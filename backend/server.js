// wall-badge backend — minimal, standalone.
// This is the ~150 lines the extension actually depends on, extracted from
// the much bigger wallet-analyzer server.js (which powers a separate
// product and isn't needed here). Deploy this file alone.
//
// Data source: GMGN.ai's internal API, scraped via curl with spoofed
// browser headers (User-Agent/Referer/Origin) to avoid Cloudflare — this is
// free and keyless, but MUST run server-side. Browsers refuse to let
// JavaScript set a custom User-Agent (a "forbidden header"), and GMGN's
// server doesn't send CORS headers permitting a browser to read it
// directly — so this can't be ported into the extension itself no matter
// what. That's the whole reason this backend exists.
//
// No third-party API key is required to run this.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const DEBUG = process.env.DEBUG === '1';

app.use(cors({
  // Only allow requests whose Origin is an extension page (chrome-extension://…
  // or moz-extension://…). This blocks any regular website's own JavaScript
  // from calling this local server directly — previously `origin: '*'`
  // let any open tab hit localhost:3001 on the user's behalf.
  // Requests with no Origin header (curl, health checks, server-to-server)
  // are still allowed, since those aren't the browser-tab attack this guards
  // against.
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (/^(chrome|moz)-extension:\/\//.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());

/* ── curl binary resolution ──
 * Windows System32 curl lacks brotli support and fails on GMGN's
 * br-compressed responses — prefer git-for-windows curl when present.
 * On Linux/Mac hosts (Render, Fly, Railway, etc.) system curl works fine. */
const CURL_BIN = (() => {
  const candidates = [
    'C:/Program Files/Git/mingw64/bin/curl.exe',
    'C:/Program Files/Git/usr/bin/curl.exe',
    'C:/mingw64/bin/curl.exe',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return 'curl'; // resolved via PATH — this is what most Linux hosts hit
})();
const CURL_HAS_BROTLI = CURL_BIN.includes('Git') || CURL_BIN.includes('mingw') || CURL_BIN === 'curl';

const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isValidSolanaAddress(addr) {
  return typeof addr === 'string' && SOLANA_RE.test(addr.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function periodToSec(period) {
  const map = { '1d': 86400, '3d': 3 * 86400, '7d': 7 * 86400, '30d': 30 * 86400, 'd1': 86400, 'd3': 3 * 86400, 'd7': 7 * 86400, 'd30': 30 * 86400 };
  return map[period] || 7 * 86400;
}

const GMGN_UAs = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
];

const DEFAULT_BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': CURL_HAS_BROTLI ? 'gzip, deflate, br' : 'gzip, deflate',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Microsoft Edge";v="126"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

function curlJson(url, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-L', '--http1.1', '--max-time', String(Math.round(timeoutMs / 1000)), '--compressed'];
    const merged = { ...DEFAULT_BROWSER_HEADERS, ...headers };
    for (const [k, v] of Object.entries(merged)) {
      args.push('-H', `${k}: ${v}`);
    }
    args.push(url);
    execFile(CURL_BIN, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout.trim()) return reject(new Error('empty curl response'));
      // Detect Cloudflare challenge page (HTML instead of JSON)
      const trimmed = stdout.trimStart();
      if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
        return reject(new Error('cloudflare_challenge'));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`invalid json: ${stdout.slice(0, 120)}`));
      }
    });
  });
}

/* ── tiny in-memory TTL cache — no database needed ── */
const _cache = new Map();
const _MAX_CACHE_ENTRIES = 500;
function cacheGet(key, ttlSec = 120) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlSec * 1000) {
    _cache.delete(key);
    return null;
  }
  return entry.v;
}
function cacheSet(key, value, ttlSec = 120) {
  if (_cache.size >= _MAX_CACHE_ENTRIES) {
    const sorted = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < Math.ceil(sorted.length * 0.2); i++) _cache.delete(sorted[i][0]);
  }
  _cache.set(key, { v: value, ts: Date.now() });
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of _cache) {
    if (now - e.ts > 600 * 1000) _cache.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

/* ── GMGN wallet activity (the real data source) ── */
// Now chain-aware: gmgnWalletActivity(wallet, limit, chain)
// chain = 'sol' (default, existing behavior) | 'bsc' | 'eth' | 'base'
async function gmgnWalletActivity(wallet, limit = 100, chain = 'sol') {
  const cacheKey = `gmgn:activity:${chain}:${wallet}:${limit}`;
  const cached = cacheGet(cacheKey, 90);
  if (cached && cached.length > 0) return cached;

  const chainPath = chain === 'sol' ? 'sol' : chain; // 'sol', 'bsc', 'eth', 'base'
  const headers = {
    'User-Agent': GMGN_UAs[0],
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `https://gmgn.ai/${chainPath}/address/${wallet}`,
    'Origin': 'https://gmgn.ai',
    'DNT': '1',
    'Connection': 'keep-alive',
  };
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ua = GMGN_UAs[attempt % GMGN_UAs.length];
      const j = await curlJson(
        `https://gmgn.ai/vas/api/v1/wallet_activity/${chainPath}?wallet=${encodeURIComponent(wallet)}&limit=${limit}`,
        { ...headers, 'User-Agent': ua },
        8000 + attempt * 4000,
      );
      const acts = j?.data?.activities || [];
      if (acts.length > 0) {
        cacheSet(cacheKey, acts, 90);
        return acts;
      }
      if (attempt === 0) continue;
      return [];
    } catch (err) {
      lastErr = err;
      if (err.message === 'cloudflare_challenge') break;
      await sleep(400 + attempt * 500);
    }
  }
  if (DEBUG) console.warn(`[gmgnWalletActivity:${chain}] failed for`, wallet.slice(0, 8), lastErr?.message);
  return [];
}

/* ── FIFO buy/sell matching → average + median hold time ── */
function avgHoldFromGmgnActivities(activities, period = '7d') {
  // A single matched trade is still a valid median (n=1) — only bail when
  // there's truly nothing to compute from. Previously this required 2+ raw
  // activities before even attempting FIFO matching, which silently pushed
  // a lot of wallets down to the wallet_stat fallback below — a source that
  // has no per-trade data and therefore can never report a median. That's
  // the actual reason the badge sometimes shows avg with no median line.
  if (!activities || activities.length < 1) return null;
  const windowSec = periodToSec(period);
  const cutoff = Math.floor(Date.now() / 1000) - windowSec;
  // Filter: only buy/sell events, within time window, from DEX swaps (not transfers)
  const trades = activities
    .filter(a => {
      if (a?.event_type !== 'buy' && a?.event_type !== 'sell') return false;
      if (a.timestamp < cutoff) return false;
      // Skip pure transfers — only count actual DEX swaps
      // GMGN activity entries have a "source" or "platform" field
      // If it's a transfer (no swap), skip it
      const source = (a?.source || a?.platform || a?.dex || '').toString().toLowerCase();
      if (source === 'transfer' || source === 'transfer_token') return false;
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  if (trades.length < 1) return null;

  const tokenTrades = {};
  for (const t of trades) {
    const ca = t?.token?.address;
    if (!ca) continue;
    if (!tokenTrades[ca]) tokenTrades[ca] = [];
    tokenTrades[ca].push(t);
  }

  let totalHoldSec = 0;
  const allHolds = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (const list of Object.values(tokenTrades)) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    const buyQueue = [];
    for (const t of list) {
      if (t.event_type === 'buy') {
        buyQueue.push(t.timestamp);
      } else if (t.event_type === 'sell' && buyQueue.length > 0) {
        const buyTs = buyQueue.shift();
        const hold = Math.min(t.timestamp - buyTs, windowSec);
        totalHoldSec += hold;
        allHolds.push(hold);
      }
    }
    for (const buyTs of buyQueue) {
      const hold = Math.min(nowSec - buyTs, windowSec);
      totalHoldSec += hold;
      allHolds.push(hold);
    }
  }
  if (!allHolds.length) return null;
  if (process.env.WALLIO_DEBUG_HOLD) {
    const allTs = trades.map(t => t.timestamp).sort((a,b)=>a-b);
    console.log('[debug-hold] period=' + period + ' windowSec=' + windowSec + ' trades=' + trades.length + ' oldestTradeAgoH=' + Math.round((Date.now()/1000 - allTs[0])/3600) + ' newestTradeAgoH=' + Math.round((Date.now()/1000 - allTs[allTs.length-1])/3600));
  }

  // Median calculation — more robust than average against outliers
  const sorted = [...allHolds].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianSec = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

  return {
    avgSec: Math.round(totalHoldSec / allHolds.length),
    medianSec,
    lastActive: Math.max(...trades.map(t => t.timestamp)),
    tradeCount: trades.length,
  };
}

/* ── basic per-IP rate limit — no dependency needed for this scale ──
 * Loosen/replace with a proper library (e.g. express-rate-limit) once
 * traffic justifies it. */
const _rateBuckets = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const maxPerWindow = 60; // 60 requests/min/IP — generous for hover-driven usage
  const bucket = _rateBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count++;
  _rateBuckets.set(ip, bucket);
  if (bucket.count > maxPerWindow) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down.' });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of _rateBuckets) {
    if (now > b.resetAt + 300_000) _rateBuckets.delete(ip);
  }
}, 5 * 60 * 1000).unref?.();

/* ── GMGN wallet profile (pnl / winrate / tags) ── */
async function fetchWalletProfile(address) {
  const cacheKey = `gmgn:profile:${address}`;
  const cached = cacheGet(cacheKey, 180);
  if (cached) return cached;
  try {
    const j = await curlJson(
      `https://gmgn.ai/vas/api/v1/wallet/profile/sol/${address}`,
      {
        'User-Agent': GMGN_UAs[0],
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://gmgn.ai/?chain=sol',
        'Origin': 'https://gmgn.ai',
      },
      12000,
    );
    const data = j?.data || null;
    if (data) cacheSet(cacheKey, data, 180);
    return data;
  } catch {
    return null;
  }
}

/* ── Helius API fallback ──
 * When GMGN fails (Cloudflare block, rate limit, downtime),
 * Helius provides parsed transaction history that we can run the
 * same FIFO matching on. Requires a Helius API key set via
 * HELIUS_API_KEY env var or sent by the extension in X-Helius-Key header.
 */
async function heliusWalletActivity(wallet, period = '7d', apiKey = null) {
  const key = apiKey || process.env.HELIUS_API_KEY;
  if (!key) return [];

  const cacheKey = `helius:activity:${wallet}:${period}`;
  const cached = cacheGet(cacheKey, 90);
  if (cached && cached.length > 0) return cached;

  const windowSec = periodToSec(period);
  const cutoffTs = Math.floor(Date.now() / 1000) - windowSec;

  // Hard timeout guard — kill everything after 10s no matter what
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; }, 10000);

  try {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 'wallio',
      method: 'getSignaturesForAddress',
      params: {
        address: wallet,
        limit: 100,
        before: undefined,
      },
    });

    const resp = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    const sigs = data?.result || [];

    // Parse each signature for swap events
    const activities = [];
    for (const sig of sigs) {
      if (timedOut) break;
      if (sig.blockTime && sig.blockTime < cutoffTs) continue;
      try {
        const txBody = JSON.stringify({
          jsonrpc: '2.0',
          id: 'wallio-tx',
          method: 'getTransaction',
          params: [sig.signature, { maxSupportedTransactionVersion: 0 }],
        });
        const txResp = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: txBody,
        });
        if (!txResp.ok) continue;
        const txData = await txResp.json();
        const tx = txData?.result;
        if (!tx) continue;

        // Parse swap events from transaction
        const instructions = tx?.transaction?.message?.instructions || [];
        for (const ix of instructions) {
          // Jupiter swap VI
          if (ix?.programId && ix.programId.includes('JUP6LkbZbjS1jKKwapdHNy74zcZ3kLU4ofH22JtZJtK')) {
            activities.push({
              event_type: 'swap',
              timestamp: sig.blockTime,
              token: { address: null },
              source: 'jupiter',
              signature: sig.signature,
            });
          }
        }

        // Use token transfers from inner instructions
        const inner = tx?.meta?.innerInstructions || [];
        for (const group of inner) {
          for (const i of group.instructions) {
            const parsed = i?.parsed;
            if (parsed?.type === 'transfer' && parsed?.info) {
              const amount = Number(parsed.info.amount || parsed.info.tokenAmount?.amount || 0);
              const isBuy = parsed.info.source === wallet;
              activities.push({
                event_type: isBuy ? 'buy' : 'sell',
                timestamp: sig.blockTime,
                token: { address: parsed.info.mint || null },
                source: 'helius-transfer',
                amount,
              });
            }
          }
        }
      } catch {}
    }

    if (activities.length > 0) cacheSet(cacheKey, activities, 90);
    return activities;
  } catch (err) {
    if (DEBUG) console.warn('[heliusWalletActivity] failed:', err.message);
    return [];
  } finally {
    clearTimeout(deadline);
  }
}

/* ── Etherscan/BSCScan wallet activity (EVM fallback) ── */
// Uses the Etherscan-compatible API (works for Etherscan, BSCScan, BaseScan).
// Free tier: 5 req/s, 100k req/day. API key optional but recommended.
// Returns activities in the same { timestamp, type, token, amount } format
// as GMGN activities so the FIFO matcher can consume them unchanged.
async function etherscanWalletActivity(wallet, chain = 'eth', apiKey = null) {
  const cacheKey = `etherscan:activity:${chain}:${wallet}`;
  const cached = cacheGet(cacheKey, 90);
  if (cached && cached.length > 0) return cached;

  // Etherscan's V2 API unifies all supported chains (Ethereum, BSC, Base,
  // and others) behind a single endpoint + single API key, selected via
  // chainid. This replaced the old per-site (etherscan.io / bscscan.com /
  // basescan.org) V1 APIs, each of which needed its own separate key —
  // a single Etherscan key obtained today already covers all three.
  const CHAIN_IDS = { eth: 1, bsc: 56, base: 8453 };
  const chainId = CHAIN_IDS[chain] || 1;
  const apiBase = 'https://api.etherscan.io/v2/api';

  const keyParam = apiKey ? `&apikey=${apiKey}` : '';
  // Fetch normal transactions (outgoing + incoming) for this wallet.
  // txlist returns: { hash, from, to, value, timeStamp, tokenSymbol, ... }
  // We only need buys/sells of tokens — for EVM that means ERC-20 transfers.
  // Use tokentx action for ERC-20 token transfers.
  try {
    const j = await curlJson(
      `${apiBase}?chainid=${chainId}&module=account&action=tokentx&address=${encodeURIComponent(wallet)}&startblock=0&endblock=99999999&page=1&offset=200&sort=desc${keyParam}`,
      { 'Accept': 'application/json', 'User-Agent': 'WallioBadge/1.3' },
      10000,
    );
    if (!j?.result || !Array.isArray(j.result)) return [];

    // Map Etherscan token transfers → same format as GMGN activities
    // Each ERC-20 transfer has: from, to, value, tokenSymbol, tokenDecimal, timeStamp, hash
    // A "buy" = wallet received tokens (to == wallet)
    // A "sell" = wallet sent tokens (from == wallet)
    const wLower = wallet.toLowerCase();
    const activities = j.result
      .filter(tx => tx && tx.timeStamp && tx.from && tx.to)
      .map(tx => {
        const from = tx.from.toLowerCase();
        const to = tx.to.toLowerCase();
        if (to === wLower) {
          // incoming → buy
          return {
            timestamp: parseInt(tx.timeStamp),
            event_type: 'buy',
            token: { address: tx.contractAddress || tx.tokenSymbol || 'unknown' },
            amount: tx.value ? (parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || 18))) : 0,
            source: 'etherscan',
            hash: tx.hash,
          };
        } else if (from === wLower) {
          // outgoing → sell
          return {
            timestamp: parseInt(tx.timeStamp),
            event_type: 'sell',
            token: { address: tx.contractAddress || tx.tokenSymbol || 'unknown' },
            amount: tx.value ? (parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || 18))) : 0,
            source: 'etherscan',
            hash: tx.hash,
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (activities.length > 0) cacheSet(cacheKey, activities, 90);
    return activities;
  } catch (err) {
    if (DEBUG) console.warn(`[etherscanWalletActivity:${chain}] failed:`, err.message);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════
   ROUTES
   ═══════════════════════════════════════════════════════ */

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/wallet/:address/quick', rateLimit, async (req, res) => {
  const address = (req.params.address || '').trim();
  if (!isValidSolanaAddress(address)) return res.status(400).json({ error: 'invalid_address' });
  const period = req.query.period || '7d';

  const [holdResult, profile] = await Promise.all([
    (async () => {
      try {
        const acts = await gmgnWalletActivity(address, 400);
        const h = avgHoldFromGmgnActivities(acts, period);
        if (h) return { avg_hold_sec: h.avgSec, trade_count: h.tradeCount, last_active: h.lastActive, source: 'gmgn-activity' };
      } catch {}
      try {
        const j = await curlJson(
          `https://gmgn.ai/api/v1/wallet_stat/sol/${address}/${period}`,
          { 'User-Agent': GMGN_UAs[0], 'Accept': 'application/json, text/plain, */*', 'Referer': `https://gmgn.ai/sol/address/${address}`, 'Origin': 'https://gmgn.ai' },
          10000,
        );
        const d = j?.data;
        if (d) {
          const avgHoldSec = Number(d?.avg_holding_peroid ?? d?.avg_holding_period ?? 0);
          return { avg_hold_sec: avgHoldSec, trade_count: null, last_active: d?.last_active_timestamp || null, source: 'gmgn' };
        }
      } catch {}
      return null;
    })(),
    fetchWalletProfile(address),
  ]);

  if (!holdResult && !profile) {
    return res.status(503).json({ error: 'no_data', message: 'Wallet analytics unavailable' });
  }

  const d = profile || {};
  return res.json({
    address,
    period,
    avg_hold_sec: holdResult?.avg_hold_sec ?? null,
    trade_count: holdResult?.trade_count ?? null,
    last_active: holdResult?.last_active ?? null,
    source: holdResult?.source || 'gmgn',
    pnl_7d: d.realized_profit_7d ?? d.pnl_7d ?? null,
    pnl_30d: d.realized_profit_30d ?? d.pnl_30d ?? null,
    winrate_7d: d.winrate_7d ?? null,
    winrate_30d: d.winrate_30d ?? null,
    buy_7d: d.buy_7d ?? null,
    sell_7d: d.sell_7d ?? null,
    buy_30d: d.buy_30d ?? null,
    sell_30d: d.sell_30d ?? null,
    tags: d.tags || d.wallet_tags || [],
    total_value: d.total_value ?? d.total_sol ?? null,
  });
});

app.post('/api/wallet/:wallet/avg-hold', rateLimit, async (req, res) => {
  const wallet = (req.params.wallet || '').trim();
  const period = req.query.period || '7d';
  const chain = req.query.chain || 'sol';
  const heliusKey = req.headers['x-helius-key'] || null;
  const etherscanKey = req.headers['x-etherscan-key'] || process.env.ETHERSCAN_API_KEY || null;

  // Validate address based on chain
  if (chain === 'sol') {
    if (!isValidSolanaAddress(wallet)) return res.status(400).json({ error: 'invalid_address' });
  } else {
    // EVM: 0x + 40 hex
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ error: 'invalid_address' });
  }

  // ── EVM chains (eth, bsc, base) ──
  if (chain !== 'sol') {
    // 1. GMGN EVM activity (primary)
    try {
      const acts = await gmgnWalletActivity(wallet, 400, chain);
      if (acts && acts.length > 0) {
        const h = avgHoldFromGmgnActivities(acts, period);
        if (h) {
          return res.json({
            wallet,
            chain,
            avg_hold: `${Math.max(1, Math.round(h.avgSec / 3600))}h`,
            avg_hold_sec: h.avgSec,
            median_hold_sec: h.medianSec,
            period,
            source: 'gmgn-activity',
            trade_count: h.tradeCount,
            last_active: h.lastActive,
          });
        }
      }
    } catch (err) {
      console.warn(`[avg-hold:${chain}] gmgn-activity path failed:`, wallet.slice(0, 10), err.message);
    }

    // 2. Etherscan/BSCScan fallback
    try {
      const evmActs = await etherscanWalletActivity(wallet, chain, etherscanKey);
      if (evmActs && evmActs.length > 0) {
        const h = avgHoldFromGmgnActivities(evmActs, period);
        if (h) {
          return res.json({
            wallet,
            chain,
            avg_hold: `${Math.max(1, Math.round(h.avgSec / 3600))}h`,
            avg_hold_sec: h.avgSec,
            median_hold_sec: h.medianSec,
            period,
            source: 'etherscan',
            trade_count: h.tradeCount,
            last_active: h.lastActive,
          });
        }
      }
    } catch (err) {
      if (DEBUG) console.warn(`[avg-hold:${chain}] etherscan fallback failed:`, err.message);
    }

    return res.status(503).json({ error: 'no_data', message: 'Hold-time unavailable for this EVM wallet' });
  }

  // ── Solana chain (existing, untouched) ──

  // 1. GMGN wallet activity (actual trades) — primary source, proper FIFO
  //    buy/sell matching per token.
  try {
    const acts = await gmgnWalletActivity(wallet, 400);
    const h = avgHoldFromGmgnActivities(acts, period);
    if (h) {
      return res.json({
        wallet,
        avg_hold: `${Math.max(1, Math.round(h.avgSec / 3600))}h`,
        avg_hold_sec: h.avgSec,
        median_hold_sec: h.medianSec,
        period,
        source: 'gmgn-activity',
        trade_count: h.tradeCount,
        last_active: h.lastActive,
      });
    }
  } catch (err) {
    console.warn('[avg-hold] gmgn-activity path failed:', wallet.slice(0,8), err.message);
  }

  // 2. GMGN wallet stat summary — fallback when activity has no closed trades
  //    (e.g. wallet only ever bought, never sold, in the lookback window).
  let gmgnStat = null;
  let gmgnError = null;
  for (const p of [period, '7d', '30d', '1d']) {
    try {
      const j = await curlJson(
        `https://gmgn.ai/api/v1/wallet_stat/sol/${wallet}/${p}`,
        {
          'User-Agent': GMGN_UAs[0],
          'Accept': 'application/json, text/plain, */*',
          'Referer': `https://gmgn.ai/sol/address/${wallet}`,
          'Origin': 'https://gmgn.ai',
        },
        10000,
      );
      const d = j?.data;
      if (d) {
        const avgHoldSec = Number(d?.avg_holding_peroid ?? d?.avg_holding_period ?? 0);
        gmgnStat = {
          wallet,
          avg_hold: avgHoldSec > 0 ? `${Math.max(1, Math.round(avgHoldSec / 3600))}h` : '0h',
          avg_hold_sec: avgHoldSec,
          median_hold_sec: null,
          period: p,
          source: 'gmgn',
          win_rate: d?.winrate ?? d?.win_rate ?? null,
          last_active: d?.last_active_timestamp || null,
        };
        if (avgHoldSec > 0) return res.json(gmgnStat);
        break;
      }
    } catch (err) {
      gmgnError = err.message;
    }
  }
  if (DEBUG && gmgnError) console.warn('[avg-hold] GMGN stat failed:', gmgnError);

  // 3. Helius fallback — when GMGN fails entirely (Cloudflare/rate limit)
  //    Only works if user has set HELIUS_API_KEY or sent X-Helius-Key header.
  if (heliusKey || process.env.HELIUS_API_KEY) {
    try {
      const heliusActs = await heliusWalletActivity(wallet, period, heliusKey);
      const h = avgHoldFromGmgnActivities(heliusActs, period);
      if (h) {
        return res.json({
          wallet,
          avg_hold: `${Math.max(1, Math.round(h.avgSec / 3600))}h`,
          avg_hold_sec: h.avgSec,
          median_hold_sec: h.medianSec,
          period,
          source: 'helius',
          trade_count: h.tradeCount,
          last_active: h.lastActive,
        });
      }
    } catch (err) {
      if (DEBUG) console.warn('[avg-hold] Helius fallback failed:', err.message);
    }
  }

  // 4. GMGN responded but with 0 — show 0h rather than "unavailable".
  if (gmgnStat) return res.json(gmgnStat);

  return res.status(503).json({ error: 'no_data', message: 'Hold-time unavailable' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'server_error', message: 'Unexpected server error.' });
});

const server = app.listen(PORT, () => {
  console.log(`wall-badge backend running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
