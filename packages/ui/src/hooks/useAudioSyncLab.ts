import { useCallback, useEffect, useRef, useState } from 'react';
import type { BluetoothDevice } from '@polyblue/shared';

export type TestSourceMode = 'pulse' | 'groove' | 'file';

interface DeviceChain {
  delay: DelayNode;
  bass: BiquadFilterNode;
  mid: BiquadFilterNode;
  treble: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
}

/**
 * Live Web Audio API multi-stream delay-compensation & acoustic calibration engine.
 * Models each connected Bluetooth audio device as a parallel signal chain with its exact
 * hardware latency + PolyBlue applied delay buffer, EQ, stereo split, and volume.
 * Toggling Sync ON vs OFF lets you physically HEAR phase lock vs multi-headset echo.
 */
export function useAudioSyncLab(devices: BluetoothDevice[], syncEnabled: boolean) {
  const [playing, setPlaying] = useState(false);
  const [sourceMode, setSourceMode] = useState<TestSourceMode>('pulse');
  const [customTrackName, setCustomTrackName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [bpm, setBpmState] = useState(116);

  const ctxRef = useRef<AudioContext | null>(null);
  const busRef = useRef<GainNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const chainsRef = useRef<Map<string, DeviceChain>>(new Map());
  const timerRef = useRef<number | null>(null);
  const fileBufferRef = useRef<AudioBuffer | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const stepRef = useRef(0);
  const latestDevicesRef = useRef(devices);
  const latestSyncRef = useRef(syncEnabled);

  latestDevicesRef.current = devices;
  latestSyncRef.current = syncEnabled;

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const bus = ctx.createGain();
      bus.gain.value = 0.85;
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      busRef.current = bus;
      masterRef.current = master;
    }
    return ctxRef.current;
  }, []);

  const reconcileChains = useCallback((currentDevices: BluetoothDevice[], currentSync: boolean) => {
    const ctx = ctxRef.current;
    const bus = busRef.current;
    const master = masterRef.current;
    if (!ctx || !bus || !master) return;

    const activeAudio = currentDevices.filter((d) => d.connected && d.audio.supportsAudio);
    const activeIds = new Set(activeAudio.map((d) => d.id));
    const hasSolo = activeAudio.some((d) => d.audio.solo);

    // Tear down disconnected chains
    for (const [id, chain] of chainsRef.current.entries()) {
      if (!activeIds.has(id)) {
        try {
          bus.disconnect(chain.delay);
          chain.gain.disconnect();
        } catch {
          // Ignore already disconnected nodes
        }
        chainsRef.current.delete(id);
      }
    }

    const scale = activeAudio.length > 0 ? 1 / Math.sqrt(activeAudio.length) : 1;
    const now = ctx.currentTime;

    for (const dev of activeAudio) {
      let chain = chainsRef.current.get(dev.id);
      if (!chain) {
        const delay = ctx.createDelay(1.0);
        const bass = ctx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 110;
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 1.1;
        const treble = ctx.createBiquadFilter();
        treble.type = 'highshelf';
        treble.frequency.value = 7500;
        const panner = ctx.createStereoPanner();
        const gain = ctx.createGain();

        bus.connect(delay);
        delay.connect(bass);
        bass.connect(mid);
        mid.connect(treble);
        treble.connect(panner);
        panner.connect(gain);
        gain.connect(master);

        chain = { delay, bass, mid, treble, panner, gain };
        chainsRef.current.set(dev.id, chain);
      }

      const totalMs = Math.max(
        5,
        Math.min(
          900,
          dev.audio.intrinsicLatencyMs + (currentSync ? dev.audio.appliedDelayMs : 0) + dev.audio.manualOffsetMs
        )
      );
      chain.delay.delayTime.setTargetAtTime(totalMs / 1000, now, 0.02);

      chain.bass.gain.setTargetAtTime(
        dev.audio.routing === 'subwoofer' ? dev.audio.eq.bassDb + 6 : dev.audio.eq.bassDb,
        now,
        0.03
      );
      chain.mid.gain.setTargetAtTime(dev.audio.eq.midDb, now, 0.03);
      chain.treble.gain.setTargetAtTime(
        dev.audio.routing === 'subwoofer' ? -12 : dev.audio.eq.trebleDb,
        now,
        0.03
      );

      const pan = dev.audio.routing === 'left' ? -0.9 : dev.audio.routing === 'right' ? 0.9 : 0;
      chain.panner.pan.setTargetAtTime(pan, now, 0.02);

      const audible = !dev.audio.muted && (!hasSolo || dev.audio.solo);
      const targetGain = audible ? (dev.audio.volume / 100) * scale : 0;
      chain.gain.gain.setTargetAtTime(targetGain, now, 0.02);
    }
  }, []);

  useEffect(() => {
    reconcileChains(devices, syncEnabled);
  }, [devices, syncEnabled, playing, reconcileChains]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (fileSourceRef.current) {
      try {
        fileSourceRef.current.stop();
        fileSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      fileSourceRef.current = null;
    }
    setPlaying(false);
  }, []);

  const triggerStep = useCallback((mode: TestSourceMode) => {
    const ctx = ctxRef.current;
    const bus = busRef.current;
    if (!ctx || !bus) return;

    const now = ctx.currentTime;
    const step = stepRef.current++;

    if (mode === 'pulse') {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(step % 4 === 0 ? 1480 : 940, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.038);

      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.75, now + 0.002);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

      osc.connect(env);
      env.connect(bus);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (mode === 'groove') {
      const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23];
      const freq = notes[step % notes.length];
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.22);

      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.28, now + 0.008);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(filter);
      filter.connect(env);
      env.connect(bus);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  }, []);

  const start = useCallback(
    async (modeOverride?: TestSourceMode, bpmOverride?: number) => {
      stop();
      const mode = modeOverride ?? sourceMode;
      const tempo = bpmOverride ?? bpm;
      const ctx = ensureContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Build and wire per-device chains synchronously BEFORE firing the very first beat
      reconcileChains(latestDevicesRef.current, latestSyncRef.current);
      stepRef.current = 0;

      if (mode === 'file' && fileBufferRef.current && busRef.current) {
        const src = ctx.createBufferSource();
        src.buffer = fileBufferRef.current;
        src.loop = true;
        src.connect(busRef.current);
        src.start();
        fileSourceRef.current = src;
        setPlaying(true);
        return;
      }

      const activeMode = mode === 'file' ? 'pulse' : mode;
      const intervalMs = Math.round((60_000 / tempo) / (activeMode === 'groove' ? 2 : 1));
      setPlaying(true);
      triggerStep(activeMode);
      timerRef.current = window.setInterval(() => triggerStep(activeMode), intervalMs);
    },
    [bpm, ensureContext, reconcileChains, sourceMode, stop, triggerStep]
  );

  const loadAudioFile = useCallback(
    async (file: File) => {
      setFileError(null);
      try {
        const ctx = ensureContext();
        const arrayBuf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        fileBufferRef.current = decoded;
        setCustomTrackName(file.name);
        setSourceMode('file');
        if (playing) {
          await start('file');
        }
      } catch {
        setFileError(`Could not decode "${file.name}". Please choose a standard MP3, WAV, or OGG audio file.`);
      }
    },
    [ensureContext, playing, start]
  );

  useEffect(() => {
    return () => {
      stop();
      void ctxRef.current?.close();
    };
  }, [stop]);

  return {
    playing,
    sourceMode,
    setSourceMode: (mode: TestSourceMode) => {
      setSourceMode(mode);
      if (playing) void start(mode);
    },
    bpm,
    setBpm: (next: number) => {
      const clamped = Math.max(60, Math.min(200, Math.round(next)));
      setBpmState(clamped);
      if (playing && sourceMode !== 'file') {
        void start(sourceMode, clamped);
      }
    },
    customTrackName,
    fileError,
    loadAudioFile,
    start,
    stop,
    toggle: () => {
      if (playing) stop();
      else void start();
    }
  };
}
