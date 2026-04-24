// api/alpaca.js
// Consolidated Alpaca Broker API handler.
// All actions are POST with an "action" field in the request body.
//
// Actions:
//   create-account  — KYC + brokerage account creation
//   link-bank       — ACH relationship via routing/account numbers
//   portfolio       — fetch positions, cash, portfolio value
//   trade           — place a buy/sell order (optionally initiates ACH transfer first)
//   transfer        — standalone ACH fund transfer

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth } from '../lib/requireAuth.js';

const ALPACA_BASE = process.env.ALPACA_BASE_URL || 'https://broker-api.sandbox.alpaca.markets';

const alpacaHeaders = () => ({
  'Authorization': 'Basic ' + Buffer.from(
    `${process.env.ALPACA_BROKER_KEY}:${process.env.ALPACA_BROKER_SECRET}`
  ).toString('base64'),
  'Content-Type': 'application/json',
});

// Firebase Admin (used by link-bank to persist achRelationshipId)
let adminDb = null;
try {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    adminDb = getFirestore();
  }
} catch (err) {
  console.warn('[alpaca] Firebase admin init failed:', err.message);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const normalizeIncomeRange = (range) => {
  const legacyMap = {
    '0-1000': 'under_30k', '1000-2000': 'under_30k', '2000-3500': 'under_30k',
    '3500-5000': '30k_60k', '5000-10000': '60k_100k', '10000+': 'over_300k',
    'menos_de_20k': 'under_30k', '20k_50k': '30k_60k', '50k_100k': '60k_100k',
    '100k_300k': '100k_300k', 'mas_de_300k': 'over_300k',
  };
  return legacyMap[range] || range;
};

const INCOME_MAP = {
  'menos_de_20k': { min: 0,      max: 19999   },
  '20k_50k':      { min: 20000,  max: 49999   },
  '50k_100k':     { min: 50000,  max: 99999   },
  '100k_300k':    { min: 100000, max: 299999  },
  'mas_de_300k':  { min: 300000, max: 9999999 },
};

const FUNDING_SOURCE_MAP = {
  'sin_experiencia': ['savings'],
  'algo':            ['employment_income', 'savings'],
  'intermedio':      ['employment_income', 'investments'],
  'experto':         ['employment_income', 'investments'],
};

// ─── Action handlers ─────────────────────────────────────────────────────────

async function createAccount(body, req) {
  const {
    firstName, lastName, middleName, email, dateOfBirth, taxId, taxIdType,
    streetAddress, unit, city, state, postalCode, country, phoneNumber,
    incomeRange, employmentStatus, employerName, employerAddress, occupation,
    liquidNetWorthMin, liquidNetWorthMax, experience,
    isAffiliatedWithFinra, isControlPerson, isPoliticallyExposed, immediateFamilyExposed,
    agreementSignedAt, ipAddress,
    citizenshipStatus, visaType, visaExpiration, countryOfBirth,
    trustedContact,
  } = body;

  const required = { firstName, lastName, email, dateOfBirth, taxId, taxIdType, streetAddress, city, country };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) return { status: 400, body: { error: `Missing required fields: ${missing.join(', ')}` } };

  const isUS = country === 'USA';
  const income = INCOME_MAP[normalizeIncomeRange(incomeRange)] || { min: 0, max: 49999 };
  const fundingSource = FUNDING_SOURCE_MAP[experience] || ['savings'];
  const signedAt = agreementSignedAt || new Date().toISOString();
  const userIp = ipAddress || req.headers['x-forwarded-for'] || '127.0.0.1';

  const payload = {
    contact: {
      email_address: email,
      phone_number: phoneNumber || '',
      street_address: [streetAddress],
      ...(unit && { unit }),
      city,
      postal_code: postalCode || '',
      country,
      ...(isUS && state && { state }),
    },
    identity: {
      given_name: firstName,
      ...(middleName && { middle_name: middleName }),
      family_name: lastName,
      date_of_birth: dateOfBirth,
      tax_id: taxId,
      tax_id_type: taxIdType,
      country_of_citizenship: isUS
        ? (citizenshipStatus === 'USA' ? 'USA' : countryOfBirth || country)
        : country,
      country_of_birth: countryOfBirth || country,
      country_of_tax_residence: country,
      funding_source: fundingSource,
      annual_income_min: income.min,
      annual_income_max: income.max,
      liquid_net_worth_min: liquidNetWorthMin ?? income.min,
      liquid_net_worth_max: liquidNetWorthMax ?? income.max,
      ...(isUS && citizenshipStatus === 'GreenCard' && { permanent_resident: true }),
      ...(isUS && citizenshipStatus === 'Visa' && visaType && {
        visa_type: visaType,
        visa_expiration_date: visaExpiration,
      }),
    },
    disclosures: {
      is_control_person: isControlPerson ?? false,
      is_affiliated_exchange_or_finra: isAffiliatedWithFinra ?? false,
      is_politically_exposed: isPoliticallyExposed ?? false,
      immediate_family_exposed: immediateFamilyExposed ?? false,
      employment_status: employmentStatus || 'employed',
      ...(employerName && { employer_name: employerName }),
      ...(employerAddress && { employer_address: employerAddress }),
      ...(occupation && { employment_position: occupation }),
    },
    agreements: [
      { agreement: 'margin_agreement',   signed_at: signedAt, ip_address: userIp },
      { agreement: 'account_agreement',  signed_at: signedAt, ip_address: userIp },
      { agreement: 'customer_agreement', signed_at: signedAt, ip_address: userIp },
    ],
    ...(trustedContact && { trusted_contact: trustedContact }),
  };

  const response = await fetch(`${ALPACA_BASE}/v1/accounts`, {
    method: 'POST',
    headers: alpacaHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error('[alpaca] create-account failed:', JSON.stringify(data, null, 2));
    return { status: response.status, body: { error: data.message || 'Failed to create account', details: data } };
  }
  return { status: 200, body: { alpacaAccountId: data.id, status: data.status, accountNumber: data.account_number } };
}

async function linkBank(body) {
  const { accountId, uid, routingNumber, accountNumber, bankAccountType = 'CHECKING', bankAccountOwnerName } = body;

  if (!accountId || !uid || !routingNumber || !accountNumber || !bankAccountOwnerName) {
    return { status: 400, body: { error: 'Missing required fields' } };
  }

  const response = await fetch(`${ALPACA_BASE}/v1/accounts/${accountId}/ach_relationships`, {
    method: 'POST',
    headers: alpacaHeaders(),
    body: JSON.stringify({
      account_owner_name: bankAccountOwnerName,
      bank_account_type: bankAccountType,
      bank_account_number: accountNumber,
      bank_routing_number: routingNumber,
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error('[alpaca] link-bank failed:', data);
    return { status: response.status, body: { error: data.message || 'Failed to link bank', details: data } };
  }

  if (adminDb && uid) {
    try {
      await adminDb.collection('users').doc(uid).set(
        { achRelationshipId: data.id, achStatus: data.status },
        { merge: true }
      );
    } catch (err) {
      console.warn('[alpaca] link-bank Firestore write failed:', err.message);
    }
  }

  return { status: 200, body: { achRelationshipId: data.id, status: data.status } };
}

async function portfolio(body) {
  const { accountId } = body;
  if (!accountId) return { status: 400, body: { error: 'Missing accountId' } };

  const [accountRes, positionsRes] = await Promise.all([
    fetch(`${ALPACA_BASE}/v1/trading/accounts/${accountId}/account`, { headers: alpacaHeaders() }),
    fetch(`${ALPACA_BASE}/v1/trading/accounts/${accountId}/positions`, { headers: alpacaHeaders() }),
  ]);
  const [account, positions] = await Promise.all([accountRes.json(), positionsRes.json()]);

  if (!accountRes.ok) return { status: accountRes.status, body: { error: account.message } };

  return {
    status: 200,
    body: {
      cash: parseFloat(account.cash),
      buyingPower: parseFloat(account.buying_power),
      portfolioValue: parseFloat(account.portfolio_value),
      positions: (positions || []).map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        marketValue: parseFloat(p.market_value),
        costBasis: parseFloat(p.cost_basis),
        unrealizedPL: parseFloat(p.unrealized_pl),
        unrealizedPLPC: parseFloat(p.unrealized_plpc),
        currentPrice: parseFloat(p.current_price),
      })),
    },
  };
}

async function trade(body) {
  const { accountId, symbol, side, amount, qty, achRelationshipId } = body;

  if (!accountId || !symbol || !side || (!amount && !qty)) {
    return { status: 400, body: { error: 'Missing required fields' } };
  }
  if (!['buy', 'sell'].includes(side)) {
    return { status: 400, body: { error: 'side must be buy or sell' } };
  }


  const hasAch = achRelationshipId != null && achRelationshipId !== '';

  if (side === 'buy' && hasAch && amount) {
    const transferRes = await fetch(`${ALPACA_BASE}/v1/accounts/${accountId}/transfers`, {
      method: 'POST',
      headers: alpacaHeaders(),
      body: JSON.stringify({
        transfer_type: 'ach',
        relationship_id: achRelationshipId,
        amount: parseFloat(amount).toFixed(2),
        direction: 'INCOMING',
      }),
    });
    if (!transferRes.ok) {
      const transferErr = await transferRes.json().catch(() => ({}));
      console.warn('[alpaca] trade ACH transfer failed (proceeding with order):', transferErr.message);
    }
  }

  const orderBody = {
    symbol,
    side,
    type: 'market',
    time_in_force: 'day',
    ...(amount && side === 'buy'
      ? { notional: amount.toString() }
      : { qty: qty.toString() }
    ),
  };


  let response, data;
  try {
    response = await fetch(`${ALPACA_BASE}/v1/trading/accounts/${accountId}/orders`, {
      method: 'POST',
      headers: alpacaHeaders(),
      body: JSON.stringify(orderBody),
    });
    const rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : {};
  } catch (fetchErr) {
    console.error('[alpaca] trade fetch error:', fetchErr.message);
    return { status: 500, body: { error: fetchErr.message } };
  }

  if (!response.ok) {
    return { status: response.status, body: { error: data.message || 'Order failed', details: data } };
  }

  return {
    status: 200,
    body: {
      orderId: data.id,
      symbol: data.symbol,
      side: data.side,
      status: data.status,
      submittedAt: data.submitted_at,
      notional: data.notional,
      qty: data.qty,
    },
  };
}

async function transfer(body) {
  const { accountId, achRelationshipId, amount } = body;

  if (!accountId || !achRelationshipId || !amount) {
    return { status: 400, body: { error: 'Missing required fields' } };
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { status: 400, body: { error: 'Invalid amount' } };
  }

  const response = await fetch(`${ALPACA_BASE}/v1/accounts/${accountId}/transfers`, {
    method: 'POST',
    headers: alpacaHeaders(),
    body: JSON.stringify({
      transfer_type: 'ach',
      relationship_id: achRelationshipId,
      amount: parsedAmount.toFixed(2),
      direction: 'INCOMING',
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error('[alpaca] transfer failed:', data);
    return { status: response.status, body: { error: data.message || 'Transfer failed', details: data } };
  }

  return {
    status: 200,
    body: { transferId: data.id, status: data.status, amount: data.amount, direction: data.direction },
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────

const ACTIONS = { 'create-account': createAccount, 'link-bank': linkBank, portfolio, trade, transfer };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  const { action, ...rest } = req.body;
  if (!action || !ACTIONS[action]) {
    return res.status(400).json({ error: `Unknown action. Valid actions: ${Object.keys(ACTIONS).join(', ')}` });
  }

  try {
    const { status, body } = await ACTIONS[action](rest, req);
    return res.status(status).json(body);
  } catch (error) {
    console.error(`[alpaca] ${action} error:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
