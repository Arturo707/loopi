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

  // 1. Check Firestore cache — keyed by date so each day gets one fresh call
  if (db) {
    try {
      const snap = await db.collection('cache').doc(`market-vibe-${today}`).get();
      if (snap.exists) {
        const cached = snap.data();
        console.log('[market-vibe] Returning cached vibe for', today);
        return res.status(200).json({ vibe: cached.vibe, date: today });
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
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: "You are a seasoned Wall Street insider writing to your kid who just started investing. You've seen bull markets, crashes, recessions, and bubbles. You know how the game really works. Write 3-4 sentences about what's actually happening in the market right now — not just the numbers, but the why behind them. What's the macro story? What's being driven by geopolitics, earnings, Fed policy, sector rotation? What should a young investor actually pay attention to this week? Be specific with names — stocks, sectors, indexes, world events. Write like you're texting your kid, not filing a report. No disclaimers. No fluff. Just the real picture from someone who's been in the room.",
        messages: [{
          role: 'user',
          content: 'Search for the latest US stock market news today and this week. Give me the market pulse in 3-4 sentences.',
        }],
      }),
    });

    const data = await response.json();
    console.log('market-vibe full response:', JSON.stringify(data, null, 2));

    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const vibeText = textBlocks.map(b => b.text).join(' ').trim();

    if (!vibeText) {
      console.log('No text blocks found. Full content:', JSON.stringify(data.content));
    }

    if (vibeText) vibe = vibeText;
  } catch (err) {
    console.error('[market-vibe] Anthropic call failed:', err);
  }

  // 4. Save to Firestore cache under the date key
  if (db) {
    try {
      await db.collection('cache').doc(`market-vibe-${today}`).set({
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
