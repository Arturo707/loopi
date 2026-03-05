// POST { accessToken } → { balance, currency, accountId, iban }
//                    OR  { expired: true } when the token has expired (401)
// Used by the dashboard "Actualizar saldo" button.

const TINK_BASE = 'https://api.tink.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function parseAmount(value) {
  if (!value) return 0;
  return parseInt(value.unscaledValue, 10) / Math.pow(10, parseInt(value.scale, 10));
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accessToken } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: 'accessToken required' });

  try {
    const accountsRes = await fetch(`${TINK_BASE}/data/v2/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (accountsRes.status === 401) {
      return res.status(401).json({ expired: true });
    }
    if (!accountsRes.ok) throw new Error(`Accounts fetch failed: ${accountsRes.status}`);

    const accountsData = await accountsRes.json();
    const account = accountsData.accounts?.[0];
    if (!account) throw new Error('No accounts found.');

    const balanceValue =
      account.balances?.available?.amount?.value ||
      account.balances?.booked?.amount?.value;
    const currency =
      account.balances?.available?.amount?.currencyCode ||
      account.balances?.booked?.amount?.currencyCode ||
      'EUR';

    return res.status(200).json({
      accountId: account.id,
      balance: parseAmount(balanceValue),
      currency,
      iban: account.identifiers?.iban?.iban ?? null,
    });
  } catch (err) {
    console.error('[tink-balance]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
