import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  computePiconetBudget,
  estimateDistanceMeters,
  getCodecSpec,
  isValidMacAddress,
  lookupVendor,
  normalizeMacAddress,
  type AudioCodecId,
  type BluetoothDevice,
  type ChannelRouting,
  type DeviceCategory,
  type HostAdapterInfo
} from '@polyblue/shared';
import type { BluetoothDriver, PhaseCallback } from './types.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function inferCategory(minorType: string, name: string): DeviceCategory {
  const hay = `${minorType} ${name}`.toLowerCase();
  if (hay.includes('airpods') || hay.includes('buds')) return 'earbuds';
  if (hay.includes('headphone') || hay.includes('headset')) return 'headphones';
  if (hay.includes('speaker') || hay.includes('homepod') || hay.includes('jbl')) return 'speaker';
  if (hay.includes('keyboard')) return 'keyboard';
  if (hay.includes('mouse') || hay.includes('trackpad')) return 'mouse';
  if (hay.includes('gamepad') || hay.includes('controller')) return 'gamepad';
  return 'unknown';
}

function stableAngleForMac(mac: string): number {
  let hash = 0;
  for (let i = 0; i < mac.length; i++) hash = (hash * 31 + mac.charCodeAt(i)) % 360;
  return hash;
}

export class MacOSCoreBluetoothDriver implements BluetoothDriver {
  readonly mode = 'macos' as const;
  hardwareDetected = false;
  audioBackend = 'CoreBluetooth + CoreAudio Multi-Output Aggregate';
  readonly notes: string[] = [];

  private devices = new Map<string, BluetoothDevice>();
  private adapterName = 'Apple Bluetooth Controller';
  private adapterAddress = '00:00:00:00:00:00';
  private powered = true;
  private discovering = false;

  async initialize(): Promise<void> {
    await this.pollTelemetry();
  }

  async shutdown(): Promise<void> {
    this.discovering = false;
  }

  async getAdapterInfo(): Promise<HostAdapterInfo> {
    const all = Array.from(this.devices.values());
    const budget = computePiconetBudget(all);
    return {
      id: 'macos-bt-0',
      name: this.adapterName,
      address: this.adapterAddress,
      platform: 'macos',
      driver: 'macos',
      hardwareDetected: this.hardwareDetected,
      audioBackend: this.audioBackend,
      powered: this.powered,
      discovering: this.discovering,
      bluetoothVersion: '5.3',
      leAudioSupported: false,
      maxSimultaneousLinks: 7,
      activeLinks: all.filter((d) => d.connected).length,
      activeAudioLinks: all.filter((d) => d.connected && d.audio.supportsAudio).length,
      piconetLoadPct: budget.loadPct,
      totalBitrateKbps: budget.totalBitrateKbps,
      airtimeWarning: budget.warning
    };
  }

  async setPowered(powered: boolean): Promise<void> {
    try {
      await execFileAsync('blueutil', ['--power', powered ? '1' : '0'], { timeout: 4000 });
      this.powered = powered;
    } catch {
      this.notes.push('Install blueutil (`brew install blueutil`) to toggle macOS radio power programmatically.');
    }
  }

  async startScan(): Promise<void> {
    this.discovering = true;
    try {
      await execFileAsync('blueutil', ['--inquiry', '6'], { timeout: 10000 });
    } catch {
      // Fallback to system_profiler refresh
    }
    await this.pollTelemetry();
    this.discovering = false;
  }

  async stopScan(): Promise<void> {
    this.discovering = false;
  }

  async getDevices(): Promise<BluetoothDevice[]> {
    return Array.from(this.devices.values());
  }

  async pollTelemetry(): Promise<BluetoothDevice[]> {
    try {
      const { stdout } = await execFileAsync('system_profiler', ['SPBluetoothDataType', '-json'], { timeout: 6000 });
      const json = JSON.parse(stdout) as { SPBluetoothDataType?: Array<Record<string, unknown>> };
      const root = json.SPBluetoothDataType?.[0];
      if (!root) return Array.from(this.devices.values());

      this.hardwareDetected = true;
      const ctrl = root.controller_properties as Record<string, string> | undefined;
      if (ctrl?.controller_address) this.adapterAddress = normalizeMacAddress(ctrl.controller_address);
      if (ctrl?.controller_state) this.powered = ctrl.controller_state.toLowerCase().includes('on');

      const ingestGroup = (group: unknown, connected: boolean) => {
        if (!Array.isArray(group)) return;
        const now = Date.now();
        for (const entry of group) {
          if (!entry || typeof entry !== 'object') continue;
          for (const [name, metaRaw] of Object.entries(entry as Record<string, Record<string, string>>)) {
            const addr = metaRaw?.device_address;
            if (!addr || !isValidMacAddress(addr)) continue;
            const mac = normalizeMacAddress(addr);
            const existing = this.devices.get(mac);
            const category = inferCategory(metaRaw.device_minorType || '', name);
            const supportsAudio = ['headphones', 'earbuds', 'speaker', 'soundbar'].includes(category);
            const rssi = metaRaw.device_rssi ? Number.parseInt(metaRaw.device_rssi, 10) : existing?.rssi ?? -55;
            const battMatch = (metaRaw.device_batteryLevelMain || '').match(/(\d+)/);
            const batteryLevel = battMatch ? Number.parseInt(battMatch[1], 10) : existing?.batteryLevel ?? null;
            const codec: AudioCodecId = existing?.audio.codec ?? 'AAC';
            const spec = getCodecSpec(codec);

            this.devices.set(mac, {
              id: mac,
              address: mac,
              name,
              vendor: lookupVendor(mac),
              category,
              transport: 'dual',
              bluetoothVersion: '5.3',
              paired: true,
              trusted: true,
              favorite: existing?.favorite ?? false,
              connected,
              phase: connected ? 'connected' : 'disconnected',
              phaseProgress: connected ? 100 : 0,
              rssi,
              estimatedDistanceM: estimateDistanceMeters(rssi),
              batteryLevel,
              linkQuality: connected ? 94 : 0,
              jitterMs: connected ? spec.typicalJitterMs : 0,
              packetLossPct: connected ? 0.08 : 0,
              bitrateKbps: connected && supportsAudio ? spec.bitrateKbps : 0,
              connectedAt: connected ? existing?.connectedAt ?? now : null,
              lastSeenAt: now,
              radarAngleDeg: existing?.radarAngleDeg ?? stableAngleForMac(mac),
              audio: existing?.audio ?? {
                supportsAudio,
                volume: 80,
                muted: false,
                solo: false,
                routing: 'stereo',
                eq: { preset: 'flat', bassDb: 0, midDb: 0, trebleDb: 0 },
                codec,
                supportedCodecs: ['AAC', 'SBC'],
                intrinsicLatencyMs: spec.baseLatencyMs,
                manualOffsetMs: 0,
                appliedDelayMs: 0,
                effectiveLatencyMs: spec.baseLatencyMs,
                clockDriftPpm: 0,
                phaseDeltaMs: 0
              },
              proximity: existing?.proximity ?? {
                enabled: false,
                autoConnectRssi: -62,
                autoDisconnectRssi: -88,
                autoReconnect: true
              },
              gattServices: existing?.gattServices ?? [],
              telemetry: [
                ...(existing?.telemetry ?? []),
                { timestamp: now, rssi, jitterMs: connected ? spec.typicalJitterMs : 0, driftPpm: 0, packetLossPct: 0 }
              ].slice(-40)
            });
          }
        }
      };

      ingestGroup(root.device_connected, true);
      ingestGroup(root.device_not_connected, false);
    } catch {
      this.hardwareDetected = false;
    }

    return Array.from(this.devices.values());
  }

  async pairDevice(deviceId: string): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid MAC address: ${deviceId}`);
    await execFileAsync('blueutil', ['--pair', mac], { timeout: 12000 });
    await this.pollTelemetry();
    const dev = this.devices.get(mac);
    if (!dev) throw new Error(`Device ${mac} not found`);
    return dev;
  }

  async connectDevice(deviceId: string, onPhase?: PhaseCallback): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid MAC address: ${deviceId}`);
    onPhase?.('paging', 30);
    await execFileAsync('blueutil', ['--connect', mac], { timeout: 12000 });
    onPhase?.('syncing', 85);
    await this.pollTelemetry();
    onPhase?.('connected', 100);
    const dev = this.devices.get(mac);
    if (!dev) throw new Error(`Device ${mac} unavailable after connect`);
    return dev;
  }

  async disconnectDevice(deviceId: string): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid MAC address: ${deviceId}`);
    await execFileAsync('blueutil', ['--disconnect', mac], { timeout: 10000 });
    await this.pollTelemetry();
    const dev = this.devices.get(mac);
    if (!dev) throw new Error(`Device ${mac} not found`);
    return dev;
  }

  async removeDevice(deviceId: string): Promise<void> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid MAC address: ${deviceId}`);
    try {
      await execFileAsync('blueutil', ['--unpair', mac], { timeout: 8000 });
    } catch {
      // Ignore
    }
    this.devices.delete(mac);
  }

  async setDeviceVolume(deviceId: string, volume: number, muted: boolean): Promise<void> {
    const dev = this.devices.get(normalizeMacAddress(deviceId));
    if (dev) {
      dev.audio.volume = volume;
      dev.audio.muted = muted;
    }
  }

  async setDeviceCodec(deviceId: string, codec: AudioCodecId): Promise<void> {
    const dev = this.devices.get(normalizeMacAddress(deviceId));
    if (dev) {
      dev.audio.codec = codec;
      dev.audio.intrinsicLatencyMs = getCodecSpec(codec).baseLatencyMs;
    }
  }

  async applySyncDelays(delaysMs: Record<string, number>, _routing: Record<string, ChannelRouting>): Promise<void> {
    const swiftHelper = path.resolve(__dirname, '../../../../scripts/macos-coreaudio-sync.swift');
    const names = Array.from(this.devices.values())
      .filter((d) => d.connected && d.audio.supportsAudio)
      .map((d) => d.name);

    if (names.length < 2) return;
    try {
      await execFileAsync('swift', [swiftHelper, JSON.stringify({ devices: names, delaysMs })], { timeout: 10000 });
    } catch {
      // Swift CoreAudio helper requires macOS Command Line Tools
    }
  }
}
