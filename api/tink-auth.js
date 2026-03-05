// POST { uid } → { url }
// Sandbox flow: builds the Tink Link URL directly (no server-side user creation).
// user/create is restricted in Tink Sandbox — permanent user management is a
// production-only API capability. The direct link flow works identically in both
// environments; the only difference in production will be adding the delegation
// step once the app is promoted out of sandbox.

const LINK_BASE = 'https://link.tink.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Env var diagnostics ───────────────────────────────────────────
  const clientId  = process.env.EXPO_PUBLIC_TINK_CLIENT_ID;
  const redirectUri = process.env.TINK_REDIRECT_URI;
  console.log('[tink-auth] EXPO_PUBLIC_TINK_CLIENT_ID :', clientId   ? clientId.slice(0, 4)   + '…' : 'MISSING');
  console.log('[tink-auth] TINK_REDIRECT_URI          :', redirectUri || 'MISSING');

  if (!clientId)   return res.status(500).json({ error: 'EXPO_PUBLIC_TINK_CLIENT_ID env var not set' });
  if (!redirectUri) return res.status(500).json({ error: 'TINK_REDIRECT_URI env var not set' });

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });

  try {
    // Build the direct Tink Link URL.
    // Tink creates an anonymous session — the ?code= that comes back is exchanged
    // by api/tink-token.js exactly the same as in the delegation flow.
    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: redirectUri,
      market:       'ES',
      locale:       'es_ES',
      scope:        'accounts:read,balances:read,transactions:read',
    });
    const url = `${LINK_BASE}/1.0/transactions/connect-accounts?${params.toString()}`;

    console.log('[tink-auth] Tink Link URL built:', url);
    return res.status(200).json({ url });
  } catch (err) {
    console.error('[tink-auth] Unhandled error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
