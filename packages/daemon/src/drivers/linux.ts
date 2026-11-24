import { execFile, spawn, type ChildProcess } from 'node:child_process';
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
  type GattService,
  type HostAdapterInfo
} from '@polyblue/shared';
import type { BluetoothDriver, PhaseCallback } from './types.js';

const execFileAsync = promisify(execFile);

const A2DP_UUID = '0000110b-0000-1000-8000-00805f9b34fb';
const LE_AUDIO_UUID = '0000184e-0000-1000-8000-00805f9b34fb';

function inferCategory(icon: string, name: string): DeviceCategory {
  const hay = `${icon} ${name}`.toLowerCase();
  if (hay.includes('earbud') || hay.includes('airpods') || hay.includes('buds')) return 'earbuds';
  if (hay.includes('headphone') || hay.includes('headset') || hay.includes('wh-1000') || hay.includes('quietcomfort')) {
    return 'headphones';
  }
  if (hay.includes('soundbar')) return 'soundbar';
  if (hay.includes('speaker') || hay.includes('audio-card') || hay.includes('jbl') || hay.includes('boom')) {
    return 'speaker';
  }
  if (hay.includes('keyboard')) return 'keyboard';
  if (hay.includes('mouse')) return 'mouse';
  if (hay.includes('gaming') || hay.includes('gamepad') || hay.includes('controller')) return 'gamepad';
  if (hay.includes('watch') || hay.includes('band')) return 'wearable';
  if (hay.includes('heart') || hay.includes('sensor')) return 'sensor';
  if (hay.includes('phone')) return 'phone';
  return 'unknown';
}

function stableAngleForMac(mac: string): number {
  let hash = 0;
  for (let i = 0; i < mac.length; i++) {
    hash = (hash * 31 + mac.charCodeAt(i)) % 360;
  }
  return hash;
}

export class LinuxBlueZDriver implements BluetoothDriver {
  readonly mode = 'linux' as const;
  hardwareDetected = false;
  audioBackend = 'BlueZ + PipeWire / PulseAudio';
  readonly notes: string[] = [];

  private devices = new Map<string, BluetoothDevice>();
  private scanProcess: ChildProcess | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private discovering = false;
  private adapterAddress = '00:00:00:00:00:00';
  private adapterName = 'hci0 (BlueZ)';
  private powered = true;
  private combineModuleId: string | null = null;
  private lastCombinedSinksKey = '';

  async initialize(): Promise<void> {
    await this.refreshAdapter();
    await this.pollTelemetry();
  }

  async shutdown(): Promise<void> {
    await this.stopScan();
  }

  private async runBtCtl(args: string[], timeout = 8000): Promise<string> {
    const { stdout } = await execFileAsync('bluetoothctl', args, { timeout });
    return stdout;
  }

  private async refreshAdapter(): Promise<void> {
    try {
      const out = await this.runBtCtl(['show']);
      const addrMatch = out.match(/Controller\s+([0-9A-Fa-f:]{17})/);
      const aliasMatch = out.match(/Alias:\s+(.+)/);
      const poweredMatch = out.match(/Powered:\s+(yes|no)/i);
      const discMatch = out.match(/Discovering:\s+(yes|no)/i);

      if (addrMatch) {
        this.hardwareDetected = true;
        this.adapterAddress = normalizeMacAddress(addrMatch[1]);
      }
      if (aliasMatch) {
        this.adapterName = aliasMatch[1].trim();
      }
      if (poweredMatch) {
        this.powered = poweredMatch[1].toLowerCase() === 'yes';
      }
      if (discMatch) {
        this.discovering = discMatch[1].toLowerCase() === 'yes';
      }

      // Check PipeWire vs PulseAudio
      try {
        const { stdout } = await execFileAsync('pactl', ['info'], { timeout: 3000 });
        if (stdout.toLowerCase().includes('pipewire')) {
          this.audioBackend = 'BlueZ + PipeWire (Multi-Sink Sync)';
        } else {
          this.audioBackend = 'BlueZ + PulseAudio (module-combine-sink)';
        }
      } catch {
        this.audioBackend = 'BlueZ (Audio router inactive)';
      }
    } catch {
      this.hardwareDetected = false;
      this.notes.push('BlueZ bluetoothctl unavailable or no HCI adapter found.');
    }
  }

  async getAdapterInfo(): Promise<HostAdapterInfo> {
    const all = Array.from(this.devices.values());
    const activeLinks = all.filter((d) => d.connected).length;
    const activeAudioLinks = all.filter((d) => d.connected && d.audio.supportsAudio).length;
    const budget = computePiconetBudget(all);

    return {
      id: 'hci0',
      name: this.adapterName,
      address: this.adapterAddress,
      platform: 'linux',
      driver: 'linux',
      hardwareDetected: this.hardwareDetected,
      audioBackend: this.audioBackend,
      powered: this.powered,
      discovering: this.discovering,
      bluetoothVersion: '5.3',
      leAudioSupported: this.audioBackend.includes('PipeWire'),
      maxSimultaneousLinks: 7,
      activeLinks,
      activeAudioLinks,
      piconetLoadPct: budget.loadPct,
      totalBitrateKbps: budget.totalBitrateKbps,
      airtimeWarning: budget.warning
    };
  }

  async setPowered(powered: boolean): Promise<void> {
    await this.runBtCtl(['power', powered ? 'on' : 'off']);
    this.powered = powered;
  }

  async startScan(durationMs = 15000): Promise<void> {
    await this.stopScan();
    this.discovering = true;
    try {
      // Spawn interactive bluetoothctl scan on; closed after durationMs
      this.scanProcess = spawn('bluetoothctl', ['--timeout', String(Math.ceil(durationMs / 1000)), 'scan', 'on'], {
        stdio: 'ignore'
      });
      this.scanProcess.on('exit', () => {
        this.discovering = false;
        this.scanProcess = null;
      });
      this.scanTimer = setTimeout(() => {
        void this.stopScan();
      }, durationMs + 500);
    } catch {
      this.discovering = false;
    }
  }

  async stopScan(): Promise<void> {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.scanProcess) {
      this.scanProcess.kill('SIGTERM');
      this.scanProcess = null;
    }
    try {
      await this.runBtCtl(['scan', 'off'], 2500);
    } catch {
      // Ignore if scan was already off
    }
    this.discovering = false;
  }

  async getDevices(): Promise<BluetoothDevice[]> {
    return Array.from(this.devices.values());
  }

  async pollTelemetry(): Promise<BluetoothDevice[]> {
    try {
      const listOut = await this.runBtCtl(['devices']);
      const lines = listOut.split('\n').filter((line) => line.startsWith('Device '));

      for (const line of lines) {
        const match = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.+)$/);
        if (!match) continue;
        const mac = normalizeMacAddress(match[1]);
        const name = match[2].trim();
        await this.inspectDevice(mac, name);
      }
    } catch {
      // Keep last known device snapshot if polling fails transiently
    }
    return Array.from(this.devices.values());
  }

  private async inspectDevice(mac: string, fallbackName: string): Promise<void> {
    if (!isValidMacAddress(mac)) return;
    let infoOut = '';
    try {
      infoOut = await this.runBtCtl(['info', mac], 3500);
    } catch {
      return;
    }

    const name = infoOut.match(/Name:\s+(.+)/)?.[1]?.trim() || fallbackName;
    const alias = infoOut.match(/Alias:\s+(.+)/)?.[1]?.trim();
    const icon = infoOut.match(/Icon:\s+(.+)/)?.[1]?.trim() || '';
    const paired = /Paired:\s+yes/i.test(infoOut);
    const trusted = /Trusted:\s+yes/i.test(infoOut);
    const connected = /Connected:\s+yes/i.test(infoOut);
    const rssiRaw = infoOut.match(/RSSI:\s+(?:0x[0-9a-f]+\s+\()?(-?\d+)/i)?.[1];
    const batteryRaw = infoOut.match(/Battery Percentage:\s+0x[0-9a-f]+\s+\((\d+)\)/i)?.[1];

    const uuids = Array.from(infoOut.matchAll(/UUID:\s+(.+?)\s+\(([0-9a-f-]+)\)/gi)).map((m) => ({
      name: m[1].trim(),
      uuid: m[2].toLowerCase()
    }));

    const supportsAudio =
      uuids.some((u) => u.uuid === A2DP_UUID || u.uuid === LE_AUDIO_UUID || u.name.toLowerCase().includes('audio')) ||
      ['headphones', 'earbuds', 'speaker', 'soundbar'].includes(inferCategory(icon, name));
    const hasLeAudio = uuids.some((u) => u.uuid === LE_AUDIO_UUID);

    const existing = this.devices.get(mac);
    const rssi = rssiRaw ? Number.parseInt(rssiRaw, 10) : existing?.rssi ?? (connected ? -54 : -72);
    const batteryLevel = batteryRaw ? Number.parseInt(batteryRaw, 10) : existing?.batteryLevel ?? null;
    const codec: AudioCodecId = existing?.audio.codec ?? (hasLeAudio ? 'LC3' : 'AAC');
    const codecSpec = getCodecSpec(codec);
    const now = Date.now();

    const gattServices: GattService[] = uuids.slice(0, 8).map((u) => ({
      uuid: u.uuid,
      name: u.name,
      primary: true,
      characteristics: []
    }));

    const sample = {
      timestamp: now,
      rssi,
      jitterMs: connected ? codecSpec.typicalJitterMs : 0,
      driftPpm: existing?.audio.clockDriftPpm ?? 0,
      packetLossPct: connected ? 0.1 : 0
    };

    const telemetry = [...(existing?.telemetry ?? []), sample].slice(-40);

    const device: BluetoothDevice = {
      id: mac,
      address: mac,
      name,
      alias,
      vendor: lookupVendor(mac),
      category: inferCategory(icon, name),
      transport: hasLeAudio ? 'le-audio' : 'dual',
      bluetoothVersion: hasLeAudio ? '5.3' : '5.2',
      paired,
      trusted,
      favorite: existing?.favorite ?? false,
      connected,
      phase: connected ? 'connected' : 'disconnected',
      phaseProgress: connected ? 100 : 0,
      rssi,
      estimatedDistanceM: estimateDistanceMeters(rssi),
      batteryLevel,
      linkQuality: Math.max(20, Math.min(100, Math.round((rssi + 100) * 1.6))),
      jitterMs: sample.jitterMs,
      packetLossPct: sample.packetLossPct,
      bitrateKbps: connected && supportsAudio ? codecSpec.bitrateKbps : 0,
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
        supportedCodecs: hasLeAudio ? ['LC3', 'AAC', 'SBC'] : ['LDAC', 'APTX_HD', 'APTX', 'AAC', 'SBC'],
        intrinsicLatencyMs: codecSpec.baseLatencyMs,
        manualOffsetMs: 0,
        appliedDelayMs: 0,
        effectiveLatencyMs: codecSpec.baseLatencyMs,
        clockDriftPpm: 0,
        phaseDeltaMs: 0
      },
      proximity: existing?.proximity ?? {
        enabled: false,
        autoConnectRssi: -62,
        autoDisconnectRssi: -88,
        autoReconnect: true
      },
      gattServices,
      telemetry
    };

    this.devices.set(mac, device);
  }

  async pairDevice(deviceId: string): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid Bluetooth MAC address: ${deviceId}`);
    await this.runBtCtl(['pair', mac], 15000);
    await this.runBtCtl(['trust', mac], 5000);
    await this.inspectDevice(mac, mac);
    const updated = this.devices.get(mac);
    if (!updated) throw new Error(`Device ${mac} not found after pairing`);
    return updated;
  }

  async connectDevice(deviceId: string, onPhase?: PhaseCallback): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid Bluetooth MAC address: ${deviceId}`);

    onPhase?.('paging', 25);
    const existing = this.devices.get(mac);
    if (existing && !existing.paired) {
      onPhase?.('authenticating', 45);
      await this.runBtCtl(['pair', mac], 15000);
      await this.runBtCtl(['trust', mac], 5000);
    }

    onPhase?.('negotiating', 70);
    await this.runBtCtl(['connect', mac], 15000);

    onPhase?.('syncing', 90);
    await this.inspectDevice(mac, existing?.name ?? mac);
    await this.rebuildCombinedAudioSink();

    onPhase?.('connected', 100);
    const updated = this.devices.get(mac);
    if (!updated) throw new Error(`Device ${mac} unavailable after connect`);
    return updated;
  }

  async disconnectDevice(deviceId: string): Promise<BluetoothDevice> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid Bluetooth MAC address: ${deviceId}`);
    await this.runBtCtl(['disconnect', mac], 10000);
    await this.inspectDevice(mac, this.devices.get(mac)?.name ?? mac);
    await this.rebuildCombinedAudioSink();
    const updated = this.devices.get(mac);
    if (!updated) throw new Error(`Device ${mac} not found`);
    return updated;
  }

  async removeDevice(deviceId: string): Promise<void> {
    const mac = normalizeMacAddress(deviceId);
    if (!isValidMacAddress(mac)) throw new Error(`Invalid Bluetooth MAC address: ${deviceId}`);
    await this.runBtCtl(['remove', mac], 8000);
    this.devices.delete(mac);
  }

  async setDeviceVolume(deviceId: string, volume: number, muted: boolean): Promise<void> {
    const mac = normalizeMacAddress(deviceId);
    const sinkName = await this.findSinkForMac(mac);
    const dev = this.devices.get(mac);
    if (dev) {
      dev.audio.volume = volume;
      dev.audio.muted = muted;
    }
    if (!sinkName) return;
    try {
      await execFileAsync('pactl', ['set-sink-volume', sinkName, `${Math.round(volume)}%`], { timeout: 3000 });
      await execFileAsync('pactl', ['set-sink-mute', sinkName, muted ? '1' : '0'], { timeout: 3000 });
    } catch {
      // Ignore if PipeWire/PulseAudio sink is not yet active
    }
  }

  async setDeviceCodec(deviceId: string, codec: AudioCodecId): Promise<void> {
    const mac = normalizeMacAddress(deviceId);
    const dev = this.devices.get(mac);
    if (dev) {
      dev.audio.codec = codec;
      dev.audio.intrinsicLatencyMs = getCodecSpec(codec).baseLatencyMs;
    }
    const cardName = `bluez_card.${mac.replace(/:/g, '_')}`;
    const profileMap: Record<AudioCodecId, string> = {
      LC3: 'bap-sink',
      LDAC: 'a2dp-sink-ldac',
      APTX_HD: 'a2dp-sink-aptx_hd',
      APTX_LL: 'a2dp-sink-aptx_ll',
      APTX_ADAPTIVE: 'a2dp-sink-aptx_adaptive',
      APTX: 'a2dp-sink-aptx',
      AAC: 'a2dp-sink-aac',
      SBC: 'a2dp-sink-sbc',
      MSBC: 'headset-head-unit-msbc'
    };
    try {
      await execFileAsync('pactl', ['set-card-profile', cardName, profileMap[codec]], { timeout: 4000 });
    } catch {
      // Card profile switch may not be exposed by every BlueZ build
    }
  }

  async applySyncDelays(delaysMs: Record<string, number>, _routing: Record<string, ChannelRouting>): Promise<void> {
    await this.rebuildCombinedAudioSink();

    const entries = Object.entries(delaysMs).filter(([mac, ms]) => isValidMacAddress(mac) && Number.isFinite(ms));
    if (entries.length === 0) return;

    let cardsStdout = '';
    try {
      const { stdout } = await execFileAsync('pactl', ['list', 'cards'], { timeout: 3500 });
      cardsStdout = stdout;
    } catch {
      return;
    }

    for (const [mac, delayMs] of entries) {
      const cardName = `bluez_card.${mac.replace(/:/g, '_')}`;
      const escapedCard = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const offsetUsec = Math.round(Math.max(0, delayMs) * 1000);
      try {
        const portMatch = cardsStdout.match(
          new RegExp(`Name: ${escapedCard}[\\s\\S]*?Ports:[\\s\\S]*?\\t\\t([a-zA-Z0-9_.:-]+):`, 'm')
        );
        const portName = portMatch?.[1] ?? 'headphone-output';
        await execFileAsync('pactl', ['set-port-latency-offset', cardName, portName, String(offsetUsec)], {
          timeout: 3000
        });
      } catch {
        // Port latency offset requires PipeWire / PulseAudio >= 13
      }
    }
  }

  private async findSinkForMac(mac: string): Promise<string | null> {
    const token = mac.replace(/:/g, '_').toUpperCase();
    try {
      const { stdout } = await execFileAsync('pactl', ['list', 'short', 'sinks'], { timeout: 3000 });
      for (const line of stdout.split('\n')) {
        const cols = line.split('\t');
        if (cols[1] && cols[1].toUpperCase().includes(token)) {
          return cols[1];
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private async rebuildCombinedAudioSink(): Promise<void> {
    try {
      const { stdout } = await execFileAsync('pactl', ['list', 'short', 'sinks'], { timeout: 3000 });
      const btSinks = stdout
        .split('\n')
        .map((line) => line.split('\t')[1])
        .filter((name): name is string => Boolean(name && (name.startsWith('bluez_output.') || name.startsWith('bluez_sink.'))))
        .sort();

      const nextKey = btSinks.length >= 2 ? btSinks.join(',') : '';
      if (nextKey === this.lastCombinedSinksKey && (nextKey === '' || this.combineModuleId !== null)) {
        return;
      }

      // Clean up any stale polyblue combine modules left from prior daemon runs
      try {
        const { stdout: modList } = await execFileAsync('pactl', ['list', 'short', 'modules'], { timeout: 3000 });
        for (const line of modList.split('\n')) {
          if (line.includes('polyblue_multi_output')) {
            const staleId = line.split('\t')[0]?.trim();
            if (staleId) {
              await execFileAsync('pactl', ['unload-module', staleId], { timeout: 3000 }).catch(() => {});
            }
          }
        }
      } catch {
        // Ignore module enumeration error
      }
      this.combineModuleId = null;

      if (btSinks.length >= 2) {
        const { stdout: modOut } = await execFileAsync(
          'pactl',
          [
            'load-module',
            'module-combine-sink',
            'sink_name=polyblue_multi_output',
            'sink_properties=device.description=PolyBlue_Multi_Bluetooth_Sync',
            `slaves=${btSinks.join(',')}`,
            'adjust_time=2'
          ],
          { timeout: 4000 }
        );
        this.combineModuleId = modOut.trim();
        this.lastCombinedSinksKey = nextKey;
        await execFileAsync('pactl', ['set-default-sink', 'polyblue_multi_output'], { timeout: 3000 });
      } else {
        this.lastCombinedSinksKey = '';
      }
    } catch {
      // PipeWire / PulseAudio may not be running
    }
  }
}
