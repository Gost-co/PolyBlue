import type {
  AudioCodecId,
  BluetoothDevice,
  ChannelRouting,
  ConnectionPhase,
  DriverMode,
  HostAdapterInfo
} from '@polyblue/shared';

export type PhaseCallback = (phase: ConnectionPhase, progress: number) => void;

export interface BluetoothDriver {
  readonly mode: Exclude<DriverMode, 'auto'>;
  readonly hardwareDetected: boolean;
  readonly audioBackend: string;
  readonly notes: string[];

  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  getAdapterInfo(): Promise<HostAdapterInfo>;
  setPowered(powered: boolean): Promise<void>;

  startScan(durationMs?: number): Promise<void>;
  stopScan(): Promise<void>;

  getDevices(): Promise<BluetoothDevice[]>;
  connectDevice(deviceId: string, onPhase?: PhaseCallback): Promise<BluetoothDevice>;
  disconnectDevice(deviceId: string): Promise<BluetoothDevice>;
  pairDevice(deviceId: string): Promise<BluetoothDevice>;
  removeDevice(deviceId: string): Promise<void>;

  setDeviceVolume(deviceId: string, volume: number, muted: boolean): Promise<void>;
  setDeviceCodec(deviceId: string, codec: AudioCodecId): Promise<void>;
  applySyncDelays(
    delaysMs: Record<string, number>,
    routing: Record<string, ChannelRouting>
  ): Promise<void>;

  pollTelemetry(): Promise<BluetoothDevice[]>;

  registerExternalDevice?(device: Partial<BluetoothDevice> & { id: string; name: string }): Promise<BluetoothDevice>;
}
