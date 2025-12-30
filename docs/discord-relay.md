# Discord relay testing

Run curl in a terminal. Example request:

```bash
curl -X POST "https://ccapp.shawnpeiris22.workers.dev/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"dice.roll","actor":{"vigilanteName":"Test","uid":"local"},"detail":{"total":20},"ts":1730000000000}'
```

If you want to test from the browser console, use fetch:

```js
fetch('https://ccapp.shawnpeiris22.workers.dev/', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'dice.roll',
    actor: { vigilanteName: 'Test', uid: 'local' },
    detail: { total: 20 },
    ts: Date.now(),
  }),
}).then(res => res.status).then(console.log).catch(console.warn);
```
