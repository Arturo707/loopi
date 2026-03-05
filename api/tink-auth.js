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
    scope: 'authorization:grant,user:create',
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

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });

  try {
    const clientToken = await getClientToken();

    // Create Tink user with Firebase UID as external_user_id.
    // 409 = user already exists — that's fine, proceed with delegation.
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
    if (!createRes.ok && createRes.status !== 409) {
      const err = await createRes.json();
      throw new Error(`Tink user creation failed: ${JSON.stringify(err)}`);
    }

    // Create delegated authorization grant using external_user_id.
    // This ties the Tink Link session to this permanent user.
    const grantRes = await fetch(`${TINK_BASE}/api/v1/oauth/authorization-grant/delegate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_user_id: uid,
        scope: 'accounts:read,balances:read,transactions:read',
        actor_client_id: process.env.EXPO_PUBLIC_TINK_CLIENT_ID,
        id_hint: uid,
      }),
    });
    const grant = await grantRes.json();
    if (!grant.code) throw new Error(`Authorization grant failed: ${JSON.stringify(grant)}`);

    // Build the Tink Link URL with the delegation code.
    const params = new URLSearchParams({
      client_id: process.env.EXPO_PUBLIC_TINK_CLIENT_ID,
      redirect_uri: process.env.TINK_REDIRECT_URI,
      authorization_code: grant.code,
      market: 'ES',
      locale: 'es_ES',
    });
    const url = `${LINK_BASE}/1.0/transactions/connect-accounts?${params.toString()}`;

    return res.status(200).json({ url });
  } catch (err) {
    console.error('[tink-auth]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
