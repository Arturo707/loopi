// api/loopi-score.js
// GET /api/loopi-score?ticker=NVDA
// Returns: { ticker, score, band, momentum, buzz, familiarity, narrativeLine, vibeCheck }
// Caches in Firestore scores/{symbol} — 15-min TTL, shared with refresh-feed cron.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeScore } from '../lib/loopi-score-core.js';
import { requireAuth } from '../lib/requireAuth.js';

// Serve cached scores for up to 24h — the cron job refreshes every 30min,
// so this generous TTL avoids live Claude calls between cron runs.
const SERVE_TTL_MS = 24 * 60 * 60 * 1000;

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
  } else {
    console.warn('[loopi-score] Firebase env vars not set — Firestore cache disabled');
  }
} catch (err) {
  console.warn('[loopi-score] Firebase init failed:', err.message);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'ticker query param required' });

  // Check Firestore cache first
  if (db) {
    try {
      const snap = await db.collection('scores').doc(ticker).get();
      if (snap.exists) {
        const cached = snap.data();
        const age = Date.now() - new Date(cached.cachedAt).getTime();
        if (age < SERVE_TTL_MS) {
          console.log(`[loopi-score] Firestore cache hit for ${ticker} (${Math.round(age / 60000)}m old)`);
          return res.status(200).json(cached);
        }
      }
    } catch (err) {
      console.warn('[loopi-score] Cache read failed:', err.message);
    }
  }

  const fmpKey      = process.env.FMP_API_KEY || process.env.EXPO_PUBLIC_FMP_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!fmpKey) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    const result = await computeScore(ticker, fmpKey, anthropicKey);
    const doc = { ...result, cachedAt: new Date().toISOString() };

    console.log(`[loopi-score] ${ticker} → score=${result.score} band=${result.band}`);

    if (db) {
      try { await db.collection('scores').doc(ticker).set(doc); }
      catch (err) { console.warn('[loopi-score] Cache write failed:', err.message); }
    }

    return res.status(200).json(doc);
  } catch (err) {
    console.error('[loopi-score] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
