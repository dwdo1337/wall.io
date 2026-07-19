# Chrome Web Store Listing

## Title
Wall.io Badge — Solana Wallet Hold Time

## Short Description (132 chars max)
Hover any Solana wallet address on trading terminals to instantly see its average hold time. Supports Trojan, GMGN, Axiom, Padre & more.

## Category
Productivity

## Language
English

## Detailed Description
Wall.io Badge shows you the average hold time of any Solana wallet — instantly, just by hovering over the address on your favorite trading terminal.

**How it works:**
1. Install the extension
2. Start the local backend (one-time setup, see SETUP.md)
3. Hover over any wallet address on a supported terminal
4. See the wallet's average hold time in a compact badge

**Supported terminals:**
Trojan, GMGN, Axiom, Padre, DexScreener, Pump.fun, Raydium, Jupiter, Meteora, Birdeye, Solscan, Solana Explorer

**Features:**
- Instant hover-to-see — no clicks, no copying addresses
- Average hold time with color-coded indicator (green = long holder, red = flipper)
- Adjustable lookback window: 1D, 3D, 7D, 30D
- Keyboard shortcuts: press 1, 3, 7, or 0 to switch period
- Fully customizable badge appearance: 5 built-in presets (Default, Neon, Stealth, Crimson, Ocean) + save your own
- Color, typography, layout, and effects controls
- Close button on every badge
- No account, no login, no tracking
- Backend runs on your own machine — wallet lookups never leave your computer

**Privacy:**
No account required. The extension stores only an anonymous install ID. Wallet addresses you look up are sent to a backend that runs on your own machine by default. Nothing is sent to any third-party server unless you choose to point the backend setting elsewhere. See PRIVACY.md for full details.

**Requirements:**
- Chrome or Edge (Chromium-based browser with extension support)
- Node.js installed on your machine (one-time, for the backend)
- See SETUP.md for step-by-step installation guide

## Screenshots (need to capture)

| # | What to show | How |
|---|---|---|
| 1 | Hover badge on Trojan wallet | Screenshot of Trojan with badge visible on a wallet row |
| 2 | Hover badge on Axiom | Screenshot of Axiom with badge |
| 3 | Popup main view | Screenshot of popup with period selector, ACTIVE status |
| 4 | Style editor | Screenshot of popup style editor with preview badge, presets, color controls |
| 5 | Badge color variants | Composite showing Default, Neon, Stealth, Crimson, Ocean badges side by side |

Screenshot dimensions: 1280x800 or 640x400 (Chrome Web Store requirement)

## Promotional Images (optional but recommended)

| Size | What |
|---|---|
| 440x280 | Small promotional tile — badge on dark background with "Wall.io" logo |
| 920x680 | Large promotional tile — badge in context on a trading terminal |
| 1400x560 | Marquee promotional tile — hero shot |

## Privacy Policy URL
Host PRIVACY.md content at a public URL. Options:
- GitHub Pages (free): push PRIVACY.md as `privacy-policy.md` to a public repo
- Notion public page
- Simple static site

## Single Purpose
The extension's single purpose is to display average wallet hold time data when a user hovers over a Solana wallet address on supported trading terminal websites.

## Permission Justification

| Permission | Why it's needed |
|---|---|
| `activeTab` | Access the current tab's DOM to detect wallet addresses on hover |
| `storage` | Save the user's period preference, badge style config, and anonymous install ID |
| `host_permissions` (12 trading terminals) | Content scripts must run on these sites to detect wallet addresses and show the badge |