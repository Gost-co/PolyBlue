# PolyBlue Studio — Guide to Every Section

> A practical, click-by-click walkthrough of the PolyBlue Studio interface: what each section is for, what every control does, and how the sections work together. For install and platform-driver setup, see the main [README](../README.md).

PolyBlue Studio is a single-page React application served by the local PolyBlue daemon over HTTP + WebSocket. The daemon owns the Bluetooth adapter, the multi-link connection state machine, the zero-drift sync plan, and the persisted profile. The UI is a live view of that state — every slider, toggle, and button talks to the same REST API and WebSocket event stream.

---

## Section Map

| # | Section | Nav label | What it is for |
| :-- | :-- | :-- | :-- |
| 1 | [Devices Hub](#1-devices-hub-devices) | **Devices** | Discover, filter, multi-select, and connect Bluetooth devices in parallel |
| 2 | [Zero-Drift Sync Studio](#2-zero-drift-sync-studio-sync-studio) | **Sync Studio** | Align codec latencies, audition the sync engine, split stereo channels, EQ each output |
| 3 | [Spatial RF Proximity Radar](#3-spatial-rf-proximity-radar-rf-radar) | **RF Radar** | Visualize RSSI, distance, jitter, and piconet topology in real time |
| 4 | [Multi-Device Scenes](#4-multi-device-scenes-scenes) | **Scenes** | Save and launch complete multi-device setups in one click |
| 5 | [Device Inspector & GATT Explorer](#5-device-inspector--ble-gatt-explorer-inspector-drawer) | *Drawer* | Deep per-device controls, proximity automation, and BLE GATT introspection |
| 6 | [Settings & System Diagnostics](#6-settings--system-diagnostics-settings) | **Settings** | Driver backend, radio tuning, persistence, LAN remote, and profile backup |
| 7 | [Command Palette](#7-command-palette) | `⌘K` / `Ctrl+K` | Keyboard-driven access to every navigation and action |
| 8 | [Desktop Tray Shell](#8-desktop-tray-shell) | *Tray* | Electron wrapper with quick-connect tray menu |

---

## 1. Devices Hub (`Devices`)

The Devices Hub is the operational home of PolyBlue. It answers three questions at a glance: *what is nearby, what is connected, and what can I connect right now?*

### Top KPI strip

- **Simultaneous Links** — active Bluetooth links out of the adapter's maximum (typically `7`), split into audio links and HID/BLE links.
- **Audio Phase Delta** — the current worst-case phase error (`Δ ms`) across connected audio outputs. `Locked` means every active output is aligned to the master clock target; `Drift` means sync is bypassed or unaligned. The master clock target latency is shown underneath.
- **Piconet Throughput** — summed bitrate in kbps and shared radio airtime utilization. Above `85%` the RF budget turns red and the sidebar shows an airtime warning.
- **Zero-Drift Sync Engine** — shortcuts to **Auto-Align** (recompute all delays and relock phase) and **Studio** (open the Sync Studio).

### Filter, search, and selection toolbar

- **Filter chips**: `All`, `Connected`, `Audio`, `HID & BLE`, and `Favorites`. Counts update live.
- **Search**: matches device name, custom alias, vendor, MAC address, and active codec.
- **Select All Audio** / **Clear Audio Selection**: toggles every audio-capable device at once.
- **Connect Favorites**: links every disconnected favorite in a single parallel HCI burst.
- **Per-card checkbox**: add or remove a device from the multi-select set.

### Device cards

Each card shows:

- Multi-select checkbox and category icon.
- Display name (alias if set) plus vendor and MAC address.
- Live RSSI with signal bars and estimated distance in meters.
- Battery percentage when the device reports it (red at `≤20%`).
- Active codec and its native latency for audio devices, or the transport (`BLE`, `Classic`, `Dual`, `LE Audio`) for peripherals.
- Injected sync delay and channel routing for connected audio devices.
- Inline volume slider and mute button for connected audio devices.
- Connection handshake bar while a link is being established: `Queued → Paging → Auth → Codec → Sync`.
- **Connect / Disconnect** action, plus favorite (star) and Inspector (sliders) shortcuts.

Cards are sorted stably by **Connected → Favorite → Name**, so live telemetry never makes a card jump under the cursor.

### Floating action dock

Selecting one or more devices opens a bottom dock with:

- **Connect N Simultaneously** — sends all selected disconnected devices through the staggered HCI connect pipeline.
- **Disconnect (N)** — drops all selected connected devices.
- **Save as Scene** — carries the current selection into the Scenes builder as a starting draft.
- **Clear** — empties the selection.

---

## 2. Zero-Drift Sync Studio (`Sync Studio`)

The Sync Studio is where PolyBlue turns a set of independent Bluetooth audio devices into a single phase-locked multi-output system.

### Header and A/B sync switch

- **Sync Lock: ON / Sync Bypassed (A/B)** — toggles the delay-compensation engine. Bypass is useful for hearing the uncompensated echo and then comparing it against the locked result.
- **Auto-Align All** — clears drift estimators, recomputes the sync plan from the current codec latencies and fine-trim offsets, and relocks every active audio output. Existing manual trims are preserved.
- The status pill shows `LOCKED · Δ x.xms` or `DRIFT · Δ x.xms`.

### 60fps phase-alignment oscilloscope

- Each active audio output gets its own wave lane.
- The vertical dashed **Master Clock Reticle** marks the shared wall-clock arrival target.
- A device's wave packet is offset horizontally by its residual phase delta; when locked, every packet peaks on the reticle.
- Values are exponentially interpolated so slider drags and telemetry updates glide instead of snapping.
- The canvas is driven by a `requestAnimationFrame` loop that reads reactive state through refs, so telemetry ticks never restart the animation.

### Web Audio calibration bench

Audition the engine directly in the browser:

- **Sync Click** — short transient pulses for hearing timing differences.
- **Synth Groove** — a melodic sequence for musical listening tests.
- **Audio File** — load any browser-decodable audio file (`MP3`, `WAV`, `OGG`, etc.); decoding errors are shown inline.
- **BPM slider** — `60–200 BPM` for click/groove sources; updates smoothly while playing.
- **Jitter Buffer** — the extra safety buffer (`0–60 ms`) added above the slowest device's base latency.
- **Kalman Clock Drift Lock** — enables continuous crystal-skew estimation and cancellation.
- **Hear Live Sync Test / Stop Calibration Audio** — starts or stops the test source.
- **Load Track** — opens the file picker for a custom calibration track.

Each connected audio device is modelled as its own Web Audio chain: delay buffer → bass shelf → peaking mid → treble shelf → stereo panner → gain. The chain mirrors the daemon's latency, EQ, routing, mute, solo, and volume state, so the calibration lab is a faithful preview of the real multi-output path.

### Master bus and linked proportional gain

- **Master Multi-Output Bus** — scales every connected audio device. When **Linked Proportional Volume** is enabled, all device volumes move together while preserving relative offsets, including recovery from `0%`.
- Each device strip also exposes independent **Mute** and **Solo** controls.

### Per-device strips

For every active audio output:

- **Channel Splitter Matrix** — assign `Stereo`, `Left (L)`, `Right (R)`, `Mono`, or `Subwoofer` independently. This is how two different-brand speakers become a true L/R stereo pair.
- **Visual Latency Pipeline** — shows codec base latency, manual trim, injected PolyBlue delay, and the resulting total latency as a proportional bar.
- **Fine Trim** — `±1 ms` / `±5 ms` nudge buttons, `Reset`, and a `-150…+150 ms` slider for acoustic fine calibration.
- **EQ** — expandable three-band EQ with `Bass 100 Hz`, `Mid 1 kHz`, and `Treble 8 kHz` controls (`-12…+12 dB`) plus `Flat`, `Deep Bass`, `Vocal Clarity`, `Studio Monitor`, and `Late Night` presets.
- **Live drift and phase readout** — crystal skew in ppm and residual phase delta in milliseconds.

### Quick-connect prompt

If fewer than two audio devices are connected, the Studio offers a one-click **Quick-Connect 2 Speakers/Headphones** action so you can immediately compare alignment.

---

## 3. Spatial RF Proximity Radar (`RF Radar`)

The radar turns raw RSSI telemetry into a spatial picture of your Bluetooth environment.

- **Concentric range rings** — `1.5 m`, `4 m`, `8 m`, and `14 m`, estimated with a log-distance path-loss model.
- **Rotating sweep** — the cone accelerates while a scan is active and slows to an idle sweep otherwise.
- **Device blips** — connected audio nodes are emerald, connected HID/BLE nodes are violet, and nearby unconnected devices are grey.
- **Piconet link arcs** — dashed animated arcs connect the host adapter to every active link.
- **Hover callouts** — hovering a blip shows the device name and live RSSI; clicking opens the Inspector Drawer.
- **Live telemetry list** — the right-hand panel lists every radio with RSSI, estimated distance, jitter, signal bars, and an RSSI sparkline. Rows are sorted stably so they never reorder under the pointer.
- **Inline connect/disconnect** — each telemetry row has a link/unlink button.

The radar reads live state through a ref inside its animation loop, so a telemetry snapshot refresh never resets the sweep or the smooth radial interpolation.

---

## 4. Multi-Device Scenes (`Scenes`)

Scenes are complete, reusable multi-device setups: which devices, what volume, which channel, which codec, which EQ, and what manual offset.

### Starter scenes

PolyBlue ships with:

- **Cinema Night Duo** — two headphones locked to the same master clock.
- **Split Stereo Speakers** — two independent speakers assigned Left and Right.
- **Focus Workstation** — low-latency headphones plus a BLE keyboard and mouse.

### Creating a scene

1. Click **New Scene**, or select devices in the Devices Hub and choose **Save as Scene**.
2. Enter a name and optional description.
3. Pick an accent color (`cyan`, `emerald`, `violet`, `amber`, `rose`).
4. Toggle devices into the scene. For audio devices, choose per-device channel routing directly in the picker.
5. Click **Save Scene**. Current volume, routing, manual offset, codec, and EQ are captured for each member.

### Launching a scene

- **Disconnect other devices on launch** — exclusive mode drops every link that is not part of the scene, then connects the scene members in parallel.
- With the checkbox off, the scene is launched additively alongside current connections.
- Launch applies each member's saved volume, routing, manual offset, codec, and EQ, then recomputes the sync plan.

Scenes are stored in the daemon's `state.json` and are included in profile export/import.

---

## 5. Device Inspector & BLE GATT Explorer (`Inspector Drawer`)

Open the drawer from a device card's sliders icon, a radar blip, or a telemetry row.

- **Quick telemetry strip** — signal strength and estimated distance, battery level and Bluetooth version, link quality and packet loss.
- **Custom Display Name** — rename a device; press `Enter` or click **Save**. Saving the hardware name or an empty value clears the alias.
- **Audio Codec & Latency Profile** — switch among the codecs the device advertises. The sync engine immediately recalculates sibling delays and the oscilloscope reflects the new latency.
- **Bidirectional Proximity Auto-Watchdog** — enable per-device RSSI automation:
  - `autoConnectRssi` — reconnect when the signal is at least this strong.
  - `autoDisconnectRssi` — pause the link when the signal drops to this level.
  - Hysteresis protection keeps the disconnect threshold at least `5 dBm` below the connect threshold, and cooldowns prevent manual disconnects from being immediately overridden.
- **BLE GATT Service & Characteristic Explorer** — Bluetooth SIG service names, characteristic properties, raw hex values, and decoded telemetry such as battery level, heart rate, firmware revision, and HID reports.
- **Connect / Disconnect / Forget** — link controls and device removal.

---

## 6. Settings & System Diagnostics (`Settings`)

The Settings section is the daemon's control room. Everything here is persisted and reflected in `/api/state` and the WebSocket snapshot stream.

### Driver backend and multi-link radio tuning

- **Driver backend** — choose `Auto-Detect OS`, `Linux BlueZ + PipeWire`, `Windows WinRT + WASAPI`, `macOS CoreAudio`, or `Virtual Radio Lab`. Switching reloads the driver and re-emits a fresh snapshot.
- **Parallel HCI Stagger Paging Interval** (`40–600 ms`) — spaces concurrent page-scan bursts so multiple devices can establish links without colliding in the host controller.
- **Telemetry & Proximity Watchdog Cadence** (`1–30 s`) — controls how often the daemon polls RSSI, battery, Kalman drift, and proximity rules.

### Startup, sync, and appearance

- **Auto-Reconnect Last Devices on Startup** — restores previously connected paired devices when the daemon boots.
- **Auto-Align Audio on Device Connect** — relocks sync automatically whenever a new audio device joins.
- **Kalman Clock Drift Correction** — enables continuous quartz-skew estimation.
- **Studio Theme** — dark/light toggle, saved in browser `localStorage` under `polyblue:theme`.

### Cross-platform Bluetooth & audio stack

- Host OS and kernel release.
- Active driver and audio backend (for example `Virtual RF Piconet + Web Audio Multi-Stream Engine` or `BlueZ + PipeWire`).
- Detected native tooling (`bluetoothctl`, `pactl`, `pw-cli`, `busctl`, `powershell`, `blueutil`, `system_profiler`, `swift`).
- Driver notes explaining fallbacks and missing native dependencies.

### LAN Companion Remote and profile portability

- **Enable Wi-Fi LAN Companion Remote** — allows phones, tablets, and laptops on the local network to open the Studio at `http://<lan-ip>:4720`. When disabled, only loopback connections are accepted (including WebSocket upgrades).
- **LAN address list** — every detected non-internal IPv4 address with a copy button.
- **Export Profile** — downloads `polyblue-config-YYYY-MM-DD.json` containing settings, sync options, scenes, per-device preferences, and the last-connected device list.
- **Import Profile** — validates and sanitizes the JSON before applying it. Malformed scenes, unknown codecs, invalid routing values, and out-of-range numbers are normalized or discarded so a bad file cannot crash the Studio.
- **Reset Defaults** — requires a second confirmation click and restores factory settings, scenes, and calibrations.

### CLI quick reference

The Settings panel includes copy-ready commands for `status`, parallel `connect`, `sync align`, and `group run`. See the README's CLI reference for the full command set.

---

## 7. Command Palette

Open with `⌘K` (macOS) or `Ctrl+K` (Windows/Linux).

- **Search** filters by action label, hint, and category.
- **Arrow keys** move the highlight; **Enter** runs the highlighted action; **Esc** closes the palette.
- **Actions** include scanning, auto-aligning, connecting all audio devices, navigating to every section, toggling the theme, launching scenes, and connecting/disconnecting individual devices.
- The highlight is clamped to the filtered list length, so a live snapshot shrinking the list never leaves Enter pointing at a missing row.
- Clicking the backdrop closes the palette; clicking inside the dialog does not.

---

## 8. Desktop Tray Shell

The Electron wrapper (`packages/desktop`) launches the daemon on `127.0.0.1:4720`, waits for `/api/health`, and loads the Studio in a sandboxed window (`contextIsolation: true`, `nodeIntegration: false`). The tray menu provides:

- **Open PolyBlue Studio** — show or restore the window.
- **Auto-Align Audio Sync** — trigger a relock without opening the UI.
- **Quit PolyBlue** — shut down the daemon and exit.

Closing the window hides it to the tray instead of quitting, so long listening sessions keep running.

---

## How the Sections Share State

```
Bluetooth hardware / Virtual Radio Lab
              │
              ▼
   PolyBlue daemon (Express + WebSocket)
   • connection manager + HCI stagger queue
   • zero-drift sync planner (computeSyncPlan)
   • Kalman drift estimators
   • StateStore (state.json persistence)
              │
        REST API + /ws events
              │
              ▼
        React Studio (sections 1–7)
```

- The daemon is the single source of truth. The UI applies **optimistic patches** for instant slider feedback and coalesces rapid changes into trailing requests (~55–65 ms) to avoid rubber-banding.
- WebSocket events include `snapshot`, `device:updated`, `device:removed`, `sync:updated`, `adapter:updated`, `groups:updated`, and `log`.
- While a slider is being dragged, the UI briefly guards the affected device/sync/settings slice so incoming telemetry cannot overwrite the value under the cursor; live RF telemetry still flows through.
- Every mutation is persisted through `StateStore` with debounced disk writes (about `160 ms`), and `flush()` guarantees a write on shutdown.

### What is persisted

| Key | Contents |
| :-- | :-- |
| `settings` | Driver mode, LAN remote toggle, HCI stagger interval, startup auto-reconnect, watchdog cadence |
| `syncOptions` | Sync enabled, auto-align, drift correction, safety buffer, master volume, linked volume |
| `groups` | Saved scenes with per-member volume, routing, offset, codec, and EQ |
| `devicePrefs` | Per-device alias, favorite, volume, routing, offset, codec, EQ, and proximity rules |
| `lastConnectedIds` | Devices to restore when auto-reconnect is enabled |

---

## Keyboard Shortcuts

| Shortcut | Action |
| :-- | :-- |
| `⌘K` / `Ctrl+K` | Open or close the Command Palette |
| `↑` / `↓` | Move the palette highlight |
| `Enter` | Run the highlighted palette action; save an alias in the Inspector |
| `Esc` | Close the palette or Inspector Drawer |

---

## Recommended Workflows

### Two headphones, one movie

1. Open **Devices**, select both headphones, and click **Connect N Simultaneously**.
2. Open **Sync Studio** and confirm the status pill reads `LOCKED · Δ 0.0ms`.
3. Use **Hear Live Sync Test** with **Sync Click**; toggle **Sync Bypassed (A/B)** to hear the difference.
4. Save the pair as a **Scene** for one-click relaunch next time.

### Two different-brand speakers as a stereo pair

1. Connect both speakers in **Devices**.
2. In **Sync Studio**, assign one to **Left (L)** and the other to **Right (R)**.
3. Adjust **Fine Trim** per speaker until the phantom center is stable.
4. Save as a **Scene** with exclusive launch enabled.

### Multi-room listening from the couch

1. In **Settings**, enable **Wi-Fi LAN Companion Remote**.
2. Open the listed `http://<lan-ip>:4720` URL on a phone or tablet.
3. Use **Scenes** to switch setups, **Sync Studio** for EQ, and **Auto-Align** after any device change.

### Debugging a flaky link

1. Open **RF Radar** and watch the device's RSSI, distance, and jitter sparkline.
2. Open the **Inspector Drawer** and enable the proximity watchdog with sensible connect/disconnect thresholds.
3. If piconet load is high, switch high-bitrate codecs (`LDAC`, `aptX HD`) to `AAC`, `aptX Adaptive`, or `LC3` in the Inspector.
4. Check **Settings → Cross-Platform Bluetooth & Audio Stack** for missing native tools.

---

## Troubleshooting Quick Reference

| Symptom | Where to look | Likely fix |
| :-- | :-- | :-- |
| Only one device plays audio | Settings → Active Driver | Install/configure PipeWire-Pulse or the platform audio bridge |
| Echo between two outputs | Sync Studio → status pill | Enable Sync Lock, then Auto-Align |
| Cards jump around | Devices → sort | Sorting is intentionally stable by Connected → Favorite → Name |
| Scene launch does nothing | Scenes → member list | The device may be offline; check RF Radar and reconnect |
| LAN remote blocked | Settings → LAN toggle | Enable Wi-Fi LAN Companion Remote; loopback is always allowed |
| Imported profile breaks the UI | Settings → Import | Profiles are sanitized on import; re-export a clean profile |

For platform-specific setup and deeper troubleshooting, see the [README troubleshooting section](../README.md#troubleshooting).
