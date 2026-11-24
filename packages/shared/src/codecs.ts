import type { AudioCodecId } from './types.js';

export interface CodecSpec {
  id: AudioCodecId;
  label: string;
  family: 'LE Audio' | 'Qualcomm' | 'Sony' | 'Bluetooth SIG' | 'Apple/AAC';
  baseLatencyMs: number;
  typicalJitterMs: number;
  bitrateKbps: number;
  sampleRateHz: number;
  airtimeWeight: number; // Percentage of a standard 2.1 Mbps EDR piconet slot budget
  description: string;
}

export const CODEC_SPECS: Record<AudioCodecId, CodecSpec> = {
  LC3: {
    id: 'LC3',
    label: 'LC3 (LE Audio)',
    family: 'LE Audio',
    baseLatencyMs: 22,
    typicalJitterMs: 1.4,
    bitrateKbps: 192,
    sampleRateHz: 48000,
    airtimeWeight: 10,
    description: 'Isochronous LE Audio codec with ultra-low latency and multi-stream broadcast support.'
  },
  APTX_LL: {
    id: 'APTX_LL',
    label: 'aptX Low Latency',
    family: 'Qualcomm',
    baseLatencyMs: 38,
    typicalJitterMs: 2.0,
    bitrateKbps: 352,
    sampleRateHz: 48000,
    airtimeWeight: 18,
    description: 'Low-latency A2DP transport optimized for lip-sync video and real-time audio.'
  },
  APTX_ADAPTIVE: {
    id: 'APTX_ADAPTIVE',
    label: 'aptX Adaptive',
    family: 'Qualcomm',
    baseLatencyMs: 68,
    typicalJitterMs: 2.8,
    bitrateKbps: 420,
    sampleRateHz: 96000,
    airtimeWeight: 22,
    description: 'Dynamically scales bitrate and buffer depth based on RF link conditions.'
  },
  APTX: {
    id: 'APTX',
    label: 'aptX Classic',
    family: 'Qualcomm',
    baseLatencyMs: 128,
    typicalJitterMs: 3.5,
    bitrateKbps: 352,
    sampleRateHz: 48000,
    airtimeWeight: 19,
    description: 'Fixed-ratio ADPCM codec with reliable multi-link compatibility.'
  },
  APTX_HD: {
    id: 'APTX_HD',
    label: 'aptX HD',
    family: 'Qualcomm',
    baseLatencyMs: 162,
    typicalJitterMs: 4.1,
    bitrateKbps: 576,
    sampleRateHz: 48000,
    airtimeWeight: 31,
    description: '24-bit high-definition A2DP stream for critical listening.'
  },
  AAC: {
    id: 'AAC',
    label: 'AAC',
    family: 'Apple/AAC',
    baseLatencyMs: 148,
    typicalJitterMs: 3.8,
    bitrateKbps: 256,
    sampleRateHz: 44100,
    airtimeWeight: 15,
    description: 'Efficient psychoacoustic codec widely supported on macOS, iOS, and modern headsets.'
  },
  SBC: {
    id: 'SBC',
    label: 'SBC',
    family: 'Bluetooth SIG',
    baseLatencyMs: 186,
    typicalJitterMs: 5.2,
    bitrateKbps: 328,
    sampleRateHz: 44100,
    airtimeWeight: 18,
    description: 'Universal mandatory A2DP codec supported by virtually all Bluetooth audio sinks.'
  },
  LDAC: {
    id: 'LDAC',
    label: 'LDAC',
    family: 'Sony',
    baseLatencyMs: 196,
    typicalJitterMs: 4.6,
    bitrateKbps: 990,
    sampleRateHz: 96000,
    airtimeWeight: 48,
    description: 'High-resolution 990 kbps stream; uses substantial shared radio airtime in multi-link mode.'
  },
  MSBC: {
    id: 'MSBC',
    label: 'mSBC (Hands-Free)',
    family: 'Bluetooth SIG',
    baseLatencyMs: 52,
    typicalJitterMs: 2.5,
    bitrateKbps: 64,
    sampleRateHz: 16000,
    airtimeWeight: 8,
    description: 'Wideband voice codec for bidirectional HFP headset communication.'
  }
};

export function getCodecSpec(codec: AudioCodecId): CodecSpec {
  return CODEC_SPECS[codec] ?? CODEC_SPECS.SBC;
}

export const EQ_PRESETS = {
  flat: { label: 'Flat Reference', bassDb: 0, midDb: 0, trebleDb: 0 },
  bass_boost: { label: 'Deep Bass', bassDb: 6, midDb: -1, trebleDb: 2 },
  vocal: { label: 'Vocal Clarity', bassDb: -2, midDb: 4.5, trebleDb: 2.5 },
  studio: { label: 'Studio Monitor', bassDb: 1, midDb: 0.5, trebleDb: 1.5 },
  night: { label: 'Late Night', bassDb: -4, midDb: 2, trebleDb: -2 }
} as const;
