import { useMemo, useState } from 'react';
import {
  Battery,
  Check,
  CheckSquare,
  Clock,
  Link2,
  Layers,
  Search,
  Settings2,
  Sparkles,
  Star,
  Unlink,
  Volume2,
  VolumeX,
  Zap
} from 'lucide-react';
import { getCodecSpec, type BluetoothDevice, type PolyBlueSnapshot } from '@polyblue/shared';
import { DeviceIcon, SignalBars } from './DeviceIcon';
import type { DevicePatch } from '../hooks/usePolyBlue';

type FilterTab = 'all' | 'connected' | 'audio' | 'peripherals' | 'favorites';

interface DeviceGridProps {
  snapshot: PolyBlueSnapshot;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onConnectMany: (ids: string[]) => void;
  onDisconnectMany: (ids: string[]) => void;
  onUpdateDevice: (id: string, patch: DevicePatch) => void;
  onInspectDevice: (device: BluetoothDevice) => void;
  onAutoAlign: () => void;
  onSaveSelectionAsGroup: (ids: string[]) => void;
  onOpenSyncStudio: () => void;
}

const PHASE_LABEL: Record<BluetoothDevice['phase'], string> = {
  disconnected: 'Ready',
  queued: 'Queued in HCI burst...',
  paging: 'Paging radio...',
  authenticating: 'Exchanging link keys...',
  negotiating: 'Negotiating codec...',
  syncing: 'Locking sync clock...',
  connected: 'Connected',
  disconnecting: 'Disconnecting...',
  error: 'Connection error'
};

export function DeviceGrid({
  snapshot,
  selectedIds,
  onToggleSelect,
  onSelectIds,
  onConnectMany,
  onDisconnectMany,
  onUpdateDevice,
  onInspectDevice,
  onAutoAlign,
  onSaveSelectionAsGroup,
  onOpenSyncStudio
}: DeviceGridProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [query, setQuery] = useState('');

  const { devices, adapter, sync } = snapshot;

  const filteredDevices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices
      .filter((d) => {
        if (filter === 'connected' && !d.connected) return false;
        if (filter === 'audio' && !d.audio.supportsAudio) return false;
        if (filter === 'peripherals' && d.audio.supportsAudio) return false;
        if (filter === 'favorites' && !d.favorite) return false;
        if (q) {
          const hay = `${d.name} ${d.alias ?? ''} ${d.vendor} ${d.address} ${d.audio.codec}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        const nameA = (a.alias || a.name).toLowerCase();
        const nameB = (b.alias || b.name).toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return a.id.localeCompare(b.id);
      });
  }, [devices, filter, query]);

  const connectedAudioCount = devices.filter((d) => d.connected && d.audio.supportsAudio).length;
  const disconnectedFavorites = devices.filter((d) => d.favorite && !d.connected);
  const selectedSet = new Set(selectedIds);
  const audioIds = devices.filter((d) => d.audio.supportsAudio).map((d) => d.id);
  const allAudioSelected = audioIds.length > 0 && audioIds.every((id) => selectedSet.has(id));
  const selectedDisconnected = selectedIds.filter((id) => !devices.find((d) => d.id === id)?.connected);
  const selectedConnected = selectedIds.filter((id) => devices.find((d) => d.id === id)?.connected);

  return (
    <div className="space-y-5 pb-24">
      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0E1420]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Simultaneous Links</span>
            <Link2 className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {adapter.activeLinks}
            </span>
            <span className="text-xs font-mono text-slate-500">/ {adapter.maxSimultaneousLinks} max</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {connectedAudioCount} audio · {adapter.activeLinks - connectedAudioCount} HID / BLE
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0E1420]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Audio Phase Delta</span>
            <Clock className={`w-4 h-4 ${sync.syncLocked ? 'text-emerald-500' : 'text-amber-500'}`} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                sync.syncLocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
              }`}
            >
              {sync.maxPhaseErrorMs.toFixed(1)} ms
            </span>
            <span className="text-[11px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              {sync.syncLocked ? 'Locked' : 'Drift'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Master clock target: <span className="font-mono">{sync.masterTargetLatencyMs.toFixed(0)} ms</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0E1420]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Piconet Throughput</span>
            <Zap className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {adapter.totalBitrateKbps}
            </span>
            <span className="text-xs font-mono text-slate-500">kbps</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Airtime utilization: <span className="font-mono">{adapter.piconetLoadPct}%</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-white to-blue-500/5 dark:from-cyan-500/12 dark:via-[#0E1420] dark:to-blue-600/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-cyan-700 dark:text-cyan-300 font-medium">
            <span>Zero-Drift Sync Engine</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={onAutoAlign}
              className="flex-1 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
            >
              Auto-Align
            </button>
            <button
              onClick={onOpenSyncStudio}
              className="px-3 py-1.5 rounded-lg border border-cyan-500/35 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/15 text-xs font-medium transition-colors cursor-pointer"
            >
              Studio
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Multi-Select Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', `All (${devices.length})`],
              ['connected', `Connected (${adapter.activeLinks})`],
              ['audio', `Audio (${devices.filter((d) => d.audio.supportsAudio).length})`],
              ['peripherals', `HID & BLE (${devices.filter((d) => !d.audio.supportsAudio).length})`],
              ['favorites', `Favorites (${devices.filter((d) => d.favorite).length})`]
            ] as Array<[FilterTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filter === id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-sm'
                  : 'bg-white dark:bg-[#101624] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#222D42] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search device, MAC, codec..."
              className="pl-8 pr-3 py-1.5 w-52 sm:w-60 rounded-lg text-xs bg-white dark:bg-[#101624] border border-slate-200 dark:border-[#222D42] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            onClick={() => {
              onSelectIds(allAudioSelected ? [] : audioIds);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-[#222D42] bg-white dark:bg-[#101624] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-cyan-500" />
            <span>{allAudioSelected ? 'Clear Audio Selection' : 'Select All Audio'}</span>
          </button>

          <button
            disabled={disconnectedFavorites.length === 0 || !adapter.powered}
            onClick={() => {
              if (disconnectedFavorites.length > 0) {
                onConnectMany(disconnectedFavorites.map((d) => d.id));
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/25 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {disconnectedFavorites.length > 0
                ? `Connect Favorites (${disconnectedFavorites.length})`
                : 'Favorites Linked'}
            </span>
          </button>
        </div>
      </div>

      {/* Multi-Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filteredDevices.map((dev) => {
          const isSelected = selectedSet.has(dev.id);
          const isConnecting =
            dev.phase === 'queued' ||
            dev.phase === 'paging' ||
            dev.phase === 'authenticating' ||
            dev.phase === 'negotiating' ||
            dev.phase === 'syncing';
          const codecSpec = dev.audio.supportsAudio ? getCodecSpec(dev.audio.codec) : null;

          return (
            <div
              key={dev.id}
              className={`group relative rounded-2xl border p-4 transition-all flex flex-col justify-between gap-3.5 ${
                dev.connected
                  ? 'border-cyan-500/45 bg-white dark:bg-[#101827] shadow-lg shadow-cyan-500/5'
                  : isSelected
                    ? 'border-blue-500/60 bg-blue-500/5 dark:bg-[#121B2E]'
                    : 'border-slate-200 dark:border-[#1E273B] bg-white dark:bg-[#0D121D] hover:border-slate-300 dark:hover:border-[#2E3B57]'
              }`}
            >
              {/* Top Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Multi-select checkbox */}
                  <button
                    onClick={() => onToggleSelect(dev.id)}
                    aria-label={`Select ${dev.name} for multi-connect`}
                    className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500 border-cyan-500 text-slate-950'
                        : 'border-slate-300 dark:border-slate-600 hover:border-cyan-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      dev.connected
                        ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-500 dark:text-cyan-400'
                        : 'bg-slate-100 dark:bg-[#161E2E] border-slate-200 dark:border-[#253149] text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <DeviceIcon category={dev.category} className="w-5 h-5" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {dev.alias || dev.name}
                      </h3>
                      {dev.connected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {dev.vendor} · <span className="font-mono">{dev.address}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onUpdateDevice(dev.id, { favorite: !dev.favorite })}
                    title={dev.favorite ? 'Remove favorite' : 'Mark as favorite'}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-[#182133] transition-colors cursor-pointer"
                  >
                    <Star className={`w-3.5 h-3.5 ${dev.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                  <button
                    onClick={() => onInspectDevice(dev)}
                    title="Inspect GATT, codec, EQ & proximity rules"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-[#182133] transition-colors cursor-pointer"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Telemetry Badges */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#161F30] text-slate-700 dark:text-slate-300">
                  <SignalBars rssi={dev.rssi} />
                  <span>{dev.rssi} dBm</span>
                  <span className="opacity-50">({dev.estimatedDistanceM}m)</span>
                </span>

                {dev.batteryLevel !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
                      dev.batteryLevel <= 20
                        ? 'bg-rose-500/15 text-rose-500'
                        : 'bg-slate-100 dark:bg-[#161F30] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Battery className="w-3 h-3" />
                    <span>{dev.batteryLevel}%</span>
                  </span>
                )}

                {dev.audio.supportsAudio ? (
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/12 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                    {codecSpec?.id} · {dev.audio.intrinsicLatencyMs}ms
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-violet-500/12 text-violet-700 dark:text-violet-300 border border-violet-500/20 uppercase">
                    {dev.transport}
                  </span>
                )}

                {dev.connected && dev.audio.supportsAudio && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                    +{dev.audio.appliedDelayMs.toFixed(0)}ms sync · {dev.audio.routing.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Connection Handshake Pipeline Bar */}
              {isConnecting && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                    <span>{PHASE_LABEL[dev.phase]}</span>
                    <span>{dev.phaseProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-[#1A2438] overflow-hidden">
                    <div
                      style={{ width: `${dev.phaseProgress}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-200"
                    />
                  </div>
                </div>
              )}

              {/* Inline Volume Control for Connected Audio Devices */}
              {dev.connected && dev.audio.supportsAudio && (
                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    onClick={() => onUpdateDevice(dev.id, { muted: !dev.audio.muted })}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      dev.audio.muted
                        ? 'bg-rose-500/15 text-rose-500'
                        : 'bg-slate-100 dark:bg-[#161F30] text-slate-600 dark:text-slate-300 hover:text-cyan-400'
                    }`}
                  >
                    {dev.audio.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={dev.audio.volume}
                    onChange={(e) => onUpdateDevice(dev.id, { volume: Number(e.target.value), muted: false })}
                    className="pb-slider flex-1"
                  />
                  <span className="w-9 text-right text-xs font-mono text-slate-600 dark:text-slate-300">
                    {dev.audio.volume}%
                  </span>
                </div>
              )}

              {/* Bottom Action Footer */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#1B2437]">
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {dev.connected
                    ? dev.audio.supportsAudio
                      ? `Δ ${dev.audio.phaseDeltaMs.toFixed(1)}ms · ${dev.bitrateKbps} kbps`
                      : `Link ${dev.linkQuality}% · Jitter ${dev.jitterMs}ms`
                    : dev.paired
                      ? 'Paired · Ready'
                      : 'Discovered nearby'}
                </span>

                <button
                  disabled={!adapter.powered || isConnecting}
                  onClick={() => (dev.connected ? onDisconnectMany([dev.id]) : onConnectMany([dev.id]))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-45 ${
                    dev.connected
                      ? 'bg-slate-100 dark:bg-[#1A2438] text-slate-700 dark:text-slate-200 hover:bg-rose-500/15 hover:text-rose-500'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-sm shadow-cyan-500/20'
                  }`}
                >
                  {dev.connected ? (
                    <>
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{isConnecting ? 'Linking...' : 'Connect'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Multi-Connect Action Dock */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[95vw]">
          <div className="pb-pop-in flex flex-wrap items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-cyan-500/40 bg-slate-900/95 dark:bg-[#0D1524]/95 text-white shadow-2xl shadow-cyan-950/50 backdrop-blur-xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold px-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center font-mono text-[11px] font-bold">
                {selectedIds.length}
              </span>
              <span>Selected</span>
            </span>

            {selectedDisconnected.length > 0 && (
              <button
                onClick={() => {
                  onConnectMany(selectedDisconnected);
                  onSelectIds([]);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Connect {selectedDisconnected.length} Simultaneously</span>
              </button>
            )}

            {selectedConnected.length > 0 && (
              <button
                onClick={() => {
                  onDisconnectMany(selectedConnected);
                  onSelectIds([]);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/35 text-xs font-medium transition-colors cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Disconnect ({selectedConnected.length})</span>
              </button>
            )}

            <button
              onClick={() => onSaveSelectionAsGroup(selectedIds)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 text-xs font-medium transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Save as Scene</span>
            </button>

            <button
              onClick={() => onSelectIds([])}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
