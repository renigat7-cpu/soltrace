export interface Trade {
  token: string;
  symbol: string;
  side: 'buy' | 'sell';
  usd: number | null;
  sol: number | null;
  dex: string;
  pool: string;
  ts: number | null;
  sig: string;
}

export interface PnlRow {
  wallet: string;
  pnl: number | null;
  rank: number | null;
}

export interface TrendingItem {
  symbol: string;
  mint: string;
  usd: number | null;
  pct24h: number | null;
}

export interface ChainStatus {
  source: 'solami-rpc' | 'public';
  health: string;
  slot: number | null;
}