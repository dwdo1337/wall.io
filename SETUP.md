# wall.io Badge — Setup Guide

This extension shows wallet hold-time data by hovering over addresses on
supported trading terminals. To do that, it needs a small helper program
(the "backend") running on your own computer. Nothing is sent to anyone
else's server — it all stays local, on your machine.

This takes about 5 minutes, once.

## Step 1 — Install Node.js (skip if you already have it)

1. Go to **https://nodejs.org**
2. Download the button labeled **LTS** (not "Current")
3. Run the installer, click through with the default options

## Step 2 — Start the backend

1. Open the `backend` folder inside this download
2. **Windows:** double-click `start-windows.bat`
   **Mac:** double-click `start-mac.command`
   (Mac may warn "unidentified developer" the first time — right-click the
   file, choose **Open**, then confirm.)
3. A black/terminal window will open. The first time, it installs a few
   things automatically — this can take a minute. After that it will say:

   ```
   Starting the wall.io backend on http://localhost:3001
   ```

4. **Leave this window open** while you use the extension. It's doing the
   work behind the scenes. Closing it turns the badges off until you start
   it again.

## Step 3 — Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension` folder inside this download
5. The wall.io icon should appear in your toolbar

## Step 4 — Check it's connected

1. Click the wall.io icon in your toolbar
2. Near the bottom you should see a status dot and the word **ACTIVE**
   in green. If it says **OFFLINE**, make sure the backend window from
   Step 2 is still open and running.

That's it. Hover over a wallet address on a supported site (Trojan, GMGN,
Axiom, Padre, DexScreener, Pump.fun, and others) to see its average hold
time.

## Pointing at a different backend (optional)

If you're running the backend on another machine, or someone else is
hosting one for you, open the extension popup, find the **Backend Server**
field near the bottom, enter that address (e.g. `http://192.168.1.10:3001`
or `https://your-backend-url.com`), and click **Save**. Leave it as
`http://localhost:3001` for the normal, everything-on-my-own-machine setup.

## Troubleshooting

- **Status says OFFLINE** — the backend window isn't running. Re-open it
  via Step 2.
- **"Node.js was not found"** — install Node from Step 1, then run the
  start file again.
- **Badges show "no data"** — the site may not be fully supported yet, or
  the wallet has no recent trade history GMGN can see.
- **Windows SmartScreen warning** — click "More info" → "Run anyway." This
  happens because the script isn't signed by a paid certificate, not
  because anything is wrong with it.
- **Nothing happens after double-clicking on Mac** — right-click the file
  and choose Open instead of double-clicking, the first time only.

## Do I need an API key or account?

No. The backend reads public wallet data — no key, no sign-up, no cost.
