# wall.io Terminal — Feature Proposal (v1, for discussion)

Whitelist-gated. Opened via "Open Terminal" button in the popup. Two layers: a
CA-first discovery screen, and a deep single-wallet terminal you drill into
from it.

---

## Layer 1 — CA Discovery Screen

**Entry point:** paste a contract address (or it auto-fills from the terminal
tab you're currently on, same way the badge already resolves wallets from
page context).

**What it shows, in order:**

1. **Token header strip** — name, ticker, price, mcap, liquidity, age. Thin,
   one line. Not the focus, just orientation so you know what you're looking
   at without tabbing back to the chart.

2. **Wallet list — the actual core of this screen.** Every wallet that is
   either currently holding or appears in top traders for this CA, ranked
   and filterable. Columns, tight and scannable:

   - **Wallet** (short addr, copy icon, existing "known wallet" tag if we
     have one — sniper / insider / whale / etc, same tag system already in
     the enriched tooltip you liked from the other build)
   - **Role** — `Holding` / `Sold` / `Top Trader` (badge chip, color-coded)
   - **Hold time** — reuse the exact avg/median logic that already works in
     the badge. This is our actual differentiator vs Axiom/GMGN — none of
     them surface this front-and-center in a wallet list.
   - **PNL on this token** — realized + unrealized, SOL and USD toggle
   - **Position size** — current bag size / % of supply
   - **Win rate** (all-time, not just this token) — small, secondary
   - **Last active** — relative time

   **Sort/filter bar above the list:** sort by hold time, PNL, position
   size, or last active. Filter toggles: Holding only / Top traders only /
   Snipers / Insiders / >$X position. This is where "find the interesting
   wallets" actually happens — the list is useless if you can't cut through
   noise fast.

   **Default sort:** hold time descending, filtered to holding-only. Reasoning:
   the wallets worth looking at first are the ones still in the trade with a
   long hold — that's the "smart money is still here" signal. Sniper wallets
   that already dumped are noise for this default view, not the headline.

3. **Row click → inline expand, not a new page.** Clicking a wallet row
   expands it in place with a compact preview: this-token trade history (buy/
   sell markers with size + timestamp), the hold-time badge breakdown (avg +
   median with the exact same color coding as the hover badge, for visual
   consistency), and a single **"Open Full Terminal →"** button.

   Inline expand > modal > new tab, because you're often comparing 2-3
   wallets from the same list and shouldn't lose your place each time.

---

## Layer 2 — Full Wallet Terminal

Opens from "Open Full Terminal →". This is the deep view — everything Axiom/
GMGN/Trojan try to cram into a wallet page, but curated instead of dumped.

**Header:** wallet address, copy, tags, linked-wallet indicator (funding
source detection — "funded by [known exchange/wallet]" — this exists in the
other build's `linkedWallets` feature and is genuinely useful for spotting
sybil/bundle clusters, worth keeping).

**Top stat row** (the numbers that matter at a glance, not everything):
- All-time realized PNL
- Win rate
- Avg hold time / median hold time (global, not per-token)
- Total trades / active since

**Equity curve** — realized + unrealized over time. The other build already
has this working (recharts area chart) and it's genuinely one of the more
useful things a chart can show for a wallet — trajectory tells you more than
a single PNL number. Worth keeping, cleaned up.

**Tabs below:**

1. **Positions** — current holdings, each with entry price, current value,
   unrealized PNL, hold time so far. Sortable.
2. **Trade history** — full buy/sell log, filterable by token, exportable.
   This is where "advanced metrics" lives — per-trade slippage, time-to-
   first-sell, whether a trade was part of a detected bundle.
3. **Token performance** — every token this wallet has ever traded, win/loss
   per token, so you can see if a wallet is a generalist or has an edge in
   specific token types (new launches vs established, specific dev, etc).
4. **Linked wallets** — funding graph. Wallets that funded this one, wallets
   this one funded. This is the bundle/sybil detector — if you paste a CA
   and five "different" wallets all trace back to the same funding source,
   that's the tell no other terminal surfaces this clearly.

**What I'd deliberately leave out** (this is the "sloppy/missing info" fix):
no vanity stats that don't inform a decision (no follower counts, no social
scores, nothing speculative). Every number on screen should answer either
"should I trust this wallet" or "what is this wallet actually doing."

---

## Why this beats pasting a CA into Axiom/GMGN/Trojan directly

Those terminals show you a holders table with balance and PNL. None of them
default-sort by hold time, none of them make the funding-graph/bundle
detection a first-class tab, and none of them let you jump from "interesting
wallet in a list" to "full terminal" without losing the list. That gap is
the actual product here — badge already proved hold-time-on-hover is a real
edge; the terminal is "what if that same edge was the organizing principle
of the whole wallet-research flow" instead of a bolted-on stat.

---

## Open questions for us to tune before building

1. Default filter on Layer 1 — holding-only, or holding + top-traders blended?
2. Position size shown as % of supply, SOL value, or both?
3. Equity curve — keep both realized+unrealized lines, or simplify to one?
4. Do we want a "compare wallets" mode (select 2-3 rows, see them
   side-by-side) or is that scope creep for v1?
5. Whitelist gate — hard block with upsell message, or soft "coming soon"
   teaser visible to everyone but only clickable for whitelisted users?
