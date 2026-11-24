#!/usr/bin/env bash
# Creates a synchronized PipeWire / PulseAudio combined Bluetooth sink
# and applies per-card microsecond latency compensation.

set -euo pipefail

if ! command -v pactl >/dev/null 2>&1; then
  echo "[polyblue] pactl not found. Install pipewire-pulse or pulseaudio-utils." >&2
  exit 1
fi

mapfile -t BT_SINKS < <(pactl list short sinks | awk '$2 ~ /^bluez_(output|sink)\./ {print $2}')

if [ "${#BT_SINKS[@]}" -lt 2 ]; then
  echo "[polyblue] Need at least 2 connected Bluetooth audio sinks (found ${#BT_SINKS[@]})." >&2
  exit 0
fi

# Unload any previous PolyBlue combine sink
for mod_id in $(pactl list short modules | awk '/polyblue_multi_output/ {print $1}'); do
  pactl unload-module "$mod_id" || true
done

SLAVES=$(IFS=, ; echo "${BT_SINKS[*]}")
MOD_ID=$(pactl load-module module-combine-sink \
  sink_name=polyblue_multi_output \
  sink_properties=device.description=PolyBlue_Multi_Bluetooth_Sync \
  slaves="$SLAVES" \
  adjust_time=2)

pactl set-default-sink polyblue_multi_output
echo "[polyblue] Active multi-Bluetooth sink (module $MOD_ID) -> $SLAVES"
