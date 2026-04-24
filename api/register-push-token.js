// POST /api/register-push-token
// Body: { token: string, platform: "ios" | "android" }
// Stores Expo push token under push_tokens/{uid}.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth } from '../lib/requireAuth.js';

let db = null;
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = getFirestore();
  }
} catch (err) {
  console.warn('[register-push-token] Firebase init failed:', err.message);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  const { token, platform } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required' });
  }
  if (!db) return res.status(500).json({ error: 'Firestore not configured' });

  try {
    await db.collection('push_tokens').doc(authUser.uid).set({
      token,
      platform: platform || 'unknown',
      userId:   authUser.uid,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[register-push-token] write failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
