const key = process.env.ALPACA_BROKER_KEY;
const secret = process.env.ALPACA_BROKER_SECRET;
const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

async function fundAccount() {
  const res = await fetch('https://broker-api.sandbox.alpaca.markets/v1/journals', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from_account: '99d0ebb8-f37a-3c60-a3b6-75726035100e',
      entry_type: 'JNLC',
      to_account: '197792d5-06bb-4344-aefc-5090ceea1de6',
      amount: '1000',
      description: 'sandbox test funding',
    }),
  });
  const data = await res.json();
  console.log(data);
}

fundAccount();
