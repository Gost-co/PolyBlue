import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioWaveform,
  Link2,
  Lock,
  Music,
  Play,
  SlidersHorizontal,
  Sparkles,
  Square,
  Unlock,
  Upload,
  Volume2,
  VolumeX
} from 'lucide-react';
import {
  EQ_PRESETS,
  getCodecSpec,
  type BluetoothDevice,
  type ChannelRouting,
  type EqPresetId,
  type PolyBlueSnapshot,
  type SyncConfig
} from '@polyblue/shared';
import { useAudioSyncLab, type TestSourceMode } from '../hooks/useAudioSyncLab';
import type { DevicePatch } from '../hooks/usePolyBlue';
import { DeviceIcon } from './DeviceIcon';

const TRACE_COLORS = ['#22D3EE', '#10B981', '#A78BFA', '#F59E0B', '#FB7185', '#60A5FA'];

interface SyncStudioProps {
  snapshot: PolyBlueSnapshot;
  onUpdateSync: (patch: Partial<SyncConfig>) => void;
  onAutoAlign: () => void;
  onUpdateDevice: (id: string, patch: DevicePatch) => void;
  onConnectMany: (ids: string[]) => void;
}

export function SyncStudio({
  snapshot,
  onUpdateSync,
  onAutoAlign,
  onUpdateDevice,
  onConnectMany
}: SyncStudioProps) {
  const { devices, sync } = snapshot;
  const activeAudio = devices.filter((d) => d.connected && d.audio.supportsAudio);
  const disconnectedAudio = devices.filter((d) => !d.connected && d.audio.supportsAudio);

  const [expandedEq, setExpandedEq] = useState<Record<string, boolean>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const audioLab = useAudioSyncLab(devices, sync.enabled);

  // Keep latest reactive state in a ref so the 60fps RAF loop NEVER resets on telemetry ticks or slider drags
  const oscStateRef = useRef({
    activeAudio,
    syncLocked: sync.syncLocked,
    masterTargetLatencyMs: sync.masterTargetLatencyMs,
    playing: audioLab.playing
  });
  oscStateRef.current = {
    activeAudio,
    syncLocked: sync.syncLocked,
    masterTargetLatencyMs: sync.masterTargetLatencyMs,
    playing: audioLab.playing
  };

  // 60fps Phase Alignment Oscilloscope Canvas with smooth exponential wave interpolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastNow = performance.now();
    let phaseTime = 0;
    const smoothed = new Map<string, { phaseDeltaMs: number; amplitudeScale: number }>();

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const { activeAudio: currentAudio, syncLocked, masterTargetLatencyMs, playing } = oscStateRef.current;
      phaseTime += dt * (playing ? 2.4 : 1.1);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background studio grid
      ctx.fillStyle = '#080D16';
      ctx.fillRect(0, 0, w, h);

      const gridCols = 12;
      const gridRows = 4;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < gridCols; i++) {
        const x = (w / gridCols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let j = 1; j < gridRows; j++) {
        const y = (h / gridRows) * j;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Master Clock Target vertical reticle (center-right)
      const targetX = w * 0.56;
      ctx.save();
      ctx.strokeStyle = syncLocked ? 'rgba(16, 185, 129, 0.82)' : 'rgba(245, 158, 11, 0.68)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(targetX, 0);
      ctx.lineTo(targetX, h);
      ctx.stroke();
      ctx.restore();

      // Reticle label
      ctx.fillStyle = syncLocked ? '#34D399' : '#FBBF24';
      ctx.font = `600 ${11 * dpr}px ui-monospace, monospace`;
      ctx.fillText(
        `MASTER CLOCK ${masterTargetLatencyMs.toFixed(0)}ms  (${syncLocked ? 'PHASE LOCKED' : 'UNALIGNED'})`,
        targetX + 8 * dpr,
        18 * dpr
      );

      if (currentAudio.length === 0) {
        ctx.fillStyle = '#64748B';
        ctx.font = `500 ${13 * dpr}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Connect 2+ Bluetooth audio devices to visualize live phase alignment', w / 2, h / 2);
        ctx.textAlign = 'left';
      } else {
        const laneHeight = (h - 32 * dpr) / Math.max(1, currentAudio.length);
        const lerpAlpha = 1 - Math.exp(-dt * 14);
        const activeIds = new Set(currentAudio.map((d) => d.id));
        for (const key of smoothed.keys()) {
          if (!activeIds.has(key)) smoothed.delete(key);
        }

        currentAudio.forEach((dev, index) => {
          const color = TRACE_COLORS[index % TRACE_COLORS.length];
          const centerY = 26 * dpr + laneHeight * (index + 0.5);
          const targetAmpScale = dev.audio.muted ? 0.12 : 0.4 + (dev.audio.volume / 100) * 0.6;

          let sState = smoothed.get(dev.id);
          if (!sState) {
            sState = { phaseDeltaMs: dev.audio.phaseDeltaMs, amplitudeScale: targetAmpScale };
            smoothed.set(dev.id, sState);
          } else {
            sState.phaseDeltaMs += (dev.audio.phaseDeltaMs - sState.phaseDeltaMs) * lerpAlpha;
            sState.amplitudeScale += (targetAmpScale - sState.amplitudeScale) * lerpAlpha;
          }

          const amplitude = Math.min(laneHeight * 0.34, 24 * dpr) * sState.amplitudeScale;
          const pxPerMs = (w * 0.28) / 180;
          const phaseOffsetPx = Math.max(-w * 0.38, Math.min(w * 0.38, sState.phaseDeltaMs * pxPerMs));
          const peakX = targetX + phaseOffsetPx;

          // Center baseline
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, centerY);
          ctx.lineTo(w, centerY);
          ctx.stroke();

          // Draw transient acoustic wave packet centered at peakX
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();

          const samples = 220;
          for (let s = 0; s <= samples; s++) {
            const x = (s / samples) * w;
            const dx = (x - peakX) / (26 * dpr);
            const envelope = Math.exp(-dx * dx * 1.45);
            const carrier = Math.sin(dx * 8.5 - phaseTime * 6.28318);
            const ripple = Math.sin(x * 0.035 - phaseTime * 2.5 + index) * 0.08;
            const y = centerY - (envelope * carrier + ripple) * amplitude;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // Peak marker dot
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(peakX, centerY, 4 * dpr, 0, Math.PI * 2);
          ctx.fill();

          // Device lane label
          ctx.fillStyle = '#E2E8F0';
          ctx.font = `600 ${11 * dpr}px Inter, sans-serif`;
          ctx.fillText(dev.alias || dev.name, 12 * dpr, centerY - laneHeight * 0.25);

          ctx.fillStyle = color;
          ctx.font = `500 ${10 * dpr}px ui-monospace, monospace`;
          ctx.fillText(
            `${dev.audio.codec}  +${dev.audio.appliedDelayMs.toFixed(0)}ms  (Δ ${dev.audio.phaseDeltaMs.toFixed(1)}ms)`,
            12 * dpr,
            centerY + laneHeight * 0.32
          );
        });
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const routingOptions: Array<{ id: ChannelRouting; label: string }> = [
    { id: 'stereo', label: 'Stereo' },
    { id: 'left', label: 'Left (L)' },
    { id: 'right', label: 'Right (R)' },
    { id: 'mono', label: 'Mono' },
    { id: 'subwoofer', label: 'Sub' }
  ];

  return (
    <div className="space-y-5">
      {/* Top Studio Header & Live Oscilloscope */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#1E283D] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AudioWaveform className="w-5 h-5 text-cyan-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Zero-Drift Multi-Output Sync Studio
              </h2>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                  sync.syncLocked
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                }`}
              >
                {sync.syncLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {sync.syncLocked ? `LOCKED · Δ ${sync.maxPhaseErrorMs.toFixed(1)}ms` : `DRIFT · Δ ${sync.maxPhaseErrorMs.toFixed(1)}ms`}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Compensates hardware codec delays (LC3, aptX, AAC, SBC, LDAC) and crystal clock drift so every connected device plays at the exact same millisecond.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* A/B Sync Enable vs Bypass */}
            <button
              onClick={() => onUpdateSync({ enabled: !sync.enabled })}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                sync.enabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              {sync.enabled ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{sync.enabled ? 'Sync Lock: ON' : 'Sync Bypassed (A/B)'}</span>
            </button>

            <button
              onClick={onAutoAlign}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-sm shadow-cyan-500/25 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Align All</span>
            </button>
          </div>
        </div>

        {/* Live Phase Alignment Oscilloscope */}
        <div className="relative">
          <canvas ref={canvasRef} className="w-full h-56 sm:h-64 block" />
        </div>

        {/* Interactive Web Audio Acoustic Calibration Bench */}
        <div className="p-4 bg-slate-50 dark:bg-[#0A0F1A] border-t border-slate-200 dark:border-[#1E283D] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={audioLab.toggle}
              disabled={activeAudio.length === 0}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 ${
                audioLab.playing
                  ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/25'
                  : 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:opacity-90'
              }`}
            >
              {audioLab.playing ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{audioLab.playing ? 'Stop Calibration Audio' : 'Hear Live Sync Test'}</span>
            </button>

            <div className="inline-flex rounded-xl border border-slate-200 dark:border-[#232F46] bg-white dark:bg-[#111827] p-0.5">
              {(
                [
                  ['pulse', 'Sync Click'],
                  ['groove', 'Synth Groove'],
                  ['file', audioLab.customTrackName ? `File: ${audioLab.customTrackName.slice(0, 12)}` : 'Audio File']
                ] as Array<[TestSourceMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode === 'file' && !audioLab.customTrackName) {
                      fileInputRef.current?.click();
                    } else {
                      audioLab.setSourceMode(mode);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    audioLab.sourceMode === mode
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void audioLab.loadAudioFile(file);
              }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232F46] text-[11px] text-slate-600 dark:text-slate-300 hover:border-cyan-500/40 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Load Track</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {audioLab.sourceMode !== 'file' && (
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span className="font-mono text-[11px]">{audioLab.bpm} BPM</span>
                <input
                  type="range"
                  min={60}
                  max={200}
                  step={4}
                  value={audioLab.bpm}
                  onChange={(e) => audioLab.setBpm(Number(e.target.value))}
                  className="pb-slider w-20"
                />
              </label>
            )}

            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="font-mono text-[11px]">Jitter Buffer: {sync.safetyBufferMs}ms</span>
              <input
                type="range"
                min={0}
                max={60}
                step={2}
                value={sync.safetyBufferMs}
                onChange={(e) => onUpdateSync({ safetyBufferMs: Number(e.target.value) })}
                className="pb-slider w-24"
              />
            </label>

            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={sync.driftCorrection}
                onChange={(e) => onUpdateSync({ driftCorrection: e.target.checked })}
                className="accent-cyan-500 rounded"
              />
              <span className="text-[11px] font-medium">Kalman Clock Drift Lock</span>
            </label>
          </div>
          {audioLab.fileError && (
            <div className="w-full text-xs text-rose-400 font-mono pt-1">{audioLab.fileError}</div>
          )}
        </div>
      </div>

      {/* Master Bus Volume & Linked Gain Control */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-[220px] flex-1">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/12 border border-cyan-500/25 flex items-center justify-center text-cyan-500">
            <Music className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Master Multi-Output Bus</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400">{sync.masterVolume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={sync.masterVolume}
              onChange={(e) => onUpdateSync({ masterVolume: Number(e.target.value) })}
              className="pb-slider w-full"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232F46] bg-slate-50 dark:bg-[#111827] text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={sync.linkedVolume}
            onChange={(e) => onUpdateSync({ linkedVolume: e.target.checked })}
            className="accent-cyan-500"
          />
          <span>Linked Proportional Volume</span>
        </label>
      </div>

      {/* Quick Connect More Audio Devices Prompt if < 2 connected */}
      {activeAudio.length < 2 && disconnectedAudio.length > 0 && (
        <div className="p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/8 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-cyan-900 dark:text-cyan-200">
            Connect at least <strong>2 Bluetooth audio devices</strong> simultaneously to compare latency alignment and split stereo channels.
          </div>
          <button
            onClick={() => onConnectMany(disconnectedAudio.slice(0, 2).map((d) => d.id))}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Quick-Connect {Math.min(2, disconnectedAudio.length)} Speakers/Headphones</span>
          </button>
        </div>
      )}

      {/* Per-Device Delay Calibration, Channel Matrix & EQ Strips */}
      <div className="space-y-3">
        {activeAudio.map((dev, idx) => (
          <SyncDeviceStrip
            key={dev.id}
            device={dev}
            traceColor={TRACE_COLORS[idx % TRACE_COLORS.length]}
            masterTargetMs={sync.masterTargetLatencyMs}
            routingOptions={routingOptions}
            eqOpen={Boolean(expandedEq[dev.id])}
            onToggleEq={() => setExpandedEq((prev) => ({ ...prev, [dev.id]: !prev[dev.id] }))}
            onUpdate={(patch) => onUpdateDevice(dev.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function SyncDeviceStrip({
  device,
  traceColor,
  masterTargetMs,
  routingOptions,
  eqOpen,
  onToggleEq,
  onUpdate
}: {
  device: BluetoothDevice;
  traceColor: string;
  masterTargetMs: number;
  routingOptions: Array<{ id: ChannelRouting; label: string }>;
  eqOpen: boolean;
  onToggleEq: () => void;
  onUpdate: (patch: DevicePatch) => void;
}) {
  const spec = getCodecSpec(device.audio.codec);
  const adjustedBaseMs = Math.max(5, device.audio.intrinsicLatencyMs + device.audio.manualOffsetMs);
  const maxBar = Math.max(masterTargetMs, device.audio.effectiveLatencyMs, 240);
  const intrinsicPct = Math.min(100, (adjustedBaseMs / maxBar) * 100);
  const delayPct = Math.min(100 - intrinsicPct, (device.audio.appliedDelayMs / maxBar) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] p-4 space-y-4">
      {/* Row 1: Device Header + Volume + Channel Matrix */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-[220px]">
          <span style={{ backgroundColor: traceColor }} className="w-1.5 h-10 rounded-full shrink-0" />
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#161F30] flex items-center justify-center text-cyan-500">
            <DeviceIcon category={device.category} className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {device.alias || device.name}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/12 text-blue-600 dark:text-blue-300 border border-blue-500/20">
                {spec.label}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Drift: {device.audio.clockDriftPpm >= 0 ? '+' : ''}{device.audio.clockDriftPpm} ppm</span>
              <span>·</span>
              <span className={Math.abs(device.audio.phaseDeltaMs) <= 1 ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
                Phase Δ {device.audio.phaseDeltaMs.toFixed(1)} ms
              </span>
            </div>
          </div>
        </div>

        {/* Channel Splitter Pills */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-[#121929] p-1 rounded-xl border border-slate-200 dark:border-[#1F2A40]">
          {routingOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ routing: opt.id })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                device.audio.routing === opt.id
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Volume + Mute + Solo + EQ toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate({ muted: !device.audio.muted })}
            title="Mute device"
            className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
              device.audio.muted
                ? 'bg-rose-500 text-white'
                : 'bg-slate-100 dark:bg-[#161F30] text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {device.audio.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => onUpdate({ solo: !device.audio.solo })}
            title="Solo this device in calibration lab"
            className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
              device.audio.solo
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-100 dark:bg-[#161F30] text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            S
          </button>

          <input
            type="range"
            min={0}
            max={100}
            value={device.audio.volume}
            onChange={(e) => onUpdate({ volume: Number(e.target.value), muted: false })}
            className="pb-slider w-24"
          />
          <span className="w-8 text-right text-xs font-mono text-slate-600 dark:text-slate-300">
            {device.audio.volume}%
          </span>

          <button
            onClick={onToggleEq}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              eqOpen
                ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-600 dark:text-cyan-300'
                : 'border-slate-200 dark:border-[#232F46] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>EQ</span>
          </button>
        </div>
      </div>

      {/* Row 2: Visual Latency Pipeline Bar + Fine Trim Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-6 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>
              Codec <strong className="text-slate-800 dark:text-slate-200">{device.audio.intrinsicLatencyMs}ms</strong>
              {device.audio.manualOffsetMs !== 0 && (
                <>
                  {' '}
                  ({device.audio.manualOffsetMs > 0 ? '+' : ''}
                  {device.audio.manualOffsetMs}ms trim)
                </>
              )}{' '}
              + PolyBlue Buffer{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">+{device.audio.appliedDelayMs.toFixed(1)}ms</strong>
            </span>
            <span className="text-slate-800 dark:text-slate-100 font-semibold">
              Total {device.audio.effectiveLatencyMs.toFixed(1)} ms
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-[#141D2E] overflow-hidden flex">
            <div
              style={{ width: `${intrinsicPct}%` }}
              className="h-full bg-blue-500/75 transition-all duration-300"
              title={`Intrinsic codec latency: ${device.audio.intrinsicLatencyMs}ms`}
            />
            <div
              style={{ width: `${delayPct}%` }}
              className="h-full bg-emerald-400 transition-all duration-300"
              title={`Injected sync alignment delay: +${device.audio.appliedDelayMs}ms`}
            />
          </div>
        </div>

        {/* Fine Manual Micro-Offset Calibration */}
        <div className="lg:col-span-6 flex flex-wrap items-center justify-end gap-2">
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Fine Trim:</span>
          {[-5, -1, 0, 1, 5].map((delta) => (
            <button
              key={delta}
              onClick={() =>
                onUpdate({
                  manualOffsetMs: delta === 0 ? 0 : Math.max(-250, Math.min(250, device.audio.manualOffsetMs + delta))
                })
              }
              className="px-2 py-1 rounded-md text-[11px] font-mono bg-slate-100 dark:bg-[#161F30] text-slate-700 dark:text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors cursor-pointer"
            >
              {delta === 0 ? 'Reset' : delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
          <input
            type="range"
            min={-150}
            max={150}
            step={1}
            value={device.audio.manualOffsetMs}
            onChange={(e) => onUpdate({ manualOffsetMs: Number(e.target.value) })}
            className="pb-slider w-24"
          />
          <span className="w-14 text-right text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400">
            {device.audio.manualOffsetMs >= 0 ? '+' : ''}
            {device.audio.manualOffsetMs}ms
          </span>
        </div>
      </div>

      {/* Expandable 3-Band Parametric EQ */}
      {eqOpen && (
        <div className="pt-3 border-t border-slate-100 dark:border-[#1B2437] grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5 flex flex-wrap items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-500 mr-1" />
            {(Object.keys(EQ_PRESETS) as Array<Exclude<EqPresetId, 'custom'>>).map((presetId) => (
              <button
                key={presetId}
                onClick={() => onUpdate({ eq: { preset: presetId } })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  device.audio.eq.preset === presetId
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-100 dark:bg-[#161F30] text-slate-600 dark:text-slate-300 hover:text-white'
                }`}
              >
                {EQ_PRESETS[presetId].label}
              </button>
            ))}
          </div>

          <div className="md:col-span-7 grid grid-cols-3 gap-3">
            {(
              [
                ['bassDb', 'Bass 100Hz', device.audio.eq.bassDb],
                ['midDb', 'Mid 1kHz', device.audio.eq.midDb],
                ['trebleDb', 'Treble 8kHz', device.audio.eq.trebleDb]
              ] as const
            ).map(([key, label, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span>{label}</span>
                  <span className="text-cyan-500">{val > 0 ? `+${val}` : val} dB</span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={val}
                  onChange={(e) => onUpdate({ eq: { [key]: Number(e.target.value), preset: 'custom' } })}
                  className="pb-slider w-full"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
