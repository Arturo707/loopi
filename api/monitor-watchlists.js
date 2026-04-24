// Vercel cron: every 6 hours.
// 1. Collects all watchlisted tickers across all users.
// 2. Computes current Loopi Score for each (batched, 10 at a time).
// 3. For each user holding a ticker whose band changed → enqueues a push
//    notification + in-app notification, updates the watchlist doc.
// 4. Idempotent — only fires when last_band != new band.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { computeScore } from '../lib/loopi-score-core.js';
import { buildAlert } from '../lib/score-alerts.js';

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
  console.warn('[monitor] Firebase init failed:', err.message);
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush({ token, title, body, data }) {
  if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
    return { ok: false, error: 'invalid-token' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let resp;
    try {
      resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: token,
          title,
          body,
          data,
          sound: 'default',
          priority: 'high',
          channelId: 'loopi-alerts',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `http-${resp.status}`, detail: text.slice(0, 200) };
    }
    const json = await resp.json().catch(() => ({}));
    const status = json?.data?.status ?? null;
    // DeviceNotRegistered / InvalidCredentials → purge this token
    if (status === 'error') {
      return { ok: false, error: json?.data?.details?.error || 'expo-error', receipt: json.data };
    }
    return { ok: true, receipt: json.data };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

export default async function handler(req, res) {
  // Cron invocations come in as GET; allow POST too for manual trigger
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!db)                            return res.status(500).json({ error: 'Firestore not configured' });
  const fmpKey       = process.env.FMP_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!fmpKey)        return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  const startedAt = Date.now();
  const summary = {
    usersScanned: 0, tickersTotal: 0, scoresComputed: 0,
    bandChanges: 0, pushesSent: 0, pushesFailed: 0, invalidTokensRemoved: 0,
  };

  try {
    // ── 1. Load all watchlist docs ──
    const watchlistSnap = await db.collection('watchlists').get();
    summary.usersScanned = watchlistSnap.size;

    // Map: ticker → [{ uid, tickerEntry }]
    const tickerSubscribers = new Map();
    watchlistSnap.forEach((snap) => {
      const data = snap.data() || {};
      const uid = snap.id;
      const entries = Array.isArray(data.tickers) ? data.tickers : [];
      entries.forEach((entry) => {
        if (!entry?.ticker || entry.alert_on_change === false) return;
        if (!tickerSubscribers.has(entry.ticker)) tickerSubscribers.set(entry.ticker, []);
        tickerSubscribers.get(entry.ticker).push({ uid, entry });
      });
    });

    const uniqueTickers = Array.from(tickerSubscribers.keys());
    summary.tickersTotal = uniqueTickers.length;
    if (uniqueTickers.length === 0) {
      return res.status(200).json({ ok: true, summary, message: 'no watchlisted tickers' });
    }
    console.log(`[monitor] users=${summary.usersScanned} uniqueTickers=${uniqueTickers.length}`);

    // ── 2. Compute scores in batches of 10 ──
    const newScores = {};  // ticker → { score, band, vibeCheck, ... }
    const BATCH = 10;
    for (let i = 0; i < uniqueTickers.length; i += BATCH) {
      const batch = uniqueTickers.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (ticker) => {
        try {
          // Serve-from-cache first to save API cost + time
          const cacheSnap = await db.collection('scores').doc(ticker).get();
          if (cacheSnap.exists) {
            const cached = cacheSnap.data();
            const age = Date.now() - new Date(cached.cachedAt || 0).getTime();
            if (age < 30 * 60 * 1000) {
              return { ticker, data: cached };
            }
          }
          const data = await computeScore(ticker, fmpKey, anthropicKey, { timeoutMs: 6000 });
          await db.collection('scores').doc(ticker).set({ ...data, cachedAt: new Date().toISOString() });
          return { ticker, data };
        } catch (err) {
          console.error(`[monitor] score failed for ${ticker}:`, err.message);
          return { ticker, data: null };
        }
      }));
      results.forEach(({ ticker, data }) => {
        if (data) {
          newScores[ticker] = data;
          summary.scoresComputed += 1;
        }
      });
    }

    // ── 3. Pre-fetch push tokens for all affected users in one pass ──
    const affectedUids = new Set();
    for (const ticker of uniqueTickers) {
      const newData = newScores[ticker];
      if (!newData) continue;
      for (const { uid, entry } of tickerSubscribers.get(ticker)) {
        if (entry.last_band && entry.last_band !== newData.band) affectedUids.add(uid);
      }
    }

    const pushTokens = {};  // uid → token
    await Promise.all(Array.from(affectedUids).map(async (uid) => {
      try {
        const snap = await db.collection('push_tokens').doc(uid).get();
        if (snap.exists) pushTokens[uid] = snap.data()?.token || null;
      } catch { /* ignore */ }
    }));

    // ── 4. Walk each user's watchlist, detect band change, notify ──
    const nowIso = new Date().toISOString();
    const purgeUids = new Set();

    for (const [userId, data] of watchlistSnap.docs.map(d => [d.id, d.data() || {}])) {
      const entries = Array.isArray(data.tickers) ? data.tickers : [];
      if (entries.length === 0) continue;

      let dirty = false;
      const updatedEntries = [];
      for (const entry of entries) {
        const latest = newScores[entry.ticker];
        if (!latest) { updatedEntries.push(entry); continue; }

        const prevBand  = entry.last_band;
        const nextBand  = latest.band;
        const newScore  = latest.score;
        const bandChanged = !!(prevBand && nextBand && prevBand !== nextBand);

        if (bandChanged) {
          summary.bandChanges += 1;

          const alert = buildAlert(prevBand, nextBand, entry.ticker, newScore);

          // Append to score_history (audit trail)
          await db.collection('score_history').add({
            ticker:         entry.ticker,
            userId,
            score:          newScore,
            band:           nextBand,
            previous_score: entry.last_score ?? null,
            previous_band:  prevBand,
            band_changed:   true,
            timestamp:      FieldValue.serverTimestamp(),
          }).catch(() => {});

          // In-app notification doc (drives the NotificationsScreen)
          if (alert) {
            await db.collection('notifications').doc(userId).collection('items').add({
              ticker:        entry.ticker,
              score:         newScore,
              band:          nextBand,
              previousBand:  prevBand,
              title:         alert.title,
              body:          alert.body,
              data:          alert.data,
              timestamp:     FieldValue.serverTimestamp(),
              read:          false,
            }).catch(() => {});

            // Push notification (if user has a token and alerts enabled)
            if (entry.alert_on_change !== false) {
              const token = pushTokens[userId];
              if (token) {
                const result = await sendExpoPush({
                  token, title: alert.title, body: alert.body, data: alert.data,
                });
                if (result.ok) {
                  summary.pushesSent += 1;
                } else {
                  summary.pushesFailed += 1;
                  if (
                    result.error === 'DeviceNotRegistered' ||
                    result.error === 'InvalidCredentials' ||
                    result.error === 'invalid-token'
                  ) {
                    purgeUids.add(userId);
                  }
                }
              }
            }
          }
        }

        updatedEntries.push({
          ...entry,
          last_score:   newScore,
          last_band:    nextBand,
          last_checked: nowIso,
          initial_band: entry.initial_band || prevBand || nextBand,
        });
        dirty = true;
      }

      if (dirty) {
        try {
          await db.collection('watchlists').doc(userId).set({
            tickers: updatedEntries,
            updated_at: FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.warn(`[monitor] failed to update watchlist for ${userId}:`, err.message);
        }
      }
    }

    // ── 5. Purge invalid push tokens ──
    for (const uid of purgeUids) {
      try {
        await db.collection('push_tokens').doc(uid).delete();
        summary.invalidTokensRemoved += 1;
      } catch { /* ignore */ }
    }

    // ── 6. Log run metadata ──
    try {
      await db.collection('notification_log').add({
        ranAt:     FieldValue.serverTimestamp(),
        durationMs: Date.now() - startedAt,
        summary,
      });
    } catch { /* ignore */ }

    console.log('[monitor] done:', JSON.stringify(summary));
    return res.status(200).json({ ok: true, summary, durationMs: Date.now() - startedAt });
  } catch (err) {
    console.error('[monitor] Fatal error:', err.message);
    return res.status(500).json({ error: err.message, summary });
  }
}

export const config = {
  maxDuration: 60,
};
