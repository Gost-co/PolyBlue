import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Link2, Moon, Radar, Search, Settings, Sparkles, Unlink } from 'lucide-react';
import type { PolyBlueSnapshot } from '@polyblue/shared';
import type { NavTab } from './Sidebar';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  snapshot: PolyBlueSnapshot;
  onSelectTab: (tab: NavTab) => void;
  onToggleTheme: () => void;
  onScan: () => void;
  onAutoAlign: () => void;
  onConnectMany: (ids: string[]) => void;
  onDisconnectMany: (ids: string[]) => void;
  onActivateGroup: (id: string) => void;
}

interface ActionItem {
  id: string;
  label: string;
  hint: string;
  category: string;
  run: () => void;
  icon: typeof Sparkles;
}

export function CommandPalette({
  open,
  onClose,
  snapshot,
  onSelectTab,
  onToggleTheme,
  onScan,
  onAutoAlign,
  onConnectMany,
  onDisconnectMany,
  onActivateGroup
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const actions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [
      {
        id: 'scan',
        label: 'Scan for Nearby Bluetooth Devices',
        hint: 'Classic + BLE + LE Audio',
        category: 'Radio',
        run: onScan,
        icon: Radar
      },
      {
        id: 'align',
        label: 'Auto-Align All Active Audio Outputs (0.0 ms)',
        hint: 'Re-lock master clock',
        category: 'Sync',
        run: onAutoAlign,
        icon: Sparkles
      },
      {
        id: 'connect-all-audio',
        label: 'Connect All Audio Devices Simultaneously',
        hint: `${snapshot.devices.filter((d) => d.audio.supportsAudio && !d.connected).length} ready`,
        category: 'Multi-Link',
        run: () => {
          const ids = snapshot.devices.filter((d) => d.audio.supportsAudio && !d.connected).map((d) => d.id);
          if (ids.length) onConnectMany(ids);
        },
        icon: Link2
      },
      {
        id: 'go-sync',
        label: 'Open Zero-Drift Sync Studio',
        hint: 'Oscilloscope, EQ & L/R split',
        category: 'Navigate',
        run: () => onSelectTab('sync'),
        icon: Sparkles
      },
      {
        id: 'go-radar',
        label: 'Open Spatial RF Proximity Radar',
        hint: 'Live RSSI topology',
        category: 'Navigate',
        run: () => onSelectTab('radar'),
        icon: Radar
      },
      {
        id: 'go-groups',
        label: 'Open Multi-Device Scenes',
        hint: 'One-click presets',
        category: 'Navigate',
        run: () => onSelectTab('groups'),
        icon: Layers
      },
      {
        id: 'go-settings',
        label: 'Open Settings & System Diagnostics',
        hint: 'Drivers, watchdog, LAN & backup',
        category: 'Settings',
        run: () => onSelectTab('diagnostics'),
        icon: Settings
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Dark / Light Studio Theme',
        hint: 'Appearance preference',
        category: 'Settings',
        run: onToggleTheme,
        icon: Moon
      }
    ];

    for (const group of snapshot.groups) {
      items.push({
        id: `grp-${group.id}`,
        label: `Launch Scene: ${group.name}`,
        hint: `${group.members.length} devices`,
        category: 'Scenes',
        run: () => onActivateGroup(group.id),
        icon: Layers
      });
    }

    for (const dev of snapshot.devices) {
      items.push({
        id: `dev-${dev.id}`,
        label: `${dev.connected ? 'Disconnect' : 'Connect'} ${dev.alias || dev.name}`,
        hint: dev.address,
        category: 'Devices',
        run: () => (dev.connected ? onDisconnectMany([dev.id]) : onConnectMany([dev.id])),
        icon: dev.connected ? Unlink : Link2
      });
    }

    return items;
  }, [snapshot, onScan, onAutoAlign, onConnectMany, onDisconnectMany, onSelectTab, onToggleTheme, onActivateGroup]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 10);
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.hint.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [open, onClose]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="pb-backdrop-in fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-slate-950/70 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pb-pop-in w-full max-w-xl rounded-2xl border border-slate-200 dark:border-[#26344F] bg-white dark:bg-[#0D1320] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-[#1E2A42]">
          <Search className="w-4 h-4 text-cyan-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (filtered.length > 0) setActiveIndex((i) => (i + 1) % filtered.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (filtered.length > 0) setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
              } else if (e.key === 'Enter' && filtered[activeIndex]) {
                e.preventDefault();
                filtered[activeIndex].run();
                onClose();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Connect devices, launch scenes, align sync..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-[#172135] text-slate-500">
            ↑↓ · ↵ · ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.map((item, idx) => {
            const Icon = item.icon;
            const active = idx === activeIndex;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                  active ? 'bg-cyan-500/15 text-slate-900 dark:text-white' : 'hover:bg-cyan-500/10'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-slate-500">{item.hint}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-[#172135] text-slate-500">
                    {item.category}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-500">No matching PolyBlue command.</div>
          )}
        </div>
      </div>
    </div>
  );
}
