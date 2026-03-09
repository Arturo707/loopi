// api/alpaca-account.js
// Creates a brokerage account for a Loopi user via Alpaca Broker API
// Handles both international (Spain) and US users
// All required fields per Alpaca KYC requirements docs

const ALPACA_BASE = 'https://broker-api.sandbox.alpaca.markets';

const alpacaHeaders = () => {
  const credentials = Buffer.from(
    `${process.env.ALPACA_BROKER_KEY}:${process.env.ALPACA_BROKER_SECRET}`
  ).toString('base64');
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
};

const normalizeIncomeRange = (range) => {
  const legacyMap = {
    '0-1000': 'under_30k',
    '1000-2000': 'under_30k',
    '2000-3500': 'under_30k',
    '3500-5000': '30k_60k',
    '5000-10000': '60k_100k',
    '10000+': 'over_300k',
    'menos_de_20k': 'under_30k',
    '20k_50k': '30k_60k',
    '50k_100k': '60k_100k',
    '100k_300k': '100k_300k',
    'mas_de_300k': 'over_300k',
  };
  return legacyMap[range] || range;
};

// Map Loopi income ranges to Alpaca min/max numbers
const INCOME_MAP = {
  'menos_de_20k': { min: 0,      max: 19999   },
  '20k_50k':      { min: 20000,  max: 49999   },
  '50k_100k':     { min: 50000,  max: 99999   },
  '100k_300k':    { min: 100000, max: 299999  },
  'mas_de_300k':  { min: 300000, max: 9999999 },
};

// Map Loopi experience to Alpaca funding source
const FUNDING_SOURCE_MAP = {
  'sin_experiencia': ['savings'],
  'algo':            ['employment_income', 'savings'],
  'intermedio':      ['employment_income', 'investments'],
  'experto':         ['employment_income', 'investments'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    // Identity
    firstName,
    lastName,
    middleName,
    email,
    dateOfBirth,        // "YYYY-MM-DD"
    taxId,              // NIE/DNI for Spain, SSN for US
    taxIdType,          // "ESP_NIF" or "USA_SSN"

    // Address
    streetAddress,
    unit,
    city,
    state,              // Required for US (2-char abbr), optional for Spain
    postalCode,
    country,            // "ESP" or "USA" (ISO 3166 alpha-3)
    phoneNumber,

    // Financial profile (from Loopi onboarding)
    incomeRange,        // Loopi range key e.g. "20k_50k"
    employmentStatus,   // "employed" | "unemployed" | "student" | "retired"
    employerName,       // optional
    employerAddress,    // optional
    occupation,         // optional
    liquidNetWorthMin,  // number - required by Alpaca
    liquidNetWorthMax,  // number - required by Alpaca
    experience,         // Loopi experience field → maps to funding_source

    // Disclosures (user must have confirmed these via checkboxes in UI)
    isAffiliatedWithFinra,
    isControlPerson,
    isPoliticallyExposed,
    immediateFamilyExposed,

    // Agreement metadata (timestamps from when user clicked agree in UI)
    agreementSignedAt,
    ipAddress,

    // US-specific
    citizenshipStatus,  // "USA" | "GreenCard" | "Visa"
    visaType,
    visaExpiration,     // "YYYY-MM-DD"
    countryOfBirth,     // ISO 3166 alpha-3
  } = req.body;

  // Validate required fields
  const required = { firstName, lastName, email, dateOfBirth, taxId, taxIdType, streetAddress, city, country };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const isUS = country === 'USA';
  const income = INCOME_MAP[normalizeIncomeRange(incomeRange)] || { min: 0, max: 49999 };
  const fundingSource = FUNDING_SOURCE_MAP[experience] || ['savings'];
  const signedAt = agreementSignedAt || new Date().toISOString();
  const userIp = ipAddress || req.headers['x-forwarded-for'] || '127.0.0.1';

  try {
    const body = {
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

        // US-specific
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

      // Three agreements required — timestamps from when user clicked agree
      agreements: [
        { agreement: 'margin_agreement',   signed_at: signedAt, ip_address: userIp },
        { agreement: 'account_agreement',  signed_at: signedAt, ip_address: userIp },
        { agreement: 'customer_agreement', signed_at: signedAt, ip_address: userIp },
      ],
    };

    const response = await fetch(`${ALPACA_BASE}/v1/accounts`, {
      method: 'POST',
      headers: alpacaHeaders(),
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Alpaca account creation failed:', JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: data.message || 'Failed to create account',
        details: data,
      });
    }

    // Store alpacaAccountId in Firestore against the user's UID
    return res.status(200).json({
      alpacaAccountId: data.id,
      status: data.status,         // "SUBMITTED" → "ACTIVE" once KYC passes
      accountNumber: data.account_number,
    });

  } catch (error) {
    console.error('alpaca-account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
