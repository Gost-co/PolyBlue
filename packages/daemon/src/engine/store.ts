import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CODEC_SPECS,
  EQ_PRESETS,
  type AudioCodecId,
  type ChannelRouting,
  type DaemonSettings,
  type DeviceGroup,
  type DeviceGroupMember,
  type DriverMode,
  type EqualizerBands,
  type EqPresetId,
  type ProximityRule
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
const VALID_ACCENTS: Array<DeviceGroup['accent']> = ['cyan', 'emerald', 'violet', 'amber', 'rose'];
const VALID_ROUTING: ChannelRouting[] = ['stereo', 'left', 'right', 'mono', 'subwoofer'];
const VALID_EQ_PRESETS = Object.keys(EQ_PRESETS) as Array<Exclude<EqPresetId, 'custom'>>;

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFiniteStep(value: unknown, fallback: number, min: number, max: number, step: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Imported profiles are untrusted local JSON. Sanitize every scene so a malformed
 * member (null, wrong routing, out-of-range values, unknown codec) can never reach
 * the UI/render layer and crash a `.map()` over `group.members`.
 */
export function sanitizeGroupMembers(raw: unknown): DeviceGroupMember[] {
  if (!Array.isArray(raw)) return [];

  const members: DeviceGroupMember[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const deviceId = typeof entry.deviceId === 'string' ? entry.deviceId.trim() : '';
    if (!deviceId) continue;

    const routing: ChannelRouting = VALID_ROUTING.includes(entry.routing as ChannelRouting)
      ? (entry.routing as ChannelRouting)
      : 'stereo';
    const codec: AudioCodecId | undefined =
      typeof entry.codec === 'string' && entry.codec in CODEC_SPECS
        ? (entry.codec as AudioCodecId)
        : undefined;
    const eq = sanitizeEqualizerBands(entry.eq);

    members.push({
      deviceId,
      volume: clampFinite(entry.volume, 80, 0, 100),
      routing,
      manualOffsetMs: clampFiniteStep(entry.manualOffsetMs, 0, -250, 250, 0.1),
      ...(codec ? { codec } : {}),
      ...(eq ? { eq } : {})
    });
  }
  return members;
}

function sanitizeEqualizerBands(raw: unknown): EqualizerBands | undefined {
  if (!isPlainObject(raw)) return undefined;
  const preset =
    raw.preset === 'custom' || (typeof raw.preset === 'string' && VALID_EQ_PRESETS.includes(raw.preset as Exclude<EqPresetId, 'custom'>))
      ? (raw.preset as EqPresetId)
      : 'custom';
  return {
    preset,
    bassDb: clampFiniteStep(raw.bassDb, 0, -12, 12, 0.5),
    midDb: clampFiniteStep(raw.midDb, 0, -12, 12, 0.5),
    trebleDb: clampFiniteStep(raw.trebleDb, 0, -12, 12, 0.5)
  };
}

export function sanitizeGroup(raw: unknown): DeviceGroup | null {
  if (!isPlainObject(raw)) return null;
  const members = sanitizeGroupMembers(raw.members);
  if (members.length === 0) return null;

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Scene';
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `grp-${Date.now().toString(36)}`;
  const accent: DeviceGroup['accent'] = VALID_ACCENTS.includes(raw.accent as DeviceGroup['accent'])
    ? (raw.accent as DeviceGroup['accent'])
    : 'cyan';

  return {
    id,
    name,
    description: typeof raw.description === 'string' ? raw.description : '',
    accent,
    members,
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) && raw.createdAt > 0
        ? Math.round(raw.createdAt)
        : Date.now(),
    lastActivatedAt:
      typeof raw.lastActivatedAt === 'number' && Number.isFinite(raw.lastActivatedAt) && raw.lastActivatedAt > 0
        ? Math.round(raw.lastActivatedAt)
        : null
  };
}

function sanitizeGroups(raw: unknown, fallback: DeviceGroup[]): DeviceGroup[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.map(sanitizeGroup).filter((group): group is DeviceGroup => group !== null);
}

function sanitizeDevicePrefs(raw: unknown): Record<string, SavedDevicePrefs> {
  if (!isPlainObject(raw)) return {};

  const prefs: Record<string, SavedDevicePrefs> = {};
  for (const [deviceId, value] of Object.entries(raw)) {
    if (!deviceId.trim() || !isPlainObject(value)) continue;
    const pref: SavedDevicePrefs = {};

    if (typeof value.alias === 'string' && value.alias.trim()) pref.alias = value.alias.trim();
    if (typeof value.favorite === 'boolean') pref.favorite = value.favorite;
    if (typeof value.volume === 'number' && Number.isFinite(value.volume)) {
      pref.volume = clampFinite(value.volume, 80, 0, 100);
    }
    if (VALID_ROUTING.includes(value.routing as ChannelRouting)) pref.routing = value.routing as ChannelRouting;
    if (typeof value.manualOffsetMs === 'number' && Number.isFinite(value.manualOffsetMs)) {
      pref.manualOffsetMs = clampFiniteStep(value.manualOffsetMs, 0, -250, 250, 0.1);
    }
    if (typeof value.codec === 'string' && value.codec in CODEC_SPECS) {
      pref.codec = value.codec as AudioCodecId;
    }
    const eq = sanitizeEqualizerBands(value.eq);
    if (eq) pref.eq = eq;

    if (isPlainObject(value.proximity)) {
      const proximity = value.proximity;
      pref.proximity = {
        enabled: typeof proximity.enabled === 'boolean' ? proximity.enabled : false,
        autoConnectRssi: clampFinite(proximity.autoConnectRssi, -60, -90, -30),
        autoDisconnectRssi: clampFinite(proximity.autoDisconnectRssi, -88, -100, -55),
        autoReconnect: typeof proximity.autoReconnect === 'boolean' ? proximity.autoReconnect : true
      };
    }

    if (Object.keys(pref).length > 0) prefs[deviceId.trim()] = pref;
  }
  return prefs;
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
          groups: sanitizeGroups(parsed.groups, defaults.groups),
          devicePrefs: sanitizeDevicePrefs(parsed.devicePrefs),
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
      groups: sanitizeGroups(incoming.groups, this.state.groups),
      devicePrefs: sanitizeDevicePrefs(incoming.devicePrefs),
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
