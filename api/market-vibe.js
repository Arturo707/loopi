// api/market-vibe.js
// Generates a daily market vibe snippet using Claude with web search.
// Caches result in Firestore for the day — only one API call per day.
// Firebase-admin is optional: if env vars are missing, caching is skipped.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  } else {
    console.warn('[market-vibe] Firebase env vars not set — caching disabled');
  }
} catch (err) {
  console.warn('[market-vibe] Firebase init failed — caching disabled:', err.message);
}

const FALLBACK_VIBE = "Markets are open. Check the feed for today's biggest movers.";

const todayString = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const today = todayString();

  // 1. Check Firestore cache (skip if db unavailable)
  if (db) {
    try {
      const snap = await db.collection('cache').doc('market-vibe').get();
      if (snap.exists) {
        const cached = snap.data();
        if (cached.date === today) {
          console.log('[market-vibe] Returning cached vibe for', today);
          return res.status(200).json({ vibe: cached.vibe, date: cached.date });
        }
      }
    } catch (err) {
      console.warn('[market-vibe] Cache read failed:', err.message);
    }
  }

  // 2. Call Anthropic API with web_search tool
  let vibe = FALLBACK_VIBE;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: "You are Loopi's market pulse writer. Your job is to write a single short paragraph (3-4 sentences max) that captures what's happening in the US stock market TODAY. Write like a sharp, plugged-in 22-year-old who actually understands markets — not a financial advisor, not cringe. Be specific: mention actual stocks, sectors, or events happening today. Use FOMO-inducing but honest language. No disclaimers. No emojis. Just the vibe.",
        messages: [
          {
            role: 'user',
            content: "What's happening in the US stock market today? Search for the latest news and give me the market vibe in 3-4 sentences.",
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // 3. Extract text blocks from the response
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim();

    if (text) vibe = text;
    console.log('[market-vibe] Generated vibe, length:', vibe.length);
  } catch (err) {
    console.error('[market-vibe] Anthropic call failed:', err.message);
  }

  // 4. Save to Firestore cache (skip if db unavailable)
  if (db) {
    try {
      await db.collection('cache').doc('market-vibe').set({
        vibe,
        date: today,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[market-vibe] Cache write failed:', err.message);
    }
  }

  // 5. Return result
  return res.status(200).json({ vibe, date: today });
}
