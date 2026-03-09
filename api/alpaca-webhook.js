// Receives account status updates from Alpaca via webhook
// When a user's KYC passes, status changes from SUBMITTED to ACTIVE
// Configure this URL in your Alpaca Broker dashboard under Events

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const event = req.body;
    console.log('Alpaca webhook event:', JSON.stringify(event));

    // Account status update events
    if (event.event_type === 'accounts' && event.data?.status) {
      const alpacaAccountId = event.data.id;
      const newStatus = event.data.status; // "ACTIVE", "REJECTED", "ACTION_REQUIRED"

      // Find the user in Firestore by their alpacaAccountId
      const usersRef = db.collection('users');
      const snapshot = await usersRef
        .where('alpacaAccountId', '==', alpacaAccountId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        await userDoc.ref.update({
          alpacaAccountStatus: newStatus,
          alpacaAccountUpdatedAt: new Date().toISOString(),
        });
        console.log(`Updated user ${userDoc.id} alpaca status to ${newStatus}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('alpaca-webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
