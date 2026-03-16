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
  }
} catch (err) {
  console.warn('[RankFeed] Firebase init failed — caching disabled:', err.message);
}

const GEN_Z_SYMBOLS = new Set([
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'PLTR',
  'IBIT', 'GLD', 'JPM', 'V', 'WMT', 'SOFI', 'AMD', 'NFLX', 'DIS', 'UBER',
  'COIN', 'BRK-B', 'XLE', 'IWM', 'TLT',
]);

const CACHE_TTL_MS  = 30 * 60 * 1000; // 30 minutes
const SCORE_TTL_MS  = 15 * 60 * 1000; // must match loopi-score-core

async function batchReadScores(symbols, db) {
  if (!db || !symbols.length) return {};
  try {
    const docRefs = symbols.map((sym) => db.collection('scores').doc(sym));
    const snaps   = await db.getAll(...docRefs);
    const scores  = {};
    const now     = Date.now();
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const d   = snap.data();
      const age = now - new Date(d.cachedAt || 0).getTime();
      if (age < SCORE_TTL_MS) scores[snap.id] = d;
    });
    return scores;
  } catch (err) {
    console.warn('[RankFeed] Score batch-read failed:', err.message);
    return {};
  }
}

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { items, riskProfile, age, incomeRange: rawIncomeRange, experience } = req.body;
  const incomeRange = normalizeIncomeRange(rawIncomeRange);
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing or empty items array" });
  }

  // Conservative falls back to the Moderate cache
  const cacheProfile = riskProfile === 'Conservative' ? 'Moderate' : (riskProfile || 'Moderate');

  // Check Firestore cache — return immediately if fresh (< 30 min)
  if (db) {
    try {
      const snap = await db.collection('feed-cache').doc(cacheProfile).get();
      if (snap.exists) {
        const cached = snap.data();
        const age_ms = Date.now() - new Date(cached.generatedAt).getTime();
        if (age_ms < CACHE_TTL_MS) {
          console.log('[RankFeed] Returning cached result for', cacheProfile, '— age:', Math.round(age_ms / 60000), 'min');
          const allSymbols = [...(cached.top || []).map((t) => t.symbol), ...(cached.rest || [])];
          const scores = await batchReadScores(allSymbols, db);
          return res.json({ top: cached.top, rest: cached.rest, scores, fromCache: true });
        }
      }
    } catch (err) {
      console.warn('[RankFeed] Cache read failed:', err.message);
    }
  }

  // Filter to Gen Z symbol pool
  const filteredItems = items.filter(i => GEN_Z_SYMBOLS.has(i.symbol));
  const poolItems = filteredItems.length >= 10 ? filteredItems : items.slice(0, 25);

  console.log('[RankFeed] profile received:', { riskProfile, age, incomeRange, experience });
  console.log('[RankFeed] pool size:', poolItems.length, 'symbols:', poolItems.map(i => i.symbol).join(','));

  const profileParts = [];
  if (riskProfile) profileParts.push(`risk profile: ${riskProfile}`);
  if (age)         profileParts.push(`age: ${age}`);
  if (incomeRange) profileParts.push(`income: ${incomeRange}/mo`);
  if (experience)  profileParts.push(`investing experience: ${experience}`);
  const profileDesc = profileParts.join(", ") || "profile not specified";

  const itemList = poolItems
    .map((s) => `${s.symbol} (${s.name}, ${s.type === "etf" ? "ETF" : "STOCK"}, price $${Number(s.price).toFixed(2)}, change ${Number(s.changesPercentage) >= 0 ? "+" : ""}${Number(s.changesPercentage).toFixed(1)}%)`)
    .join("\n");

  const system = `You are the brain behind Loopi — a investing app for Gen Z users who are curious about markets but don't have a finance degree. Your job is to analyze today's market snapshot and build a personalized feed that helps the user:
1. Understand what's actually happening in the market today
2. See concrete opportunities that fit their profile
3. Feel informed and confident, not overwhelmed

PHILOSOPHY: Value investing fundamentals (Greenwald/Buffett) + generational common sense. Look for assets with solid fundamentals. Cut the hype.

PROFILES — differences must be OBVIOUS in the output:

- Conservative: ONLY broad index ETFs (SPY, QQQ, VTI) and gold (GLD). Max 2-3 stocks from ultra-established companies (Apple, Microsoft, Berkshire). NEVER volatile stocks, NEVER small caps, NEVER crypto ETFs. This user does not want surprises.

- Moderate: ETFs as ~40% of the feed + Magnificent 7 (AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA) + 2-3 stocks with solid momentum today. NEVER the same speculative picks as Aggressive.

- Aggressive: PRIORITIZE stocks with the biggest moves today, small caps with a clear narrative, leveraged ETFs (SOXL, TQQQ), crypto ETFs (IBIT, BITO). FEW broad index ETFs — this user wants action. Stocks must look very different from Conservative.

If Conservative and Aggressive share more than 3 symbols, you've failed.

DEMOGRAPHICS:
- Young + low income + no experience: keep it simple, ETFs, long-term framing, plain language
- Young + higher income/experience: more variety, individual stocks are fine
- High experience: more sophisticated assets, deeper analysis in tips

RULES:
- Reflect WHAT'S HAPPENING TODAY — if Apple is tanking, it shows up; if gold is running, it's there
- Filter junk: exclude price < $2, moves > 30% from unknown companies
- Tips sound like a sharp friend texting you about a stock — warm, confident, not bro-y. No financial advisor voice. No disclaimers.
- Conservative and Moderate must look VERY different from Aggressive.

TIP VOICE: Imagine explaining this stock to a friend who's smart but new to investing. Be specific about what's happening today. Say what matters. Cut the filler.

FORMAT — respond ONLY with valid JSON:
{
  "top": [
    {"symbol": "SPY", "indicator": "🟢", "tip": "S&P 500 dipped today on macro fears but the long-term case is unchanged. If you're building a base, this is it."},
    {"symbol": "GLD", "indicator": "🟢", "tip": "Gold's climbing as uncertainty picks up. A 5-10% allocation here is just smart insurance right now."}
  ],
  "rest": ["AAPL", "MSFT", "NVDA"]
}

- "top": exactly 12 assets with indicator (🟢 Interesting, 🟡 Neutral, 🔴 Avoid) and a tip of max 50 words in casual English
- "rest": up to 38 more symbols ranked by profile relevance, no tips
- Max 50 assets total
- Nothing outside the JSON`;

  const userMsg = `User: ${profileDesc}.\nDate: ${new Date().toISOString().split('T')[0]}\n\nAvailable assets today:\n${itemList}\n\nBuild the personalized feed for this user.`;

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 25_000);

    let apiRes;
    try {
      apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system,
          messages: [{ role: "user", content: userMsg }],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.warn('[RankFeed] Claude timed out after 10s — returning unranked fallback');
        const timeoutTop  = poolItems.slice(0, 12).map((s) => ({ symbol: s.symbol, indicator: '🟡', tip: '' }));
        const timeoutRest = poolItems.slice(12, 25).map((s) => s.symbol);
        const timeoutSyms = [...timeoutTop.map((t) => t.symbol), ...timeoutRest];
        const timeoutScores = await batchReadScores(timeoutSyms, db);
        return res.json({ top: timeoutTop, rest: timeoutRest, scores: timeoutScores });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const data = await apiRes.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    const raw = (data.content?.[0]?.text ?? "").trim();
    console.log('[RankFeed] Claude raw response:', raw.slice(0, 500));

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*"top"[\s\S]*"rest"[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }

    if (parsed?.top?.length) {
      const tipsPopulated = parsed.top.filter(i => i.tip && i.tip.length > 0).length;
      console.log('[RankFeed] top symbols:', parsed.top.map(i => i.symbol).join(','));
      console.log('[RankFeed] tips populated:', tipsPopulated, '/', parsed.top.length);
      if (tipsPopulated < parsed.top.length) {
        console.warn('[RankFeed] Some items missing tips:', parsed.top.filter(i => !i.tip).map(i => i.symbol).join(','));
      }
      console.log('[RankFeed] full tips object:', JSON.stringify(parsed.top.map(i => ({ symbol: i.symbol, indicator: i.indicator, tip: i.tip?.slice(0, 40) }))));
      console.log('[RankFeed] rest:', parsed.rest?.join(','));

      // Write to Firestore cache
      if (db) {
        try {
          await db.collection('feed-cache').doc(cacheProfile).set({
            top: parsed.top,
            rest: parsed.rest ?? [],
            generatedAt: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
          });
        } catch (err) {
          console.warn('[RankFeed] Cache write failed:', err.message);
        }
      }

      const allSymbols = [...(parsed.top || []).map((t) => t.symbol), ...(parsed.rest || [])];
      const scores = await batchReadScores(allSymbols, db);
      return res.json({ ...parsed, scores });
    }

    // Fallback
    console.warn('[RankFeed] JSON parse failed, using fallback');
    const fallbackTop  = poolItems.slice(0, 12).map((s) => ({ symbol: s.symbol, indicator: '🟡', tip: '' }));
    const fallbackRest = poolItems.slice(12, 25).map((s) => s.symbol);
    const fallbackSyms = [...fallbackTop.map((t) => t.symbol), ...fallbackRest];
    const fallbackScores = await batchReadScores(fallbackSyms, db);
    return res.json({ top: fallbackTop, rest: fallbackRest, scores: fallbackScores });

  } catch (err) {
    console.error('[RankFeed] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
