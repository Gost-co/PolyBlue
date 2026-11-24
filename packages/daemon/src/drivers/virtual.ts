import {
  computePiconetBudget,
  estimateDistanceMeters,
  getCodecSpec,
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

interface SeedDevice {
  address: string;
  name: string;
  category: DeviceCategory;
  transport: BluetoothDevice['transport'];
  bluetoothVersion: string;
  paired: boolean;
  connected: boolean;
  favorite: boolean;
  baseRssi: number;
  battery: number | null;
  radarAngleDeg: number;
  supportsAudio: boolean;
  codec: AudioCodecId;
  supportedCodecs: AudioCodecId[];
  routing?: ChannelRouting;
  volume?: number;
  discoverableOnly?: boolean;
  gattServices: GattService[];
}

const SEED_DEVICES: SeedDevice[] = [
  {
    address: '7C:96:D2:4A:1B:88',
    name: 'Sony WH-1000XM5',
    category: 'headphones',
    transport: 'dual',
    bluetoothVersion: '5.2',
    paired: true,
    connected: true,
    favorite: true,
    baseRssi: -47,
    battery: 88,
    radarAngleDeg: 38,
    supportsAudio: true,
    codec: 'LDAC',
    supportedCodecs: ['LDAC', 'AAC', 'SBC'],
    routing: 'stereo',
    volume: 82,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '58', valueDecoded: '88%' }
        ]
      },
      {
        uuid: '0x180A',
        name: 'Device Information',
        primary: true,
        characteristics: [
          { uuid: '0x2A29', name: 'Manufacturer Name', properties: ['read'], valueHex: '536F6E79', valueDecoded: 'Sony Corporation' },
          { uuid: '0x2A26', name: 'Firmware Revision', properties: ['read'], valueHex: '322E332E31', valueDecoded: '2.3.1' }
        ]
      }
    ]
  },
  {
    address: '40:98:AD:9E:33:12',
    name: 'AirPods Pro 2',
    category: 'earbuds',
    transport: 'le-audio',
    bluetoothVersion: '5.3',
    paired: true,
    connected: true,
    favorite: true,
    baseRssi: -51,
    battery: 76,
    radarAngleDeg: 146,
    supportsAudio: true,
    codec: 'LC3',
    supportedCodecs: ['LC3', 'AAC', 'SBC'],
    routing: 'stereo',
    volume: 78,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '4C', valueDecoded: '76% (L:78% R:74%)' }
        ]
      },
      {
        uuid: '0x184E',
        name: 'Audio Stream Control (ASCS)',
        primary: true,
        characteristics: [
          { uuid: '0x2BC4', name: 'ASE Control Point', properties: ['write', 'notify'], valueHex: '010030', valueDecoded: 'LC3 48kHz 10ms frame' }
        ]
      }
    ]
  },
  {
    address: '58:FC:C6:81:F0:2A',
    name: 'JBL Charge 5',
    category: 'speaker',
    transport: 'classic',
    bluetoothVersion: '5.1',
    paired: true,
    connected: false,
    favorite: true,
    baseRssi: -58,
    battery: 94,
    radarAngleDeg: 225,
    supportsAudio: true,
    codec: 'SBC',
    supportedCodecs: ['AAC', 'SBC'],
    routing: 'left',
    volume: 85,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '5E', valueDecoded: '94%' }
        ]
      }
    ]
  },
  {
    address: '2C:41:A1:67:C4:09',
    name: 'Bose QuietComfort Ultra',
    category: 'headphones',
    transport: 'dual',
    bluetoothVersion: '5.3',
    paired: true,
    connected: false,
    favorite: true,
    baseRssi: -55,
    battery: 63,
    radarAngleDeg: 302,
    supportsAudio: true,
    codec: 'APTX_ADAPTIVE',
    supportedCodecs: ['APTX_ADAPTIVE', 'APTX_LL', 'AAC', 'SBC'],
    routing: 'stereo',
    volume: 80,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '3F', valueDecoded: '63%' }
        ]
      },
      {
        uuid: '0xFDDF',
        name: 'Bose Spatial Control',
        primary: true,
        characteristics: [
          { uuid: '0x2B7D', name: 'ANC Mode', properties: ['read', 'write'], valueHex: '01', valueDecoded: 'Quiet Mode (Max ANC)' }
        ]
      }
    ]
  },
  {
    address: 'E8:AB:FA:55:19:7D',
    name: 'Soundcore Motion X600',
    category: 'speaker',
    transport: 'dual',
    bluetoothVersion: '5.3',
    paired: true,
    connected: false,
    favorite: false,
    baseRssi: -63,
    battery: 81,
    radarAngleDeg: 268,
    supportsAudio: true,
    codec: 'AAC',
    supportedCodecs: ['LDAC', 'AAC', 'SBC'],
    routing: 'right',
    volume: 85,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '51', valueDecoded: '81%' }
        ]
      }
    ]
  },
  {
    address: '80:99:E7:2F:B9:41',
    name: 'Sennheiser Momentum 4',
    category: 'headphones',
    transport: 'dual',
    bluetoothVersion: '5.2',
    paired: true,
    connected: false,
    favorite: false,
    baseRssi: -66,
    battery: 91,
    radarAngleDeg: 95,
    supportsAudio: true,
    codec: 'APTX_HD',
    supportedCodecs: ['APTX_ADAPTIVE', 'APTX_HD', 'APTX', 'AAC', 'SBC'],
    routing: 'stereo',
    volume: 76,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '5B', valueDecoded: '91%' }
        ]
      }
    ]
  },
  {
    address: 'DC:2C:26:A3:44:10',
    name: 'Keychron Q1 Pro',
    category: 'keyboard',
    transport: 'ble',
    bluetoothVersion: '5.1',
    paired: true,
    connected: true,
    favorite: false,
    baseRssi: -43,
    battery: 69,
    radarAngleDeg: 14,
    supportsAudio: false,
    codec: 'SBC',
    supportedCodecs: [],
    gattServices: [
      {
        uuid: '0x1812',
        name: 'Human Interface Device',
        primary: true,
        characteristics: [
          { uuid: '0x2A4D', name: 'HID Report', properties: ['read', 'notify'], valueHex: '00000400', valueDecoded: 'NKRO 90Hz Polling' }
        ]
      },
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read', 'notify'], valueHex: '45', valueDecoded: '69%' }
        ]
      }
    ]
  },
  {
    address: 'D0:8A:55:77:8E:3C',
    name: 'Logitech MX Master 3S',
    category: 'mouse',
    transport: 'ble',
    bluetoothVersion: '5.0',
    paired: true,
    connected: false,
    favorite: false,
    baseRssi: -46,
    battery: 84,
    radarAngleDeg: 342,
    supportsAudio: false,
    codec: 'SBC',
    supportedCodecs: [],
    gattServices: [
      {
        uuid: '0x1812',
        name: 'Human Interface Device',
        primary: true,
        characteristics: [
          { uuid: '0x2A4D', name: 'HID Report', properties: ['read', 'notify'], valueHex: '0100FF', valueDecoded: '8000 DPI 125Hz' }
        ]
      }
    ]
  },
  {
    address: 'F0:13:C3:18:62:9F',
    name: 'Polar H10 Sensor',
    category: 'sensor',
    transport: 'ble',
    bluetoothVersion: '5.0',
    paired: true,
    connected: false,
    favorite: false,
    baseRssi: -60,
    battery: 72,
    radarAngleDeg: 185,
    supportsAudio: false,
    codec: 'SBC',
    supportedCodecs: [],
    gattServices: [
      {
        uuid: '0x180D',
        name: 'Heart Rate',
        primary: true,
        characteristics: [
          { uuid: '0x2A37', name: 'Heart Rate Measurement', properties: ['notify'], valueHex: '0048', valueDecoded: '72 bpm (RR 833ms)' }
        ]
      },
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read'], valueHex: '48', valueDecoded: '72%' }
        ]
      }
    ]
  },
  {
    address: '64:A2:F9:31:AA:07',
    name: 'Marshall Emberton II',
    category: 'speaker',
    transport: 'dual',
    bluetoothVersion: '5.1',
    paired: false,
    connected: false,
    favorite: false,
    baseRssi: -68,
    battery: 58,
    radarAngleDeg: 122,
    supportsAudio: true,
    codec: 'SBC',
    supportedCodecs: ['SBC'],
    routing: 'stereo',
    volume: 75,
    discoverableOnly: true,
    gattServices: [
      {
        uuid: '0x180F',
        name: 'Battery Service',
        primary: true,
        characteristics: [
          { uuid: '0x2A19', name: 'Battery Level', properties: ['read'], valueHex: '3A', valueDecoded: '58%' }
        ]
      }
    ]
  },
  {
    address: 'C4:9D:ED:88:12:F4',
    name: 'Xbox Wireless Controller',
    category: 'gamepad',
    transport: 'ble',
    bluetoothVersion: '5.1',
    paired: false,
    connected: false,
    favorite: false,
    baseRssi: -61,
    battery: 90,
    radarAngleDeg: 205,
    supportsAudio: false,
    codec: 'SBC',
    supportedCodecs: [],
    discoverableOnly: true,
    gattServices: [
      {
        uuid: '0x1812',
        name: 'Human Interface Device',
        primary: true,
        characteristics: [
          { uuid: '0x2A4D', name: 'Gamepad HID', properties: ['read', 'notify'], valueHex: '008080', valueDecoded: 'Low-Latency BLE HID' }
        ]
      }
    ]
  }
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VirtualRadioDriver implements BluetoothDriver {
  readonly mode = 'virtual' as const;
  readonly hardwareDetected = false;
  readonly audioBackend = 'Virtual RF Piconet + Web Audio Multi-Stream Engine';
  readonly notes = [
    'Virtual Radio Lab simulates real multi-link Bluetooth 5.4 RF physics, codec latencies, crystal clock drift, and parallel HCI paging.',
    'Connect real physical BLE devices right from Chromium/Edge using the Web Bluetooth button, or run on a machine with a Bluetooth adapter for native OS control.'
  ];

  private devices = new Map<string, BluetoothDevice>();
  private baseRssiMap = new Map<string, number>();
  private clockSkewSeed = new Map<string, number>();
  private powered = true;
  private discovering = false;
  private scanTimer: NodeJS.Timeout | null = null;
  private discoveryTimers: NodeJS.Timeout[] = [];
  private tickCount = 0;

  private resolveDevice(deviceId: string): BluetoothDevice | undefined {
    return this.devices.get(deviceId) ?? this.devices.get(normalizeMacAddress(deviceId));
  }

  private clearScanTimers(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    for (const timer of this.discoveryTimers) {
      clearTimeout(timer);
    }
    this.discoveryTimers = [];
  }

  async initialize(): Promise<void> {
    const now = Date.now();
    for (const seed of SEED_DEVICES) {
      if (seed.discoverableOnly) continue;
      this.insertSeed(seed, now);
    }
  }

  private insertSeed(seed: SeedDevice, now: number): void {
    const spec = getCodecSpec(seed.codec);
    const mac = normalizeMacAddress(seed.address);
    this.baseRssiMap.set(mac, seed.baseRssi);
    // Realistic ±18 ppm quartz oscillator drift per hardware device
    this.clockSkewSeed.set(mac, ((mac.charCodeAt(15) % 37) - 18) * 0.9);

    const history = Array.from({ length: 16 }, (_, idx) => {
      const wave = Math.sin(idx * 0.65 + seed.radarAngleDeg) * 2.2;
      const rssi = Math.round(seed.baseRssi + wave);
      return {
        timestamp: now - (16 - idx) * 2000,
        rssi,
        jitterMs: seed.connected ? Math.max(0.4, Number((spec.typicalJitterMs + Math.cos(idx) * 0.4).toFixed(2))) : 0,
        driftPpm: seed.connected ? Number((this.clockSkewSeed.get(mac) ?? 0).toFixed(2)) : 0,
        packetLossPct: seed.connected ? Number((Math.max(0, 0.06 + Math.abs(Math.sin(idx)) * 0.08)).toFixed(2)) : 0
      };
    });

    const device: BluetoothDevice = {
      id: mac,
      address: mac,
      name: seed.name,
      vendor: lookupVendor(mac),
      category: seed.category,
      transport: seed.transport,
      bluetoothVersion: seed.bluetoothVersion,
      paired: seed.paired,
      trusted: seed.paired,
      favorite: seed.favorite,
      connected: seed.connected,
      phase: seed.connected ? 'connected' : 'disconnected',
      phaseProgress: seed.connected ? 100 : 0,
      rssi: seed.baseRssi,
      estimatedDistanceM: estimateDistanceMeters(seed.baseRssi),
      batteryLevel: seed.battery,
      linkQuality: seed.connected ? Math.min(99, Math.max(72, Math.round((seed.baseRssi + 100) * 1.8))) : 0,
      jitterMs: seed.connected ? spec.typicalJitterMs : 0,
      packetLossPct: seed.connected ? 0.08 : 0,
      bitrateKbps: seed.connected && seed.supportsAudio ? spec.bitrateKbps : seed.connected ? 16 : 0,
      connectedAt: seed.connected ? now - 145_000 : null,
      lastSeenAt: now,
      radarAngleDeg: seed.radarAngleDeg,
      audio: {
        supportsAudio: seed.supportsAudio,
        volume: seed.volume ?? 80,
        muted: false,
        solo: false,
        routing: seed.routing ?? 'stereo',
        eq: { preset: 'flat', bassDb: 0, midDb: 0, trebleDb: 0 },
        codec: seed.codec,
        supportedCodecs: seed.supportedCodecs,
        intrinsicLatencyMs: seed.supportsAudio ? spec.baseLatencyMs : 0,
        manualOffsetMs: 0,
        appliedDelayMs: 0,
        effectiveLatencyMs: seed.supportsAudio ? spec.baseLatencyMs : 0,
        clockDriftPpm: seed.connected ? this.clockSkewSeed.get(mac) ?? 0 : 0,
        phaseDeltaMs: 0
      },
      proximity: {
        enabled: false,
        autoConnectRssi: -60,
        autoDisconnectRssi: -88,
        autoReconnect: true
      },
      gattServices: seed.gattServices,
      telemetry: history
    };

    this.devices.set(mac, device);
  }

  async shutdown(): Promise<void> {
    this.clearScanTimers();
    this.discovering = false;
  }

  async getAdapterInfo(): Promise<HostAdapterInfo> {
    const all = Array.from(this.devices.values());
    const budget = computePiconetBudget(all);

    return {
      id: 'virtual-hci0',
      name: 'PolyBlue Virtual BT 5.4 Controller',
      address: 'B8:27:EB:54:00:01',
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
      driver: 'virtual',
      hardwareDetected: false,
      audioBackend: this.audioBackend,
      powered: this.powered,
      discovering: this.discovering,
      bluetoothVersion: '5.4',
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
    if (!powered) {
      this.clearScanTimers();
      this.discovering = false;
      for (const dev of this.devices.values()) {
        dev.connected = false;
        dev.phase = 'disconnected';
        dev.phaseProgress = 0;
        dev.bitrateKbps = 0;
        dev.connectedAt = null;
      }
    }
  }

  async startScan(durationMs = 8000): Promise<void> {
    if (!this.powered) throw new Error('Bluetooth adapter is powered off');
    this.clearScanTimers();
    this.discovering = true;

    // Reveal discoverable nearby devices during scan
    const undiscovered = SEED_DEVICES.filter((s) => !this.devices.has(normalizeMacAddress(s.address)));
    undiscovered.forEach((seed, idx) => {
      const timer = setTimeout(() => {
        if (this.discovering) {
          this.insertSeed(seed, Date.now());
        }
      }, 650 * (idx + 1));
      this.discoveryTimers.push(timer);
    });

    this.scanTimer = setTimeout(() => {
      this.discovering = false;
      this.clearScanTimers();
    }, Math.max(1000, Math.min(durationMs, 15000)));
  }

  async stopScan(): Promise<void> {
    this.clearScanTimers();
    this.discovering = false;
  }

  async getDevices(): Promise<BluetoothDevice[]> {
    return Array.from(this.devices.values());
  }

  async pairDevice(deviceId: string): Promise<BluetoothDevice> {
    const dev = this.resolveDevice(deviceId);
    if (!dev) throw new Error(`Device ${deviceId} not found`);
    dev.paired = true;
    dev.trusted = true;
    return dev;
  }

  async connectDevice(deviceId: string, onPhase?: PhaseCallback): Promise<BluetoothDevice> {
    if (!this.powered) throw new Error('Bluetooth adapter is powered off');
    const dev = this.resolveDevice(deviceId);
    if (!dev) throw new Error(`Device ${deviceId} not found`);
    if (dev.connected) return dev;

    const stages: Array<[BluetoothDevice['phase'], number, number]> = [
      ['paging', 22, 160],
      ['authenticating', 48, 170],
      ['negotiating', 74, 180],
      ['syncing', 92, 150]
    ];

    for (const [phase, progress, waitMs] of stages) {
      if (!this.powered) throw new Error('Bluetooth adapter powered off during connection');
      dev.phase = phase;
      dev.phaseProgress = progress;
      onPhase?.(phase, progress);
      await delay(waitMs);
    }

    const spec = getCodecSpec(dev.audio.codec);
    dev.paired = true;
    dev.trusted = true;
    dev.connected = true;
    dev.phase = 'connected';
    dev.phaseProgress = 100;
    dev.lastError = undefined;
    dev.connectedAt = Date.now();
    dev.bitrateKbps = dev.audio.supportsAudio ? spec.bitrateKbps : 16;
    dev.linkQuality = Math.min(99, Math.max(76, Math.round((dev.rssi + 100) * 1.8)));
    dev.jitterMs = dev.audio.supportsAudio ? spec.typicalJitterMs : 1.1;
    dev.packetLossPct = 0.06;
    onPhase?.('connected', 100);
    return dev;
  }

  async disconnectDevice(deviceId: string): Promise<BluetoothDevice> {
    const dev = this.resolveDevice(deviceId);
    if (!dev) throw new Error(`Device ${deviceId} not found`);
    dev.phase = 'disconnecting';
    await delay(120);
    dev.connected = false;
    dev.phase = 'disconnected';
    dev.phaseProgress = 0;
    dev.bitrateKbps = 0;
    dev.jitterMs = 0;
    dev.packetLossPct = 0;
    dev.linkQuality = 0;
    dev.connectedAt = null;
    dev.audio.appliedDelayMs = 0;
    dev.audio.phaseDeltaMs = 0;
    return dev;
  }

  async removeDevice(deviceId: string): Promise<void> {
    const dev = this.resolveDevice(deviceId);
    if (dev) {
      this.devices.delete(dev.id);
      this.baseRssiMap.delete(dev.id);
      this.clockSkewSeed.delete(dev.id);
    }
  }

  async setDeviceVolume(deviceId: string, volume: number, muted: boolean): Promise<void> {
    const dev = this.resolveDevice(deviceId);
    if (!dev) return;
    dev.audio.volume = Math.max(0, Math.min(100, Math.round(volume)));
    dev.audio.muted = muted;
  }

  async setDeviceCodec(deviceId: string, codec: AudioCodecId): Promise<void> {
    const dev = this.resolveDevice(deviceId);
    if (!dev || !dev.audio.supportsAudio) return;
    const spec = getCodecSpec(codec);
    dev.audio.codec = codec;
    dev.audio.intrinsicLatencyMs = spec.baseLatencyMs;
    if (dev.connected) {
      dev.bitrateKbps = spec.bitrateKbps;
      dev.jitterMs = spec.typicalJitterMs;
    }
  }

  async applySyncDelays(
    delaysMs: Record<string, number>,
    routing: Record<string, ChannelRouting>
  ): Promise<void> {
    for (const [id, delayMs] of Object.entries(delaysMs)) {
      const dev = this.devices.get(id);
      if (dev) {
        dev.audio.appliedDelayMs = delayMs;
      }
    }
    for (const [id, channel] of Object.entries(routing)) {
      const dev = this.devices.get(id);
      if (dev) {
        dev.audio.routing = channel;
      }
    }
  }

  async pollTelemetry(): Promise<BluetoothDevice[]> {
    if (!this.powered) return Array.from(this.devices.values());
    this.tickCount += 1;
    const now = Date.now();

    for (const dev of this.devices.values()) {
      const base = this.baseRssiMap.get(dev.id) ?? dev.rssi;
      const oscillation = Math.sin(this.tickCount * 0.45 + dev.radarAngleDeg * 0.08) * 2.5 + (Math.random() - 0.5) * 1.4;
      dev.rssi = Math.round(Math.max(-95, Math.min(-32, base + oscillation)));
      dev.estimatedDistanceM = estimateDistanceMeters(dev.rssi);
      dev.lastSeenAt = now;

      if (dev.connected) {
        const spec = getCodecSpec(dev.audio.codec);
        const jitterNoise = (Math.random() - 0.5) * 0.8;
        dev.jitterMs = Number(Math.max(0.4, (dev.audio.supportsAudio ? spec.typicalJitterMs : 1.0) + jitterNoise).toFixed(2));
        dev.linkQuality = Math.min(99, Math.max(60, Math.round((dev.rssi + 100) * 1.85)));
        dev.packetLossPct = Number(Math.max(0, (dev.rssi < -72 ? 0.45 : 0.05) + Math.random() * 0.08).toFixed(2));

        const baseSkew = this.clockSkewSeed.get(dev.id) ?? 0;
        const measuredSkew = Number((baseSkew + Math.sin(this.tickCount * 0.3) * 0.4).toFixed(2));
        dev.audio.clockDriftPpm = measuredSkew;

        // Live Heart Rate sensor simulation for Polar H10
        if (dev.category === 'sensor') {
          const bpm = Math.round(70 + Math.sin(this.tickCount * 0.5) * 6);
          const hrSvc = dev.gattServices.find((s) => s.uuid === '0x180D');
          if (hrSvc?.characteristics[0]) {
            hrSvc.characteristics[0].valueHex = `00${bpm.toString(16).padStart(2, '0').toUpperCase()}`;
            hrSvc.characteristics[0].valueDecoded = `${bpm} bpm (RR ${Math.round(60000 / bpm)}ms)`;
          }
        }
      }

      dev.telemetry = [
        ...dev.telemetry,
        {
          timestamp: now,
          rssi: dev.rssi,
          jitterMs: dev.jitterMs,
          driftPpm: dev.audio.clockDriftPpm,
          packetLossPct: dev.packetLossPct
        }
      ].slice(-40);
    }

    return Array.from(this.devices.values());
  }

  async registerExternalDevice(input: Partial<BluetoothDevice> & { id: string; name: string }): Promise<BluetoothDevice> {
    const now = Date.now();
    const id = input.id;
    const address = input.address ?? 'FE:ED:00:00:00:01';
    const rssi = input.rssi ?? -50;
    const existing = this.devices.get(id);

    const device: BluetoothDevice = {
      id,
      address,
      name: input.name,
      vendor: input.vendor ?? 'Web Bluetooth BLE',
      category: input.category ?? 'sensor',
      transport: 'ble',
      bluetoothVersion: '5.3',
      paired: true,
      trusted: true,
      favorite: existing?.favorite ?? false,
      connected: input.connected ?? true,
      phase: 'connected',
      phaseProgress: 100,
      rssi,
      estimatedDistanceM: estimateDistanceMeters(rssi),
      batteryLevel: input.batteryLevel ?? null,
      linkQuality: 95,
      jitterMs: 1.2,
      packetLossPct: 0.02,
      bitrateKbps: 24,
      connectedAt: now,
      lastSeenAt: now,
      radarAngleDeg: existing?.radarAngleDeg ?? Math.floor(Math.random() * 360),
      audio: {
        supportsAudio: false,
        volume: 80,
        muted: false,
        solo: false,
        routing: 'stereo',
        eq: { preset: 'flat', bassDb: 0, midDb: 0, trebleDb: 0 },
        codec: 'LC3',
        supportedCodecs: [],
        intrinsicLatencyMs: 0,
        manualOffsetMs: 0,
        appliedDelayMs: 0,
        effectiveLatencyMs: 0,
        clockDriftPpm: 0,
        phaseDeltaMs: 0
      },
      proximity: {
        enabled: false,
        autoConnectRssi: -62,
        autoDisconnectRssi: -88,
        autoReconnect: true
      },
      gattServices: input.gattServices ?? [],
      telemetry: [
        { timestamp: now, rssi, jitterMs: 1.2, driftPpm: 0, packetLossPct: 0.02 }
      ]
    };

    this.baseRssiMap.set(id, rssi);
    this.devices.set(id, device);
    return device;
  }
}
