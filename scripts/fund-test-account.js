const key = process.env.ALPACA_BROKER_KEY;
const secret = process.env.ALPACA_BROKER_SECRET;
const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

const targetAccountId = process.argv[2] || '197792d5-06bb-4344-aefc-5090ceea1de6';

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
      to_account: targetAccountId,
      amount: '1000',
      description: 'sandbox test funding',
    }),
  });
  const data = await res.json();
  console.log(data);
  console.log('\n--- Funding Summary ---');
  console.log('Journal ID:      ', data.id);
  console.log('Amount journaled: $1000');
  console.log('Target account:  ', targetAccountId);
  console.log('\nWait a few minutes for settlement, then try the trade.');
}

fundAccount();
