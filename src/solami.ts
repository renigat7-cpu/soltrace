import type { ChainStatus, PnlRow, Trade, TrendingItem } from './types'

const API = 'https://api.solami.dev'
export const RPC_SOLAMI = 'https://rpc.solami.dev/sol'
const RPC_PUBLIC = 'https://api.mainnet-beta.solana.com'
const WS_BLUR = 'wss://ws.solami.dev/data/subscribe?chain=solana'

export function pick(o: unknown, keys: string[]): unknown {
  if (!o || typeof o !== 'object') return undefined
  const rec = o as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function tsOf(v: unknown): number | null {
  const raw = num(v)
  if (raw === null) return null
  return raw > 1e12 ? raw : raw * 1000
}

function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>
    for (const k of ['trades', 'data', 'items', 'rows', 'result']) {
      if (Array.isArray(rec[k])) return rec[k] as unknown[]
    }
  }
  return []
}

function shortAddr(s: unknown): string {
  const str = typeof s === 'string' ? s : ''
  if (str.length <= 10) return str || '—'
  return `${str.slice(0, 4)}…${str.slice(-4)}`
}

export function toTrades(o: unknown): Trade[] {
  return asArr(o)
    .map((it) => {
      const side = String(pick(it, ['side', 'sbb', 'action']) ?? '').toLowerCase()
      const sig = String(pick(it, ['signature', 'sig', 'tx', 'txid', 'txHash']) ?? '')
      return {
        token: String(pick(it, ['token', 'mint', 'tokenAddress', 'token_mint']) ?? ''),
        symbol: String(pick(it, ['symbol', 'tokenSymbol', 'name']) ?? '?'),
        side: side.startsWith('b') ? ('buy' as const) : side.startsWith('s') ? ('sell' as const) : ('buy' as const),
        usd: num(pick(it, ['usd', 'usd_value', 'valueUsd', 'amountUsd', 'usdValue', 'quoteUsd'])),
        sol: num(pick(it, ['sol', 'sol_value', 'solValue', 'amountSol', 'lamports'])),
        dex: String(pick(it, ['dex', 'venue', 'program', 'poolName', 'market']) ?? '—'),
        pool: String(pick(it, ['pool', 'poolId', 'marketId']) ?? '—'),
        ts: tsOf(pick(it, ['ts', 'created_at', 'createdAt', 'time', 'unix_time', 'timestamp'])),
        sig,
      }
    })
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
}

export function toPnl(o: unknown): PnlRow[] {
  return asArr(o).map((it, i) => ({
    wallet: String(pick(it, ['wallet', 'address', 'owner', 'trader']) ?? '—'),
    pnl: num(pick(it, ['pnl', 'realized_pnl', 'realizedPnl', 'totalPnl'])),
    rank: num(pick(it, ['rank', 'position'])) ?? i + 1,
  }))
}

export function toTrending(o: unknown): TrendingItem[] {
  return asArr(o).map((it) => ({
    symbol: String(pick(it, ['symbol', 'name']) ?? '?'),
    mint: String(pick(it, ['mint', 'token', 'address']) ?? ''),
    usd: num(pick(it, ['price', 'usd', 'priceUsd'])),
    pct24h: num(pick(it, ['change_24h', 'pct24h', 'change', 'price24hChange'])),
  }))
}

async function jsonReq(url: string, key?: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'x-api-key': key ?? '', Authorization: key ? `Bearer ${key}` : '' },
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { message?: string }
      if (body && body.message) msg = body.message
    } catch {
      /* non-JSON error */
    }
    throw new Error(key ? msg : `${msg} (no key)`)
  }
  return res.json()
}

export async function fetchTrades(key: string, minUsd: number): Promise<Trade[]> {
  const q = minUsd > 0 ? `?min_usd=${minUsd}` : ''
  const [recent, large] = await Promise.all([
    jsonReq(`${API}/data/trades/recent${q}`, key).then(toTrades),
    jsonReq(`${API}/data/trades/large${q}`, key).then(toTrades),
  ])
  return [...large, ...recent].slice(0, 40)
}

export async function fetchLeaderboard(key: string): Promise<PnlRow[]> {
  return jsonReq(`${API}/data/pnl/leaderboard`, key).then(toPnl)
}

export async function fetchTrending(key: string): Promise<TrendingItem[]> {
  return jsonReq(`${API}/data/token/trending`, key).then(toTrending)
}

export async function fetchTradesFromRpc(key?: string): Promise<Trade[]> {
  const endpoint = key ? `${RPC_SOLAMI}?api_key=${key}` : RPC_PUBLIC
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getRecentPerformanceSamples',
    params: [4],
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const data = (await res.json()) as { result?: Array<Record<string, unknown>> }
  const rows = data.result ?? []
  return rows
    .map((it, i) => ({
      token: 'SOL',
      symbol: 'SOL',
      side: 'buy' as const,
      usd: num(it.numTransactions),
      sol: num(it.numSlots),
      dex: 'solana',
      pool: it.samplePeriodSecs ? `${it.samplePeriodSecs}s` : '—',
      ts: Date.now() - i * 60000,
      sig: `slot ${it.slot}-${it.numSlots}`,
    }))
    .slice(0, 4)
}

export async function rpcPing(key?: string): Promise<ChainStatus> {
  const endpoint = key ? `${RPC_SOLAMI}?api_key=${key}` : RPC_PUBLIC
  const call = (method: string, params: unknown[] = []) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = (await r.json()) as { result?: unknown; error?: { message?: string } }
        if (j.error) throw new Error(j.error.message ?? 'rpc error')
        return j.result
      })
      .catch(() => null)

  const [health, slot] = await Promise.all([call('getHealth'), call('getSlot')])
  return {
    source: key ? 'solami-rpc' : 'public',
    health: health === 'ok' || health !== null ? 'ok' : 'error',
    slot: typeof slot === 'number' ? slot : null,
  }
}

export function openTradeSocket(key: string, onTrade: (t: Trade) => void): () => void {
  const ws = new WebSocket(`${WS_BLUR}&api_key=${key}`)
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as unknown
      if (msg && typeof msg === 'object') {
        const rec = msg as Record<string, unknown>
        const payload = rec.data ?? rec.event ?? rec
        if (rec.type && !rec.data) {
          if (String(rec.type) === 'trade') onTrade(toTrades([payload])[0])
        } else {
          const t = toTrades([payload])[0]
          if (t.token) onTrade(t)
        }
      }
    } catch {
      /* ignore non-JSON keep-alives */
    }
  }
  return () => {
    try {
      ws.close()
    } catch {
      /* noop */
    }
  }
}

export function fmtUsd(v: number | null): string {
  if (v === null) return '—'
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`
  return `$${v.toFixed(2)}`
}

export function fmtSol(v: number | null): string {
  return v === null ? '—' : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}◎`
}

export function shortWallet(s: string): string {
  return shortAddr(s)
}