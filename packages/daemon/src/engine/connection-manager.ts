import { EventEmitter } from 'node:events';
import {
  computeSyncPlan,
  EQ_PRESETS,
  getCodecSpec,
  KalmanDriftEstimator,
  type AudioCodecId,
  type BluetoothDevice,
  type ChannelRouting,
  type DaemonSettings,
  type DeviceGroup,
  type DriverMode,
  type EqualizerBands,
  type HostAdapterInfo,
  type PolyBlueSnapshot,
  type ProximityRule,
  type ServerEvent,
  type SyncConfig,
  type SystemDiagnostics
} from '@polyblue/shared';
import { probeEnvironment, type EnvironmentProbe } from '../drivers/detector.js';
import { LinuxBlueZDriver } from '../drivers/linux.js';
import { MacOSCoreBluetoothDriver } from '../drivers/macos.js';
import type { BluetoothDriver } from '../drivers/types.js';
import { VirtualRadioDriver } from '../drivers/virtual.js';
import { WindowsWinRTDriver } from '../drivers/windows.js';
import { StateStore, type PersistedState } from './store.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

export class PolyBlueEngine extends EventEmitter {
  private driver!: BluetoothDriver;
  private probe!: EnvironmentProbe;
  private readonly store: StateStore;
  private readonly port: number;
  private readonly startedAt = Date.now();
  private telemetryTimer: NodeJS.Timeout | null = null;
  private telemetryBusy = false;
  private driftEstimators = new Map<string, KalmanDriftEstimator>();
  private devicesCache: BluetoothDevice[] = [];
  private syncState: SyncConfig;
  private connectingIds = new Set<string>();
  private proximityCooldown = new Map<string, number>();

  constructor(options?: { dataDir?: string; port?: number; forcedDriver?: DriverMode }) {
    super();
    this.store = new StateStore(options?.dataDir);
    this.port = options?.port ?? 4720;

    if (options?.forcedDriver) {
      this.store.get().settings.driverMode = options.forcedDriver;
    }

    const savedSync = this.store.get().syncOptions;
    this.syncState = {
      ...savedSync,
      masterTargetLatencyMs: 0,
      maxPhaseErrorMs: 0,
      syncLocked: true,
      calibratedAt: null
    };
  }

  async initialize(): Promise<void> {
    this.probe = await probeEnvironment();
    await this.loadDriver(this.store.get().settings.driverMode);

    // Honor autoReconnectOnStartup for previously connected paired devices
    const settings = this.store.get().settings;
    if (settings.autoReconnectOnStartup && this.store.get().lastConnectedIds.length > 0) {
      const toReconnect = this.store
        .get()
        .lastConnectedIds.filter((id) => {
          const dev = this.devicesCache.find((d) => d.id === id);
          return Boolean(dev && dev.paired && !dev.connected);
        });
      if (toReconnect.length > 0) {
        this.log('info', `Auto-reconnecting ${toReconnect.length} previously active device(s)...`);
        await this.connectMany(toReconnect);
      }
    }

    this.restartTelemetryTimer();
  }

  private restartTelemetryTimer(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    const intervalMs = Math.max(1000, Math.min(30000, this.store.get().settings.watchdogIntervalMs));
    this.telemetryTimer = setInterval(() => {
      void this.tickTelemetry();
    }, intervalMs);
  }

  getSettings(): DaemonSettings {
    return { ...this.store.get().settings };
  }

  async shutdown(): Promise<void> {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    this.store.flush();
    if (this.driver) {
      await this.driver.shutdown();
    }
  }

  private emitEvent(event: ServerEvent): void {
    this.emit('event', event);
  }

  private log(level: 'info' | 'warn' | 'error' | 'sync', message: string): void {
    this.emitEvent({
      type: 'log',
      payload: { timestamp: Date.now(), level, message }
    });
  }

  private instantiateDriver(mode: Exclude<DriverMode, 'auto'>): BluetoothDriver {
    switch (mode) {
      case 'linux':
        return new LinuxBlueZDriver();
      case 'windows':
        return new WindowsWinRTDriver();
      case 'macos':
        return new MacOSCoreBluetoothDriver();
      case 'virtual':
      default:
        return new VirtualRadioDriver();
    }
  }

  async loadDriver(requested: DriverMode): Promise<void> {
    if (this.driver) {
      await this.driver.shutdown();
    }
    const targetMode: Exclude<DriverMode, 'auto'> =
      requested === 'auto' ? this.probe.recommendedDriver : requested;

    this.driver = this.instantiateDriver(targetMode);
    await this.driver.initialize();
    this.store.get().settings.driverMode = requested;
    this.store.save();

    this.driftEstimators.clear();
    this.devicesCache = await this.driver.getDevices();
    this.applySavedDevicePrefs();
    await this.recomputeSync(true);

    this.log('info', `Initialized ${this.driver.mode.toUpperCase()} driver (${this.driver.audioBackend}).`);
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
  }

  private applySavedDevicePrefs(): void {
    const prefs = this.store.get().devicePrefs;
    for (const dev of this.devicesCache) {
      const p = prefs[dev.id];
      if (!p) continue;
      if (p.alias !== undefined) dev.alias = p.alias;
      if (p.favorite !== undefined) dev.favorite = p.favorite;
      if (p.volume !== undefined) dev.audio.volume = p.volume;
      if (p.routing !== undefined) dev.audio.routing = p.routing;
      if (p.manualOffsetMs !== undefined) dev.audio.manualOffsetMs = p.manualOffsetMs;
      if (p.eq !== undefined) dev.audio.eq = p.eq;
      if (p.proximity !== undefined) dev.proximity = p.proximity;
      if (p.codec && dev.audio.supportedCodecs.includes(p.codec)) {
        dev.audio.codec = p.codec;
        dev.audio.intrinsicLatencyMs = getCodecSpec(p.codec).baseLatencyMs;
      }
    }
  }

  private saveDevicePref(dev: BluetoothDevice): void {
    this.store.get().devicePrefs[dev.id] = {
      alias: dev.alias,
      favorite: dev.favorite,
      volume: dev.audio.volume,
      routing: dev.audio.routing,
      manualOffsetMs: dev.audio.manualOffsetMs,
      codec: dev.audio.codec,
      eq: dev.audio.eq,
      proximity: dev.proximity
    };
    this.store.save();
  }

  async getSnapshot(): Promise<PolyBlueSnapshot> {
    const adapter = await this.driver.getAdapterInfo();
    const diagnostics: SystemDiagnostics = {
      platform: this.probe.platform,
      osRelease: this.probe.osRelease,
      nodeVersion: process.version,
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      detectedTools: this.probe.detectedTools,
      lanAddresses: this.probe.lanAddresses,
      port: this.port,
      driverNotes: [...this.probe.notes, ...this.driver.notes]
    };

    return {
      adapter,
      sync: { ...this.syncState },
      settings: { ...this.store.get().settings },
      devices: this.devicesCache,
      groups: this.store.get().groups,
      diagnostics,
      serverTime: Date.now()
    };
  }

  async setAdapterPower(powered: boolean): Promise<HostAdapterInfo> {
    await this.driver.setPowered(powered);
    this.devicesCache = await this.driver.getDevices();
    await this.recomputeSync(true);
    const adapter = await this.driver.getAdapterInfo();
    this.log('info', `Bluetooth radio powered ${powered ? 'ON' : 'OFF'}.`);
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
    return adapter;
  }

  async startScan(durationMs = 8000): Promise<HostAdapterInfo> {
    const safeDuration = Math.max(1000, Math.min(30000, finiteNumber(durationMs) ?? 8000));
    await this.driver.startScan(safeDuration);
    this.log('info', `Scanning for nearby Classic BT, BLE, and LE Audio devices (${Math.round(safeDuration / 1000)}s)...`);
    const adapter = await this.driver.getAdapterInfo();
    this.emitEvent({ type: 'adapter:updated', payload: adapter });
    return adapter;
  }

  async stopScan(): Promise<HostAdapterInfo> {
    await this.driver.stopScan();
    const adapter = await this.driver.getAdapterInfo();
    this.emitEvent({ type: 'adapter:updated', payload: adapter });
    return adapter;
  }

  /**
   * Connects one or many Bluetooth devices simultaneously using staggered HCI paging bursts
   * so multiple devices establish links in parallel without controller page-scan collisions.
   */
  async connectMany(deviceIds: string[]): Promise<{ connected: string[]; failed: Array<{ id: string; error: string }> }> {
    const unique = Array.from(
      new Set(deviceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );
    const staggerMs = Math.max(40, Math.min(600, this.store.get().settings.staggerPagingMs));
    const connected: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    if (unique.length === 0) return { connected, failed };

    this.log(
      'info',
      unique.length > 1
        ? `Initiating parallel multi-link connect for ${unique.length} devices (stagger ${staggerMs}ms)...`
        : `Connecting to ${unique[0]}...`
    );

    // Reserve and mark queued state immediately so telemetry ticks cannot clobber in-flight progress
    for (const id of unique) {
      const dev = this.devicesCache.find((d) => d.id === id);
      if (dev && !dev.connected) {
        dev.phase = 'queued';
        dev.phaseProgress = 10;
        this.emitEvent({ type: 'device:updated', payload: dev });
      }
    }

    const tasks = unique.map(async (id, index) => {
      if (this.connectingIds.has(id)) return;
      this.connectingIds.add(id);

      try {
        if (index > 0) {
          await sleep(staggerMs * index);
        }
        const updated = await this.driver.connectDevice(id, (phase, progress) => {
          const cached = this.devicesCache.find((d) => d.id === id);
          if (cached) {
            cached.phase = phase;
            cached.phaseProgress = progress;
            this.emitEvent({ type: 'device:updated', payload: cached });
          }
        });
        this.upsertDevice(updated);
        connected.push(id);
        this.log(
          'info',
          `Connected ${updated.name} (${updated.audio.supportsAudio ? updated.audio.codec : updated.transport.toUpperCase()}).`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ id, error: message });
        const cached = this.devicesCache.find((d) => d.id === id);
        if (cached) {
          cached.phase = 'error';
          cached.lastError = message;
          this.emitEvent({ type: 'device:updated', payload: cached });
        }
        this.log('error', `Failed to connect ${id}: ${message}`);
      } finally {
        this.connectingIds.delete(id);
      }
    });

    await Promise.all(tasks);
    this.devicesCache = await this.driver.getDevices();
    this.applySavedDevicePrefs();
    this.syncLastConnectedIds();

    // Auto-align newly joined audio devices when Auto-Align on Connect is enabled
    if (connected.length > 0 && this.syncState.autoAlign) {
      this.syncState.enabled = true;
      this.store.get().syncOptions.enabled = true;
      this.store.save();
    }

    await this.recomputeSync(true);
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });

    return { connected, failed };
  }

  async disconnectMany(deviceIds: string[]): Promise<void> {
    const unique = Array.from(
      new Set(deviceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );
    const now = Date.now();
    await Promise.all(
      unique.map(async (id) => {
        try {
          // Set proximity cooldown so manually disconnected devices do not immediately auto-reconnect
          this.proximityCooldown.set(id, now);
          const updated = await this.driver.disconnectDevice(id);
          this.upsertDevice(updated);
          this.driftEstimators.delete(id);
          this.log('info', `Disconnected ${updated.name}.`);
        } catch (err) {
          this.log('warn', `Disconnect error on ${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );
    this.devicesCache = await this.driver.getDevices();
    this.applySavedDevicePrefs();
    this.syncLastConnectedIds();
    await this.recomputeSync(true);
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
  }

  private syncLastConnectedIds(): void {
    this.store.get().lastConnectedIds = this.devicesCache.filter((d) => d.connected).map((d) => d.id);
    this.store.save();
  }

  async pairDevice(deviceId: string): Promise<BluetoothDevice> {
    const updated = await this.driver.pairDevice(deviceId);
    this.upsertDevice(updated);
    this.log('info', `Paired & trusted ${updated.name}.`);
    this.emitEvent({ type: 'device:updated', payload: updated });
    return updated;
  }

  async removeDevice(deviceId: string): Promise<void> {
    await this.driver.removeDevice(deviceId);
    this.devicesCache = this.devicesCache.filter((d) => d.id !== deviceId);
    this.driftEstimators.delete(deviceId);
    delete this.store.get().devicePrefs[deviceId];
    this.store.get().lastConnectedIds = this.store.get().lastConnectedIds.filter((id) => id !== deviceId);
    this.store.save();
    await this.recomputeSync(true);
    this.emitEvent({ type: 'device:removed', payload: { id: deviceId } });
    this.emitEvent({ type: 'adapter:updated', payload: await this.driver.getAdapterInfo() });
  }

  async registerExternalDevice(input: Partial<BluetoothDevice> & { id: string; name: string }): Promise<BluetoothDevice> {
    if (!this.driver.registerExternalDevice) {
      throw new Error('Current driver does not accept browser-paired external devices directly.');
    }
    const dev = await this.driver.registerExternalDevice(input);
    this.upsertDevice(dev);
    this.log('info', `Registered live Web Bluetooth device: ${dev.name}.`);
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
    return dev;
  }

  async updateDeviceAudio(
    deviceId: string,
    patch: {
      volume?: number;
      muted?: boolean;
      solo?: boolean;
      routing?: ChannelRouting;
      manualOffsetMs?: number;
      codec?: AudioCodecId;
      eq?: Partial<EqualizerBands>;
      favorite?: boolean;
      alias?: string | null;
      proximity?: Partial<ProximityRule>;
    }
  ): Promise<BluetoothDevice> {
    const dev = this.devicesCache.find((d) => d.id === deviceId);
    if (!dev) throw new Error(`Device ${deviceId} not found`);

    if (typeof patch.favorite === 'boolean') dev.favorite = patch.favorite;

    if (patch.alias !== undefined) {
      const cleaned = typeof patch.alias === 'string' ? patch.alias.trim() : '';
      if (cleaned) {
        dev.alias = cleaned;
      } else {
        delete dev.alias;
      }
    }

    if (patch.proximity) {
      const nextProx: ProximityRule = { ...dev.proximity };
      if (typeof patch.proximity.enabled === 'boolean') nextProx.enabled = patch.proximity.enabled;
      if (typeof patch.proximity.autoReconnect === 'boolean') nextProx.autoReconnect = patch.proximity.autoReconnect;
      const ac = finiteNumber(patch.proximity.autoConnectRssi);
      const ad = finiteNumber(patch.proximity.autoDisconnectRssi);
      if (ac !== undefined) nextProx.autoConnectRssi = Math.max(-90, Math.min(-30, Math.round(ac)));
      if (ad !== undefined) nextProx.autoDisconnectRssi = Math.max(-100, Math.min(-55, Math.round(ad)));
      // Prevent hysteresis inversion where disconnect threshold >= connect threshold
      if (nextProx.autoDisconnectRssi > nextProx.autoConnectRssi - 5) {
        nextProx.autoDisconnectRssi = Math.max(-100, nextProx.autoConnectRssi - 5);
      }
      dev.proximity = nextProx;
    }

    const volNum = finiteNumber(patch.volume);
    if (volNum !== undefined || typeof patch.muted === 'boolean') {
      const vol = volNum !== undefined ? volNum : dev.audio.volume;
      const muted = typeof patch.muted === 'boolean' ? patch.muted : dev.audio.muted;
      dev.audio.volume = Math.max(0, Math.min(100, Math.round(vol)));
      dev.audio.muted = muted;
      await this.driver.setDeviceVolume(deviceId, dev.audio.volume, dev.audio.muted);
    }

    if (typeof patch.solo === 'boolean') {
      dev.audio.solo = patch.solo;
    }

    if (patch.routing && ['stereo', 'left', 'right', 'mono', 'subwoofer'].includes(patch.routing)) {
      dev.audio.routing = patch.routing;
    }

    const offsetNum = finiteNumber(patch.manualOffsetMs);
    if (offsetNum !== undefined) {
      dev.audio.manualOffsetMs = Math.max(-250, Math.min(250, Math.round(offsetNum * 10) / 10));
    }

    if (patch.codec && dev.audio.supportedCodecs.includes(patch.codec)) {
      await this.driver.setDeviceCodec(deviceId, patch.codec);
      const spec = getCodecSpec(patch.codec);
      dev.audio.codec = patch.codec;
      dev.audio.intrinsicLatencyMs = spec.baseLatencyMs;
      if (dev.connected) {
        dev.bitrateKbps = spec.bitrateKbps;
      }
      this.log('sync', `Switched ${dev.name} codec to ${spec.label} (native ${spec.baseLatencyMs}ms).`);
    }

    if (patch.eq) {
      if (patch.eq.preset && patch.eq.preset !== 'custom' && patch.eq.preset in EQ_PRESETS) {
        const presetVals = EQ_PRESETS[patch.eq.preset];
        dev.audio.eq = {
          preset: patch.eq.preset,
          bassDb: presetVals.bassDb,
          midDb: presetVals.midDb,
          trebleDb: presetVals.trebleDb
        };
      } else {
        const bass = finiteNumber(patch.eq.bassDb);
        const mid = finiteNumber(patch.eq.midDb);
        const treble = finiteNumber(patch.eq.trebleDb);
        dev.audio.eq = {
          preset: 'custom',
          bassDb: bass !== undefined ? Math.max(-12, Math.min(12, bass)) : dev.audio.eq.bassDb,
          midDb: mid !== undefined ? Math.max(-12, Math.min(12, mid)) : dev.audio.eq.midDb,
          trebleDb: treble !== undefined ? Math.max(-12, Math.min(12, treble)) : dev.audio.eq.trebleDb
        };
      }
    }

    this.saveDevicePref(dev);

    const affectsSync =
      patch.codec !== undefined || patch.manualOffsetMs !== undefined || patch.routing !== undefined;

    if (affectsSync) {
      await this.recomputeSync(true);
      for (const active of this.devicesCache) {
        if (active.connected && active.audio.supportsAudio && active.id !== dev.id) {
          this.emitEvent({ type: 'device:updated', payload: active });
        }
      }
    }

    this.emitEvent({ type: 'device:updated', payload: dev });
    if (patch.codec !== undefined) {
      this.emitEvent({ type: 'adapter:updated', payload: await this.driver.getAdapterInfo() });
    }
    return dev;
  }

  async updateSyncConfig(patch: Partial<SyncConfig>): Promise<SyncConfig> {
    const prevMasterVol = this.syncState.masterVolume;

    if (typeof patch.enabled === 'boolean') this.syncState.enabled = patch.enabled;
    if (typeof patch.autoAlign === 'boolean') this.syncState.autoAlign = patch.autoAlign;
    if (typeof patch.driftCorrection === 'boolean') this.syncState.driftCorrection = patch.driftCorrection;
    if (typeof patch.linkedVolume === 'boolean') this.syncState.linkedVolume = patch.linkedVolume;

    const bufNum = finiteNumber(patch.safetyBufferMs);
    if (bufNum !== undefined) {
      this.syncState.safetyBufferMs = Math.max(0, Math.min(80, Math.round(bufNum)));
    }

    const updatedDeviceIds = new Set<string>();
    const masterVolNum = finiteNumber(patch.masterVolume);
    if (masterVolNum !== undefined) {
      const nextVol = Math.max(0, Math.min(100, Math.round(masterVolNum)));
      this.syncState.masterVolume = nextVol;

      if (this.syncState.linkedVolume && nextVol !== prevMasterVol) {
        const delta = nextVol - prevMasterVol;
        for (const dev of this.devicesCache) {
          if (dev.connected && dev.audio.supportsAudio) {
            dev.audio.volume = Math.max(0, Math.min(100, Math.round(dev.audio.volume + delta)));
            await this.driver.setDeviceVolume(dev.id, dev.audio.volume, dev.audio.muted);
            this.saveDevicePref(dev);
            updatedDeviceIds.add(dev.id);
          }
        }
      }
    }

    this.store.get().syncOptions = {
      enabled: this.syncState.enabled,
      autoAlign: this.syncState.autoAlign,
      driftCorrection: this.syncState.driftCorrection,
      safetyBufferMs: this.syncState.safetyBufferMs,
      masterVolume: this.syncState.masterVolume,
      linkedVolume: this.syncState.linkedVolume
    };
    this.store.save();

    const syncPlanChanged = patch.enabled !== undefined || patch.safetyBufferMs !== undefined;
    if (syncPlanChanged) {
      await this.recomputeSync(true);
      for (const dev of this.devicesCache) {
        if (dev.connected && dev.audio.supportsAudio) {
          updatedDeviceIds.add(dev.id);
        }
      }
    } else {
      this.emitEvent({ type: 'sync:updated', payload: { ...this.syncState } });
    }

    for (const id of updatedDeviceIds) {
      const dev = this.devicesCache.find((d) => d.id === id);
      if (dev) this.emitEvent({ type: 'device:updated', payload: dev });
    }
    return { ...this.syncState };
  }

  /**
   * Auto-Align resets per-device drift accumulators, enables sync lock, and recalculates
   * exact delay compensation so every connected output lands on the identical target clock.
   */
  async autoAlignAll(): Promise<SyncConfig> {
    this.syncState.enabled = true;
    this.syncState.autoAlign = true;
    this.store.get().syncOptions = {
      enabled: this.syncState.enabled,
      autoAlign: this.syncState.autoAlign,
      driftCorrection: this.syncState.driftCorrection,
      safetyBufferMs: this.syncState.safetyBufferMs,
      masterVolume: this.syncState.masterVolume,
      linkedVolume: this.syncState.linkedVolume
    };
    this.store.save();
    for (const dev of this.devicesCache) {
      if (dev.connected && dev.audio.supportsAudio) {
        dev.audio.manualOffsetMs = 0;
        this.saveDevicePref(dev);
      }
    }
    this.driftEstimators.clear();
    this.syncState.calibratedAt = Date.now();
    await this.recomputeSync(true);

    const activeCount = this.devicesCache.filter((d) => d.connected && d.audio.supportsAudio).length;
    this.log(
      'sync',
      `Auto-Aligned ${activeCount} active audio outputs to ${this.syncState.masterTargetLatencyMs}ms master clock (Δ ${this.syncState.maxPhaseErrorMs}ms).`
    );
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
    return { ...this.syncState };
  }

  async recomputeSync(applyToDriver = false): Promise<void> {
    const plan = computeSyncPlan(this.devicesCache, {
      enabled: this.syncState.enabled,
      safetyBufferMs: this.syncState.safetyBufferMs
    });

    this.syncState.masterTargetLatencyMs = plan.masterTargetLatencyMs;
    this.syncState.maxPhaseErrorMs = plan.maxPhaseErrorMs;
    this.syncState.syncLocked = plan.syncLocked;

    const delaysMs: Record<string, number> = {};
    const routing: Record<string, ChannelRouting> = {};

    for (const dev of this.devicesCache) {
      const sol = plan.solutions[dev.id];
      if (sol) {
        dev.audio.appliedDelayMs = sol.appliedDelayMs;
        dev.audio.effectiveLatencyMs = sol.effectiveLatencyMs;
        dev.audio.phaseDeltaMs = sol.phaseDeltaMs;
        delaysMs[dev.id] = sol.appliedDelayMs;
        routing[dev.id] = dev.audio.routing;
      } else {
        dev.audio.appliedDelayMs = 0;
        dev.audio.effectiveLatencyMs = dev.audio.intrinsicLatencyMs;
        dev.audio.phaseDeltaMs = 0;
      }
    }

    if (applyToDriver) {
      await this.driver.applySyncDelays(delaysMs, routing);
    }

    this.emitEvent({ type: 'sync:updated', payload: { ...this.syncState } });
  }

  // ---- Device Groups ("Scenes") ----

  createGroup(input: Omit<DeviceGroup, 'id' | 'createdAt' | 'lastActivatedAt'>): DeviceGroup {
    const group: DeviceGroup = {
      ...input,
      id: `grp-${Date.now().toString(36)}`,
      createdAt: Date.now(),
      lastActivatedAt: null
    };
    this.store.get().groups.push(group);
    this.store.save();
    this.log('info', `Created device scene "${group.name}" (${group.members.length} devices).`);
    this.emitEvent({ type: 'groups:updated', payload: this.store.get().groups });
    return group;
  }

  deleteGroup(groupId: string): void {
    const groups = this.store.get().groups;
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx === -1) throw new Error(`Group ${groupId} not found`);
    const [removed] = groups.splice(idx, 1);
    this.store.save();
    this.log('info', `Deleted device scene "${removed.name}".`);
    this.emitEvent({ type: 'groups:updated', payload: groups });
  }

  async activateGroup(groupId: string, exclusive = false): Promise<DeviceGroup> {
    const group = this.store.get().groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    const memberIds = group.members.map((m) => m.deviceId);
    if (exclusive) {
      const toDisconnect = this.devicesCache
        .filter((d) => d.connected && !memberIds.includes(d.id))
        .map((d) => d.id);
      if (toDisconnect.length > 0) {
        await this.disconnectMany(toDisconnect);
      }
    }

    this.log('info', `Launching scene "${group.name}" (${memberIds.length} simultaneous devices)...`);
    await this.connectMany(memberIds);

    for (const member of group.members) {
      const dev = this.devicesCache.find((d) => d.id === member.deviceId);
      if (!dev) continue;
      if (dev.audio.supportsAudio) {
        await this.updateDeviceAudio(dev.id, {
          volume: member.volume,
          routing: member.routing,
          manualOffsetMs: member.manualOffsetMs,
          codec: member.codec,
          eq: member.eq
        });
      }
    }

    group.lastActivatedAt = Date.now();
    this.store.save();
    await this.recomputeSync(true);
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
    return group;
  }

  // ---- Settings & Config Export/Import ----

  async updateSettings(patch: Partial<DaemonSettings>): Promise<DaemonSettings> {
    const current = this.store.get().settings;
    const driverChanged = patch.driverMode && patch.driverMode !== current.driverMode;
    const prevWatchdog = current.watchdogIntervalMs;

    if (patch.driverMode && ['auto', 'linux', 'windows', 'macos', 'virtual'].includes(patch.driverMode)) {
      current.driverMode = patch.driverMode;
    }
    if (typeof patch.lanRemoteEnabled === 'boolean') current.lanRemoteEnabled = patch.lanRemoteEnabled;
    if (typeof patch.autoReconnectOnStartup === 'boolean') current.autoReconnectOnStartup = patch.autoReconnectOnStartup;

    const stagger = finiteNumber(patch.staggerPagingMs);
    if (stagger !== undefined) current.staggerPagingMs = Math.max(40, Math.min(600, Math.round(stagger)));

    const watchdog = finiteNumber(patch.watchdogIntervalMs);
    if (watchdog !== undefined) current.watchdogIntervalMs = Math.max(1000, Math.min(30000, Math.round(watchdog)));

    this.store.save();

    if (current.watchdogIntervalMs !== prevWatchdog) {
      this.restartTelemetryTimer();
      this.log('info', `Updated telemetry & proximity watchdog cadence to ${(current.watchdogIntervalMs / 1000).toFixed(1)}s.`);
    }

    if (driverChanged && patch.driverMode) {
      await this.loadDriver(patch.driverMode);
    }
    this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
    return { ...current };
  }

  exportConfig(): PersistedState {
    return this.store.exportConfig();
  }

  async importConfig(config: Partial<PersistedState>): Promise<PolyBlueSnapshot> {
    const prevDriver = this.store.get().settings.driverMode;
    const prevWatchdog = this.store.get().settings.watchdogIntervalMs;

    this.store.importConfig(config);
    const nextSettings = this.store.get().settings;
    const savedSync = this.store.get().syncOptions;
    this.syncState = { ...this.syncState, ...savedSync };

    if (nextSettings.watchdogIntervalMs !== prevWatchdog) {
      this.restartTelemetryTimer();
    }
    if (nextSettings.driverMode !== prevDriver) {
      await this.loadDriver(nextSettings.driverMode);
    } else {
      this.applySavedDevicePrefs();
      await this.recomputeSync(true);
    }

    const snap = await this.getSnapshot();
    this.emitEvent({ type: 'snapshot', payload: snap });
    this.log('info', 'Imported PolyBlue configuration profile.');
    return snap;
  }

  async resetToDefaults(): Promise<PolyBlueSnapshot> {
    this.store.reset();
    const savedSync = this.store.get().syncOptions;
    this.syncState = {
      ...savedSync,
      masterTargetLatencyMs: 0,
      maxPhaseErrorMs: 0,
      syncLocked: true,
      calibratedAt: null
    };
    this.driftEstimators.clear();
    this.proximityCooldown.clear();
    this.restartTelemetryTimer();
    await this.loadDriver(this.store.get().settings.driverMode);

    const snap = await this.getSnapshot();
    this.emitEvent({ type: 'snapshot', payload: snap });
    this.log('info', 'Reset all PolyBlue settings, scenes, and calibrations to factory defaults.');
    return snap;
  }

  private upsertDevice(dev: BluetoothDevice): void {
    const idx = this.devicesCache.findIndex((d) => d.id === dev.id);
    if (idx === -1) {
      this.devicesCache.push(dev);
    } else {
      this.devicesCache[idx] = dev;
    }
  }

  private async tickTelemetry(): Promise<void> {
    if (this.telemetryBusy) return;
    this.telemetryBusy = true;

    try {
      // Snapshot in-flight connection phases so polling never resets progress bars mid-handshake
      const inFlight = new Map<string, { phase: BluetoothDevice['phase']; phaseProgress: number }>();
      for (const id of this.connectingIds) {
        const cached = this.devicesCache.find((d) => d.id === id);
        if (cached) {
          inFlight.set(id, { phase: cached.phase, phaseProgress: cached.phaseProgress });
        }
      }

      const updated = await this.driver.pollTelemetry();
      for (const dev of updated) {
        const pending = inFlight.get(dev.id);
        if (pending && !dev.connected) {
          dev.phase = pending.phase;
          dev.phaseProgress = pending.phaseProgress;
        }
      }

      this.devicesCache = updated;
      this.applySavedDevicePrefs();

      const now = Date.now();
      const autoConnectBatch: string[] = [];

      for (const dev of this.devicesCache) {
        if (dev.connected && dev.audio.supportsAudio) {
          let estimator = this.driftEstimators.get(dev.id);
          if (!estimator) {
            estimator = new KalmanDriftEstimator();
            this.driftEstimators.set(dev.id, estimator);
          }
          const syntheticOffset = dev.audio.phaseDeltaMs + dev.audio.clockDriftPpm * 0.002;
          const filtered = estimator.update(syntheticOffset, now);
          if (this.syncState.driftCorrection) {
            dev.audio.clockDriftPpm = Number((dev.audio.clockDriftPpm * 0.85 + filtered.skewPpm * 0.15).toFixed(2));
          }
        }

        // Bidirectional Proximity Watchdog
        if (dev.proximity.enabled && !this.connectingIds.has(dev.id)) {
          const lastAct = this.proximityCooldown.get(dev.id) ?? 0;
          if (dev.connected && dev.rssi <= dev.proximity.autoDisconnectRssi && now - lastAct > 15_000) {
            this.proximityCooldown.set(dev.id, now);
            this.log('warn', `${dev.name} signal dropped to ${dev.rssi} dBm; auto-pausing link.`);
            void this.disconnectMany([dev.id]);
          } else if (
            !dev.connected &&
            dev.paired &&
            dev.proximity.autoReconnect &&
            dev.rssi >= dev.proximity.autoConnectRssi &&
            now - lastAct > 30_000
          ) {
            this.proximityCooldown.set(dev.id, now);
            autoConnectBatch.push(dev.id);
          }
        }
      }

      if (autoConnectBatch.length > 0) {
        this.log('info', `Proximity watchdog detected ${autoConnectBatch.length} paired device(s) in range.`);
        void this.connectMany(autoConnectBatch);
      }

      await this.recomputeSync(false);
      this.emitEvent({ type: 'snapshot', payload: await this.getSnapshot() });
    } catch {
      // Keep telemetry loop resilient
    } finally {
      this.telemetryBusy = false;
    }
  }
}
