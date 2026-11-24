# Contributing to PolyBlue

Thank you for your interest in contributing to PolyBlue. Contributions across platform drivers, sync algorithms, UI workflows, CLI commands, and documentation are welcome.

## Development Setup

Requirements:
- Node.js 20 or newer
- npm 10 or newer
- Optional for native hardware testing:
  - **Linux**: BlueZ 5.60+, PipeWire or PulseAudio (`bluetoothctl`, `pactl`, `pw-cli`)
  - **Windows**: Windows 10/11 with Bluetooth 4.2+ / 5.x adapter and PowerShell 5.1+
  - **macOS**: macOS 13+, Xcode Command Line Tools (`swift`), optional `blueutil`

```bash
git clone https://github.com/Gost-co/DevForge.git polyblue
cd polyblue
npm install
npm run dev
```

When no physical Bluetooth controller is detected, the daemon starts in Virtual Radio mode so you can develop and test multi-device workflows on any workstation or CI runner.

## Verification Checklist

Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run build
```

## Project Layout

- `packages/shared` — Domain types, SIG GATT registry, codec profiles, and sync engine math
- `packages/daemon` — Multi-device connection engine, clock-drift sync coordinator, HTTP/WebSocket API, and OS drivers
- `packages/cli` — Command-line client for automation and headless hosts
- `packages/ui` — React + Vite interface with Web Audio calibration studio and Web Bluetooth support
- `packages/desktop` — Electron cross-platform wrapper with system tray integration
- `scripts` — Native OS audio sync helpers and installer scripts

## Pull Request Guidelines

- Keep changes focused and well scoped.
- Add unit tests for new sync math, driver parsers, or state transitions.
- Document any new API endpoints or CLI flags in `README.md`.
- Test platform-specific driver changes against the `BluetoothDriver` contract.
