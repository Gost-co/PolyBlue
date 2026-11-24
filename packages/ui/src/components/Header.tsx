import {
  Activity,
  Bluetooth,
  Command,
  Lock,
  Moon,
  Power,
  Radar,
  RefreshCw,
  Sun,
  Unlock,
  Wifi
} from 'lucide-react';
import type { PolyBlueSnapshot } from '@polyblue/shared';

interface HeaderProps {
  snapshot: PolyBlueSnapshot;
  wsConnected: boolean;
  darkMode: boolean;
  onToggleTheme: () => void;
  onTogglePower: () => void;
  onToggleScan: () => void;
  onAutoAlign: () => void;
  onWebBluetooth: () => void;
  webBtSupported: boolean;
  webBtPairing: boolean;
  onOpenCommandPalette: () => void;
}

export function Header({
  snapshot,
  wsConnected,
  darkMode,
  onToggleTheme,
  onTogglePower,
  onToggleScan,
  onAutoAlign,
  onWebBluetooth,
  webBtSupported,
  webBtPairing,
  onOpenCommandPalette
}: HeaderProps) {
  const { adapter, sync } = snapshot;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-[#222D42] bg-white/85 dark:bg-[#0B0F17]/90 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6 h-16">
        {/* Brand & Adapter Status */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30">
            <Bluetooth className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0B0F17] ${
                adapter.powered && wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
                PolyBlue
              </h1>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25">
                {adapter.driver === 'virtual' ? 'Virtual Radio Lab' : `${adapter.driver} Native`}
              </span>
              <span
                className={`inline-flex xl:hidden items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  sync.syncLocked
                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/12 border-amber-500/30 text-amber-600 dark:text-amber-300'
                }`}
              >
                Δ {sync.maxPhaseErrorMs.toFixed(1)}ms
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate max-w-[300px]">
              {adapter.audioBackend}
            </p>
          </div>
        </div>

        {/* Center Live Sync Telemetry Pill */}
        <div className="hidden xl:flex items-center gap-2">
          <button
            onClick={onAutoAlign}
            title="Click to re-lock phase across all active Bluetooth audio links"
            className={`group flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-xs font-mono transition-all cursor-pointer ${
              sync.syncLocked
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            {sync.syncLocked ? (
              <Lock className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            )}
            <span className="font-semibold">
              {sync.syncLocked ? 'SYNC LOCKED' : 'SYNC BYPASSED'}
            </span>
            <span className="opacity-40">|</span>
            <span>TARGET {sync.masterTargetLatencyMs.toFixed(0)}ms</span>
            <span className="opacity-40">|</span>
            <span className={sync.maxPhaseErrorMs <= 1 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-500 font-semibold'}>
              Δ {sync.maxPhaseErrorMs.toFixed(1)}ms
            </span>
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-[#222D42] bg-slate-100/70 dark:bg-[#121826] text-xs font-mono text-slate-700 dark:text-slate-300">
            <Activity className="w-3.5 h-3.5 text-cyan-500" />
            <span>
              {adapter.activeLinks}/{adapter.maxSimultaneousLinks} LINKS
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#222D42] bg-slate-100/80 dark:bg-[#121826] text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Command className="w-3.5 h-3.5" />
            <span>Quick Actions</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700">
              ⌘K
            </kbd>
          </button>

          {webBtSupported && (
            <button
              onClick={onWebBluetooth}
              disabled={webBtPairing}
              title="Pair a real physical BLE device directly from this browser via Web Bluetooth"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Wifi className={`w-3.5 h-3.5 ${webBtPairing ? 'animate-pulse' : ''}`} />
              <span>{webBtPairing ? 'Pairing...' : 'Web BLE'}</span>
            </button>
          )}

          <button
            onClick={onToggleScan}
            disabled={!adapter.powered}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 ${
              adapter.discovering
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25'
                : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/25'
            }`}
          >
            {adapter.discovering ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Radar className="w-3.5 h-3.5" />
            )}
            <span>{adapter.discovering ? 'Scanning...' : 'Scan'}</span>
          </button>

          <button
            onClick={onTogglePower}
            title={adapter.powered ? 'Power off Bluetooth radio' : 'Power on Bluetooth radio'}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              adapter.powered
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
            }`}
          >
            <Power className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleTheme}
            title="Toggle dark/light studio theme"
            className="p-2 rounded-lg border border-slate-200 dark:border-[#222D42] bg-slate-100/70 dark:bg-[#121826] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
