// extension/background.js — Wall.io Badge (avg hold only)
const DEFAULT_BACKEND = 'http://localhost:3001';

// Anonymous per-install identifier. Generated once, stored locally,
// never tied to a name/email. Since the backend runs on the user's
// own machine by default, this ID and anything logged against it
// stays on that machine unless the user points "backend" at a server
// they control themselves.
async function getOrCreateInstallId() {
  const { installId } = await chrome.storage.local.get('installId');
  if (installId) return installId;
  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ installId: newId });
  return newId;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ backend: DEFAULT_BACKEND });
  getOrCreateInstallId();
});

// ── Short-lived result cache ──
// Uses chrome.storage.session (not a plain JS Map) because MV3 service
// workers get killed after ~30s idle and a Map would lose everything
// between hovers. storage.session survives worker restarts and clears
// itself when the browser closes.
const CACHE_TTL_MS = 90 * 1000; // matches the backend's own ~90s GMGN cache

function cacheKeyFor(wallet, period, chain) {
  return `hold:${chain || 'sol'}:${wallet}:${period}`;
}

async function getCached(key) {
  const store = await chrome.storage.session.get(key);
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.data;
}

async function setCached(key, data) {
  await chrome.storage.session.set({ [key]: { data, ts: Date.now() } });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'get_wallet_avg_hold') {
    const chain = msg.chain || 'sol';
    (async () => {
      try {
        const period = msg.period || '7d';
        const key = cacheKeyFor(msg.wallet, period, chain);
        const cached = await getCached(key);
        if (cached) {
          sendResponse({ ok: true, data: cached, cached: true });
          return;
        }
        const { backend } = await chrome.storage.sync.get({ backend: DEFAULT_BACKEND });
        const { heliusApiKey } = await chrome.storage.local.get({ heliusApiKey: '' });
        const { etherscanApiKey } = await chrome.storage.local.get({ etherscanApiKey: '' });
        const installId = await getOrCreateInstallId();
        const url = `${backend}/api/wallet/${encodeURIComponent(msg.wallet)}/avg-hold?period=${encodeURIComponent(period)}&chain=${encodeURIComponent(chain)}`;
        const headers = { 'Content-Type': 'application/json', 'X-Install-Id': installId };
        if (heliusApiKey) headers['X-Helius-Key'] = heliusApiKey;
        if (etherscanApiKey) headers['X-Etherscan-Key'] = etherscanApiKey;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        let r;
        try {
          r = await fetch(url, {
            method: 'POST',
            headers,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        data.chain = chain;  // pass chain to frontend
        await setCached(key, data);
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'ping_backend') {
    (async () => {
      try {
        const { backend } = await chrome.storage.sync.get({ backend: DEFAULT_BACKEND });
        const r = await fetch(`${backend}/health`, { method: 'GET' });
        const data = r.ok ? await r.json() : null;
        sendResponse({ ok: r.ok, data, status: r.status });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});
