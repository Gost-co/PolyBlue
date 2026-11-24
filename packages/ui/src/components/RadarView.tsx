import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Link2, Radio, Unlink } from 'lucide-react';
import type { BluetoothDevice, PolyBlueSnapshot } from '@polyblue/shared';
import { DeviceIcon, SignalBars } from './DeviceIcon';

interface RadarViewProps {
  snapshot: PolyBlueSnapshot;
  onInspectDevice: (device: BluetoothDevice) => void;
  onConnectMany: (ids: string[]) => void;
  onDisconnectMany: (ids: string[]) => void;
}

interface HitTarget {
  device: BluetoothDevice;
  xCss: number;
  yCss: number;
}

export function RadarView({ snapshot, onInspectDevice, onConnectMany, onDisconnectMany }: RadarViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const [hoveredDeviceName, setHoveredDeviceName] = useState<string | null>(null);

  const { devices, adapter } = snapshot;

  // Keep reactive state in a ref so the 60fps radar sweep NEVER resets on telemetry ticks
  const radarStateRef = useRef({ devices, discovering: adapter.discovering });
  radarStateRef.current = { devices, discovering: adapter.discovering };

  // Stable order: Connected -> Favorite -> Name so list rows NEVER jump around when RSSI fluctuates
  const sortedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        const nameA = (a.alias || a.name).toLowerCase();
        const nameB = (b.alias || b.name).toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return a.id.localeCompare(b.id);
      }),
    [devices]
  );

  // 60fps Spatial RF Proximity Radar & Active Piconet Link Arcs with smooth radial lerping
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastNow = performance.now();
    let elapsed = 0;
    let sweepAngle = 0;
    let currentSpeed = 0.75;
    const smoothNorm = new Map<string, number>();

    const draw = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      elapsed += dt;

      const { devices: liveDevices, discovering } = radarStateRef.current;

      // Smoothly accelerate/decelerate radar sweep when Scan toggles
      const targetSpeed = discovering ? 2.4 : 0.75;
      currentSpeed += (targetSpeed - currentSpeed) * (1 - Math.exp(-dt * 5));
      sweepAngle = (sweepAngle + dt * currentSpeed) % (Math.PI * 2);

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
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.43;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#070B13';
      ctx.fillRect(0, 0, w, h);

      // Concentric range rings
      const rings = [0.25, 0.5, 0.75, 1.0];
      const ringLabels = ['1.5m', '4m', '8m', '14m'];
      rings.forEach((ratio, idx) => {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.font = `500 ${10 * dpr}px ui-monospace, monospace`;
        ctx.fillText(ringLabels[idx], cx + 5 * dpr, cy - maxR * ratio + 12 * dpr);
      });

      // Crosshairs
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Rotating radar sweep cone
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxR);
      grad.addColorStop(0, 'rgba(34, 211, 238, 0.24)');
      grad.addColorStop(1, 'rgba(34, 211, 238, 0.01)');

      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - 0.55, sweepAngle);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      ctx.stroke();
      ctx.restore();

      const lerpAlpha = 1 - Math.exp(-dt * 6);
      const hits: HitTarget[] = [];
      const activeIds = new Set(liveDevices.map((d) => d.id));
      for (const key of smoothNorm.keys()) {
        if (!activeIds.has(key)) smoothNorm.delete(key);
      }

      // Plot devices with smooth radial interpolation
      for (const dev of liveDevices) {
        const targetNorm = Math.max(0, Math.min(1, (-35 - dev.rssi) / 57));
        const prevNorm = smoothNorm.get(dev.id) ?? targetNorm;
        const norm = prevNorm + (targetNorm - prevNorm) * lerpAlpha;
        smoothNorm.set(dev.id, norm);

        const r = maxR * (0.18 + norm * 0.76);
        const rad = (dev.radarAngleDeg * Math.PI) / 180;
        const x = cx + Math.cos(rad) * r;
        const y = cy + Math.sin(rad) * r;
        const isHovered = hoveredIdRef.current === dev.id;

        hits.push({ device: dev, xCss: x / dpr, yCss: y / dpr });

        if (dev.connected) {
          ctx.save();
          ctx.strokeStyle = dev.audio.supportsAudio ? 'rgba(16, 185, 129, 0.65)' : 'rgba(139, 92, 246, 0.55)';
          ctx.lineWidth = (isHovered ? 2.4 : 1.8) * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.lineDashOffset = -elapsed * 28 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.restore();

          const pulse = 1 + Math.sin(elapsed * 4 + dev.radarAngleDeg) * 0.32;
          ctx.fillStyle = dev.audio.supportsAudio ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)';
          ctx.beginPath();
          ctx.arc(x, y, 12 * dpr * pulse, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isHovered) {
          ctx.strokeStyle = '#22D3EE';
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.arc(x, y, 11 * dpr, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = dev.connected ? (dev.audio.supportsAudio ? '#34D399' : '#A78BFA') : isHovered ? '#22D3EE' : '#64748B';
        ctx.beginPath();
        ctx.arc(x, y, (dev.connected ? 5.5 : isHovered ? 5.5 : 4) * dpr, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = dev.connected || isHovered ? '#F8FAFC' : '#94A3B8';
        ctx.font = `${dev.connected || isHovered ? '600' : '400'} ${10.5 * dpr}px Inter, sans-serif`;
        ctx.fillText(dev.alias || dev.name, x + 9 * dpr, y + 3 * dpr);
      }

      hitTargetsRef.current = hits;

      // Host adapter center node
      ctx.fillStyle = '#22D3EE';
      ctx.beginPath();
      ctx.arc(cx, cy, 8 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, 13 * dpr, 0, Math.PI * 2);
      ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const findNearestTarget = (e: React.MouseEvent<HTMLCanvasElement>): HitTarget | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let closest: HitTarget | null = null;
    let bestDist = 22;
    for (const target of hitTargetsRef.current) {
      const dist = Math.hypot(mx - target.xCss, my - target.yCss);
      if (dist < bestDist) {
        bestDist = dist;
        closest = target;
      }
    }
    return closest;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Left: Animated Interactive RF Radar Canvas */}
      <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-[#1E283D] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Spatial RF Proximity Radar & Piconet Topology
            </h2>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Synced Audio
            </span>
            <span className="inline-flex items-center gap-1.5 text-violet-400">
              <span className="w-2 h-2 rounded-full bg-violet-400" /> Active HID/BLE
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-500" /> Nearby
            </span>
          </div>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            onMouseMove={(e) => {
              const hit = findNearestTarget(e);
              hoveredIdRef.current = hit?.device.id ?? null;
              setHoveredDeviceName(hit ? `${hit.device.alias || hit.device.name} (${hit.device.rssi} dBm)` : null);
            }}
            onMouseLeave={() => {
              hoveredIdRef.current = null;
              setHoveredDeviceName(null);
            }}
            onClick={(e) => {
              const hit = findNearestTarget(e);
              if (hit) onInspectDevice(hit.device);
            }}
            className={`w-full h-[380px] sm:h-[440px] block ${hoveredDeviceName ? 'cursor-pointer' : 'cursor-default'}`}
          />
          <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 border border-slate-800 text-[11px] font-mono text-slate-300 pointer-events-none">
            {hoveredDeviceName ? `Click to inspect: ${hoveredDeviceName}` : 'Click any radar node to inspect GATT & proximity rules'}
          </div>
        </div>
      </div>

      {/* Right: Live RF Telemetry Sparklines */}
      <div className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-[#1F293D] bg-white dark:bg-[#0D131F] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-[#1E283D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live RF Signal & Jitter Telemetry</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">{devices.length} radios</span>
        </div>

        <div className="p-3 space-y-2.5 max-h-[440px] overflow-y-auto">
          {sortedDevices.map((dev) => (
            <div
              key={dev.id}
              onClick={() => onInspectDevice(dev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                dev.connected
                  ? 'border-cyan-500/35 bg-cyan-500/5 dark:bg-[#111B2D]'
                  : 'border-slate-200 dark:border-[#1D273B] bg-slate-50/70 dark:bg-[#0A0F1A] hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <DeviceIcon category={dev.category} className="w-4 h-4 text-cyan-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {dev.alias || dev.name}
                    </div>
                    <div className="text-[10.5px] font-mono text-slate-500">
                      {dev.rssi} dBm · {dev.estimatedDistanceM}m · Jitter {dev.jitterMs}ms
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <SignalBars rssi={dev.rssi} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dev.connected) onDisconnectMany([dev.id]);
                      else onConnectMany([dev.id]);
                    }}
                    className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      dev.connected
                        ? 'bg-slate-200 dark:bg-[#1D283E] text-slate-700 dark:text-slate-300 hover:bg-rose-500/20 hover:text-rose-400'
                        : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500 hover:text-slate-950'
                    }`}
                  >
                    {dev.connected ? <Unlink className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Inline RSSI Sparkline SVG */}
              <RssiSparkline samples={dev.telemetry.map((t) => t.rssi)} active={dev.connected} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RssiSparkline({ samples, active }: { samples: number[]; active: boolean }) {
  if (samples.length < 2) return null;
  const w = 280;
  const h = 26;
  const points = samples
    .map((rssi, idx) => {
      const x = (idx / (samples.length - 1)) * w;
      const norm = Math.max(0, Math.min(1, (rssi + 95) / 60));
      const y = h - norm * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6 mt-2 overflow-visible">
      <polyline
        fill="none"
        stroke={active ? '#22D3EE' : '#64748B'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
