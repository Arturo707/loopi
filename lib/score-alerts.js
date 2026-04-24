// Score transition notification copy — shared between client (in-app alerts)
// and the monitor-watchlists cron (push notifications). Keys: `${prev}->${next}`.
// Use buildAlert(prev, next, ticker, score) to get { title, body }.

const TITLE = 'loopi score alert 🔔';

const COPY = {
  'cooked->mid':      (t, s) => `${t} is showing signs of life 👀 vibe score: ${s}/100`,
  'cooked->watching': (t)    => `${t} just woke up 👀 big vibe shift — check it`,
  'cooked->fafo':     (t)    => `${t} went from cooked to fafo overnight 🔥 something's happening`,
  'mid->watching':    (t, s) => `${t} is picking up steam 👀 score jumped to ${s}/100`,
  'mid->fafo':        (t, s) => `${t} just entered fafo territory 🔥 ${s}/100 — loopi called it`,
  'watching->fafo':   (t, s) => `${t} is fafo now 🔥 ${s}/100 — you're watching a winner`,
  'watching->mid':    (t, s) => `${t} is cooling off 📉 dropped to mid — ${s}/100`,
  'fafo->watching':   (t, s) => `${t} pulled back from fafo 👀 still solid at ${s}/100`,
  'fafo->mid':        (t, s) => `${t}'s vibe is fading 😐 fell to mid — ${s}/100`,
  'mid->cooked':      (t, s) => `${t} is cooked 💀 ${s}/100 — loopi warned you`,
  'watching->cooked': (t, s) => `${t} is cooked 💀 ${s}/100 — loopi warned you`,
  'fafo->cooked':     (t, s) => `${t} is cooked 💀 ${s}/100 — loopi warned you`,
};

export function buildAlert(prevBand, nextBand, ticker, score) {
  if (!prevBand || !nextBand || prevBand === nextBand) return null;
  const key = `${prevBand}->${nextBand}`;
  const fn  = COPY[key];
  if (!fn) return null;
  return {
    title: TITLE,
    body:  fn(ticker, score),
    data:  { ticker, score, band: nextBand, previousBand: prevBand, screen: 'stock_detail' },
  };
}

export const BANDS = ['cooked', 'mid', 'watching', 'fafo'];
