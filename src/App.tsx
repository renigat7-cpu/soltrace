import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  fetchLeaderboard,
  fetchTrades,
  fetchTradesFromRpc,
  fetchTrending,
  fmtSol,
  fmtUsd,
  openTradeSocket,
  rpcPing,
  shortWallet,
} from './solami'
import type { ChainStatus, PnlRow, Trade, TrendingItem } from './types'

const LS_KEY = 'soltrace.solami_key'
const LS_MIN = 'soltrace.min_usd'

function timeAgo(ts: number | null): string {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function SideBadge({ side }: { side: Trade['side'] }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
        side === 'buy' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {side}
    </span>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur">
      <header className="flex items-baseline justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white/90">{title}</h2>
        {hint ? <span className="text-[11px] text-white/40">{hint}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function App() {
  const [key, setKey] = useState<string>(
    () => localStorage.getItem(LS_KEY) ?? import.meta.env.VITE_SOLAMI_KEY ?? '',
  )
  const [minUsd, setMinUsd] = useState<number>(() => Number(localStorage.getItem(LS_MIN) ?? '5000'))
  const [pollMs, setPollMs] = useState<number>(15000)
  const [trades, setTrades] = useState<Trade[]>([])
  const [rows, setRows] = useState<PnlRow[]>([])
  const [trend, setTrend] = useState<TrendingItem[]>([])
  const [chain, setChain] = useState<ChainStatus | null>(null)
  const [error, setError] = useState<string>('')
  const [updated, setUpdated] = useState<number>(0)
  const [live, setLive] = useState(false)

  useEffect(() => {
    localStorage.setItem(LS_KEY, key)
    localStorage.setItem(LS_MIN, String(minUsd))
  }, [key, minUsd])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const status = await rpcPing(key || undefined)
        if (!cancelled) setChain(status)
      } catch {
        if (!cancelled) setChain(null)
      }
      if (!key) {
        try {
          const fb = await fetchTradesFromRpc()
          if (!cancelled) setTrades(fb)
        } catch {
          /* keep previous */
        }
        if (!cancelled) setUpdated(Date.now())
        return
      }
      try {
        const [t, l, tr] = await Promise.all([
          fetchTrades(key, minUsd),
          fetchLeaderboard(key),
          fetchTrending(key),
        ])
        if (cancelled) return
        setTrades(t)
        setRows(l)
        setTrend(tr)
        setError('')
        setUpdated(Date.now())
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [key, minUsd, pollMs])

  useEffect(() => {
    if (!key) {
      setLive(false)
      return
    }
    const close = openTradeSocket(key, (t) => {
      setTrades((prev) => [t, ...prev].slice(0, 40))
    })
    setLive(true)
    return () => {
      setLive(false)
      close()
    }
  }, [key])

  const pressure = useMemo(() => {
    let buy = 0
    let sell = 0
    for (const t of trades) {
      const v = t.usd ?? (t.sol !== null ? t.sol : 0)
      if (t.side === 'buy') buy += v
      else sell += v
    }
    const total = buy + sell
    return { buy, sell, buyPct: total > 0 ? Math.round((buy / total) * 100) : 50 }
  }, [trades])

  return (
    <div className="min-h-screen bg-[#070a12] text-white/80">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.12),transparent_55%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 font-black text-[#06121a]">
              ST
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">SolTrace</h1>
              <p className="text-xs text-white/45">Solana smart-money radar · data path: Solami Blur</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {live ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> WS LIVE
              </span>
            ) : null}
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                chain?.health === 'ok' ? 'bg-white/10 text-white/70' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {chain ? `${chain.source} · ${chain.health}` : 'connecting…'}
              {chain?.slot ? ` · slot ${chain.slot.toLocaleString()}` : ''}
            </span>
          </div>
        </header>

        <div className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur md:grid-cols-[1fr_auto_auto]">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-white/40">Solami API key (DataApi)</span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
              placeholder="paste your key — stored only in this browser"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-white/40">Min USD</span>
            <input
              type="number"
              value={minUsd}
              onChange={(e) => setMinUsd(Number(e.target.value) || 0)}
              className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-white/40">Poll (s)</span>
            <input
              type="number"
              value={Math.round(pollMs / 1000)}
              onChange={(e) => setPollMs(Math.max(5, Number(e.target.value) || 15) * 1000)}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
            />
          </label>
        </div>

        <div className="mb-6 flex items-center justify-between text-xs text-white/40">
          <span>
            {key
              ? `Live via api.solami.dev · ${updated ? `updated ${timeAgo(updated)}` : 'loading…'}`
              : 'No API key — showing public mainnet RPC health. Paste a Solami key to unlock the radar.'}
          </span>
          {error ? <span className="text-rose-300">{error}</span> : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Large-trade radar" hint={`${trades.length} events`}>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-rose-500/30">
                  <div className="h-full bg-emerald-400" style={{ width: `${pressure.buyPct}%` }} />
                </div>
                <span className="text-xs text-white/50">
                  {pressure.buyPct}% buy / {100 - pressure.buyPct}% sell
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-white/35">
                    <tr>
                      <th className="py-2 pr-3">Age</th>
                      <th className="py-2 pr-3">Token</th>
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">USD</th>
                      <th className="py-2 pr-3">SOL</th>
                      <th className="py-2 pr-3">DEX</th>
                      <th className="py-2">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {trades.map((t, i) => (
                      <tr key={`${t.sig}-${i}`} className="text-white/75">
                        <td className="py-2 pr-3 text-white/40">{timeAgo(t.ts)}</td>
                        <td className="py-2 pr-3 font-medium text-white">{t.symbol}</td>
                        <td className="py-2 pr-3">
                          <SideBadge side={t.side} />
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{fmtUsd(t.usd)}</td>
                        <td className="py-2 pr-3 tabular-nums">{fmtSol(t.sol)}</td>
                        <td className="py-2 pr-3 text-white/50">{t.dex}</td>
                        <td className="py-2 font-mono text-xs text-cyan-300/70">
                          {t.sig ? t.sig.slice(0, 10) : '—'}
                        </td>
                      </tr>
                    ))}
                    {trades.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-white/35">
                          {key ? 'Waiting for trades…' : 'Paste a Solami key to stream decoded trades.'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card title="PnL leaderboard" hint="wallets">
              <ol className="space-y-2 text-sm">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={`${r.wallet}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-right text-white/35">{r.rank ?? i + 1}</span>
                      <span className="font-mono text-xs text-white/70">{shortWallet(r.wallet)}</span>
                    </span>
                    <span
                      className={`tabular-nums ${
                        (r.pnl ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {fmtUsd(r.pnl)}
                    </span>
                  </li>
                ))}
                {rows.length === 0 ? <li className="py-3 text-center text-white/35">—</li> : null}
              </ol>
            </Card>

            <Card title="Trending tokens" hint="24h">
              <ul className="space-y-2 text-sm">
                {trend.slice(0, 8).map((t, i) => (
                  <li key={`${t.mint}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white/80">{t.symbol}</span>
                    <span className="flex items-center gap-3 tabular-nums text-white/55">
                      <span>{fmtUsd(t.usd)}</span>
                      <span className={(t.pct24h ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                        {t.pct24h === null ? '—' : `${t.pct24h >= 0 ? '+' : ''}${t.pct24h.toFixed(1)}%`}
                      </span>
                    </span>
                  </li>
                ))}
                {trend.length === 0 ? <li className="py-3 text-center text-white/35">—</li> : null}
              </ul>
            </Card>
          </div>
        </div>

        <footer className="mt-8 text-center text-[11px] text-white/30">
          SolTrace · demo build · data via Solami Blur (api.solami.dev) + Solami RPC · key never leaves your browser
        </footer>
      </div>
    </div>
  )
}