import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  Globe,
  HardDrive,
  Terminal,
  Upload,
  XCircle
} from 'lucide-react';
import type { DriverMode, PolyBlueSnapshot } from '@polyblue/shared';

interface DiagnosticsPanelProps {
  snapshot: PolyBlueSnapshot;
  onUpdateSettings: (patch: Record<string, unknown>) => void;
  onExportConfig: () => Promise<Record<string, unknown>>;
  onImportConfig: (cfg: Record<string, unknown>) => Promise<unknown>;
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
  onUpdateSettings,
  onExportConfig,
  onImportConfig
}: DiagnosticsPanelProps) {
  const { diagnostics, adapter, settings } = snapshot;
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async () => {
    const cfg = await onExportConfig();
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polyblue-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      await onImportConfig(parsed);
      setImportStatus(`Imported configuration from ${file.name}`);
    } catch {
      setImportStatus('Invalid PolyBlue configuration JSON file.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Cross-Platform OS & Adapter Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  {present ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 opacity-50" />}
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

        {/* Driver Switcher & HCI Paging Tuning */}
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

          <div className="pt-2 border-t border-slate-200 dark:border-[#1E283D] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Parallel HCI Stagger Paging Interval
              </span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400">{settings.staggerPagingMs} ms</span>
            </div>
            <input
              type="range"
              min={40}
              max={400}
              step={10}
              value={settings.staggerPagingMs}
              onChange={(e) => onUpdateSettings({ staggerPagingMs: Number(e.target.value) })}
              className="pb-slider w-full"
            />
            <p className="text-[11px] text-slate-500">
              Staggers concurrent Bluetooth page-scan bursts across simultaneous multi-device connections to avoid controller collisions.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Row: LAN Remote + Config Portability + CLI Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              LAN Companion Remote & Config Backup
            </h3>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Control multi-speaker volumes, scenes, and latency sync from any phone, tablet, or laptop on your Wi-Fi network:
          </p>

          <div className="space-y-1.5">
            {diagnostics.lanAddresses.length > 0 ? (
              diagnostics.lanAddresses.map((ip) => (
                <div
                  key={ip}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#111929] border border-slate-200 dark:border-[#212E47] font-mono text-xs text-cyan-600 dark:text-cyan-400"
                >
                  http://{ip}:{diagnostics.port}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#111929] font-mono text-xs text-slate-500">
                http://localhost:{diagnostics.port}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-[#1E283D]">
            <button
              onClick={() => void handleExport()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/25 text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Profile JSON</span>
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
              <span>Import Profile JSON</span>
            </button>
          </div>
          {importStatus && <p className="text-xs font-mono text-emerald-500">{importStatus}</p>}
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
