#!/usr/bin/env node
import type { PolyBlueSnapshot } from '@polyblue/shared';

const BASE_URL = (process.env.POLYBLUE_URL ?? 'http://127.0.0.1:4720').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width - 1) + ' ' : str.padEnd(width, ' ');
}

function printHelp(): void {
  console.log(`PolyBlue CLI — Simultaneous Multi-Device Bluetooth & Zero-Drift Sync Engine

Usage:
  polyblue status                        Show adapter, sync lock, and device table
  polyblue scan [seconds]                Scan for nearby Bluetooth Classic, BLE & LE Audio devices
  polyblue connect <mac1> [mac2 ...]     Connect multiple Bluetooth devices in parallel
  polyblue disconnect <mac1> [mac2 ...]  Disconnect one or more devices
  polyblue sync align                    Auto-align all active audio outputs to 0.0 ms delta
  polyblue sync offset <mac> <ms>        Set fine latency offset (-250 to +250 ms)
  polyblue group list                    List saved multi-device scenes
  polyblue group run <group-id>          Launch all devices in a group simultaneously
  polyblue doctor                        Display OS stack diagnostics & LAN remote URLs

Environment:
  POLYBLUE_URL   Daemon endpoint (default: http://127.0.0.1:4720)
`);
}

async function cmdStatus(): Promise<void> {
  const snap = await request<PolyBlueSnapshot>('/api/state');
  console.log(`\nAdapter : ${snap.adapter.name} (${snap.adapter.address})`);
  console.log(`Driver  : ${snap.adapter.driver.toUpperCase()} — ${snap.adapter.audioBackend}`);
  console.log(
    `Links   : ${snap.adapter.activeLinks}/${snap.adapter.maxSimultaneousLinks} active  |  Piconet Load: ${snap.adapter.piconetLoadPct}% (${snap.adapter.totalBitrateKbps} kbps)`
  );
  console.log(
    `Sync    : ${snap.sync.syncLocked ? 'LOCKED' : 'DRIFT'}  |  Master Target: ${snap.sync.masterTargetLatencyMs} ms  |  Max Delta: ${snap.sync.maxPhaseErrorMs} ms\n`
  );

  console.log(
    pad('STATUS', 12) +
      pad('ADDRESS', 19) +
      pad('NAME', 26) +
      pad('CODEC', 14) +
      pad('DELAY', 10) +
      pad('RSSI', 9) +
      'BATTERY'
  );
  console.log('-'.repeat(98));
  for (const d of snap.devices) {
    const status = d.connected ? 'CONNECTED' : d.paired ? 'PAIRED' : 'NEARBY';
    const codec = d.audio.supportsAudio ? d.audio.codec : d.transport.toUpperCase();
    const delayStr = d.connected && d.audio.supportsAudio ? `+${d.audio.appliedDelayMs}ms` : '-';
    const batt = d.batteryLevel !== null ? `${d.batteryLevel}%` : '-';
    console.log(
      pad(status, 12) +
        pad(d.address, 19) +
        pad(d.name, 26) +
        pad(codec, 14) +
        pad(delayStr, 10) +
        pad(`${d.rssi}dBm`, 9) +
        batt
    );
  }
  console.log('');
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp();
    return;
  }

  switch (cmd) {
    case 'status':
      await cmdStatus();
      break;

    case 'scan': {
      const parsed = args[0] !== undefined ? Number.parseInt(args[0], 10) : 8;
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
        throw new Error('Scan duration must be a number between 1 and 30 seconds.');
      }
      await request('/api/scan/start', { method: 'POST', body: JSON.stringify({ durationMs: parsed * 1000 }) });
      console.log(`Scanning for ${parsed}s...`);
      await new Promise((r) => setTimeout(r, Math.min(parsed, 4) * 1000));
      await cmdStatus();
      break;
    }

    case 'connect': {
      if (args.length === 0) throw new Error('Specify at least one device MAC address.');
      const result = await request<{ connected: string[]; failed: Array<{ id: string; error: string }> }>(
        '/api/devices/connect-multi',
        { method: 'POST', body: JSON.stringify({ deviceIds: args }) }
      );
      console.log(`Connected (${result.connected.length}): ${result.connected.join(', ') || 'none'}`);
      if (result.failed.length > 0) {
        console.error('Failed:', result.failed);
      }
      await cmdStatus();
      break;
    }

    case 'disconnect': {
      if (args.length === 0) throw new Error('Specify at least one device MAC address.');
      await request('/api/devices/disconnect-multi', {
        method: 'POST',
        body: JSON.stringify({ deviceIds: args })
      });
      console.log(`Disconnected: ${args.join(', ')}`);
      break;
    }

    case 'sync': {
      const sub = args[0];
      if (sub === 'align') {
        const sync = await request<{ masterTargetLatencyMs: number; maxPhaseErrorMs: number }>(
          '/api/sync/auto-align',
          { method: 'POST' }
        );
        console.log(`Sync locked at ${sync.masterTargetLatencyMs} ms target (max phase error: ${sync.maxPhaseErrorMs} ms).`);
      } else if (sub === 'offset' && args[1] && args[2] !== undefined) {
        const ms = Number.parseFloat(args[2]);
        if (!Number.isFinite(ms) || ms < -250 || ms > 250) {
          throw new Error('Offset must be a finite number between -250 and +250 ms.');
        }
        await request(`/api/devices/${encodeURIComponent(args[1])}`, {
          method: 'PATCH',
          body: JSON.stringify({ manualOffsetMs: ms })
        });
        console.log(`Updated ${args[1]} manual latency offset to ${ms} ms.`);
      } else {
        printHelp();
      }
      break;
    }

    case 'group': {
      const sub = args[0];
      if (sub === 'list') {
        const snap = await request<PolyBlueSnapshot>('/api/state');
        for (const g of snap.groups) {
          console.log(`${pad(g.id, 20)} ${pad(g.name, 26)} (${g.members.length} devices) — ${g.description}`);
        }
      } else if (sub === 'run' && args[1]) {
        await request(`/api/groups/${encodeURIComponent(args[1])}/activate`, {
          method: 'POST',
          body: JSON.stringify({ exclusive: args.includes('--exclusive') })
        });
        console.log(`Activated group ${args[1]}.`);
        await cmdStatus();
      } else {
        printHelp();
      }
      break;
    }

    case 'doctor': {
      const snap = await request<PolyBlueSnapshot>('/api/state');
      console.log('Platform :', snap.diagnostics.platform, snap.diagnostics.osRelease);
      console.log('Node     :', snap.diagnostics.nodeVersion);
      console.log('Tools    :', snap.diagnostics.detectedTools);
      console.log('LAN URLs :', snap.diagnostics.lanAddresses.map((ip) => `http://${ip}:${snap.diagnostics.port}`));
      console.log('Notes    :');
      for (const note of snap.diagnostics.driverNotes) {
        console.log('  -', note);
      }
      break;
    }

    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error(`[polyblue-cli] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
