// api/alpaca-bank.js
// Links a user's bank account to their Alpaca brokerage account via ACH relationship.
// Saves achRelationshipId to Firestore.
// POST /api/alpaca-bank

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

let db = null;
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
    db = getFirestore();
  }
} catch (err) {
  console.warn('[alpaca-bank] Firebase init failed:', err.message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accountId, uid, routingNumber, accountNumber, bankAccountType = 'CHECKING', bankAccountOwnerName } = req.body;

  if (!accountId || !uid || !routingNumber || !accountNumber || !bankAccountOwnerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch(
      `${ALPACA_BASE}/v1/accounts/${accountId}/ach_relationships`,
      {
        method: 'POST',
        headers: alpacaHeaders(),
        body: JSON.stringify({
          account_owner_name: bankAccountOwnerName,
          bank_account_type: bankAccountType,
          bank_account_number: accountNumber,
          bank_routing_number: routingNumber,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[alpaca-bank] ACH relationship failed:', data);
      return res.status(response.status).json({ error: data.message || 'Failed to link bank', details: data });
    }

    const achRelationshipId = data.id;

    // Save to Firestore
    if (db && uid) {
      try {
        await db.collection('users').doc(uid).set(
          { achRelationshipId, achStatus: data.status },
          { merge: true }
        );
      } catch (err) {
        console.warn('[alpaca-bank] Firestore write failed:', err.message);
      }
    }

    return res.status(200).json({
      achRelationshipId,
      status: data.status,
    });
  } catch (error) {
    console.error('[alpaca-bank] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
