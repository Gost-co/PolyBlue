import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeSyncPlan,
  EQ_PRESETS,
  getCodecSpec,
  type AudioCodecId,
  type BluetoothDevice,
  type ChannelRouting,
  type DaemonSettings,
  type DeviceGroup,
  type EqualizerBands,
  type PolyBlueSnapshot,
  type ProximityRule,
  type ServerEvent,
  type SyncConfig
} from '@polyblue/shared';

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'sync';
  message: string;
}

export interface ToastNotice {
  id: number;
  tone: 'success' | 'info' | 'error';
  message: string;
}

export type DevicePatch = {
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
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      // Ignore parse error
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function applyOptimisticDevicePatch(prev: PolyBlueSnapshot, id: string, patch: DevicePatch): PolyBlueSnapshot {
  const nextDevices = prev.devices.map((dev) => {
    if (dev.id !== id) return dev;
    const nextAudio = { ...dev.audio };
    const nextProximity = { ...dev.proximity };
    let nextAlias = dev.alias;
    let nextFavorite = dev.favorite;

    if (typeof patch.favorite === 'boolean') nextFavorite = patch.favorite;
    if (patch.alias !== undefined) {
      const trimmed = typeof patch.alias === 'string' ? patch.alias.trim() : '';
      nextAlias = trimmed || undefined;
    }
    if (patch.proximity) {
      Object.assign(nextProximity, patch.proximity);
    }
    if (typeof patch.volume === 'number' && Number.isFinite(patch.volume)) {
      nextAudio.volume = Math.max(0, Math.min(100, Math.round(patch.volume)));
    }
    if (typeof patch.muted === 'boolean') nextAudio.muted = patch.muted;
    if (typeof patch.solo === 'boolean') nextAudio.solo = patch.solo;
    if (patch.routing) nextAudio.routing = patch.routing;
    if (typeof patch.manualOffsetMs === 'number' && Number.isFinite(patch.manualOffsetMs)) {
      nextAudio.manualOffsetMs = Math.max(-250, Math.min(250, Math.round(patch.manualOffsetMs)));
    }
    if (patch.codec) {
      const spec = getCodecSpec(patch.codec);
      nextAudio.codec = patch.codec;
      nextAudio.intrinsicLatencyMs = spec.baseLatencyMs;
    }
    if (patch.eq) {
      if (patch.eq.preset && patch.eq.preset !== 'custom' && patch.eq.preset in EQ_PRESETS) {
        const p = EQ_PRESETS[patch.eq.preset];
        nextAudio.eq = { preset: patch.eq.preset, bassDb: p.bassDb, midDb: p.midDb, trebleDb: p.trebleDb };
      } else {
        nextAudio.eq = {
          preset: 'custom',
          bassDb: patch.eq.bassDb ?? nextAudio.eq.bassDb,
          midDb: patch.eq.midDb ?? nextAudio.eq.midDb,
          trebleDb: patch.eq.trebleDb ?? nextAudio.eq.trebleDb
        };
      }
    }

    return {
      ...dev,
      alias: nextAlias,
      favorite: nextFavorite,
      audio: nextAudio,
      proximity: nextProximity
    };
  });

  if (patch.codec !== undefined || patch.manualOffsetMs !== undefined || patch.routing !== undefined) {
    const plan = computeSyncPlan(nextDevices, {
      enabled: prev.sync.enabled,
      safetyBufferMs: prev.sync.safetyBufferMs
    });
    const syncedDevices = nextDevices.map((d) => {
      const sol = plan.solutions[d.id];
      if (!sol) return d;
      return {
        ...d,
        audio: {
          ...d.audio,
          appliedDelayMs: sol.appliedDelayMs,
          effectiveLatencyMs: sol.effectiveLatencyMs,
          phaseDeltaMs: sol.phaseDeltaMs
        }
      };
    });
    return {
      ...prev,
      devices: syncedDevices,
      sync: {
        ...prev.sync,
        masterTargetLatencyMs: plan.masterTargetLatencyMs,
        maxPhaseErrorMs: plan.maxPhaseErrorMs,
        syncLocked: plan.syncLocked
      }
    };
  }

  return { ...prev, devices: nextDevices };
}

function applyOptimisticSyncPatch(prev: PolyBlueSnapshot, patch: Partial<SyncConfig>): PolyBlueSnapshot {
  const prevMaster = prev.sync.masterVolume;
  const nextSync: SyncConfig = { ...prev.sync, ...patch };
  let nextDevices = prev.devices;

  if (typeof patch.masterVolume === 'number' && Number.isFinite(patch.masterVolume)) {
    const clamped = Math.max(0, Math.min(100, Math.round(patch.masterVolume)));
    nextSync.masterVolume = clamped;
    if (nextSync.linkedVolume && clamped !== prevMaster) {
      const delta = clamped - prevMaster;
      nextDevices = prev.devices.map((d) => {
        if (!d.connected || !d.audio.supportsAudio) return d;
        return {
          ...d,
          audio: {
            ...d.audio,
            volume: Math.max(0, Math.min(100, Math.round(d.audio.volume + delta)))
          }
        };
      });
    }
  }

  if (patch.enabled !== undefined || patch.safetyBufferMs !== undefined) {
    const plan = computeSyncPlan(nextDevices, {
      enabled: nextSync.enabled,
      safetyBufferMs: nextSync.safetyBufferMs
    });
    nextSync.masterTargetLatencyMs = plan.masterTargetLatencyMs;
    nextSync.maxPhaseErrorMs = plan.maxPhaseErrorMs;
    nextSync.syncLocked = plan.syncLocked;
    nextDevices = nextDevices.map((d) => {
      const sol = plan.solutions[d.id];
      if (!sol) return d;
      return {
        ...d,
        audio: {
          ...d.audio,
          appliedDelayMs: sol.appliedDelayMs,
          effectiveLatencyMs: sol.effectiveLatencyMs,
          phaseDeltaMs: sol.phaseDeltaMs
        }
      };
    });
  }

  return { ...prev, devices: nextDevices, sync: nextSync };
}

interface PendingChannel<T> {
  patch: T;
  timer: number | null;
  inFlight: boolean;
}

export function usePolyBlue() {
  const [snapshot, setSnapshot] = useState<PolyBlueSnapshot | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);

  const reconnectTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Coalesced optimistic patch queues so dragging sliders stays silky 60fps with zero rubber-banding
  const deviceQueues = useRef<Map<string, PendingChannel<DevicePatch>>>(new Map());
  const syncQueue = useRef<PendingChannel<Partial<SyncConfig>> | null>(null);
  const settingsQueue = useRef<PendingChannel<Partial<DaemonSettings>> | null>(null);
  const guardUntil = useRef<Map<string, number>>(new Map());

  const showToast = useCallback((message: string, tone: ToastNotice['tone'] = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), tone, message });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const pushLog = useCallback((level: ActivityLogEntry['level'], message: string, timestamp = Date.now()) => {
    setLogs((prev) => [
      { id: `${timestamp}-${Math.random().toString(36).slice(2, 7)}`, timestamp, level, message },
      ...prev.slice(0, 49)
    ]);
  }, []);

  const isGuarded = (key: string) => (guardUntil.current.get(key) ?? 0) > Date.now();
  const markGuarded = (key: string, ms = 320) => {
    guardUntil.current.set(key, Date.now() + ms);
  };

  const fetchState = useCallback(async () => {
    try {
      const data = await apiJson<PolyBlueSnapshot>('/api/state');
      setSnapshot(data);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to reach PolyBlue daemon');
    }
  }, []);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let backoffMs = 900;

    void fetchState();

    const connectWs = () => {
      if (!active) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (!active) return;
        backoffMs = 900;
        setWsConnected(true);
        setErrorBanner(null);
      };

      socket.onmessage = (evt) => {
        if (!active) return;
        try {
          const event = JSON.parse(evt.data as string) as ServerEvent;
          switch (event.type) {
            case 'snapshot':
              setSnapshot((prev) => {
                if (!prev) return event.payload;
                const incoming = event.payload;
                const syncGuarded = isGuarded('sync');
                const settingsGuarded = isGuarded('settings');
                const mergedDevices = incoming.devices.map((incDev) => {
                  const devKey = `dev:${incDev.id}`;
                  if (!isGuarded(devKey) && !syncGuarded) return incDev;
                  const local = prev.devices.find((d) => d.id === incDev.id);
                  if (!local) return incDev;
                  // Keep live telemetry fresh while preserving actively dragged audio/proximity sliders
                  return {
                    ...incDev,
                    alias: isGuarded(devKey) ? local.alias : incDev.alias,
                    favorite: isGuarded(devKey) ? local.favorite : incDev.favorite,
                    proximity: isGuarded(devKey) ? local.proximity : incDev.proximity,
                    audio: local.audio
                  };
                });
                return {
                  ...incoming,
                  devices: mergedDevices,
                  sync: syncGuarded ? prev.sync : incoming.sync,
                  settings: settingsGuarded ? prev.settings : incoming.settings
                };
              });
              break;
            case 'device:updated':
              setSnapshot((prev) => {
                if (!prev) return prev;
                const devKey = `dev:${event.payload.id}`;
                if (isGuarded(devKey) || isGuarded('sync')) {
                  // Only refresh live RF/connection telemetry while user is dragging sliders
                  const exists = prev.devices.some((d) => d.id === event.payload.id);
                  if (!exists) return { ...prev, devices: [...prev.devices, event.payload] };
                  return {
                    ...prev,
                    devices: prev.devices.map((d) =>
                      d.id === event.payload.id
                        ? {
                            ...event.payload,
                            alias: isGuarded(devKey) ? d.alias : event.payload.alias,
                            favorite: isGuarded(devKey) ? d.favorite : event.payload.favorite,
                            proximity: isGuarded(devKey) ? d.proximity : event.payload.proximity,
                            audio: d.audio
                          }
                        : d
                    )
                  };
                }
                const exists = prev.devices.some((d) => d.id === event.payload.id);
                const devices = exists
                  ? prev.devices.map((d) => (d.id === event.payload.id ? event.payload : d))
                  : [...prev.devices, event.payload];
                return { ...prev, devices };
              });
              break;
            case 'device:removed':
              setSnapshot((prev) =>
                prev ? { ...prev, devices: prev.devices.filter((d) => d.id !== event.payload.id) } : prev
              );
              break;
            case 'sync:updated':
              setSnapshot((prev) => {
                if (!prev || isGuarded('sync')) return prev;
                return { ...prev, sync: event.payload };
              });
              break;
            case 'adapter:updated':
              setSnapshot((prev) => (prev ? { ...prev, adapter: event.payload } : prev));
              break;
            case 'groups:updated':
              setSnapshot((prev) => (prev ? { ...prev, groups: event.payload } : prev));
              break;
            case 'log':
              pushLog(event.payload.level, event.payload.message, event.payload.timestamp);
              break;
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (!active) return;
        setWsConnected(false);
        const delay = backoffMs;
        backoffMs = Math.min(4000, Math.round(backoffMs * 1.6));
        reconnectTimer.current = window.setTimeout(connectWs, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    const onVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && (!socket || socket.readyState === WebSocket.CLOSED)) {
        if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
        backoffMs = 900;
        connectWs();
      }
    };

    window.addEventListener('online', onVisibilityOrOnline);
    document.addEventListener('visibilitychange', onVisibilityOrOnline);

    connectWs();

    return () => {
      active = false;
      window.removeEventListener('online', onVisibilityOrOnline);
      document.removeEventListener('visibilitychange', onVisibilityOrOnline);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      for (const ch of deviceQueues.current.values()) {
        if (ch.timer) window.clearTimeout(ch.timer);
      }
      if (syncQueue.current?.timer) window.clearTimeout(syncQueue.current.timer);
      if (settingsQueue.current?.timer) window.clearTimeout(settingsQueue.current.timer);
      socket?.close();
    };
  }, [fetchState, pushLog]);

  const runAction = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      setBusyAction(label);
      setErrorBanner(null);
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorBanner(msg);
        pushLog('error', msg);
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [pushLog]
  );

  const setAdapterPower = useCallback(
    (powered: boolean) =>
      runAction('power', () => apiJson('/api/adapter/power', { method: 'POST', body: JSON.stringify({ powered }) })),
    [runAction]
  );

  const startScan = useCallback(
    (durationMs = 8000) =>
      runAction('scan', () => apiJson('/api/scan/start', { method: 'POST', body: JSON.stringify({ durationMs }) })),
    [runAction]
  );

  const stopScan = useCallback(
    () => runAction('scan', () => apiJson('/api/scan/stop', { method: 'POST' })),
    [runAction]
  );

  const connectMany = useCallback(
    (deviceIds: string[]) =>
      runAction('connect', () =>
        apiJson('/api/devices/connect-multi', { method: 'POST', body: JSON.stringify({ deviceIds }) })
      ),
    [runAction]
  );

  const disconnectMany = useCallback(
    (deviceIds: string[]) =>
      runAction('disconnect', () =>
        apiJson('/api/devices/disconnect-multi', { method: 'POST', body: JSON.stringify({ deviceIds }) })
      ),
    [runAction]
  );

  const pairDevice = useCallback(
    (id: string) =>
      runAction('pair', () => apiJson(`/api/devices/${encodeURIComponent(id)}/pair`, { method: 'POST' })),
    [runAction]
  );

  const removeDevice = useCallback(
    (id: string) =>
      runAction('remove', async () => {
        const res = await apiJson(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('Device forgotten', 'info');
        return res;
      }),
    [runAction, showToast]
  );

  // Optimistic + trailing-coalesced device update for buttery 60fps sliders
  const flushDeviceQueue = useCallback((id: string) => {
    const ch = deviceQueues.current.get(id);
    if (!ch || ch.inFlight) return;
    const payload = ch.patch;
    if (Object.keys(payload).length === 0) {
      deviceQueues.current.delete(id);
      return;
    }
    ch.patch = {};
    ch.inFlight = true;
    markGuarded(`dev:${id}`, 340);

    void apiJson<BluetoothDevice>(`/api/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
      .catch((err) => {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        ch.inFlight = false;
        if (Object.keys(ch.patch).length > 0) {
          flushDeviceQueue(id);
        } else {
          deviceQueues.current.delete(id);
          markGuarded(`dev:${id}`, 160);
        }
      });
  }, []);

  const updateDevice = useCallback(
    (id: string, patch: DevicePatch) => {
      markGuarded(`dev:${id}`, 360);
      setSnapshot((prev) => (prev ? applyOptimisticDevicePatch(prev, id, patch) : prev));

      let ch = deviceQueues.current.get(id);
      if (!ch) {
        ch = { patch: {}, timer: null, inFlight: false };
        deviceQueues.current.set(id, ch);
      }
      ch.patch = {
        ...ch.patch,
        ...patch,
        ...(patch.eq ? { eq: { ...(ch.patch.eq ?? {}), ...patch.eq } } : {}),
        ...(patch.proximity ? { proximity: { ...(ch.patch.proximity ?? {}), ...patch.proximity } } : {})
      };

      // Flush discrete clicks immediately; coalesce high-frequency slider drags at ~60ms
      const isSliderDrag =
        patch.volume !== undefined ||
        patch.manualOffsetMs !== undefined ||
        (patch.eq !== undefined && patch.eq.preset === 'custom') ||
        (patch.proximity !== undefined &&
          (patch.proximity.autoConnectRssi !== undefined || patch.proximity.autoDisconnectRssi !== undefined));

      if (!isSliderDrag) {
        if (ch.timer) {
          window.clearTimeout(ch.timer);
          ch.timer = null;
        }
        flushDeviceQueue(id);
      } else if (!ch.timer) {
        ch.timer = window.setTimeout(() => {
          if (ch) ch.timer = null;
          flushDeviceQueue(id);
        }, 55);
      }
    },
    [flushDeviceQueue]
  );

  const flushSyncQueue = useCallback(() => {
    const ch = syncQueue.current;
    if (!ch || ch.inFlight) return;
    const payload = ch.patch;
    if (Object.keys(payload).length === 0) {
      syncQueue.current = null;
      return;
    }
    ch.patch = {};
    ch.inFlight = true;
    markGuarded('sync', 360);

    void apiJson<SyncConfig>('/api/sync', { method: 'PATCH', body: JSON.stringify(payload) })
      .catch((err) => {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        ch.inFlight = false;
        if (Object.keys(ch.patch).length > 0) {
          flushSyncQueue();
        } else {
          syncQueue.current = null;
          markGuarded('sync', 160);
        }
      });
  }, []);

  const updateSync = useCallback(
    (patch: Partial<SyncConfig>) => {
      markGuarded('sync', 380);
      setSnapshot((prev) => (prev ? applyOptimisticSyncPatch(prev, patch) : prev));

      if (!syncQueue.current) {
        syncQueue.current = { patch: {}, timer: null, inFlight: false };
      }
      const ch = syncQueue.current;
      ch.patch = { ...ch.patch, ...patch };

      const isSliderDrag = patch.masterVolume !== undefined || patch.safetyBufferMs !== undefined;
      if (!isSliderDrag) {
        if (ch.timer) {
          window.clearTimeout(ch.timer);
          ch.timer = null;
        }
        flushSyncQueue();
      } else if (!ch.timer) {
        ch.timer = window.setTimeout(() => {
          if (syncQueue.current) syncQueue.current.timer = null;
          flushSyncQueue();
        }, 55);
      }
    },
    [flushSyncQueue]
  );

  const autoAlignAll = useCallback(
    () =>
      runAction('align', async () => {
        const res = await apiJson<SyncConfig>('/api/sync/auto-align', { method: 'POST' });
        showToast(`Phase locked at ${res.masterTargetLatencyMs.toFixed(0)}ms (Δ ${res.maxPhaseErrorMs.toFixed(1)}ms)`);
        return res;
      }),
    [runAction, showToast]
  );

  const createGroup = useCallback(
    (payload: Omit<DeviceGroup, 'id' | 'createdAt' | 'lastActivatedAt'>) =>
      runAction('group', async () => {
        const res = await apiJson<DeviceGroup>('/api/groups', { method: 'POST', body: JSON.stringify(payload) });
        showToast(`Scene "${res.name}" saved`);
        return res;
      }),
    [runAction, showToast]
  );

  const activateGroup = useCallback(
    (id: string, exclusive = false) =>
      runAction('group', async () => {
        const res = await apiJson<DeviceGroup>(`/api/groups/${encodeURIComponent(id)}/activate`, {
          method: 'POST',
          body: JSON.stringify({ exclusive })
        });
        showToast(`Launched scene "${res.name}"`);
        return res;
      }),
    [runAction, showToast]
  );

  const deleteGroup = useCallback(
    (id: string) =>
      runAction('group', async () => {
        const res = await apiJson(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('Scene deleted', 'info');
        return res;
      }),
    [runAction, showToast]
  );

  const flushSettingsQueue = useCallback(() => {
    const ch = settingsQueue.current;
    if (!ch || ch.inFlight) return;
    const payload = ch.patch;
    if (Object.keys(payload).length === 0) {
      settingsQueue.current = null;
      return;
    }
    ch.patch = {};
    ch.inFlight = true;
    markGuarded('settings', 360);

    void apiJson<DaemonSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(payload) })
      .catch((err) => {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        ch.inFlight = false;
        if (Object.keys(ch.patch).length > 0) {
          flushSettingsQueue();
        } else {
          settingsQueue.current = null;
          markGuarded('settings', 160);
        }
      });
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<DaemonSettings>) => {
      markGuarded('settings', 380);
      setSnapshot((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev));

      if (!settingsQueue.current) {
        settingsQueue.current = { patch: {}, timer: null, inFlight: false };
      }
      const ch = settingsQueue.current;
      ch.patch = { ...ch.patch, ...patch };

      const isSliderDrag = patch.staggerPagingMs !== undefined || patch.watchdogIntervalMs !== undefined;
      if (!isSliderDrag) {
        if (ch.timer) {
          window.clearTimeout(ch.timer);
          ch.timer = null;
        }
        flushSettingsQueue();
      } else if (!ch.timer) {
        ch.timer = window.setTimeout(() => {
          if (settingsQueue.current) settingsQueue.current.timer = null;
          flushSettingsQueue();
        }, 65);
      }
    },
    [flushSettingsQueue]
  );

  const registerExternalDevice = useCallback(
    (device: Partial<BluetoothDevice> & { id: string; name: string }) =>
      runAction('webbt', async () => {
        const res = await apiJson<BluetoothDevice>('/api/devices/external', {
          method: 'POST',
          body: JSON.stringify(device)
        });
        showToast(`Linked ${res.name} via Web Bluetooth`);
        return res;
      }),
    [runAction, showToast]
  );

  const exportConfig = useCallback(() => apiJson<Record<string, unknown>>('/api/config/export'), []);

  const importConfig = useCallback(
    (cfg: Record<string, unknown>) =>
      runAction('import', async () => {
        const res = await apiJson<PolyBlueSnapshot>('/api/config/import', {
          method: 'POST',
          body: JSON.stringify(cfg)
        });
        showToast('Profile imported successfully');
        return res;
      }),
    [runAction, showToast]
  );

  const resetConfig = useCallback(
    () =>
      runAction('reset', async () => {
        const res = await apiJson<PolyBlueSnapshot>('/api/config/reset', { method: 'POST' });
        setSnapshot(res);
        showToast('All settings restored to defaults', 'info');
        return res;
      }),
    [runAction, showToast]
  );

  return {
    snapshot,
    wsConnected,
    busyAction,
    errorBanner,
    clearError: () => setErrorBanner(null),
    toast,
    showToast,
    clearToast: () => setToast(null),
    logs,
    pushLog,
    setAdapterPower,
    startScan,
    stopScan,
    connectMany,
    disconnectMany,
    pairDevice,
    removeDevice,
    updateDevice,
    updateSync,
    autoAlignAll,
    createGroup,
    activateGroup,
    deleteGroup,
    updateSettings,
    registerExternalDevice,
    exportConfig,
    importConfig,
    resetConfig
  };
}
