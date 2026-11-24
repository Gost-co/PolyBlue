import {
  AlertTriangle,
  BluetoothConnected,
  Layers,
  Play,
  Radar,
  Settings,
  Sliders,
  Terminal
} from 'lucide-react';
import type { PolyBlueSnapshot } from '@polyblue/shared';
import type { ActivityLogEntry } from '../hooks/usePolyBlue';

export type NavTab = 'devices' | 'sync' | 'radar' | 'groups' | 'diagnostics';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  snapshot: PolyBlueSnapshot;
  logs: ActivityLogEntry[];
  onActivateGroup: (id: string) => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; desc: string; icon: typeof BluetoothConnected }> = [
  { id: 'devices', label: 'Devices', desc: 'Multi-connect hub', icon: BluetoothConnected },
  { id: 'sync', label: 'Sync Studio', desc: 'Zero-drift audio', icon: Sliders },
  { id: 'radar', label: 'RF Radar', desc: 'Spatial & signal', icon: Radar },
  { id: 'groups', label: 'Scenes', desc: 'One-click presets', icon: Layers },
  { id: 'diagnostics', label: 'Settings', desc: 'Drivers, LAN & prefs', icon: Settings }
];

const ACCENT_DOT: Record<string, string> = {
  cyan: 'bg-cyan-400',
  emerald: 'bg-emerald-400',
  violet: 'bg-violet-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400'
};

export function Sidebar({ activeTab, onSelectTab, snapshot, logs, onActivateGroup }: SidebarProps) {
  const { adapter, groups } = snapshot;

  return (
    <aside className="w-full lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-[#222D42] bg-white/70 dark:bg-[#0B0F17]/60 flex flex-col justify-between">
      <div className="p-3 lg:p-4 space-y-5">
        {/* Primary Navigation */}
        <nav className="grid grid-cols-5 lg:grid-cols-1 gap-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col lg:flex-row items-center lg:items-center gap-1.5 lg:gap-3 px-2 lg:px-3 py-2 lg:py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#151C2B] hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-500 dark:text-cyan-400' : ''}`} />
                <div className="min-w-0 text-center lg:text-left">
                  <div className="text-[11px] lg:text-sm font-medium leading-tight">{item.label}</div>
                  <div className="hidden lg:block text-[11px] opacity-65 truncate">{item.desc}</div>
                </div>
                {item.id === 'devices' && (
                  <span className="hidden lg:inline-flex ml-auto px-1.5 py-0.5 rounded-md text-[11px] font-mono bg-slate-200/80 dark:bg-[#1C2538] text-slate-700 dark:text-slate-300">
                    {adapter.activeLinks}
                  </span>
                )}
                {item.id === 'sync' && (
                  <span
                    className={`hidden lg:inline-flex ml-auto w-2 h-2 rounded-full ${
                      snapshot.sync.syncLocked ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Scenes Launcher */}
        <div className="hidden lg:block space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quick Scenes
            </span>
            <button
              onClick={() => onSelectTab('groups')}
              className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Manage
            </button>
          </div>
          <div className="space-y-1.5">
            {groups.slice(0, 4).map((group) => (
              <button
                key={group.id}
                onClick={() => onActivateGroup(group.id)}
                className="w-full group flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-[#1E273B] bg-slate-50/70 dark:bg-[#101624] hover:border-cyan-500/40 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ACCENT_DOT[group.accent] ?? 'bg-cyan-400'}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {group.name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      {group.members.length} devices
                    </div>
                  </div>
                </div>
                <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Piconet RF Bandwidth Meter */}
        <div className="hidden lg:block p-3.5 rounded-xl border border-slate-200 dark:border-[#1F293D] bg-slate-50/80 dark:bg-[#101624] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">Piconet RF Load</span>
            <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
              {adapter.piconetLoadPct}% · {adapter.totalBitrateKbps} kbps
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-[#1C2538] overflow-hidden">
            <div
              style={{ width: `${adapter.piconetLoadPct}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                adapter.piconetLoadPct >= 85
                  ? 'bg-rose-500'
                  : adapter.piconetLoadPct >= 65
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
              }`}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>BT {adapter.bluetoothVersion}</span>
            <span>{adapter.leAudioSupported ? 'LE Audio Ready' : 'Classic A2DP'}</span>
          </div>
          {adapter.airtimeWarning && (
            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{adapter.airtimeWarning}</span>
            </div>
          )}
        </div>
      </div>

      {/* Live Event Ticker */}
      <div className="hidden lg:block p-4 pt-0">
        <div className="p-3 rounded-xl border border-slate-200 dark:border-[#1E273B] bg-slate-100/70 dark:bg-[#090D15] space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-cyan-500" />
            <span>ENGINE STREAM</span>
          </div>
          <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-[11px] font-mono text-slate-500">Ready for multi-link commands.</p>
            ) : (
              logs.slice(0, 6).map((entry) => (
                <div key={entry.id} className="text-[10.5px] font-mono leading-snug flex gap-1.5">
                  <span
                    className={
                      entry.level === 'sync'
                        ? 'text-emerald-500 shrink-0'
                        : entry.level === 'error'
                          ? 'text-rose-400 shrink-0'
                          : entry.level === 'warn'
                            ? 'text-amber-400 shrink-0'
                            : 'text-cyan-500 shrink-0'
                    }
                  >
                    ●
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 break-words">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
