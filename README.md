# SolTrace — Solana Smart-Money Radar

Real-time Solana market radar built on **Solami** decoded data. It streams large trades,
shows buy/sell pressure, tracks a PnL leaderboard, and lists trending tokens — all live
against Solana **mainnet**.

> Built for the Solami track *"Build something live on Solana data"* (Crypto World's Fair).

## What Solami powers

| Feature | Solami product | Endpoint |
| --- | --- | --- |
| Large-trade radar (decoded trades) | **Blur** REST | `GET https://api.solami.dev/data/trades/recent`, `GET /data/trades/large` |
| Realtime push of trades | **Blur** WebSocket | `wss://ws.solami.dev/data/subscribe?chain=solana` |
| Smart-money PnL leaderboard | **Blur** wallet analytics | `GET /data/pnl/leaderboard` |
| Trending tokens | **Blur** | `GET /data/token/trending` |
| Chain health / slot | **Solami RPC** | `https://rpc.solami.dev/sol` (`getHealth`, `getSlot`) |

Without a key the app falls back to the public Solana RPC so the page is always live; paste a
Solami key (DataApi permission) to unlock decoded trades, PnL and trends.

## Run locally

```bash
npm install
npm run dev
# open http://127.0.0.1:5173 and paste your Solami API key
```

The key is kept **only in `localStorage`** of your browser and sent directly to
`api.solami.dev` — nothing is proxied through a server, so the build can be hosted as a
static site.

### Optional: build-time key

Create `.env.local`:

```
VITE_SOLAMI_KEY=your_dataapi_key
```

`src/solami.ts` reads a browser key first; env is a convenience for local demos only — never
commit it.

## Build & deploy

```bash
npm run build      # outputs dist/
```

`vite.config.ts` sets `base: './'`, so `dist/` can be served from any subpath (e.g. GitHub
Pages project pages) with no extra config.

## Architecture

```
src/
  solami.ts   typed client: REST calls, WebSocket subscription, RPC ping, field normalizers
  types.ts    Trade / PnlRow / TrendingItem / ChainStatus
  App.tsx     dashboard UI (polling + live WS overlay)
```

- **Polling** refreshes trades / leaderboard / trends every N seconds (configurable in the UI).
- **WebSocket** overlays new decoded trades instantly when a key is present (`WS LIVE` badge).
- Response normalizers tolerate the beta field aliases of the Blur API.

## Notes

- Blur endpoints are in BETA; historical ranges can be re-indexed.
- Get a key: sign in at <https://solami.dev> → API keys → permission **DataApi**.
