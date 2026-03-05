// POST { uid } → { url }
// Creates a permanent Tink user (or reuses existing one via external_user_id = Firebase UID),
// generates a delegated authorization grant, and returns the Tink Link URL for that user.

const TINK_BASE = 'https://api.tink.com';
const LINK_BASE = 'https://link.tink.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getClientToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.EXPO_PUBLIC_TINK_CLIENT_ID,
    client_secret: process.env.TINK_CLIENT_SECRET,
    scope: 'accounts:read,balances:read,transactions:read,user:read',
  });
  const res = await fetch(`${TINK_BASE}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Client token failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Env var diagnostics ───────────────────────────────────────────
  const clientId = process.env.EXPO_PUBLIC_TINK_CLIENT_ID;
  const clientSecret = process.env.TINK_CLIENT_SECRET;
  const redirectUri = process.env.TINK_REDIRECT_URI;
  console.log('[tink-auth] EXPO_PUBLIC_TINK_CLIENT_ID :', clientId ? clientId.slice(0, 4) + '…' : 'MISSING');
  console.log('[tink-auth] TINK_CLIENT_SECRET         :', clientSecret ? clientSecret.slice(0, 4) + '…' : 'MISSING');
  console.log('[tink-auth] TINK_REDIRECT_URI          :', redirectUri || 'MISSING');

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });

  try {
    // ── Step 1: client credentials token ─────────────────────────
    console.log('[tink-auth] Step 1: fetching client credentials token…');
    const clientToken = await getClientToken();
    console.log('[tink-auth] Step 1: OK — got client token');

    // ── Step 2: create/reuse Tink user ────────────────────────────
    console.log('[tink-auth] Step 2: creating Tink user for uid:', uid);
    const createRes = await fetch(`${TINK_BASE}/api/v1/user/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_user_id: uid,
        market: 'ES',
        locale: 'es_ES',
      }),
    });
    const createBody = await createRes.json();
    if (!createRes.ok && createRes.status !== 409) {
      console.error('[tink-auth] Step 2 FAILED — status:', createRes.status, 'body:', JSON.stringify(createBody));
      return res.status(500).json({
        error: 'Tink user creation failed',
        step: 'user/create',
        status: createRes.status,
        detail: createBody,
      });
    }
    console.log('[tink-auth] Step 2: OK — status:', createRes.status, createRes.status === 409 ? '(existing user)' : '(new user)');

    // ── Step 3: delegated authorization grant ─────────────────────
    console.log('[tink-auth] Step 3: creating authorization grant…');
    const grantRes = await fetch(`${TINK_BASE}/api/v1/oauth/authorization-grant/delegate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        external_user_id: uid,
        scope: 'accounts:read,balances:read,transactions:read',
        actor_client_id: clientId,
        id_hint: uid,
      }).toString(),
    });
    const grantText = await grantRes.text();
    console.log('[tink-auth] Step 3 raw response:', grantRes.status, grantText);
    const grant = grantText ? JSON.parse(grantText) : {};
    if (!grant.code) {
      console.error('[tink-auth] Step 3 FAILED — status:', grantRes.status, 'body:', JSON.stringify(grant));
      return res.status(500).json({
        error: 'Authorization grant failed',
        step: 'authorization-grant/delegate',
        status: grantRes.status,
        detail: grant,
      });
    }
    console.log('[tink-auth] Step 3: OK — got authorization code');

    // ── Step 4: build Tink Link URL ───────────────────────────────
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      authorization_code: grant.code,
      market: 'ES',
      locale: 'es_ES',
    });
    const url = `${LINK_BASE}/1.0/transactions/connect-accounts?${params.toString()}`;
    console.log('[tink-auth] Step 4: Tink Link URL built successfully');

    return res.status(200).json({ url });
  } catch (err) {
    console.error('[tink-auth] Unhandled error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
