import { describe, expect, it } from 'vitest';
import {
  computePiconetBudget,
  computeSyncPlan,
  estimateDistanceMeters,
  isValidMacAddress,
  KalmanDriftEstimator,
  lookupVendor,
  type BluetoothDevice
} from './index.js';

function makeAudioDevice(id: string, codec: BluetoothDevice['audio']['codec'], intrinsicMs: number, manualOffsetMs = 0, rssi = -52): BluetoothDevice {
  return {
    id,
    address: id,
    name: `Device ${id}`,
    vendor: 'Test Audio',
    category: 'headphones',
    transport: 'dual',
    bluetoothVersion: '5.3',
    paired: true,
    trusted: true,
    favorite: false,
    connected: true,
    phase: 'connected',
    phaseProgress: 100,
    rssi,
    estimatedDistanceM: 1.5,
    batteryLevel: 85,
    linkQuality: 96,
    jitterMs: 2.1,
    packetLossPct: 0.1,
    bitrateKbps: 352,
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
    radarAngleDeg: 45,
    audio: {
      supportsAudio: true,
      volume: 80,
      muted: false,
      solo: false,
      routing: 'stereo',
      eq: { preset: 'flat', bassDb: 0, midDb: 0, trebleDb: 0 },
      codec,
      supportedCodecs: [codec, 'SBC'],
      intrinsicLatencyMs: intrinsicMs,
      manualOffsetMs,
      appliedDelayMs: 0,
      effectiveLatencyMs: intrinsicMs,
      clockDriftPpm: 0,
      phaseDeltaMs: 0
    },
    proximity: {
      enabled: false,
      autoConnectRssi: -62,
      autoDisconnectRssi: -88,
      autoReconnect: true
    },
    gattServices: [],
    telemetry: []
  };
}

describe('computeSyncPlan', () => {
  it('aligns heterogeneous Bluetooth codecs to zero phase difference', () => {
    const fastLeAudio = makeAudioDevice('AA:AA:AA:AA:AA:01', 'LC3', 22);
    const midAac = makeAudioDevice('AA:AA:AA:AA:AA:02', 'AAC', 148);
    const slowLdac = makeAudioDevice('AA:AA:AA:AA:AA:03', 'LDAC', 196);

    const plan = computeSyncPlan([fastLeAudio, midAac, slowLdac], {
      enabled: true,
      safetyBufferMs: 12
    });

    expect(plan.syncLocked).toBe(true);
    expect(plan.masterTargetLatencyMs).toBe(208);
    expect(plan.maxPhaseErrorMs).toBe(0);

    expect(plan.solutions['AA:AA:AA:AA:AA:01'].appliedDelayMs).toBe(186);
    expect(plan.solutions['AA:AA:AA:AA:AA:02'].appliedDelayMs).toBe(60);
    expect(plan.solutions['AA:AA:AA:AA:AA:03'].appliedDelayMs).toBe(12);

    // All three devices land on the exact same wall-clock arrival target
    expect(plan.solutions['AA:AA:AA:AA:AA:01'].effectiveLatencyMs).toBe(208);
    expect(plan.solutions['AA:AA:AA:AA:AA:02'].effectiveLatencyMs).toBe(208);
    expect(plan.solutions['AA:AA:AA:AA:AA:03'].effectiveLatencyMs).toBe(208);
  });

  it('reports real uncompensated time difference when sync is bypassed', () => {
    const fast = makeAudioDevice('AA:AA:AA:AA:AA:01', 'APTX_LL', 38);
    const slow = makeAudioDevice('AA:AA:AA:AA:AA:02', 'SBC', 186);

    const plan = computeSyncPlan([fast, slow], { enabled: false, safetyBufferMs: 10 });
    expect(plan.syncLocked).toBe(false);
    expect(plan.maxPhaseErrorMs).toBe(148);
    expect(plan.solutions['AA:AA:AA:AA:AA:01'].appliedDelayMs).toBe(0);
    expect(plan.solutions['AA:AA:AA:AA:AA:01'].phaseDeltaMs).toBe(-148);
  });

  it('incorporates user fine-trim manual offsets into delay alignment', () => {
    const d1 = makeAudioDevice('AA:AA:AA:AA:AA:01', 'AAC', 140, 15);
    const d2 = makeAudioDevice('AA:AA:AA:AA:AA:02', 'AAC', 140, -10);

    const plan = computeSyncPlan([d1, d2], { enabled: true, safetyBufferMs: 5 });
    expect(plan.masterTargetLatencyMs).toBe(160);
    expect(plan.solutions['AA:AA:AA:AA:AA:01'].appliedDelayMs).toBe(5);
    expect(plan.solutions['AA:AA:AA:AA:AA:02'].appliedDelayMs).toBe(30);
    expect(plan.syncLocked).toBe(true);
  });

  it('safely handles NaN or non-finite latency and safety buffer values without corrupting sync lock', () => {
    const d1 = makeAudioDevice('AA:AA:AA:AA:AA:01', 'LC3', Number.NaN, Number.POSITIVE_INFINITY);
    const d2 = makeAudioDevice('AA:AA:AA:AA:AA:02', 'AAC', 148, Number.NaN);

    const plan = computeSyncPlan([d1, d2], { enabled: true, safetyBufferMs: Number.NaN });
    expect(Number.isFinite(plan.masterTargetLatencyMs)).toBe(true);
    expect(Number.isFinite(plan.maxPhaseErrorMs)).toBe(true);
    expect(plan.syncLocked).toBe(true);
    expect(plan.maxPhaseErrorMs).toBe(0);
  });
});

describe('KalmanDriftEstimator', () => {
  it('converges toward true crystal clock skew despite jitter', () => {
    const estimator = new KalmanDriftEstimator();
    const trueSkewPpm = 24; // 24 microseconds per second = 0.024 ms/s
    let t = 1_000_000;
    let out = { offsetMs: 0, skewPpm: 0 };

    for (let i = 0; i < 60; i++) {
      const elapsedSec = i * 1.0;
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.25;
      const measured = elapsedSec * (trueSkewPpm * 1e-3) + jitter;
      out = estimator.update(measured, t + i * 1000);
    }

    expect(Math.abs(out.skewPpm - trueSkewPpm)).toBeLessThan(8);
  });
});

describe('computePiconetBudget & utilities', () => {
  it('flags RF airtime saturation when multiple LDAC streams run together', () => {
    const d1 = makeAudioDevice('AA:AA:AA:AA:AA:01', 'LDAC', 196);
    const d2 = makeAudioDevice('AA:AA:AA:AA:AA:02', 'LDAC', 196);
    const budget = computePiconetBudget([d1, d2]);
    expect(budget.loadPct).toBeGreaterThanOrEqual(85);
    expect(budget.warning).toContain('LDAC');
  });

  it('validates MAC addresses and estimates distance from RSSI', () => {
    expect(isValidMacAddress('7c:96:d2:4a:1b:88')).toBe(true);
    expect(isValidMacAddress('7C-96-D2-4A-1B-88')).toBe(true);
    expect(isValidMacAddress('AA:BB; rm -rf /')).toBe(false);
    expect(lookupVendor('7C:96:D2:11:22:33')).toBe('Sony Corporation');
    expect(estimateDistanceMeters(-59)).toBeCloseTo(1.0, 1);
    expect(estimateDistanceMeters(-80)).toBeGreaterThan(5);
  });
});
