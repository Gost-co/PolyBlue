export type PlatformKind = 'linux' | 'windows' | 'macos' | 'other';

export type DriverMode = 'auto' | 'linux' | 'windows' | 'macos' | 'virtual';

export type DeviceCategory =
  | 'headphones'
  | 'earbuds'
  | 'speaker'
  | 'soundbar'
  | 'keyboard'
  | 'mouse'
  | 'gamepad'
  | 'wearable'
  | 'sensor'
  | 'phone'
  | 'unknown';

export type BluetoothTransport = 'classic' | 'ble' | 'dual' | 'le-audio';

export type ConnectionPhase =
  | 'disconnected'
  | 'queued'
  | 'paging'
  | 'authenticating'
  | 'negotiating'
  | 'syncing'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type AudioCodecId =
  | 'LC3'
  | 'APTX_LL'
  | 'APTX_ADAPTIVE'
  | 'APTX_HD'
  | 'APTX'
  | 'LDAC'
  | 'AAC'
  | 'SBC'
  | 'MSBC';

export type ChannelRouting = 'stereo' | 'left' | 'right' | 'mono' | 'subwoofer';

export type EqPresetId = 'flat' | 'bass_boost' | 'vocal' | 'studio' | 'night' | 'custom';

export interface EqualizerBands {
  preset: EqPresetId;
  bassDb: number;   // -12 to +12 dB (100 Hz)
  midDb: number;    // -12 to +12 dB (1 kHz)
  trebleDb: number; // -12 to +12 dB (8 kHz)
}

export interface GattCharacteristic {
  uuid: string;
  name: string;
  properties: Array<'read' | 'write' | 'notify' | 'indicate'>;
  valueHex: string;
  valueDecoded: string;
}

export interface GattService {
  uuid: string;
  name: string;
  primary: boolean;
  characteristics: GattCharacteristic[];
}

export interface TelemetrySample {
  timestamp: number;
  rssi: number;
  jitterMs: number;
  driftPpm: number;
  packetLossPct: number;
}

export interface ProximityRule {
  enabled: boolean;
  autoConnectRssi: number;    // e.g. -62 dBm
  autoDisconnectRssi: number; // e.g. -88 dBm
  autoReconnect: boolean;
}

export interface DeviceAudioState {
  supportsAudio: boolean;
  volume: number;             // 0 - 100
  muted: boolean;
  solo: boolean;
  routing: ChannelRouting;
  eq: EqualizerBands;
  codec: AudioCodecId;
  supportedCodecs: AudioCodecId[];
  intrinsicLatencyMs: number; // Native pipeline latency for active codec
  manualOffsetMs: number;     // Fine user trim (-250 to +250 ms)
  appliedDelayMs: number;     // Delay injected by PolyBlue engine to phase-lock all outputs
  effectiveLatencyMs: number; // intrinsic + appliedDelay + manualOffset
  clockDriftPpm: number;      // Measured crystal oscillator skew in parts per million
  phaseDeltaMs: number;       // Residual delta vs master clock target (aim: ~0.0 ms)
}

export interface BluetoothDevice {
  id: string;                 // Normalized MAC or unique device identifier
  address: string;            // AA:BB:CC:DD:EE:FF
  name: string;
  alias?: string;
  vendor: string;
  category: DeviceCategory;
  transport: BluetoothTransport;
  bluetoothVersion: string;   // e.g. "5.3", "5.4"
  paired: boolean;
  trusted: boolean;
  favorite: boolean;
  connected: boolean;
  phase: ConnectionPhase;
  phaseProgress: number;      // 0 - 100
  lastError?: string;
  rssi: number;               // dBm, e.g. -52
  estimatedDistanceM: number; // meters
  batteryLevel: number | null;// 0 - 100 or null if unavailable
  charging?: boolean;
  linkQuality: number;        // 0 - 100%
  jitterMs: number;
  packetLossPct: number;
  bitrateKbps: number;
  connectedAt: number | null;
  lastSeenAt: number;
  radarAngleDeg: number;      // Stable spatial angle for radar view
  audio: DeviceAudioState;
  proximity: ProximityRule;
  gattServices: GattService[];
  telemetry: TelemetrySample[];
}

export interface HostAdapterInfo {
  id: string;
  name: string;
  address: string;
  platform: PlatformKind;
  driver: Exclude<DriverMode, 'auto'>;
  hardwareDetected: boolean;
  audioBackend: string;       // e.g. "PipeWire 1.2 + BlueZ 5.77", "WASAPI + WinRT", "CoreAudio Multi-Output", "Virtual RF Engine"
  powered: boolean;
  discovering: boolean;
  bluetoothVersion: string;
  leAudioSupported: boolean;
  maxSimultaneousLinks: number;
  activeLinks: number;
  activeAudioLinks: number;
  piconetLoadPct: number;
  totalBitrateKbps: number;
  airtimeWarning: string | null;
}

export interface SyncConfig {
  enabled: boolean;
  autoAlign: boolean;
  driftCorrection: boolean;
  safetyBufferMs: number;      // Extra jitter absorption buffer (0 - 60 ms)
  masterVolume: number;        // 0 - 100
  linkedVolume: boolean;       // Scale per-device volumes proportionally
  masterTargetLatencyMs: number;
  maxPhaseErrorMs: number;
  syncLocked: boolean;
  calibratedAt: number | null;
}

export interface DeviceGroupMember {
  deviceId: string;
  volume: number;
  routing: ChannelRouting;
  manualOffsetMs: number;
  codec?: AudioCodecId;
  eq?: EqualizerBands;
}

export interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  accent: 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose';
  members: DeviceGroupMember[];
  createdAt: number;
  lastActivatedAt: number | null;
}

export interface DaemonSettings {
  driverMode: DriverMode;
  lanRemoteEnabled: boolean;
  staggerPagingMs: number;     // Delay between simultaneous HCI page commands (prevents collisions)
  autoReconnectOnStartup: boolean;
  watchdogIntervalMs: number;
}

export interface SystemDiagnostics {
  platform: PlatformKind;
  osRelease: string;
  nodeVersion: string;
  uptimeSec: number;
  detectedTools: Record<string, boolean>;
  lanAddresses: string[];
  port: number;
  driverNotes: string[];
}

export interface PolyBlueSnapshot {
  adapter: HostAdapterInfo;
  sync: SyncConfig;
  settings: DaemonSettings;
  devices: BluetoothDevice[];
  groups: DeviceGroup[];
  diagnostics: SystemDiagnostics;
  serverTime: number;
}

export type ServerEvent =
  | { type: 'snapshot'; payload: PolyBlueSnapshot }
  | { type: 'device:updated'; payload: BluetoothDevice }
  | { type: 'device:removed'; payload: { id: string } }
  | { type: 'sync:updated'; payload: SyncConfig }
  | { type: 'adapter:updated'; payload: HostAdapterInfo }
  | { type: 'groups:updated'; payload: DeviceGroup[] }
  | { type: 'log'; payload: { timestamp: number; level: 'info' | 'warn' | 'error' | 'sync'; message: string } };
