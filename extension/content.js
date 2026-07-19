// extension/content.js — Wall.io Badge (multichain)
// Delegated hover detection: resolve the wallet under the cursor at hover time.
(() => {
  const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
  const EVM_RE = /\b(0x[a-fA-F0-9]{40})\b/g;
  const TRUNCATED_RE = /\b([1-9A-HJ-NP-Za-km-z]{3,10})[\.…\u2026\u22ef\u2024\u00b7\u200d\u2219_]{1,8}([1-9A-HJ-NP-Za-km-z]{3,10})\b/;
  const EVM_TRUNCATED_RE = /\b(0x[a-fA-F0-9]{3,12})[\.…\u2026\u22ef\u2024\u00b7\u200d\u2219_-]{1,8}([a-fA-F0-9]{3,12})\b/;
  const SOLSCAN_RE = /(?:solscan\.io\/account\/|solana\.fm\/address\/|explorer\.solana\.com\/address\/)([1-9A-HJ-NP-Za-km-z]{32,44})/i;
  const ETHERSCAN_RE = /(?:etherscan\.io\/address\/|bscscan\.com\/address\/|basescan\.org\/address\/|explorer\.bnbchain\.org\/address\/)(0x[a-fA-F0-9]{40})/i;
  const IGNORED = new Set([
    'So11111111111111111111111111111111111111112',
    '11111111111111111111111111111111',
  ]);
  const SKIP_TAGS = new Set(['script','style','link','meta','head','html','body','svg','canvas','input','textarea']);

  // ── Page-level CA exclusion ──
  // Regardless of DOM/class heuristics, if an address is literally the
  // token/CA of the page we're currently on (as encoded in the URL), it
  // must never be treated as a hoverable wallet. This is far more robust
  // than trying to enumerate every terminal's markup.
  let pageTokenAddresses = new Set();
  function computePageTokenAddresses() {
    const href = location.href;
    const addrs = new Set();
    const patterns = [
      /\/token\/(?:[a-z0-9-]+\/)?(0x[a-fA-F0-9]{40})/i,
      /\/token\/(?:[a-z0-9-]+\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /pump\.fun\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})/i,
      /dexscreener\.com\/[a-z]+\/(0x[a-fA-F0-9]{40})/i,
      /birdeye\.so\/token\/([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})/i,
      /gmgn\.ai\/[a-z]+\/token\/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i,
      /[?&](?:address|mint|ca|token)=([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})/i,
    ];
    for (const re of patterns) {
      const m = href.match(re);
      if (m && m[1]) addrs.add(m[1]);
    }
    // Also check <link rel="canonical"> and og:url, since some SPAs route
    // client-side without ever touching location.href on first paint.
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content;
    for (const extra of [canonical, ogUrl]) {
      if (!extra) continue;
      for (const re of patterns) {
        const m = extra.match(re);
        if (m && m[1]) addrs.add(m[1]);
      }
    }
    return addrs;
  }
  pageTokenAddresses = computePageTokenAddresses();
  let lastHrefForTokenCheck = location.href;
  setInterval(() => {
    if (location.href !== lastHrefForTokenCheck) {
      lastHrefForTokenCheck = location.href;
      pageTokenAddresses = computePageTokenAddresses();
      frequentPageAddresses = new Set();
      lastFrequencyScan = 0;
    }
  }, 1500);

  // ── Frequency-based CA detection ──
  // A token's contract address is repeated everywhere on a trading terminal
  // page: the header, every trade row, every share/copy link, chart
  // tooltips, social widgets. An individual wallet in a trade/holder list
  // normally appears once (or a handful of times for a repeat trader).
  // Counting occurrences across the whole page catches the token address
  // structurally, without needing to know any given terminal's markup —
  // this is what lets GMGN, BasedBot, or any future terminal work without
  // hand-tuning per-site selectors.
  const FREQ_SCAN_INTERVAL_MS = 3000;
  const FREQ_THRESHOLD = 6;
  const FREQ_MAX_SCAN_CHARS = 500_000;
  let frequentPageAddresses = new Set();
  let lastFrequencyScan = 0;
  const ATTR_NAMES_FOR_SCAN = ['href','data-address','data-wallet','data-account','data-pubkey','title','aria-label','alt'];

  function scanFrequentAddresses() {
    const now = Date.now();
    if (now - lastFrequencyScan < FREQ_SCAN_INTERVAL_MS) return;
    lastFrequencyScan = now;

    let text = document.body?.innerText || '';
    // Attributes aren't picked up by innerText (hrefs, data-*, etc.) —
    // append them so addresses that only ever appear as link targets or
    // data attributes still get counted.
    try {
      const els = document.querySelectorAll('a[href],[data-address],[data-wallet],[data-account],[data-pubkey]');
      const cap = 4000; // guard against pathological pages with huge DOMs
      for (let i = 0; i < els.length && i < cap; i++) {
        for (const name of ATTR_NAMES_FOR_SCAN) {
          const v = els[i].getAttribute?.(name);
          if (v) text += ' ' + v;
        }
      }
    } catch {}

    if (text.length > FREQ_MAX_SCAN_CHARS) text = text.slice(0, FREQ_MAX_SCAN_CHARS);

    const counts = new Map();
    let m;
    WALLET_RE.lastIndex = 0;
    while ((m = WALLET_RE.exec(text)) !== null) {
      counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
    EVM_RE.lastIndex = 0;
    while ((m = EVM_RE.exec(text)) !== null) {
      counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }

    const next = new Set();
    for (const [addr, count] of counts) {
      if (count >= FREQ_THRESHOLD) next.add(addr);
    }
    frequentPageAddresses = next;
  }
  // Prime an initial scan shortly after load, then keep it warm on a timer
  // (cheap regex counting, throttled — not tied to every mouseover).
  setTimeout(scanFrequentAddresses, 800);
  setInterval(scanFrequentAddresses, FREQ_SCAN_INTERVAL_MS);

  const HOVER_DELAY_MS = 80;
  const MAX_CACHE = 200;
  const MAX_WALK_UP = 8;
  const cache = new Map();
  let currentPeriod = '7d';
  let customStyleConfig = null;
  let styleEl = null;
  let hoverTimer = null;
  let activeWallet = null;
  let activeChain = 'sol';
  let activeEl = null;
  let tooltipEl = null;
  let hideTimer = null;

  const MAX_SEEN_WALLETS = 500;
  const seenWallets = new Set();
  function rememberWallet(w) {
    if (!w || seenWallets.has(w)) return;
    if (seenWallets.size >= MAX_SEEN_WALLETS) {
      const first = seenWallets.values().next().value;
      seenWallets.delete(first);
    }
    seenWallets.add(w);
  }
  window.addEventListener('wallio:wallets', (e) => {
    const list = e.detail;
    if (Array.isArray(list)) list.forEach(rememberWallet);
  });

  chrome.storage?.sync?.get({ holdPeriod: '7d', badgeStyle: null }, ({ holdPeriod, badgeStyle }) => {
    if (holdPeriod) currentPeriod = holdPeriod;
    applyStyleConfig(badgeStyle);  // Always apply (uses defaults if null)
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.holdPeriod) {
      currentPeriod = changes.holdPeriod.newValue || '7d';
      cache.clear();
      if (activeWallet && activeEl) showBadge(activeWallet, activeEl);
    }
    if (changes.badgeStyle) {
      applyStyleConfig(changes.badgeStyle.newValue);
      if (activeWallet && activeEl) {
        render(activeEl._lastData || null);
        position(activeEl);
      }
    }
  });

  function applyStyleConfig(raw) {
    customStyleConfig = wallioStyle.mergeWithDefaults(raw);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'wallio-custom-style';
      document.documentElement.appendChild(styleEl);
    }
    styleEl.textContent = wallioStyle.generateStyleCSS(customStyleConfig);
  }

  function currentOffsetX() {
    return customStyleConfig ? customStyleConfig.offsetX : 8;
  }

  // GMGN / BasedBot chain slug detection.
  // We deliberately keep the ORIGINAL slug (e.g. 'robinhood', 'base', 'bsc')
  // for the backend, because the backend queries GMGN's own URL path
  // (/robinhood/address/...). The backend is responsible for mapping any
  // unsupported slug to a known EVM chain when it falls back to Etherscan.
  function detectChain(addr) {
    if (!addr) return 'sol';
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return 'sol';
    const host = (location?.hostname || '').toLowerCase();
    const path = (location?.pathname || '').toLowerCase();

    // GMGN / BasedBot: the first path segment after optional launchpad slug is
    // the chain slug. Example patterns:
    //   /robinhood/token/0x...     (Robinhood chain)
    //   /base/token/0x...           (Base)
    //   /sol/token/SoL...           (Solana)
    //   /noxa/base/token/0x...      (Noxa launchpad on Base)
    //   /flap/eth/token/0x...       (Flap launchpad on ETH)
    // Chain slug is any lower-case segment just before /token/ or /address/.
    const chainSlugMatch = path.match(/\/([a-z0-9]+)\/(?:token|address)\//);
    if (chainSlugMatch && (host.includes('gmgn.ai') || host.includes('basedbot.app') || host.includes('basedbot.tech'))) {
      return chainSlugMatch[1];
    }

    // Explorer-based detection
    if (host.includes('bscscan.com')) return 'bsc';
    if (host.includes('basescan.org')) return 'base';
    if (host.includes('etherscan.io')) return 'eth';

    // Fallback EVM chain
    return 'eth';
  }

  function isWallet(s) {
    if (!s) return false;
    if (IGNORED.has(s)) return false;
    if (pageTokenAddresses.has(s)) return false;
    if (frequentPageAddresses.has(s)) return false;
    if (/^0x[a-fA-F0-9]{40}$/.test(s)) return true;
    if (s.length < 32 || s.length > 44) return false;
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return false;
    return true;
  }

  // Discovery/scanner list pages (GMGN 'Final Stretch' / 'Migrated' columns,
  // trench-style multi-column terminals, etc.) render each token as a card
  // with an inline "Buy 0.1" button and market-cap stat, using pure Tailwind
  // utility classes and JS-driven row navigation (no semantic class names,
  // often no <a href> at all). None of the class/href heuristics below can
  // catch that layout, and the frequency-based detector doesn't either since
  // each row's CA only appears a couple of times (image src, buy handler),
  // not the 6+ times a single detail page repeats its one CA. This structural
  // check catches it directly: if a "buy <amount>" control and an "MC" stat
  // both sit within a bounded ancestor, that ancestor is a token card.
  function isTokenCardContext(el) {
    let node = el;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      const text = node.textContent || '';
      if (text.length > 1200) break; // grew past a single card — stop climbing
      if (/\bbuy\s*[\d.]+/i.test(text) && /\bMC\b/.test(text)) return true;
    }
    return false;
  }

  // Reject contract-address contexts on terminals where the token CA appears
  // inside links, images, or token-header cells.
  function isTokenContext(el) {
    if (!el) return false;
    if (isTokenCardContext(el)) return true;
    const tag = el.tagName?.toLowerCase();
    const cls = (el.className || '').toString().toLowerCase();
    const text = (el.textContent || '').slice(0, 500).toLowerCase();
    const host = (location?.hostname || '').toLowerCase();
    const path = (location?.pathname || '').toLowerCase();

    // If the nearest anchor ancestor is a token link, treat the whole region as CA context
    let a = el.closest?.('a[href*="/token/0x"]');
    if (a && /\/token\/0x[a-fA-F0-9]{40}/.test(a.getAttribute('href') || '')) return true;

    // Page-level token/CA pages: anything on these pages is a token, not a wallet
    if (/trench\.to|degen\.app|pump\.fun\/coin|dexscreener\.com\/(?:solana|ethereum|bsc|base)|birdeye\.so\/token|raydium\.io\/swap|jup\.ag\/swap/.test(host + path)) {
      if (tag !== 'a') return true;
      const href = el.getAttribute('href') || '';
      if (/\/address\/0x[a-fA-F0-9]{40}/.test(href)) return false;
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (/[?&]token=/.test(href)) return true;
      // /token/<slug?>/<address> — the slug (ticker/name) segment is
      // common (e.g. "/token/robinhood/0x...") and was previously missed
      // because the checks below required the address right after /token/.
      if (/\/token\/(?:[a-z0-9-]+\/)?0x[a-fA-F0-9]{40}/i.test(href)) return true;
      if (/\/token\/(?:[a-z0-9-]+\/)?[1-9A-HJ-NP-Za-km-z]{32,44}/.test(href)) return true;
      if (/[?&]token=0x[a-fA-F0-9]{40}/.test(href)) return true;
      // GMGN CA pattern: token links; wallet links (/eth/address/...) must be allowed
      if (/external-res\//.test(href)) return true;
      if (/(?:bsc|eth|base)\/token\/0x[a-fA-F0-9]{40}/.test(href)) return true;
      // CA on explorer pages
      if (/(?:etherscan|bscscan|basescan|bnbbchain)\.\w+\/token\/0x[a-fA-F0-9]{40}/.test(href)) return true;
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (/solana\/[1-9A-HJ-NP-Za-km-z]{32,44}\/icon/.test(src)) return true;
      if (/(?:ethereum|bsc|base|arb|polygon|avax)\/0x[a-fA-F0-9]{40}/.test(src)) return true;
    }
    if (tag === 'svg' && el.getAttribute('data-icon') === 'IconOnlycollection16px') return true;  // GMGN CA icon
    
    // GMGN specific CA selectors
    if (host.includes('gmgn.ai')) {
      if (/holder-card|trader-card|wallet-row|ca-badge|token-badge|ca-label|token-info-header|final-stretch|migrated-column/.test(cls)) {
        // These could be either — check if there's an actual wallet address inside
        if (/0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/.test(text)) {
          // Let frequency detector decide
          return false;
        }
        return true;
      }
    }
    
    // BasedBot specific selectors
    if (host.includes('basedbot.app') || host.includes('basedbot.tech')) {
      // Wallet/holder rows should NOT be rejected — they are wallets
      if (/wallet-row|holder-cell|trader-cell|position-row/.test(cls)) return false;
      // Token info / CA headers should be rejected
      if (/token-header|ca-info|contract-info|token-detail|pair-info/.test(cls)) return true;
    }
    
    if (/token-image|token-name|token-icon|token-card|chart|market-cap|volume|liquidity|header-token|bg-bg-surface2|rounded-6|token-symbol|token-price|ca-address|contract-address|mint-address/.test(cls)) return true;
    if (/\b(token|contract|mint|ca)\b.*0x[a-fA-F0-9]{40}/.test(text)) return true;

    // Ancestor chain: stop if we hit a token container / CA header
    let p = el.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
      const pCls = (p.className || '').toString().toLowerCase();
      const pText = (p.textContent || '').slice(0, 300).toLowerCase();
      const a = p.tagName?.toLowerCase() === 'a' ? p : p.querySelector?.('a[href*="?token="]');
      if (a && a.getAttribute('href')?.includes('?token=')) return true;
      if (/token-image|token-name|token-icon|token-card|header-token|token-symbol|token-price|ca-address|contract-address|mint-address/.test(pCls)) return true;
      if (/\b(token|contract|mint)\b.*0x[a-fA-F0-9]{40}/.test(pText)) return true;
      // GMGN/BubbleMaps specific token card classes
      if (/gmgn|bubblemaps|token-card|ca-label|token-info/.test(pCls + ' ' + pText)) return true;
      // BasedBot specific
      if (/basedbot|token-header|ca-info|contract-info/.test(pCls + ' ' + pText)) return true;
    }
    return false;
  }

  function textOf(el) {
    if (!el) return '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || el.placeholder || '';
    return el.textContent || '';
  }

  function attrsOf(el) {
    if (!el?.getAttribute) return '';
    const names = ['data-address','data-wallet','data-account','data-pubkey','data-inserted-address','data-frontrun-address','data-frontrun-padre-address','data-frontrun-padre-fund-from','data-copy','href','title','aria-label','alt'];
    return names.map(n => el.getAttribute(n) || '').join(' ');
  }

  // Many terminals show only a truncated address in visible text, but keep
  // the full address on a nearby element's attribute — a copy-icon button,
  // a tooltip host, a hidden span — as a SIBLING or CHILD, not on the
  // container itself. attrsOf() only reads one element's own attributes,
  // so truncated rows like that were never resolvable. This pulls the same
  // attribute set from every descendant within a container as well.
  function descendantAttrsOf(el) {
    if (!el?.querySelectorAll) return '';
    try {
      const names = ['data-address','data-wallet','data-account','data-pubkey','data-copy','href','title','aria-label','alt'];
      const selector = names.map(n => `[${n}]`).join(',');
      const nodes = el.querySelectorAll(selector);
      const cap = 60; // guard against scanning huge subtrees
      let out = '';
      for (let i = 0; i < nodes.length && i < cap; i++) {
        for (const n of names) {
          const v = nodes[i].getAttribute(n);
          if (v) out += ' ' + v;
        }
      }
      return out;
    } catch {
      return '';
    }
  }

  function extractAll(str) {
    const out = [];
    let m;
    WALLET_RE.lastIndex = 0;
    while ((m = WALLET_RE.exec(str)) !== null) {
      if (isWallet(m[1])) out.push(m[1]);
    }
    EVM_RE.lastIndex = 0;
    while ((m = EVM_RE.exec(str)) !== null) {
      if (isWallet(m[1])) out.push(m[1]);
    }
    return out;
  }

  function extractTruncated(str) {
    const m = str.match(TRUNCATED_RE);
    if (m) return { prefix: m[1], suffix: m[2] };
    const evm = str.match(EVM_TRUNCATED_RE);
    if (evm) return { prefix: evm[1], suffix: evm[2] };
    return null;
  }

  function resolveTruncated(prefix, suffix, pool) {
    const p = prefix.replace(/[^1-9A-HJ-NP-Za-km-z0-9]/g, '');
    const s = suffix.replace(/[^1-9A-HJ-NP-Za-km-z0-9]/g, '');
    if (!p || !s) return null;
    for (const a of pool) {
      if (a.startsWith(p) && a.endsWith(s)) return a;
    }
    return null;
  }

  // Find the nearest ancestor that contains a full wallet address, checking
  // both its own text/attrs and any descendant's attrs (copy buttons,
  // tooltip hosts, etc. commonly carry the full address there).
  function findRowWithFullWallet(el) {
    let node = el;
    for (let i = 0; i < MAX_WALK_UP && node; i++, node = node.parentElement) {
      const all = textOf(node) + ' ' + attrsOf(node) + ' ' + descendantAttrsOf(node);
      const full = extractAll(all);
      if (full.length) return full[0];
    }
    return null;
  }

  function resolveWalletDirect(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return null;

    const allText = textOf(el) + ' ' + attrsOf(el);

    const full = extractAll(allText);
    if (full.length) {
      full.forEach(rememberWallet);
      return full[0];
    }

    const solscan = allText.match(SOLSCAN_RE);
    if (solscan && isWallet(solscan[1])) {
      rememberWallet(solscan[1]);
      return solscan[1];
    }
    const etherscan = allText.match(ETHERSCAN_RE);
    if (etherscan && isWallet(etherscan[1])) {
      rememberWallet(etherscan[1]);
      return etherscan[1];
    }

    const trunc = extractTruncated(allText);
    if (trunc) {
      const row = findRowWithFullWallet(el);
      if (row) {
        const parentPool = extractAll(
          textOf(el.parentElement) + ' ' + attrsOf(el.parentElement) + ' ' + descendantAttrsOf(el.parentElement)
        );
        const pool = new Set([row, ...parentPool]);
        const resolved = resolveTruncated(trunc.prefix, trunc.suffix, Array.from(pool));
        if (resolved) return resolved;
      }
      const fromSeen = resolveTruncated(trunc.prefix, trunc.suffix, seenWallets);
      if (fromSeen) return fromSeen;
    }

    return null;
  }

  function resolveWalletFromEvent(target) {
    let node = target;
    for (let i = 0; i < MAX_WALK_UP && node && node !== document.body; i++, node = node.parentElement) {
      if (isTokenContext(node)) {
        continue;
      }
      const wallet = resolveWalletDirect(node);
      if (wallet) {
        return { wallet, el: node };
      }
    }
    return null;
  }

  function getTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'wallio-tooltip';
    document.body.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tooltipEl.addEventListener('mouseleave', () => startHide());
    tooltipEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('wallio-close')) {
        if (tooltipEl) tooltipEl.style.display = 'none';
        activeWallet = null;
        activeEl = null;
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    });
    return tooltipEl;
  }

  function startHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (tooltipEl) tooltipEl.style.display = 'none';
      activeWallet = null;
      activeEl = null;
    }, 4000);
  }

  function cancelHide() {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function position(anchor) {
    const tt = getTooltip();
    const r = anchor.getBoundingClientRect();
    const tr = tt.getBoundingClientRect();
    let left = r.right + currentOffsetX();
    let top = r.top;
    if (left + tr.width > window.innerWidth - 8) left = r.left - tr.width - currentOffsetX();
    if (top + tr.height > window.innerHeight - 8) top = window.innerHeight - tr.height - 8;
    if (top < 4) top = 4;
    tt.style.left = `${left + window.scrollX}px`;
    tt.style.top = `${top + window.scrollY}px`;
  }

  function fmtHold(sec) {
    if (sec == null || isNaN(sec)) return null;
    if (sec >= 86400) {
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      return h > 0 ? `${d}d ${h}h` : `${d}d`;
    }
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    if (sec >= 60) return `${Math.floor(sec / 60)}m`;
    return `${Math.max(1, Math.floor(sec))}s`;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render(data) {
    const tt = getTooltip();
    if (!data) {
      tt.innerHTML = '<span class="wallio-close" title="Close">×</span><span class="tt-muted">backend offline</span>';
      return;
    }
    if (data.error) {
      const msg = data.error === 'no_data' ? 'no data' : `error: ${data.error}`;
      tt.innerHTML = `<span class="wallio-close" title="Close">×</span><span class="tt-muted">${esc(msg)}</span>`;
      return;
    }
    const hold = fmtHold(data.avg_hold_sec);
    const medHold = fmtHold(data.median_hold_sec);
    const period = currentPeriod.toUpperCase();
    let cls = 'tt-green';
    if (data.avg_hold_sec != null && data.avg_hold_sec < 3600) cls = 'tt-red';
    else if (data.avg_hold_sec != null && data.avg_hold_sec < 14400) cls = 'tt-yellow';
    const wallet = data.wallet || activeWallet || '';
    const hasAvg = hold != null;
    const hasMed = medHold != null && data.median_hold_sec != null;
    const medHtml = hasMed
      ? `<div class="tt-med">med <b>${esc(medHold || '\u2014')}</b></div>`
      : '';
    const xUrl = wallet ? `https://twitter.com/search?q=${encodeURIComponent(wallet)}&src=typed_query&f=live` : '#';
    tt.innerHTML =
      `<span class="wallio-close" title="Close">×</span>` +
      `<div style="display:flex;justify-content:space-between;align-items:center;">` +
        `<span class="tt-label">⏱ HOLDING PERIOD</span>` +
        `<span class="tt-period">${period}</span>` +
      `</div>` +
      (hasAvg ? `<div class="tt-val ${cls}" style="text-align:center;margin:6px 0 2px;">${esc(hold)}</div>` : '') +
      (hasAvg || hasMed ? `<div class="tt-vdivider"></div>` : '') +
      medHtml +
      (wallet ? `<a class="tt-xbtn" href="${esc(xUrl)}" target="_blank" rel="noopener noreferrer" title="Search this wallet on X">SEARCH ON X ↗</a>` : '');
  }

  async function showBadge(wallet, anchor) {
    activeWallet = wallet;
    activeChain = detectChain(wallet);
    activeEl = anchor;
    const requestedPeriod = currentPeriod;
    const tt = getTooltip();
    tt.innerHTML = '<span class="wallio-close" title="Close">×</span><span class="tt-muted">loading…</span>';
    tt.style.display = 'block';
    position(anchor);
    const data = await fetchAvgHold(wallet, activeChain);
    anchor._lastData = data;
    if (activeWallet !== wallet || currentPeriod !== requestedPeriod) return;
    render(data);
    position(anchor);
  }

  function onPointerOver(e) {
    const hit = resolveWalletFromEvent(e.target);
    if (!hit) return;
    cancelHide();
    clearTimeout(hoverTimer);
    if (activeWallet === hit.wallet && activeEl === hit.el) return;
    hoverTimer = setTimeout(() => showBadge(hit.wallet, hit.el), HOVER_DELAY_MS);
  }

  function onPointerOut(e) {
    const hit = resolveWalletFromEvent(e.target);
    if (!hit) return;
    const toTooltip = tooltipEl && (e.relatedTarget === tooltipEl || tooltipEl.contains?.(e.relatedTarget));
    if (toTooltip) return;
    if (hit.el.contains?.(e.relatedTarget)) return;
    clearTimeout(hoverTimer);
    startHide();
  }

  document.addEventListener('mouseover', onPointerOver, { passive: true, capture: true });
  document.addEventListener('mouseout', onPointerOut, { passive: true, capture: true });

  // ── data ──
  function cacheKey(w, chain) { return `${chain}:${w}:${currentPeriod}`; }
  function cacheSet(k, v) {
    if (cache.size >= MAX_CACHE) {
      const it = cache.keys();
      for (let i = 0; i < 50; i++) {
        const key = it.next().value;
        if (!key) break;
        cache.delete(key);
      }
    }
    cache.set(k, { value: v, ts: Date.now() });
  }
  function cacheGet(k) {
    const e = cache.get(k);
    if (!e) return undefined;
    if (Date.now() - e.ts > 5 * 60 * 1000) { cache.delete(k); return undefined; }
    return e.value;
  }

  function fetchAvgHold(wallet, chain) {
    const k = cacheKey(wallet, chain);
    const c = cacheGet(k);
    if (c && c.then) return c;
    if (c) return c;
    if (!chrome.runtime?.id) {
      return Promise.resolve(null);
    }
    const p = new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'get_wallet_avg_hold', wallet, chain, period: currentPeriod }, (res) => {
        if (chrome.runtime.lastError) {
          cache.delete(k);
          return resolve(null);
        }
        if (!res?.ok || !res.data) {
          cache.delete(k);
          return resolve({ wallet, error: res?.error || 'no_data' });
        }
        const data = { wallet, ...res.data };
        cacheSet(k, Promise.resolve(data));
        resolve(data);
      });
    });
    cacheSet(k, p);
    return p;
  }

  // ── keyboard shortcuts for period + Esc to close badge ──
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'Escape' && tooltipEl && tooltipEl.style.display !== 'none') {
      tooltipEl.style.display = 'none';
      activeWallet = null;
      activeEl = null;
      clearTimeout(hideTimer);
      hideTimer = null;
      return;
    }
    const map = { '1': '1d', '7': '7d', '0': '30d' };
    if (map[e.key]) {
      currentPeriod = map[e.key];
      chrome.storage?.sync?.set({ holdPeriod: currentPeriod });
      cache.clear();
      if (activeWallet && activeEl) showBadge(activeWallet, activeEl);
    }
  });
})();
