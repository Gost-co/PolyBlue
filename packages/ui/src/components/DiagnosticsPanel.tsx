import { useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Globe,
  HardDrive,
  Lock,
  Moon,
  RotateCcw,
  Sliders,
  Sun,
  Terminal,
  Upload,
  XCircle
} from 'lucide-react';
import type { DaemonSettings, DriverMode, PolyBlueSnapshot, SyncConfig } from '@polyblue/shared';

interface DiagnosticsPanelProps {
  snapshot: PolyBlueSnapshot;
  darkMode: boolean;
  onToggleTheme: () => void;
  onUpdateSettings: (patch: Partial<DaemonSettings>) => void;
  onUpdateSync: (patch: Partial<SyncConfig>) => void;
  onExportConfig: () => Promise<Record<string, unknown>>;
  onImportConfig: (cfg: Record<string, unknown>) => Promise<unknown>;
  onResetConfig: () => Promise<unknown>;
}

const DRIVER_OPTIONS: Array<{ id: DriverMode; label: string; desc: string }> = [
  { id: 'auto', label: 'Auto-Detect OS', desc: 'Selects native OS Bluetooth driver or Virtual Radio fallback' },
  { id: 'linux', label: 'Linux BlueZ + PipeWire', desc: 'bluetoothctl / D-Bus + module-combine-sink latency offset' },
  { id: 'windows', label: 'Windows WinRT + WASAPI', desc: 'Windows.Devices.Bluetooth + WASAPI multi-endpoint bridge' },
  { id: 'macos', label: 'macOS CoreAudio', desc: 'CoreBluetooth / blueutil + Multi-Output Aggregate Device' },
  { id: 'virtual', label: 'Virtual Radio Lab', desc: 'Full multi-link BT 5.4 RF & Web Audio latency simulator' }
];

export function DiagnosticsPanel({
  snapshot,
  darkMode,
  onToggleTheme,
  onUpdateSettings,
  onUpdateSync,
  onExportConfig,
  onImportConfig,
  onResetConfig
}: DiagnosticsPanelProps) {
  const { diagnostics, adapter, settings, sync } = snapshot;
  const [configStatus, setConfigStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async () => {
    try {
      const cfg = await onExportConfig();
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `polyblue-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setConfigStatus({ tone: 'ok', text: 'Configuration profile exported.' });
    } catch {
      setConfigStatus({ tone: 'err', text: 'Could not export the PolyBlue configuration profile.' });
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      await onImportConfig(parsed);
      setConfigStatus({ tone: 'ok', text: `Imported configuration from ${file.name}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setConfigStatus({
        tone: 'err',
        text: message
          ? `Import failed: ${message}`
          : 'Invalid PolyBlue configuration JSON file.'
      });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyText = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl((cur) => (cur === url ? null : cur)), 1600);
    } catch {
      // Clipboard may be unavailable on non-HTTPS LAN origins
    }
  };

  return (
    <div className="space-y-5">
      {/* Row 1: Driver Backend + Radio Timing & OS Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Driver Switcher & Radio Timing */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-cyan-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Driver Backend & Multi-Link Radio Tuning
            </h2>
          </div>

          <div className="space-y-1.5">
            {DRIVER_OPTIONS.map((opt) => {
              const selected = settings.driverMode === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onUpdateSettings({ driverMode: opt.id })}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    selected
                      ? 'border-cyan-500/50 bg-cyan-500/12'
                      : 'border-slate-200 dark:border-[#1E2A42] bg-slate-50 dark:bg-[#111827] hover:border-slate-400'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{opt.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</div>
                  </div>
                  {selected && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500 text-slate-950 font-semibold shrink-0">
                      SELECTED
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[#1E283D] space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Parallel HCI Stagger Paging Interval
                </span>
                <span className="font-mono text-cyan-600 dark:text-cyan-400">{settings.staggerPagingMs} ms</span>
              </div>
              <input
                type="range"
                min={40}
                max={600}
                step={10}
                value={settings.staggerPagingMs}
                onChange={(e) => onUpdateSettings({ staggerPagingMs: Number(e.target.value) })}
                className="pb-slider w-full"
              />
              <p className="text-[11px] text-slate-500">
                Spaces concurrent Bluetooth page-scan bursts across simultaneous multi-device connections to avoid controller collisions.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Telemetry & Proximity Watchdog Cadence
                </span>
                <span className="font-mono text-cyan-600 dark:text-cyan-400">
                  {(settings.watchdogIntervalMs / 1000).toFixed(1)} s
                </span>
              </div>
              <input
                type="range"
                min={1000}
                max={30000}
                step={200}
                value={settings.watchdogIntervalMs}
                onChange={(e) => onUpdateSettings({ watchdogIntervalMs: Number(e.target.value) })}
                className="pb-slider w-full"
              />
              <p className="text-[11px] text-slate-500">
                Controls how often the daemon polls RSSI, battery, Kalman drift telemetry, and proximity auto-watchdog rules.
              </p>
            </div>
          </div>
        </div>

        {/* Startup, Sync & Appearance Preferences + OS Stack */}
        <div className="space-y-5">
          {/* General & Sync Preferences */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] space-y-3.5">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-cyan-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Startup, Sync & Appearance Settings
              </h2>
            </div>

            <SettingToggleRow
              title="Auto-Reconnect Last Devices on Startup"
              desc="Automatically restores previously connected paired Bluetooth devices when the PolyBlue daemon boots."
              checked={settings.autoReconnectOnStartup}
              onChange={(val) => onUpdateSettings({ autoReconnectOnStartup: val })}
            />

            <SettingToggleRow
              title="Auto-Align Audio on Device Connect"
              desc="Locks sync automatically whenever a new Bluetooth headphone or speaker joins the active session."
              checked={sync.autoAlign}
              onChange={(val) => onUpdateSync({ autoAlign: val })}
            />

            <SettingToggleRow
              title="Kalman Clock Drift Correction"
              desc="Continuously estimates and cancels quartz crystal skew (ppm) across long listening sessions."
              checked={sync.driftCorrection}
              onChange={(val) => onUpdateSync({ driftCorrection: val })}
            />

            <div className="pt-2 border-t border-slate-200 dark:border-[#1E283D] flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Studio Theme</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Saved automatically in browser storage
                </div>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-[#232F46] bg-slate-100 dark:bg-[#111929] p-0.5">
                <button
                  onClick={() => {
                    if (!darkMode) onToggleTheme();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    darkMode
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
                <button
                  onClick={() => {
                    if (darkMode) onToggleTheme();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    !darkMode
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
              </div>
            </div>
          </div>

          {/* Cross-Platform OS & Adapter Diagnostics */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Cross-Platform Bluetooth & Audio Stack
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#111929] border border-slate-200 dark:border-[#1E2A42]">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Host OS</div>
                <div className="mt-1 font-mono font-semibold text-slate-900 dark:text-white uppercase">
                  {diagnostics.platform}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">{diagnostics.osRelease}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#111929] border border-slate-200 dark:border-[#1E2A42]">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Active Driver</div>
                <div className="mt-1 font-mono font-semibold text-cyan-600 dark:text-cyan-400 uppercase">
                  {adapter.driver}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">{adapter.audioBackend}</div>
              </div>
            </div>

            {/* Native CLI Tooling Probe */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Native OS Tooling Detected
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(diagnostics.detectedTools).map(([tool, present]) => (
                  <span
                    key={tool}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border ${
                      present
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-[#121929] border-slate-200 dark:border-[#212D44] text-slate-500'
                    }`}
                  >
                    {present ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 opacity-50" />
                    )}
                    <span>{tool}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              {diagnostics.driverNotes.map((note, idx) => (
                <p
                  key={idx}
                  className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#101725] border border-slate-200/80 dark:border-[#1D283E] rounded-xl p-3 leading-relaxed"
                >
                  {note}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: LAN Remote + Config Backup/Reset + CLI Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                LAN Companion Remote & Config Backup
              </h3>
            </div>
          </div>

          <SettingToggleRow
            title="Enable Wi-Fi LAN Companion Remote"
            desc="Allow phones, tablets, and laptops on your local network to control PolyBlue. Disable for strict localhost-only mode."
            checked={settings.lanRemoteEnabled}
            onChange={(val) => onUpdateSettings({ lanRemoteEnabled: val })}
          />

          {settings.lanRemoteEnabled ? (
            <div className="space-y-1.5">
              {(diagnostics.lanAddresses.length > 0 ? diagnostics.lanAddresses : ['localhost']).map((ip) => {
                const url = `http://${ip}:${diagnostics.port}`;
                const copied = copiedUrl === url;
                return (
                  <div
                    key={ip}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#111929] border border-slate-200 dark:border-[#212E47]"
                  >
                    <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 truncate">{url}</span>
                    <button
                      onClick={() => void copyText(url)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-[#19243A] border border-slate-200 dark:border-[#273652] text-slate-600 dark:text-slate-300 hover:text-cyan-400 cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Localhost-only security mode active — external LAN connections are blocked.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-[#1E283D]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleExport()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/25 text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Profile</span>
              </button>

              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImport(file);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#232F46] bg-slate-50 dark:bg-[#111929] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 text-xs font-medium cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Profile</span>
              </button>
            </div>

            {confirmReset ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setConfirmReset(false);
                    void onResetConfig().catch(() =>
                      setConfigStatus({ tone: 'err', text: 'Could not reset PolyBlue to factory defaults.' })
                    );
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold cursor-pointer"
                >
                  <span>Confirm Reset</span>
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            )}
          </div>
          {configStatus && (
            <p className={`text-xs font-mono ${configStatus.tone === 'ok' ? 'text-emerald-500' : 'text-rose-400'}`}>
              {configStatus.text}
            </p>
          )}
        </div>

        {/* CLI Quick Reference */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] space-y-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Cross-Platform CLI Automation
            </h3>
          </div>
          <pre className="p-3.5 rounded-xl bg-slate-950 text-cyan-300 font-mono text-[11.5px] leading-relaxed overflow-x-auto border border-slate-800">
{`# Inspect adapter, piconet load, and phase lock
npm run cli -- status

# Connect 3 Bluetooth devices simultaneously in parallel
npm run cli -- connect 7C:96:D2:4A:1B:88 40:98:AD:9E:33:12 58:FC:C6:81:F0:2A

# Auto-align all active audio sinks to 0.0 ms phase delta
npm run cli -- sync align

# Launch a saved multi-device stereo scene
npm run cli -- group run grp-party-stereo --exclusive`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function SettingToggleRow({
  title,
  desc,
  checked,
  onChange
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 p-3 rounded-xl border border-slate-200/80 dark:border-[#1D283E] bg-slate-50/70 dark:bg-[#101725] cursor-pointer hover:border-cyan-500/35 transition-colors">
      <div className="space-y-0.5">
        <div className="text-xs font-semibold text-slate-900 dark:text-white">{title}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
          checked ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
