// api/market-vibe.js
// Generates a market vibe snippet using Claude with web search.
// Caches result in Firestore — refreshes three times per day (ET morning/midday/closing).
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

const SYSTEM_PROMPT =
  "You are the older brother who works at a hedge fund and actually texts back. You grew up on the same internet as Gen Z — you get the references, you keep it short — but you've also sat in rooms where real money moves and you know how the machine works.\n\n" +
  "Format your response as exactly 3 bullet points using • character. Each bullet: bold the key thing (**like this**), then one sentence on what's actually happening under the hood, then one sentence on what to do or watch. Max 2 sentences per bullet total.\n\n" +
  "Tone: like a voice note from someone who genuinely wants you to win. Sharp. Specific. A little irreverent. Never boring. Never academic. Name the stocks, the indexes, the macro forces. Make the young investor feel like they just got the cheat code.\n\n" +
  "No disclaimers. No 'it's important to note'. No hedging. Just the real picture, fast.";

const USER_MESSAGES = {
  morning: "Market just opened. Search for premarket moves, overnight news, earnings releases, and macro events driving today's open. What should a young investor know in the first 30 minutes?",
  midday:  "It's midday on Wall Street. Search for what's moving right now, any reversals from the open, sector rotation, and the big stories developing. What's the real picture at halftime?",
  closing: "Market is heading into the close. Search for today's winners and losers, any late-day moves, and what tomorrow's setup looks like. What does a young investor need to know before tomorrow morning?",
};

const getWindowInfo = () => {
  const now = new Date();
  const etOffset = -5; // EST (use -4 for EDT)
  const etTime = new Date(now.getTime() + etOffset * 60 * 60 * 1000);
  const hour = etTime.getUTCHours();
  const date = etTime.toISOString().split('T')[0];

  let window;
  if (hour < 11) window = 'morning';
  else if (hour < 15) window = 'midday';
  else window = 'closing';

  return { date, window, cacheKey: `market-vibe-${date}-${window}` };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('[market-vibe] ANTHROPIC_API_KEY present:', !!apiKey, '— prefix:', apiKey ? apiKey.slice(0, 8) : 'MISSING');

  const { date, window: timeWindow, cacheKey } = getWindowInfo();
  const userMessage = USER_MESSAGES[timeWindow];
  console.log('[market-vibe] Window:', timeWindow, '| Cache key:', cacheKey);

  // 1. Check Firestore cache — keyed by date+window, refreshes 3x/day ET
  if (db) {
    try {
      const snap = await db.collection('cache').doc(cacheKey).get();
      if (snap.exists) {
        const cached = snap.data();
        console.log('[market-vibe] Returning cached vibe for', cacheKey);
        return res.status(200).json({ vibe: cached.vibe, date, window: timeWindow });
      }
    } catch (err) {
      console.warn('[market-vibe] Cache read failed:', err.message);
    }
  }

  // 2. Call Anthropic API with web_search tool
  let vibe = FALLBACK_VIBE;
  if (!apiKey) {
    console.error('[market-vibe] No ANTHROPIC_API_KEY — skipping Claude call, returning fallback');
    return res.status(200).json({ vibe, date, window: timeWindow });
  }

  // 2a. Primary call — Claude with web_search
  try {
    console.log('[market-vibe] Primary call (web_search) for', cacheKey);
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
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    console.log('[market-vibe] Primary response status:', response.status);
    const data = await response.json();
    console.log('market-vibe full response:', JSON.stringify(data, null, 2));

    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const vibeText = textBlocks.map(b => b.text).join(' ').trim();

    if (!vibeText) {
      console.log('[market-vibe] No text blocks found in primary call. Full content:', JSON.stringify(data.content));
    }

    if (vibeText) vibe = vibeText;
  } catch (err) {
    console.error('[market-vibe] Primary call failed:', err);
  }

  // 2b. Fallback call — plain Claude with no web_search, based on training knowledge
  if (vibe === FALLBACK_VIBE) {
    console.log('[market-vibe] Primary returned no text — trying fallback (no web_search)');
    try {
      const fallbackResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      console.log('[market-vibe] Fallback response status:', fallbackResponse.status);
      const fallbackData = await fallbackResponse.json();
      if (!fallbackResponse.ok) {
        console.error('[market-vibe] Fallback HTTP error:', fallbackResponse.status, JSON.stringify(fallbackData));
      } else {
        const fallbackText = (fallbackData.content || [])
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join(' ')
          .trim();
        if (fallbackText) {
          vibe = fallbackText;
          console.log('[market-vibe] Fallback vibe generated, length:', vibe.length);
        } else {
          console.error('[market-vibe] Fallback also returned no text:', JSON.stringify(fallbackData));
        }
      }
    } catch (err) {
      console.error('[market-vibe] Fallback call failed:', err);
    }
  }

  // 4. Save to Firestore cache under the window key
  if (db) {
    try {
      await db.collection('cache').doc(cacheKey).set({
        vibe,
        date,
        window: timeWindow,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[market-vibe] Cache write failed:', err.message);
    }
  }

  // 5. Return result
  console.log('[market-vibe] Returning:', JSON.stringify({ vibe: vibe.slice(0, 80) + '...', date, window: timeWindow }));
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  return res.status(200).json({ vibe, date, window: timeWindow });
}
