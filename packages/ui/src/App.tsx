import { useEffect, useState } from 'react';
import { AlertCircle, Bluetooth, CheckCircle2, Info, X } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { DeviceGrid } from './components/DeviceGrid';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { GroupsPanel } from './components/GroupsPanel';
import { Header } from './components/Header';
import { InspectorDrawer } from './components/InspectorDrawer';
import { RadarView } from './components/RadarView';
import { Sidebar, type NavTab } from './components/Sidebar';
import { SyncStudio } from './components/SyncStudio';
import { usePolyBlue } from './hooks/usePolyBlue';
import { useWebBluetooth } from './hooks/useWebBluetooth';

function readStoredTheme(): boolean {
  try {
    const saved = window.localStorage.getItem('polyblue:theme');
    if (saved === 'light') return false;
    if (saved === 'dark') return true;
  } catch {
    // Ignore storage restriction
  }
  return false;
}

export function App() {
  const pb = usePolyBlue();
  const webBt = useWebBluetooth(pb.registerExternalDevice);

  const [activeTab, setActiveTab] = useState<NavTab>('devices');
  const [darkMode, setDarkMode] = useState<boolean>(readStoredTheme);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspectedDeviceId, setInspectedDeviceId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [groupDraftIds, setGroupDraftIds] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem('polyblue:theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage restriction
    }
  }, [darkMode]);

  // Prune stale selectedIds if a device is forgotten/removed
  useEffect(() => {
    if (!pb.snapshot || selectedIds.length === 0) return;
    const validIds = new Set(pb.snapshot.devices.map((d) => d.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [pb.snapshot, selectedIds.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!pb.snapshot) {
    return (
      <div className="min-h-screen bg-[#080B11] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center mx-auto">
            <Bluetooth className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
          <h1 className="text-base font-semibold">Connecting to PolyBlue Engine...</h1>
          <p className="text-xs text-slate-400">
            Initializing Bluetooth controller telemetry and zero-drift audio clock sync.
          </p>
          {pb.errorBanner && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-300">
              {pb.errorBanner}
            </div>
          )}
        </div>
      </div>
    );
  }

  const snapshot = pb.snapshot;
  const inspectedDevice = inspectedDeviceId
    ? snapshot.devices.find((d) => d.id === inspectedDeviceId) ?? null
    : null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#080B11] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header
        snapshot={snapshot}
        wsConnected={pb.wsConnected}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onTogglePower={() => void pb.setAdapterPower(!snapshot.adapter.powered)}
        onToggleScan={() => void (snapshot.adapter.discovering ? pb.stopScan() : pb.startScan(8000))}
        onAutoAlign={() => void pb.autoAlignAll()}
        onWebBluetooth={() => void webBt.requestRealBleDevice()}
        webBtSupported={webBt.supported}
        webBtPairing={webBt.pairing}
        onOpenCommandPalette={() => setPaletteOpen(true)}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          snapshot={snapshot}
          logs={pb.logs}
          onActivateGroup={(id) => void pb.activateGroup(id, true)}
        />

        <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto">
          {/* Status / Error Banners */}
          {pb.errorBanner && (
            <div className="pb-fade-up mb-4 px-4 py-3 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pb.errorBanner}</span>
              </div>
              <button
                onClick={pb.clearError}
                aria-label="Dismiss error"
                className="p-1 hover:opacity-75 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {webBt.statusMessage && (
            <div className="pb-fade-up mb-4 px-4 py-3 rounded-xl border border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{webBt.statusMessage}</span>
              </div>
              <button
                onClick={webBt.clearStatus}
                aria-label="Dismiss status"
                className="p-1 hover:opacity-75 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div key={activeTab} className="pb-fade-up">
            {activeTab === 'devices' && (
              <DeviceGrid
                snapshot={snapshot}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectIds={setSelectedIds}
                onConnectMany={(ids) => void pb.connectMany(ids)}
                onDisconnectMany={(ids) => void pb.disconnectMany(ids)}
                onUpdateDevice={(id, patch) => pb.updateDevice(id, patch)}
                onInspectDevice={(dev) => setInspectedDeviceId(dev.id)}
                onAutoAlign={() => void pb.autoAlignAll()}
                onSaveSelectionAsGroup={(ids) => {
                  setGroupDraftIds(ids);
                  setSelectedIds([]);
                  setActiveTab('groups');
                }}
                onOpenSyncStudio={() => setActiveTab('sync')}
              />
            )}

            {activeTab === 'sync' && (
              <SyncStudio
                snapshot={snapshot}
                onUpdateSync={(patch) => pb.updateSync(patch)}
                onAutoAlign={() => void pb.autoAlignAll()}
                onUpdateDevice={(id, patch) => pb.updateDevice(id, patch)}
                onConnectMany={(ids) => void pb.connectMany(ids)}
              />
            )}

            {activeTab === 'radar' && (
              <RadarView
                snapshot={snapshot}
                onInspectDevice={(dev) => setInspectedDeviceId(dev.id)}
                onConnectMany={(ids) => void pb.connectMany(ids)}
                onDisconnectMany={(ids) => void pb.disconnectMany(ids)}
              />
            )}

            {activeTab === 'groups' && (
              <GroupsPanel
                snapshot={snapshot}
                initialDraftIds={groupDraftIds}
                onClearDraft={() => setGroupDraftIds([])}
                onActivateGroup={(id, exclusive) => void pb.activateGroup(id, exclusive)}
                onCreateGroup={(payload) => void pb.createGroup(payload)}
                onDeleteGroup={(id) => void pb.deleteGroup(id)}
              />
            )}

            {activeTab === 'diagnostics' && (
              <DiagnosticsPanel
                snapshot={snapshot}
                darkMode={darkMode}
                onToggleTheme={() => setDarkMode((d) => !d)}
                onUpdateSettings={(patch) => pb.updateSettings(patch)}
                onUpdateSync={(patch) => pb.updateSync(patch)}
                onExportConfig={pb.exportConfig}
                onImportConfig={pb.importConfig}
                onResetConfig={pb.resetConfig}
              />
            )}
          </div>
        </main>
      </div>

      {/* Crisp Action Toast */}
      {pb.toast && (
        <div
          key={pb.toast.id}
          className="pb-pop-in fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#24324D] bg-white/95 dark:bg-[#0E1626]/95 text-xs font-medium text-slate-800 dark:text-slate-100 shadow-xl backdrop-blur-xl"
        >
          {pb.toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : pb.toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-cyan-500 shrink-0" />
          )}
          <span>{pb.toast.message}</span>
          <button
            onClick={pb.clearToast}
            aria-label="Dismiss notification"
            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <InspectorDrawer
        device={inspectedDevice}
        onClose={() => setInspectedDeviceId(null)}
        onConnect={(id) => void pb.connectMany([id])}
        onDisconnect={(id) => void pb.disconnectMany([id])}
        onRemove={(id) => {
          setInspectedDeviceId(null);
          void pb.removeDevice(id);
        }}
        onUpdate={(id, patch) => pb.updateDevice(id, patch)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        snapshot={snapshot}
        onSelectTab={setActiveTab}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onScan={() => void pb.startScan(8000)}
        onAutoAlign={() => void pb.autoAlignAll()}
        onConnectMany={(ids) => void pb.connectMany(ids)}
        onDisconnectMany={(ids) => void pb.disconnectMany(ids)}
        onActivateGroup={(id) => void pb.activateGroup(id, true)}
      />
    </div>
  );
}

export default App;
