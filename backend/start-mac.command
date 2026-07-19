#!/bin/bash
# wall.io backend — one-click starter for macOS/Linux
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js was not found on this computer."
  echo "  Download and install it from: https://nodejs.org  (choose the LTS version)"
  echo "  Then run this file again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies, this only happens once..."
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "  npm install failed. Check the messages above."
    echo ""
    read -p "Press Enter to close..."
    exit 1
  fi
fi

echo ""
echo "  Starting the wall.io backend on http://localhost:3001"
echo "  Leave this window open while you use the extension."
echo "  Close this window (or press Ctrl+C) to stop it."
echo ""
npm start

read -p "Press Enter to close..."
