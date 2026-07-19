// extension/inject.js — Wall.io Badge passive wallet sniffer (MAIN world)
// Runs in the page's own JS context. Some terminals (Axiom, Padre) never
// put the full wallet address in the DOM — it only exists in the page's
// in-memory state, fed from WebSocket messages. We passively listen to
// WebSocket messages and postMessage from a same-origin hook (read-only,
// never modifies requests or responses) and hand wallet-shaped strings
// to the isolated-world content script via a CustomEvent.
(() => {
  const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
  const EVM_RE = /\b(0x[a-fA-F0-9]{40})\b/g;
  const MAX_SCAN_CHARS = 2_000_000;
  const MAX_PER_RESPONSE = 300;
  const MAX_SEEN = 5000;
  const seen = new Set();
  function rememberSeen(w) {
    if (seen.size >= MAX_SEEN) {
      const first = seen.values().next().value;
      seen.delete(first);
    }
    seen.add(w);
  }

  function isLikelyWallet(s) {
    if (!s) return false;
    // EVM: 0x + 40 hex chars — very specific, low false-positive risk
    if (/^0x[a-fA-F0-9]{40}$/.test(s)) return true;
    // Solana: base58, 32-44, reject pump/bonk suffixes (token mints)
    if (s.length < 32 || s.length > 44) return false;
    if (/pump$/.test(s) || /bonk$/.test(s)) return false;
    return true;
  }

  function broadcast(list) {
    if (!list.length) return;
    try {
      window.dispatchEvent(new CustomEvent('wallio:wallets', { detail: list }));
    } catch {}
  }

  function scanText(text) {
    if (!text || typeof text !== 'string') return;
    if (text.length > MAX_SCAN_CHARS) text = text.slice(0, MAX_SCAN_CHARS);
    const found = [];
    let m;
    // Solana base58 wallets
    WALLET_RE.lastIndex = 0;
    while ((m = WALLET_RE.exec(text)) !== null) {
      const w = m[1];
      if (seen.has(w)) continue;
      if (!isLikelyWallet(w)) continue;
      rememberSeen(w);
      found.push(w);
      if (found.length >= MAX_PER_RESPONSE) break;
    }
    // EVM 0x wallets
    EVM_RE.lastIndex = 0;
    while ((m = EVM_RE.exec(text)) !== null) {
      const w = m[1];
      if (seen.has(w)) continue;
      if (!isLikelyWallet(w)) continue;
      rememberSeen(w);
      found.push(w);
      if (found.length >= MAX_PER_RESPONSE) break;
    }
    if (found.length) broadcast(found);
  }

  // ── WebSocket (passive, read-only) ──
  // Some terminals stream holder/trader data over a persistent socket
  // instead of one-shot fetches. We wrap the constructor and add a
  // message listener. We DO NOT call send(), we DO NOT modify messages,
  // we DO NOT touch the socket lifecycle. The page's own code keeps full
  // control — we just observe.
  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === 'function') {
    function WrappedWebSocket(...args) {
      const ws = new NativeWebSocket(...args);
      ws.addEventListener('message', (ev) => {
        try {
          if (typeof ev.data === 'string') {
            scanText(ev.data);
          } else if (ev.data instanceof Blob) {
            ev.data.text().then(scanText).catch(() => {});
          }
        } catch {}
      });
      return ws;
    }
    WrappedWebSocket.prototype = NativeWebSocket.prototype;
    Object.defineProperty(WrappedWebSocket, 'name', { value: 'WebSocket' });
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      WrappedWebSocket[k] = NativeWebSocket[k];
    }
    window.WebSocket = WrappedWebSocket;
  }

  // NOTE: we deliberately do NOT wrap window.fetch or XMLHttpRequest.
  // In MV3, content scripts and page-context scripts inherit the page's
  // CSP. Wrapping fetch caused CSP errors on image/icon loads (the page
  // made the request via our wrapped fetch, the response was an image,
  // and the page's connect-src directive didn't allow the icon host),
  // and in some cases the response body handling broke legitimate page
  // code. WebSocket-only is the safe subset — read-only observation of
  // a channel the page has already opened.
})();
