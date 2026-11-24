import { useEffect, useState } from 'react';
import {
  Battery,
  Check,
  Cpu,
  Link2,
  Radio,
  ShieldCheck,
  Sliders,
  Trash2,
  Unlink,
  X
} from 'lucide-react';
import { getCodecSpec, type AudioCodecId, type BluetoothDevice } from '@polyblue/shared';
import { DeviceIcon, SignalBars } from './DeviceIcon';
import type { DevicePatch } from '../hooks/usePolyBlue';

interface InspectorDrawerProps {
  device: BluetoothDevice | null;
  onClose: () => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: DevicePatch) => void;
}

export function InspectorDrawer({
  device,
  onClose,
  onConnect,
  onDisconnect,
  onRemove,
  onUpdate
}: InspectorDrawerProps) {
  const [aliasInput, setAliasInput] = useState(device?.alias ?? device?.name ?? '');
  const [aliasSaved, setAliasSaved] = useState(false);

  useEffect(() => {
    setAliasInput(device?.alias ?? device?.name ?? '');
    setAliasSaved(false);
  }, [device?.id, device?.alias, device?.name]);

  useEffect(() => {
    if (!device) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [device, onClose]);

  if (!device) return null;

  const commitAlias = () => {
    const cleaned = aliasInput.trim();
    const nextAlias = cleaned && cleaned !== device.name ? cleaned : null;
    onUpdate(device.id, { alias: nextAlias });
    setAliasSaved(true);
    window.setTimeout(() => setAliasSaved(false), 1400);
  };

  return (
    <div
      onClick={onClose}
      className="pb-backdrop-in fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pb-slide-in-right w-full max-w-lg bg-white dark:bg-[#0C111C] border-l border-slate-200 dark:border-[#222D42] h-full overflow-y-auto flex flex-col justify-between shadow-2xl"
      >
        <div className="p-5 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-500">
                <DeviceIcon category={device.category} className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {device.alias || device.name}
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {device.vendor} · {device.address}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#172033] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Telemetry Strip */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121A2A] border border-slate-200 dark:border-[#1E2A42]">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Signal</div>
              <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                <SignalBars rssi={device.rssi} />
                <span>{device.rssi} dBm</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">~{device.estimatedDistanceM}m</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121A2A] border border-slate-200 dark:border-[#1E2A42]">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Battery</div>
              <div className="mt-1 flex items-center justify-center gap-1 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                <Battery className="w-3.5 h-3.5 text-emerald-500" />
                <span>{device.batteryLevel !== null ? `${device.batteryLevel}%` : 'N/A'}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">BT {device.bluetoothVersion}</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121A2A] border border-slate-200 dark:border-[#1E2A42]">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Link Quality</div>
              <div className="mt-1 font-mono text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                {device.connected ? `${device.linkQuality}%` : 'Standby'}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                Loss {device.packetLossPct}%
              </div>
            </div>
          </div>

          {/* Custom Alias */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Custom Display Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitAlias();
                  }
                }}
                placeholder={device.name}
                className="flex-1 px-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-[#111929] border border-slate-200 dark:border-[#232F46] text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={commitAlias}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold cursor-pointer transition-colors"
              >
                {aliasSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </div>

          {/* Audio Codec Switcher */}
          {device.audio.supportsAudio && device.audio.supportedCodecs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Sliders className="w-3.5 h-3.5 text-cyan-500" />
                <span>Audio Codec & Latency Profile</span>
              </div>
              <div className="space-y-1.5">
                {device.audio.supportedCodecs.map((codecId: AudioCodecId) => {
                  const spec = getCodecSpec(codecId);
                  const active = device.audio.codec === codecId;
                  return (
                    <button
                      key={codecId}
                      onClick={() => onUpdate(device.id, { codec: codecId })}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        active
                          ? 'border-cyan-500/50 bg-cyan-500/12'
                          : 'border-slate-200 dark:border-[#1E2A42] bg-slate-50 dark:bg-[#111827] hover:border-slate-400'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{spec.label}</span>
                          {active && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{spec.description}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] shrink-0">
                        <div className="text-cyan-600 dark:text-cyan-400 font-semibold">{spec.baseLatencyMs}ms</div>
                        <div className="text-slate-500">{spec.bitrateKbps} kbps</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Proximity Auto-Connect / Auto-Pause Rules */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#1F2B42] bg-slate-50/70 dark:bg-[#101726] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Radio className="w-3.5 h-3.5 text-cyan-500" />
                <span>Proximity Auto-Watchdog</span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={device.proximity.enabled}
                  onChange={(e) => onUpdate(device.id, { proximity: { enabled: e.target.checked } })}
                  className="accent-cyan-500"
                />
                <span className="text-slate-600 dark:text-slate-300">Enabled</span>
              </label>
            </div>

            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
              <span>Auto-Connect When Back in Range</span>
              <input
                type="checkbox"
                disabled={!device.proximity.enabled}
                checked={device.proximity.autoReconnect}
                onChange={(e) => onUpdate(device.id, { proximity: { autoReconnect: e.target.checked } })}
                className="accent-cyan-500 disabled:opacity-40"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="flex justify-between font-mono text-slate-500 mb-1">
                  <span>Auto-Connect</span>
                  <span className="text-emerald-500">{device.proximity.autoConnectRssi} dBm</span>
                </div>
                <input
                  type="range"
                  min={-80}
                  max={-40}
                  value={device.proximity.autoConnectRssi}
                  onChange={(e) => {
                    const nextConnect = Number(e.target.value);
                    const patch: Record<string, number> = { autoConnectRssi: nextConnect };
                    if (device.proximity.autoDisconnectRssi > nextConnect - 5) {
                      patch.autoDisconnectRssi = Math.max(-98, nextConnect - 5);
                    }
                    onUpdate(device.id, { proximity: patch });
                  }}
                  className="pb-slider w-full"
                />
              </div>
              <div>
                <div className="flex justify-between font-mono text-slate-500 mb-1">
                  <span>Out-of-Range Drop</span>
                  <span className="text-rose-400">{device.proximity.autoDisconnectRssi} dBm</span>
                </div>
                <input
                  type="range"
                  min={-98}
                  max={Math.min(-65, device.proximity.autoConnectRssi - 5)}
                  value={Math.min(device.proximity.autoDisconnectRssi, device.proximity.autoConnectRssi - 5)}
                  onChange={(e) => onUpdate(device.id, { proximity: { autoDisconnectRssi: Number(e.target.value) } })}
                  className="pb-slider w-full"
                />
              </div>
            </div>
          </div>

          {/* BLE GATT Services & Characteristics Inspector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                <span>BLE GATT Services & Characteristics</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">{device.gattServices.length} services</span>
            </div>

            {device.gattServices.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-[#243049] text-xs text-slate-500 text-center">
                No GATT services exposed by this Classic Bluetooth device.
              </div>
            ) : (
              <div className="space-y-2">
                {device.gattServices.map((svc) => (
                  <div
                    key={svc.uuid}
                    className="p-3 rounded-xl border border-slate-200 dark:border-[#1E2A42] bg-slate-50 dark:bg-[#101726] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{svc.name}</span>
                      <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">{svc.uuid}</span>
                    </div>
                    {svc.characteristics.map((ch) => (
                      <div
                        key={ch.uuid}
                        className="p-2 rounded-lg bg-white dark:bg-[#0A0F1A] border border-slate-200/80 dark:border-[#1B253A] text-[11px] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{ch.name}</span>
                          <span className="font-mono text-slate-500">{ch.uuid}</span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10.5px]">
                          <span className="text-emerald-600 dark:text-emerald-400">{ch.valueDecoded}</span>
                          <span className="text-slate-400">0x{ch.valueHex}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-[#222D42] bg-slate-50 dark:bg-[#090D16] flex items-center justify-between gap-2">
          <button
            onClick={() => {
              onRemove(device.id);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Forget Device</span>
          </button>

          <div className="flex items-center gap-2">
            {device.paired && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-500 px-2">
                <ShieldCheck className="w-3.5 h-3.5" /> Trusted
              </span>
            )}
            <button
              onClick={() => (device.connected ? onDisconnect(device.id) : onConnect(device.id))}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                device.connected
                  ? 'bg-slate-200 dark:bg-[#1B263C] text-slate-800 dark:text-slate-200 hover:bg-rose-500/20 hover:text-rose-400'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              }`}
            >
              {device.connected ? <Unlink className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{device.connected ? 'Disconnect' : 'Connect Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
