import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { PolyBlueSnapshot, ServerEvent } from '@polyblue/shared';
import { createPolyBlueServer, type RunningPolyBlueServer } from '../server.js';

describe('PolyBlue Daemon & Multi-Device Sync Integration', () => {
  let server: RunningPolyBlueServer;
  let tempDir: string;
  let baseUrl: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyblue-test-'));
    server = await createPolyBlueServer({
      host: '127.0.0.1',
      port: 0,
      dataDir: tempDir,
      forcedDriver: 'virtual',
      serveUi: false
    });
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('connects multiple Bluetooth devices simultaneously and locks all audio outputs to 0ms phase delta', async () => {
    const initialRes = await fetch(`${baseUrl}/api/state`);
    const initial = (await initialRes.json()) as PolyBlueSnapshot;
    expect(initial.devices.length).toBeGreaterThanOrEqual(8);

    // Connect 3 additional devices in parallel (Speaker + Headphones + Mouse)
    const connectRes = await fetch(`${baseUrl}/api/devices/connect-multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceIds: ['58:FC:C6:81:F0:2A', '2C:41:A1:67:C4:09', 'D0:8A:55:77:8E:3C']
      })
    });
    expect(connectRes.status).toBe(200);
    const connectBody = (await connectRes.json()) as { connected: string[]; failed: unknown[] };
    expect(connectBody.connected).toHaveLength(3);
    expect(connectBody.failed).toHaveLength(0);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const snap = (await stateRes.json()) as PolyBlueSnapshot;

    const activeAudio = snap.devices.filter((d) => d.connected && d.audio.supportsAudio);
    expect(activeAudio.length).toBe(4);
    expect(snap.sync.syncLocked).toBe(true);
    expect(snap.sync.maxPhaseErrorMs).toBe(0);

    const targets = new Set(activeAudio.map((d) => d.audio.effectiveLatencyMs));
    expect(targets.size).toBe(1);
    expect(Array.from(targets)[0]).toBe(snap.sync.masterTargetLatencyMs);
  });

  it('activates a multi-device Split Stereo Speakers scene with Left/Right routing', async () => {
    const activateRes = await fetch(`${baseUrl}/api/groups/grp-party-stereo/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exclusive: true })
    });
    expect(activateRes.status).toBe(200);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const snap = (await stateRes.json()) as PolyBlueSnapshot;

    const jbl = snap.devices.find((d) => d.id === '58:FC:C6:81:F0:2A');
    const soundcore = snap.devices.find((d) => d.id === 'E8:AB:FA:55:19:7D');

    expect(jbl?.connected).toBe(true);
    expect(jbl?.audio.routing).toBe('left');
    expect(soundcore?.connected).toBe(true);
    expect(soundcore?.audio.routing).toBe('right');
    expect(snap.sync.syncLocked).toBe(true);
  });

  it('supports live codec switching, manual sync offset, alias reset, and auto-align', async () => {
    const mac = encodeURIComponent('7C:96:D2:4A:1B:88');
    const patchRes = await fetch(`${baseUrl}/api/devices/${mac}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codec: 'AAC', manualOffsetMs: 18, routing: 'mono', alias: 'Studio Cans' })
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.audio.codec).toBe('AAC');
    expect(updated.audio.manualOffsetMs).toBe(18);
    expect(updated.audio.routing).toBe('mono');
    expect(updated.alias).toBe('Studio Cans');

    // Clear custom alias via null
    const clearRes = await fetch(`${baseUrl}/api/devices/${mac}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: null })
    });
    const cleared = await clearRes.json();
    expect(cleared.alias).toBeUndefined();

    const alignRes = await fetch(`${baseUrl}/api/sync/auto-align`, { method: 'POST' });
    expect(alignRes.status).toBe(200);
    const sync = await alignRes.json();
    expect(sync.syncLocked).toBe(true);
    expect(sync.maxPhaseErrorMs).toBe(0);
  });

  it('persists linked master volume from 0% recovery and ignores NaN numeric payloads', async () => {
    // Drop master volume to 0%, then bring back up to 50%
    await fetch(`${baseUrl}/api/sync`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterVolume: 0, linkedVolume: true })
    });
    await fetch(`${baseUrl}/api/sync`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterVolume: 50, linkedVolume: true })
    });

    const snapRes = await fetch(`${baseUrl}/api/state`);
    const snap = (await snapRes.json()) as PolyBlueSnapshot;
    const sony = snap.devices.find((d) => d.id === '7C:96:D2:4A:1B:88');
    expect(sony?.audio.volume).toBeGreaterThan(0);

    // Send malformed string/null numeric fields — must not corrupt sync state into NaN
    await fetch(`${baseUrl}/api/devices/${encodeURIComponent('7C:96:D2:4A:1B:88')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: 'not-a-number', manualOffsetMs: null })
    });
    const afterBadRes = await fetch(`${baseUrl}/api/state`);
    const afterBad = (await afterBadRes.json()) as PolyBlueSnapshot;
    expect(Number.isFinite(afterBad.sync.masterTargetLatencyMs)).toBe(true);
    expect(afterBad.sync.syncLocked).toBe(true);
  });

  it('registers, disconnects, reconnects, and removes non-MAC Web Bluetooth external devices', async () => {
    const extId = 'WEBBT:custom-sensor-99';
    const regRes = await fetch(`${baseUrl}/api/devices/external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: extId, name: 'Custom BLE Sensor', batteryLevel: 91 })
    });
    expect(regRes.status).toBe(201);

    const discRes = await fetch(`${baseUrl}/api/devices/${encodeURIComponent(extId)}/disconnect`, {
      method: 'POST'
    });
    expect(discRes.status).toBe(200);

    const reconnRes = await fetch(`${baseUrl}/api/devices/${encodeURIComponent(extId)}/connect`, {
      method: 'POST'
    });
    expect(reconnRes.status).toBe(200);

    const delRes = await fetch(`${baseUrl}/api/devices/${encodeURIComponent(extId)}`, {
      method: 'DELETE'
    });
    expect(delRes.status).toBe(200);
  });

  it('immediately broadcasts updated sync delays to sibling audio devices over WebSocket', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const receivedIds = new Set<string>();

    await new Promise<void>((resolve, reject) => {
      ws.once('error', reject);
      ws.on('message', (raw) => {
        const evt = JSON.parse(raw.toString()) as ServerEvent;
        if (evt.type === 'snapshot') {
          resolve();
        } else if (evt.type === 'device:updated') {
          receivedIds.add(evt.payload.id);
        }
      });
    });

    // Shift Sony XM5 manual offset by +25ms — AirPods Pro 2 delay must also broadcast immediately
    await fetch(`${baseUrl}/api/devices/${encodeURIComponent('7C:96:D2:4A:1B:88')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualOffsetMs: 25 })
    });

    await new Promise((r) => setTimeout(r, 80));
    ws.close();

    expect(receivedIds.has('7C:96:D2:4A:1B:88')).toBe(true);
    expect(receivedIds.has('40:98:AD:9E:33:12')).toBe(true);
  });
});
