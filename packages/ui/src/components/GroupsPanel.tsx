import { useEffect, useState } from 'react';
import { Check, Layers, Play, Plus, Trash2, Zap } from 'lucide-react';
import type { ChannelRouting, DeviceGroup, PolyBlueSnapshot } from '@polyblue/shared';
import { DeviceIcon } from './DeviceIcon';

interface GroupsPanelProps {
  snapshot: PolyBlueSnapshot;
  initialDraftIds?: string[];
  onClearDraft?: () => void;
  onActivateGroup: (id: string, exclusive: boolean) => void;
  onCreateGroup: (payload: Omit<DeviceGroup, 'id' | 'createdAt' | 'lastActivatedAt'>) => void;
  onDeleteGroup: (id: string) => void;
}

const ACCENT_RING: Record<DeviceGroup['accent'], string> = {
  cyan: 'border-cyan-500/35 bg-cyan-500/10 text-cyan-500',
  emerald: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-500',
  violet: 'border-violet-500/35 bg-violet-500/10 text-violet-500',
  amber: 'border-amber-500/35 bg-amber-500/10 text-amber-500',
  rose: 'border-rose-500/35 bg-rose-500/10 text-rose-500'
};

export function GroupsPanel({
  snapshot,
  initialDraftIds,
  onClearDraft,
  onActivateGroup,
  onCreateGroup,
  onDeleteGroup
}: GroupsPanelProps) {
  const { groups, devices } = snapshot;
  const [exclusiveMode, setExclusiveMode] = useState(true);
  const [showCreator, setShowCreator] = useState(Boolean(initialDraftIds && initialDraftIds.length > 0));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accent, setAccent] = useState<DeviceGroup['accent']>('cyan');
  const [chosenIds, setChosenIds] = useState<string[]>(
    initialDraftIds && initialDraftIds.length > 0
      ? initialDraftIds
      : devices.filter((d) => d.connected).map((d) => d.id)
  );
  const [routingDraft, setRoutingDraft] = useState<Record<string, ChannelRouting>>({});

  useEffect(() => {
    if (initialDraftIds && initialDraftIds.length > 0) {
      setChosenIds(initialDraftIds);
      setShowCreator(true);
    }
  }, [initialDraftIds]);

  const toggleChosen = (id: string) => {
    setChosenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || chosenIds.length === 0) return;

    const members = chosenIds.map((id) => {
      const dev = devices.find((d) => d.id === id);
      return {
        deviceId: id,
        volume: dev?.audio.volume ?? 80,
        routing: routingDraft[id] ?? dev?.audio.routing ?? 'stereo',
        manualOffsetMs: dev?.audio.manualOffsetMs ?? 0,
        codec: dev?.audio.supportsAudio ? dev.audio.codec : undefined,
        eq: dev?.audio.supportsAudio ? dev.audio.eq : undefined
      };
    });

    onCreateGroup({
      name: name.trim(),
      description: description.trim() || `Parallel multi-device scene (${members.length} Bluetooth devices)`,
      accent,
      members
    });

    setName('');
    setDescription('');
    setRoutingDraft({});
    setShowCreator(false);
    onClearDraft?.();
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-500" />
            Multi-Device Scenes & Profiles
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Launch entire Bluetooth combinations simultaneously with saved L/R stereo routing, EQ, volumes, and sync offsets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#232F46] bg-white dark:bg-[#101624] text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={exclusiveMode}
              onChange={(e) => setExclusiveMode(e.target.checked)}
              className="accent-cyan-500"
            />
            <span>Disconnect other devices on launch</span>
          </label>

          <button
            onClick={() => {
              setChosenIds(devices.filter((d) => d.connected).map((d) => d.id));
              setShowCreator((s) => !s);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Scene</span>
          </button>
        </div>
      </div>

      {/* Create Scene Form */}
      {showCreator && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-2xl border border-cyan-500/35 bg-white dark:bg-[#0F1727] space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Scene Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Living Room Stereo Pair"
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-[#0A0F1A] border border-slate-200 dark:border-[#232F46] text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Synced speakers + headphones..."
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-[#0A0F1A] border border-slate-200 dark:border-[#232F46] text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Accent Color
              </label>
              <div className="flex items-center gap-2 pt-1.5">
                {(['cyan', 'emerald', 'violet', 'amber', 'rose'] as const).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAccent(color)}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                      accent === color ? 'scale-115 border-white ring-2 ring-cyan-500' : 'border-transparent opacity-70'
                    } ${
                      color === 'cyan'
                        ? 'bg-cyan-400'
                        : color === 'emerald'
                          ? 'bg-emerald-400'
                          : color === 'violet'
                            ? 'bg-violet-400'
                            : color === 'amber'
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Select Devices & Optional L/R Channel Routing ({chosenIds.length} chosen)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {devices.map((dev) => {
                const picked = chosenIds.includes(dev.id);
                return (
                  <div
                    key={dev.id}
                    onClick={() => toggleChosen(dev.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      picked
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-slate-200 dark:border-[#202B40] bg-slate-50 dark:bg-[#0A0F1A]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          picked ? 'bg-cyan-500 border-cyan-500 text-slate-950' : 'border-slate-400'
                        }`}
                      >
                        {picked && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                        {dev.alias || dev.name}
                      </span>
                    </div>

                    {picked && dev.audio.supportsAudio && (
                      <select
                        value={routingDraft[dev.id] ?? dev.audio.routing}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setRoutingDraft((prev) => ({ ...prev, [dev.id]: e.target.value as ChannelRouting }))
                        }
                        className="text-[11px] font-mono rounded-md px-1.5 py-0.5 bg-white dark:bg-[#11192A] border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200"
                      >
                        <option value="stereo">Stereo</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="mono">Mono</option>
                        <option value="subwoofer">Sub</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setRoutingDraft({});
                setShowCreator(false);
                onClearDraft?.();
              }}
              className="px-3.5 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || chosenIds.length === 0}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs disabled:opacity-40 cursor-pointer"
            >
              Save Scene
            </button>
          </div>
        </form>
      )}

      {/* Scene Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className="rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] p-5 flex flex-col justify-between gap-4 hover:border-cyan-500/40 transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${ACCENT_RING[group.accent]}`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{group.name}</h3>
                    <div className="text-[11px] font-mono text-slate-500">{group.members.length} devices in parallel</div>
                  </div>
                </div>

                <button
                  onClick={() => onDeleteGroup(group.id)}
                  title="Delete scene"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{group.description}</p>

              <div className="space-y-1.5">
                {group.members.map((m) => {
                  const dev = devices.find((d) => d.id === m.deviceId);
                  return (
                    <div
                      key={m.deviceId}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#121A2B] border border-slate-200/70 dark:border-[#1E2A42] text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <DeviceIcon category={dev?.category ?? 'unknown'} className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                        <span className="text-slate-800 dark:text-slate-200 truncate">
                          {dev?.alias || dev?.name || m.deviceId}
                        </span>
                      </div>
                      <span className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {dev?.audio.supportsAudio ? `${m.routing.toUpperCase()} · ${m.volume}%` : 'BLE / HID'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => onActivateGroup(group.id, exclusiveMode)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-sm shadow-cyan-500/20 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Scene Simultaneously</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
