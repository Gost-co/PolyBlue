#!/usr/bin/env bash
set -euo pipefail

echo "Installing PolyBlue..."
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20+ is required. Install from https://nodejs.org" >&2
  exit 1
fi

npm install
npm run build
echo ""
echo "PolyBlue built successfully."
echo "Start daemon + UI: npm start"
echo "Open in browser : http://localhost:4720"
