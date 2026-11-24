import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateStore } from './store.js';

describe('StateStore profile sanitization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyblue-store-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sanitizes malformed persisted state on load instead of crashing the daemon', () => {
    fs.writeFileSync(
      path.join(tempDir, 'state.json'),
      JSON.stringify({
        version: 1,
        settings: { driverMode: 'not-a-driver', staggerPagingMs: 99999, watchdogIntervalMs: 50 },
        syncOptions: { safetyBufferMs: -50, masterVolume: 500, linkedVolume: 'yes' },
        groups: [
          null,
          {
            id: 'grp-ok',
            name: '  Good Scene  ',
            accent: 'not-a-color',
            members: [
              null,
              { deviceId: 'AA:BB:CC:DD:EE:FF', volume: 999, routing: 'not-a-routing', manualOffsetMs: 999 }
            ]
          }
        ],
        devicePrefs: {
          'AA:BB:CC:DD:EE:FF': { volume: 999, favorite: 'yes' },
          'not-an-object': 'nope'
        },
        lastConnectedIds: ['AA:BB:CC:DD:EE:FF', 42, '']
      })
    );

    const store = new StateStore(tempDir);
    const state = store.get();

    expect(state.settings.driverMode).toBe('auto');
    expect(state.settings.staggerPagingMs).toBe(600);
    expect(state.settings.watchdogIntervalMs).toBe(1000);
    expect(state.syncOptions.safetyBufferMs).toBe(0);
    expect(state.syncOptions.masterVolume).toBe(100);
    expect(state.syncOptions.linkedVolume).toBe(true);

    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toMatchObject({ id: 'grp-ok', name: 'Good Scene', accent: 'cyan' });
    expect(state.groups[0].members).toHaveLength(1);
    expect(state.groups[0].members[0]).toMatchObject({
      deviceId: 'AA:BB:CC:DD:EE:FF',
      volume: 100,
      routing: 'stereo',
      manualOffsetMs: 250
    });

    expect(state.devicePrefs['AA:BB:CC:DD:EE:FF']).toEqual({ volume: 100 });
    expect(state.devicePrefs['not-an-object']).toBeUndefined();
    expect(state.lastConnectedIds).toEqual(['AA:BB:CC:DD:EE:FF']);
  });

  it('keeps valid persisted scenes untouched', () => {
    const group = {
      id: 'grp-valid',
      name: 'Valid Scene',
      description: 'desc',
      accent: 'emerald',
      members: [
        {
          deviceId: 'AA:BB:CC:DD:EE:FF',
          volume: 55,
          routing: 'left',
          manualOffsetMs: 12.5,
          codec: 'AAC',
          eq: { preset: 'custom', bassDb: 3, midDb: -2, trebleDb: 1 }
        }
      ],
      createdAt: 1700000000000,
      lastActivatedAt: 1700000001000
    };

    fs.writeFileSync(
      path.join(tempDir, 'state.json'),
      JSON.stringify({ version: 1, groups: [group] })
    );

    const state = new StateStore(tempDir).get();
    expect(state.groups).toEqual([group]);
  });
});
