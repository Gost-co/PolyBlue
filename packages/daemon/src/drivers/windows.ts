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

function inferCategory(name: string): DeviceCategory {
  const lower = name.toLowerCase();
  if (lower.includes('airpods') || lower.includes('buds') || lower.includes('earbud')) return 'earbuds';
  if (lower.includes('headphone') || lower.includes('headset') || lower.includes('wh-1000') || lower.includes('qc')) {
    return 'headphones';
  }
  if (lower.includes('soundbar')) return 'soundbar';
  if (lower.includes('speaker') || lower.includes('jbl') || lower.includes('bose') || lower.includes('boom')) {
    return 'speaker';
  }
  if (lower.includes('keyboard')) return 'keyboard';
  if (lower.includes('mouse')) return 'mouse';
  if (lower.includes('xbox') || lower.includes('controller') || lower.includes('gamepad')) return 'gamepad';
  if (lower.includes('watch') || lower.includes('band')) return 'wearable';
  return 'unknown';
}

function stableAngleForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return hash;
}

export class WindowsWinRTDriver implements BluetoothDriver {
  readonly mode = 'windows' as const;
  hardwareDetected = false;
  audioBackend = 'WinRT Bluetooth + WASAPI Multi-Endpoint Sync';
  readonly notes: string[] = [];

  private devices = new Map<string, BluetoothDevice>();
  private adapterName = 'Windows Bluetooth Radio';
  private adapterAddress = '00:00:00:00:00:00';
  private powered = true;
  private discovering = false;

  async initialize(): Promise<void> {
    await this.pollTelemetry();
  }

  async shutdown(): Promise<void> {
    this.discovering = false;
  }

  private async runPowerShell(script: string, timeout = 12000): Promise<string> {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout }
    );
    return stdout.trim();
  }

  async getAdapterInfo(): Promise<HostAdapterInfo> {
    const all = Array.from(this.devices.values());
    const budget = computePiconetBudget(all);
    return {
      id: 'win-bt-0',
      name: this.adapterName,
      address: this.adapterAddress,
      platform: 'windows',
      driver: 'windows',
      hardwareDetected: this.hardwareDetected,
      audioBackend: this.audioBackend,
      powered: this.powered,
      discovering: this.discovering,
      bluetoothVersion: '5.3',
      leAudioSupported: true,
      maxSimultaneousLinks: 7,
      activeLinks: all.filter((d) => d.connected).length,
      activeAudioLinks: all.filter((d) => d.connected && d.audio.supportsAudio).length,
      piconetLoadPct: budget.loadPct,
      totalBitrateKbps: budget.totalBitrateKbps,
      airtimeWarning: budget.warning
    };
  }

  async setPowered(powered: boolean): Promise<void> {
    this.powered = powered;
    const state = powered ? 'On' : 'Off';
    const ps = `
      Add-Type -AssemblyName System.Runtime.WindowsRuntime
      [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
      $op = [Windows.Devices.Radios.Radio]::GetRadiosAsync()
      $radios = [System.WindowsRuntimeSystemExtensions]::AsTask($op).GetAwaiter().GetResult()
      foreach ($r in $radios) {
        if ($r.Kind -eq 'Bluetooth') {
          [System.WindowsRuntimeSystemExtensions]::AsTask($r.SetStateAsync('${state}')).GetAwaiter().GetResult() | Out-Null
        }
      }
    `;
    try {
      await this.runPowerShell(ps);
    } catch {
      this.notes.push('WinRT Radio state toggle requires Windows 10/11 permissions.');
    }
  }

  async startScan(): Promise<void> {
    this.discovering = true;
    await this.pollTelemetry();
    setTimeout(() => {
      this.discovering = false;
    }, 6000);
  }

  async stopScan(): Promise<void> {
    this.discovering = false;
  }

  async getDevices(): Promise<BluetoothDevice[]> {
    return Array.from(this.devices.values());
  }

  async pollTelemetry(): Promise<BluetoothDevice[]> {
    const ps = `
      $items = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -match 'DEV_([0-9A-F]{12})' } |
        ForEach-Object {
          $mac = ($Matches[1] -replace '(.{2})(?!$)', '$1:')
          [PSCustomObject]@{
            Name = $_.FriendlyName
            Address = $mac
            Status = $_.Status
            Connected = ($_.Status -eq 'OK')
            InstanceId = $_.InstanceId
          }
        }
      $items | ConvertTo-Json -Compress
    `;
    try {
      const raw = await this.runPowerShell(ps);
      this.hardwareDetected = true;
      if (!raw) return Array.from(this.devices.values());
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const now = Date.now();

      for (const item of list) {
        if (!item?.Address || !isValidMacAddress(item.Address)) continue;
        const mac = normalizeMacAddress(item.Address);
        const existing = this.devices.get(mac);
        const category = inferCategory(item.Name || mac);
        const supportsAudio = ['headphones', 'earbuds', 'speaker', 'soundbar'].includes(category);
        const codec: AudioCodecId = existing?.audio.codec ?? 'AAC';
        const spec = getCodecSpec(codec);
        const rssi = existing?.rssi ?? (item.Connected ? -54 : -72);

        this.devices.set(mac, {
          id: mac,
          address: mac,
          name: item.Name || mac,
          vendor: lookupVendor(mac),
          category,
          transport: 'dual',
          bluetoothVersion: '5.2',
          paired: true,
          trusted: true,
          favorite: existing?.favorite ?? false,
          connected: Boolean(item.Connected),
          phase: item.Connected ? 'connected' : 'disconnected',
          phaseProgress: item.Connected ? 100 : 0,
          rssi,
          estimatedDistanceM: estimateDistanceMeters(rssi),
          batteryLevel: existing?.batteryLevel ?? null,
          linkQuality: item.Connected ? 92 : 0,
          jitterMs: item.Connected ? spec.typicalJitterMs : 0,
          packetLossPct: item.Connected ? 0.1 : 0,
          bitrateKbps: item.Connected && supportsAudio ? spec.bitrateKbps : 0,
          connectedAt: item.Connected ? existing?.connectedAt ?? now : null,
          lastSeenAt: now,
          radarAngleDeg: existing?.radarAngleDeg ?? stableAngleForId(mac),
          audio: existing?.audio ?? {
            supportsAudio,
            volume: 80,
            muted: false,
            solo: false,
            routing: 'stereo',
            eq: { preset: 'flat', bassDb: 0, midDb: 0, trebleDb: 0 },
            codec,
            supportedCodecs: ['APTX_ADAPTIVE', 'APTX', 'AAC', 'SBC'],
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
            { timestamp: now, rssi, jitterMs: item.Connected ? spec.typicalJitterMs : 0, driftPpm: 0, packetLossPct: 0 }
          ].slice(-40)
        });
      }
    } catch {
      this.hardwareDetected = false;
    }
    return Array.from(this.devices.values());
  }

  async pairDevice(deviceId: string): Promise<BluetoothDevice> {
    const dev = this.devices.get(normalizeMacAddress(deviceId));
    if (!dev) throw new Error(`Device ${deviceId} not found`);
    dev.paired = true;
    return dev;
  }

  async connectDevice(deviceId: string, onPhase?: PhaseCallback): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid MAC address: ${deviceId}`);
    const hexId = mac.replace(/:/g, '');
    onPhase?.('paging', 30);

    const ps = `
      $dev = Get-PnpDevice -Class Bluetooth | Where-Object { $_.InstanceId -match '${hexId}' } | Select-Object -First 1
      if ($dev) { Enable-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false -ErrorAction SilentlyContinue }
    `;
    onPhase?.('negotiating', 65);
    await this.runPowerShell(ps);
    onPhase?.('syncing', 90);
    await this.pollTelemetry();
    onPhase?.('connected', 100);

    const dev = this.devices.get(mac);
    if (!dev) throw new Error(`Device ${mac} not available`);
    dev.connected = true;
    dev.phase = 'connected';
    return dev;
  }

  async disconnectDevice(deviceId: string): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid MAC address: ${deviceId}`);
    const hexId = mac.replace(/:/g, '');
    const ps = `
      $dev = Get-PnpDevice -Class Bluetooth | Where-Object { $_.InstanceId -match '${hexId}' } | Select-Object -First 1
      if ($dev) { Disable-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false -ErrorAction SilentlyContinue }
    `;
    await this.runPowerShell(ps);
    const dev = this.devices.get(mac);
    if (!dev) throw new Error(`Device ${mac} not found`);
    dev.connected = false;
    dev.phase = 'disconnected';
    return dev;
  }

  async removeDevice(deviceId: string): Promise<void> {
    this.devices.delete(normalizeMacAddress(deviceId));
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

  async applySyncDelays(delaysMs: Record<string, number>, routing: Record<string, ChannelRouting>): Promise<void> {
    const bridgeScript = path.resolve(__dirname, '../../../../scripts/windows-wasapi-bridge.ps1');
    const payload = JSON.stringify({ delaysMs, routing });
    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bridgeScript, '-ConfigJson', payload],
        { timeout: 6000 }
      );
    } catch {
      // Bridge invocation is best-effort when running without elevated WASAPI session
    }
  }
}
