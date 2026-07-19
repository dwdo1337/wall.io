# Privacy — wall.io Badge

Short version: there's no account, no login, and by default nothing you do
leaves your own computer.

## What's stored, and where

- **Anonymous install ID.** On first run, the extension generates a random
  ID (not tied to your name, email, or Google account) and saves it in your
  browser's local extension storage. It's used only so the backend can tell
  one install's requests apart from another's — for example, basic
  rate-limiting or debugging.
- **Wallet lookups.** When you hover a wallet address, the extension sends
  that address to the backend to calculate its average hold time. The
  backend runs **on your own machine** by default (`localhost:3001`), so
  this lookup — and the install ID sent with it — never leaves your computer
  unless you deliberately change the "Backend Server" setting in the popup
  to point at a server elsewhere.
- **Optional email.** The popup has an optional "Email (optional)" field for
  support/updates. It's stored only in local extension storage and is never
  sent anywhere automatically. Leave it blank and nothing changes.

## What this means in practice

- Nothing about you personally is collected — no name, no account, no
  tracking across sites beyond the anonymous ID.
- Since each user runs their own backend, there is no central server
  collecting everyone's lookups. The developer of this extension sees
  nothing about your usage unless you explicitly send it to them.
- If you point the backend setting at a shared/hosted server instead of
  localhost, that server's operator can see the wallet addresses you look
  up and your install ID (though still not your name, unless you gave your
  email separately).

## Data you can delete anytime

- Uninstalling the extension removes the install ID and any saved email
  from your browser.
- Stopping your local backend removes any local logs it wrote, if you
  choose to clear them.

## Questions

This is a small, independently run tool — if anything here is unclear,
raise it directly with the person who gave you this extension.
