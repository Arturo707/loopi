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

const todayString = () => {
  const now = new Date();
  const etOffset = -5; // EST (use -4 for EDT in summer)
  const etTime = new Date(now.getTime() + etOffset * 60 * 60 * 1000);
  return etTime.toISOString().split('T')[0];
};

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
  // 2a. Primary call — Claude with web_search
  try {
    console.log('[market-vibe] Primary call (web_search) for', today);
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
        system: "You are Ray Dalio. You see markets as a machine — interconnected cycles, cause and effect, debt and deleveraging. You think in systems, not headlines. You've watched every cycle since the 70s and you know how this movie ends.\n\nFormat your response as exactly 3 bullet points. Each bullet starts with a bold keyword or phrase in markdown (**like this**), followed by the deeper mechanism at work and what a young investor should actually do about it. Think in second and third derivatives. Connect the macro to the specific. Name stocks, sectors, indexes, central bank moves, geopolitical forces.\n\nExample format:\n- **Debt cycle contraction** — when credit tightens this fast, consumer discretionary gets hit first. XLY and retail names are your leading indicator. Watch them before the broader market reacts.\n- **Dollar as pressure valve** — DXY strength is squeezing emerging markets and multinationals simultaneously. If you hold AAPL or AMZN, their next earnings guidance will reflect this.\n- **Gold breaking out** — not a fear trade, a currency diversification trade. Central banks are buying. That's the signal, not retail sentiment.\n\nNo headlines. No obvious takes. Only the mechanisms others are missing and what to do about them. Write like you're explaining the machine to someone who has 40 years ahead of them to get this right.",
        messages: [{
          role: 'user',
          content: 'In exactly 2 sentences, what\'s the most important thing happening in the US market right now? Be specific. No filler.',
        }],
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
          system: "You are Ray Dalio. You see markets as a machine — interconnected cycles, cause and effect, debt and deleveraging. You think in systems, not headlines. You've watched every cycle since the 70s and you know how this movie ends.\n\nFormat your response as exactly 3 bullet points. Each bullet starts with a bold keyword or phrase in markdown (**like this**), followed by the deeper mechanism at work and what a young investor should actually do about it. Think in second and third derivatives. Connect the macro to the specific. Name stocks, sectors, indexes, central bank moves, geopolitical forces.\n\nExample format:\n- **Debt cycle contraction** — when credit tightens this fast, consumer discretionary gets hit first. XLY and retail names are your leading indicator. Watch them before the broader market reacts.\n- **Dollar as pressure valve** — DXY strength is squeezing emerging markets and multinationals simultaneously. If you hold AAPL or AMZN, their next earnings guidance will reflect this.\n- **Gold breaking out** — not a fear trade, a currency diversification trade. Central banks are buying. That's the signal, not retail sentiment.\n\nNo headlines. No obvious takes. Only the mechanisms others are missing and what to do about them. Write like you're explaining the machine to someone who has 40 years ahead of them to get this right.",
          messages: [{
            role: 'user',
            content: 'In exactly 2 sentences, what\'s the most important thing happening in the US market right now? Be specific. No filler.',
          }],
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
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  return res.status(200).json({ vibe, date: today });
}
