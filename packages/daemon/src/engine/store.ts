import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AudioCodecId,
  ChannelRouting,
  DaemonSettings,
  DeviceGroup,
  DriverMode,
  EqualizerBands,
  ProximityRule
} from '@polyblue/shared';

export interface SavedDevicePrefs {
  alias?: string;
  favorite?: boolean;
  volume?: number;
  routing?: ChannelRouting;
  manualOffsetMs?: number;
  codec?: AudioCodecId;
  eq?: EqualizerBands;
  proximity?: ProximityRule;
}

export interface PersistedState {
  version: number;
  settings: DaemonSettings;
  syncOptions: {
    enabled: boolean;
    autoAlign: boolean;
    driftCorrection: boolean;
    safetyBufferMs: number;
    masterVolume: number;
    linkedVolume: boolean;
  };
  groups: DeviceGroup[];
  devicePrefs: Record<string, SavedDevicePrefs>;
  lastConnectedIds: string[];
}

const VALID_DRIVERS: DriverMode[] = ['auto', 'linux', 'windows', 'macos', 'virtual'];

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

const DEFAULT_GROUPS: DeviceGroup[] = [
  {
    id: 'grp-cinema-duo',
    name: 'Cinema Night Duo',
    description: 'Simultaneous dual-headphone listening locked to 0.0 ms phase difference',
    accent: 'cyan',
    members: [
      { deviceId: '7C:96:D2:4A:1B:88', volume: 82, routing: 'stereo', manualOffsetMs: 0, codec: 'LDAC' },
      { deviceId: '40:98:AD:9E:33:12', volume: 78, routing: 'stereo', manualOffsetMs: 0, codec: 'LC3' }
    ],
    createdAt: Date.now() - 86_400_000 * 5,
    lastActivatedAt: Date.now() - 180_000
  },
  {
    id: 'grp-party-stereo',
    name: 'Split Stereo Speakers',
    description: 'Turns two independent Bluetooth speakers into a synced Left / Right stereo stage',
    accent: 'emerald',
    members: [
      { deviceId: '58:FC:C6:81:F0:2A', volume: 88, routing: 'left', manualOffsetMs: 0, codec: 'AAC' },
      { deviceId: 'E8:AB:FA:55:19:7D', volume: 88, routing: 'right', manualOffsetMs: 0, codec: 'AAC' }
    ],
    createdAt: Date.now() - 86_400_000 * 3,
    lastActivatedAt: null
  },
  {
    id: 'grp-workstation',
    name: 'Focus Workstation',
    description: 'Low-latency headphones + BLE keyboard, mouse, and biometric sensor',
    accent: 'violet',
    members: [
      { deviceId: '2C:41:A1:67:C4:09', volume: 74, routing: 'stereo', manualOffsetMs: 0, codec: 'APTX_LL' },
      { deviceId: 'DC:2C:26:A3:44:10', volume: 0, routing: 'stereo', manualOffsetMs: 0 },
      { deviceId: 'D0:8A:55:77:8E:3C', volume: 0, routing: 'stereo', manualOffsetMs: 0 }
    ],
    createdAt: Date.now() - 86_400_000 * 2,
    lastActivatedAt: null
  }
];

export function createDefaultState(): PersistedState {
  return {
    version: 1,
    settings: {
      driverMode: 'auto',
      lanRemoteEnabled: true,
      staggerPagingMs: 140,
      autoReconnectOnStartup: true,
      watchdogIntervalMs: 2200
    },
    syncOptions: {
      enabled: true,
      autoAlign: true,
      driftCorrection: true,
      safetyBufferMs: 12,
      masterVolume: 82,
      linkedVolume: true
    },
    groups: structuredClone(DEFAULT_GROUPS),
    devicePrefs: {},
    lastConnectedIds: []
  };
}

function sanitizeSettings(raw: Partial<DaemonSettings> | undefined, fallback: DaemonSettings): DaemonSettings {
  const mode = raw?.driverMode && VALID_DRIVERS.includes(raw.driverMode) ? raw.driverMode : fallback.driverMode;
  return {
    driverMode: mode,
    lanRemoteEnabled:
      typeof raw?.lanRemoteEnabled === 'boolean' ? raw.lanRemoteEnabled : fallback.lanRemoteEnabled,
    staggerPagingMs: clampFinite(raw?.staggerPagingMs, fallback.staggerPagingMs, 40, 600),
    autoReconnectOnStartup:
      typeof raw?.autoReconnectOnStartup === 'boolean'
        ? raw.autoReconnectOnStartup
        : fallback.autoReconnectOnStartup,
    watchdogIntervalMs: clampFinite(raw?.watchdogIntervalMs, fallback.watchdogIntervalMs, 1000, 30000)
  };
}

function sanitizeSyncOptions(
  raw: Partial<PersistedState['syncOptions']> | undefined,
  fallback: PersistedState['syncOptions']
): PersistedState['syncOptions'] {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    autoAlign: typeof raw?.autoAlign === 'boolean' ? raw.autoAlign : fallback.autoAlign,
    driftCorrection: typeof raw?.driftCorrection === 'boolean' ? raw.driftCorrection : fallback.driftCorrection,
    safetyBufferMs: clampFinite(raw?.safetyBufferMs, fallback.safetyBufferMs, 0, 80),
    masterVolume: clampFinite(raw?.masterVolume, fallback.masterVolume, 0, 100),
    linkedVolume: typeof raw?.linkedVolume === 'boolean' ? raw.linkedVolume : fallback.linkedVolume
  };
}

export class StateStore {
  private readonly filePath: string;
  private state: PersistedState;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(customDir?: string) {
    const baseDir = customDir ?? process.env.POLYBLUE_DATA_DIR ?? path.join(os.homedir(), '.config', 'polyblue');
    this.filePath = path.join(baseDir, 'state.json');
    this.state = this.load();
  }

  private load(): PersistedState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        const defaults = createDefaultState();
        return {
          version: 1,
          settings: sanitizeSettings(parsed.settings, defaults.settings),
          syncOptions: sanitizeSyncOptions(parsed.syncOptions, defaults.syncOptions),
          groups: Array.isArray(parsed.groups) ? parsed.groups : defaults.groups,
          devicePrefs: parsed.devicePrefs && typeof parsed.devicePrefs === 'object' ? parsed.devicePrefs : {},
          lastConnectedIds: Array.isArray(parsed.lastConnectedIds)
            ? parsed.lastConnectedIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
            : []
        };
      }
    } catch {
      // Fall back to clean defaults if state file is unreadable
    }
    return createDefaultState();
  }

  get(): PersistedState {
    return this.state;
  }

  private writeNow(): void {
    this.dirty = false;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Ignore write failures in read-only environments
    }
  }

  /**
   * Coalesces rapid state mutations (e.g., dragging volume/offset/EQ sliders) so disk I/O
   * never stalls the event loop, while guaranteeing persistence within 160ms.
   */
  save(immediate = false): void {
    this.dirty = true;
    if (immediate) {
      this.writeNow();
      return;
    }
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.writeNow();
    }, 160);
  }

  flush(): void {
    if (this.dirty || this.saveTimer) {
      this.writeNow();
    }
  }

  exportConfig(): PersistedState {
    return structuredClone(this.state);
  }

  importConfig(incoming: Partial<PersistedState>): PersistedState {
    const defaults = createDefaultState();
    this.state = {
      version: 1,
      settings: sanitizeSettings(incoming.settings, defaults.settings),
      syncOptions: sanitizeSyncOptions(incoming.syncOptions, defaults.syncOptions),
      groups: Array.isArray(incoming.groups) ? incoming.groups : this.state.groups,
      devicePrefs:
        incoming.devicePrefs && typeof incoming.devicePrefs === 'object'
          ? incoming.devicePrefs
          : this.state.devicePrefs,
      lastConnectedIds: Array.isArray(incoming.lastConnectedIds)
        ? incoming.lastConnectedIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
        : this.state.lastConnectedIds
    };
    this.save(true);
    return this.state;
  }

  reset(): PersistedState {
    this.state = createDefaultState();
    this.save(true);
    return this.state;
  }
}
