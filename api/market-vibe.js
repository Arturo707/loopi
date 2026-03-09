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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('[market-vibe] ANTHROPIC_API_KEY present:', !!apiKey, '— prefix:', apiKey ? apiKey.slice(0, 8) : 'MISSING');

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
  if (!apiKey) {
    console.error('[market-vibe] No ANTHROPIC_API_KEY — skipping Claude call, returning fallback');
    return res.status(200).json({ vibe, date: today });
  }
  try {
    console.log('[market-vibe] Calling Anthropic API for', today);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: "You are Loopi's market pulse writer. Write a single short paragraph (3-4 sentences) covering what happened in the US stock market today AND this week. Be specific: name actual indexes (S&P 500, Nasdaq, Dow), sectors, or major individual stocks. Whether markets are open or closed, always write something useful — if closed, recap today and flag what to watch next. Write like a sharp, plugged-in 22-year-old who actually follows markets. No financial advisor voice, no disclaimers, no emojis. Just the vibe.",
        messages: [
          {
            role: 'user',
            content: "Search for the latest US stock market news. Summarize what happened in the market today and this week in 3-4 sentences. Be specific — mention actual indexes (S&P 500, Nasdaq, Dow), sectors, and any major moves or events. Write like a sharp 22-year-old who actually follows markets.",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error('[market-vibe] Anthropic HTTP error:', response.status, JSON.stringify(errBody));
      throw new Error(errBody.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[market-vibe] Anthropic response stop_reason:', data.stop_reason, 'content blocks:', data.content?.length);

    // 3. Extract text blocks from the response
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim();

    if (text) {
      vibe = text;
      console.log('[market-vibe] Generated vibe, length:', vibe.length, '— preview:', vibe.slice(0, 80));
    } else {
      console.error('[market-vibe] Empty text extracted — full response:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('[market-vibe] Anthropic call failed:', err);
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
  console.log('[market-vibe] Returning:', JSON.stringify({ vibe: vibe.slice(0, 80) + '...', date: today }));
  return res.status(200).json({ vibe, date: today });
}
