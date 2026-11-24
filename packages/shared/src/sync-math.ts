import { getCodecSpec } from './codecs.js';
import type { BluetoothDevice } from './types.js';

export interface DeviceDelaySolution {
  deviceId: string;
  intrinsicLatencyMs: number;
  manualOffsetMs: number;
  appliedDelayMs: number;
  effectiveLatencyMs: number;
  phaseDeltaMs: number;
}

export interface SyncPlan {
  masterTargetLatencyMs: number;
  maxPhaseErrorMs: number;
  syncLocked: boolean;
  solutions: Record<string, DeviceDelaySolution>;
}

/**
 * Computes exact per-device delay compensation so all active Bluetooth audio outputs
 * align to a single wall-clock arrival target (zero audible time difference / echo).
 *
 * For each connected audio device i:
 *   base_i = intrinsicLatencyMs_i + manualOffsetMs_i
 * When sync is enabled:
 *   masterTarget = max_i(base_i) + safetyBufferMs
 *   appliedDelay_i = max(0, masterTarget - base_i)
 *   effective_i = base_i + appliedDelay_i === masterTarget
 *   phaseDelta_i = effective_i - masterTarget (0.0 ms when locked)
 */
export function computeSyncPlan(
  devices: BluetoothDevice[],
  options: { enabled: boolean; safetyBufferMs: number }
): SyncPlan {
  const connectedAudio = devices.filter((d) => d.connected && d.audio.supportsAudio);
  const solutions: Record<string, DeviceDelaySolution> = {};

  if (connectedAudio.length === 0) {
    return {
      masterTargetLatencyMs: 0,
      maxPhaseErrorMs: 0,
      syncLocked: true,
      solutions
    };
  }

  const rawSafety = Number.isFinite(options.safetyBufferMs) ? options.safetyBufferMs : 0;
  const safety = Math.max(0, Math.min(100, rawSafety));

  const bases = connectedAudio.map((d) => {
    const intrinsic = Number.isFinite(d.audio.intrinsicLatencyMs) ? d.audio.intrinsicLatencyMs : 0;
    const manual = Number.isFinite(d.audio.manualOffsetMs) ? d.audio.manualOffsetMs : 0;
    return {
      device: d,
      base: Math.max(5, intrinsic + manual)
    };
  });

  const slowestBase = Math.max(...bases.map((b) => b.base));
  const masterTarget = round2(slowestBase + (options.enabled ? safety : 0));

  let maxError = 0;

  for (const { device, base } of bases) {
    const appliedDelay = options.enabled ? round2(Math.max(0, masterTarget - base)) : 0;
    const effective = round2(base + appliedDelay);
    // When sync is enabled and drift correction runs, residual phase error is sub-millisecond.
    const rawDelta = round2(effective - masterTarget);
    const residual = options.enabled ? rawDelta : round2(base - slowestBase);

    maxError = Math.max(maxError, Math.abs(residual));

    solutions[device.id] = {
      deviceId: device.id,
      intrinsicLatencyMs: device.audio.intrinsicLatencyMs,
      manualOffsetMs: device.audio.manualOffsetMs,
      appliedDelayMs: appliedDelay,
      effectiveLatencyMs: effective,
      phaseDeltaMs: residual
    };
  }

  return {
    masterTargetLatencyMs: masterTarget,
    maxPhaseErrorMs: round2(maxError),
    syncLocked: options.enabled && maxError <= 1.0,
    solutions
  };
}

/**
 * 2-state Kalman filter tracking per-device Bluetooth clock offset (ms)
 * and crystal clock skew (ppm) while rejecting wireless RF packet jitter.
 */
export class KalmanDriftEstimator {
  private offsetMs = 0;
  private skewPpm = 0;
  private p00 = 4;
  private p01 = 0;
  private p10 = 0;
  private p11 = 2500;
  private lastTimestampMs: number | null = null;

  constructor(
    private readonly processNoiseOffset = 0.002,
    private readonly processNoiseSkew = 2.0,
    private readonly measurementNoise = 0.35
  ) {}

  update(measuredOffsetMs: number, timestampMs: number): { offsetMs: number; skewPpm: number } {
    if (this.lastTimestampMs === null) {
      this.offsetMs = measuredOffsetMs;
      this.lastTimestampMs = timestampMs;
      return { offsetMs: round2(this.offsetMs), skewPpm: round2(this.skewPpm) };
    }

    const dtSec = Math.max(0.05, (timestampMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = timestampMs;

    // State transition: offset_k = offset_{k-1} + skewPpm * 1e-3 * dtSec
    const f = dtSec * 1e-3;
    const predOffset = this.offsetMs + this.skewPpm * f;
    const predSkew = this.skewPpm;

    // Covariance prediction P = F P F^T + Q
    const p00 = this.p00 + f * (this.p10 + this.p01) + f * f * this.p11 + this.processNoiseOffset * dtSec;
    const p01 = this.p01 + f * this.p11;
    const p10 = this.p10 + f * this.p11;
    const p11 = this.p11 + this.processNoiseSkew * dtSec;

    // Innovation
    const y = measuredOffsetMs - predOffset;
    const s = p00 + this.measurementNoise;
    const k0 = p00 / s;
    const k1 = p10 / s;

    // State update
    this.offsetMs = predOffset + k0 * y;
    this.skewPpm = Math.max(-150, Math.min(150, predSkew + k1 * y));

    // Covariance update
    this.p00 = (1 - k0) * p00;
    this.p01 = (1 - k0) * p01;
    this.p10 = p10 - k1 * p00;
    this.p11 = p11 - k1 * p01;

    return {
      offsetMs: round2(this.offsetMs),
      skewPpm: round2(this.skewPpm)
    };
  }

  reset(): void {
    this.offsetMs = 0;
    this.skewPpm = 0;
    this.p00 = 4;
    this.p01 = 0;
    this.p10 = 0;
    this.p11 = 2500;
    this.lastTimestampMs = null;
  }
}

export interface PiconetBudget {
  loadPct: number;
  totalBitrateKbps: number;
  warning: string | null;
}

/**
 * Estimates shared Bluetooth piconet RF airtime utilization across all active simultaneous links.
 * Classic EDR adapters comfortably sustain ~85% scheduled slot load before audio stutters appear.
 */
export function computePiconetBudget(devices: BluetoothDevice[]): PiconetBudget {
  const active = devices.filter((d) => d.connected);
  let loadPct = 0;
  let totalBitrateKbps = 0;

  for (const device of active) {
    if (device.audio.supportsAudio) {
      const spec = getCodecSpec(device.audio.codec);
      // Weak RSSI increases retransmissions, raising airtime cost.
      const retransmitMultiplier = device.rssi < -75 ? 1.3 : device.rssi < -65 ? 1.12 : 1.0;
      loadPct += spec.airtimeWeight * retransmitMultiplier;
      totalBitrateKbps += spec.bitrateKbps;
    } else if (device.category === 'gamepad') {
      loadPct += 6;
      totalBitrateKbps += 32;
    } else {
      loadPct += 3;
      totalBitrateKbps += 12;
    }
  }

  const clampedLoad = Math.min(100, Math.round(loadPct));
  let warning: string | null = null;

  if (clampedLoad >= 85) {
    warning =
      'High RF airtime utilization detected. Switch high-bitrate LDAC/aptX HD links to AAC, aptX Adaptive, or LC3 for rock-solid multi-link stability.';
  } else if (clampedLoad >= 70) {
    warning = 'Moderate multi-link RF load. Keep devices within 8 meters of the host adapter.';
  }

  return {
    loadPct: clampedLoad,
    totalBitrateKbps: Math.round(totalBitrateKbps),
    warning
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
