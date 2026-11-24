# Changelog

All notable changes to PolyBlue are documented in this file.

## [Unreleased]

### Added
- Added `docs/SECTIONS.md`, an in-depth guide to every Studio section, its controls, state flow, persistence model, and recommended workflows.
- Linked the new Studio section guide from the README "About Every Studio Section" overview.

### Fixed
- Fixed a fresh-clone failure where `npm run typecheck` and `npm test` could not resolve `@polyblue/shared` because the shared package was never built first; both scripts now build `@polyblue/shared` before checking/testing.
- Fixed Auto-Align wiping every device's manual fine-trim offset; it now clears only the Kalman drift estimators and relocks phase around the existing acoustic calibration.
- Hardened profile import and scene creation: malformed scenes, null members, unknown codecs, invalid routing values, and out-of-range numbers are now sanitized instead of reaching the UI and crashing render loops.
- Typed the Settings, Sync Studio, Device Grid, and Inspector patch callbacks against the real `DaemonSettings`, `SyncConfig`, and `DevicePatch` contracts instead of `Record<string, unknown>`.
- Fixed export/import error reporting in Settings so a rejected profile shows the daemon error instead of always claiming invalid JSON.
- Aligned the Settings slider ranges with the daemon's accepted clamps (`staggerPagingMs` `40–600 ms`, `watchdogIntervalMs` `1–30 s`) so imported values no longer leave the slider thumb out of sync with its label.
- Fixed the invalid `scale-115` Tailwind utility on scene accent swatches (`scale-110`).
- Clamped the Command Palette highlight when a live snapshot shrinks the filtered action list.
- Corrected the README CI badge and clone URL to point at `Gost-co/PolyBlue` instead of the old `DevForge` repository.

## [1.1.0] - 2026-11-24

### Changed
- Rebranded project to **PolyBlue** (`@polyblue/*`, `polyblue` CLI, `POLYBLUE_*` environment variables, `polyblue_multi_output` Linux sink, and `PolyBlue Multi-Output` macOS aggregate device).
- Upgraded `README.md` with custom architecture, timeline, and studio vector graphics plus codec latency documentation.

### Fixed
- Fixed linked master volume persistence across telemetry refreshes and recovery when scaling up from `0%`.
- Fixed race condition where periodic telemetry polling overwrote in-flight parallel multi-connect handshake progress.
- Fixed custom device alias reset when saving an empty display name.
- Implemented bidirectional proximity watchdog (auto-connect in range + auto-disconnect out of range with manual-disconnect cooldown).
- Fixed Virtual Radio discovery timer cleanup on `stopScan`, radio power-off, and shutdown, and fixed lookup for non-MAC Web Bluetooth device IDs.
- Fixed first-beat audio initialization in Web Audio Sync Calibration Lab and added smooth BPM updates and file decode error handling.
- Hardened Linux PipeWire/PulseAudio port latency regex escaping, stale combine-sink cleanup, and single-pass `pactl list cards` lookup.
- Added strict finite-number input validation across REST API endpoints, sync math, and CLI offset commands.

## [1.0.0] - 2026-11-24

### Added
- Simultaneous multi-device Bluetooth connection engine with staggered HCI paging queue and parallel state machine.
- Zero-drift audio sync engine with automatic codec latency profiling, Kalman clock-drift estimation, and per-device millisecond delay compensation.
- Cross-platform native driver architecture for Linux (BlueZ + PipeWire/PulseAudio), Windows (WinRT + WASAPI), macOS (CoreBluetooth + CoreAudio Multi-Output), and Virtual Radio simulation lab.
- Interactive Sync Studio with live multi-channel phase oscilloscope, per-device L/R/Stereo/Mono/Sub channel routing, 3-band parametric EQ, and Web Audio acoustic calibration lab.
- Spatial RF proximity radar with live RSSI distance estimation, piconet topology graph, and signal/jitter telemetry sparklines.
- Device Groups (Scenes) for one-click parallel multi-device launch with saved volume, routing, EQ, and delay offsets.
- BLE GATT service inspector with live browser Web Bluetooth (`navigator.bluetooth`) direct pairing support.
- Command-line interface (`polyblue`) and Electron cross-platform desktop wrapper with tray quick-connect menu.
