# Changelog

All notable changes to PolyBlue are documented in this file.

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
