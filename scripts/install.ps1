$ErrorActionPreference = "Stop"

Write-Host "Installing PolyBlue for Windows..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 20+ is required. Install from https://nodejs.org"
  exit 1
}

npm install
npm run build

Write-Host ""
Write-Host "PolyBlue built successfully." -ForegroundColor Green
Write-Host "Start daemon + UI: npm start"
Write-Host "Open in browser : http://localhost:4720"
