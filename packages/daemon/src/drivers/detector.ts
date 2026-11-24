import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { DriverMode, PlatformKind } from '@polyblue/shared';

const execFileAsync = promisify(execFile);

export interface EnvironmentProbe {
  platform: PlatformKind;
  osRelease: string;
  detectedTools: Record<string, boolean>;
  hasPhysicalBluetooth: boolean;
  recommendedDriver: Exclude<DriverMode, 'auto'>;
  lanAddresses: string[];
  notes: string[];
}

export function getPlatformKind(): PlatformKind {
  switch (process.platform) {
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    default:
      return 'other';
  }
}

async function commandExists(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await execFileAsync(cmd, args, { timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

async function hasLinuxHciController(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('bluetoothctl', ['list'], { timeout: 2500 });
    return /Controller\s+[0-9A-F:]{17}/i.test(stdout);
  } catch {
    return false;
  }
}

async function hasWindowsBluetoothRadio(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue | Measure-Object).Count"
      ],
      { timeout: 3500 }
    );
    return Number.parseInt(stdout.trim(), 10) > 0;
  } catch {
    return false;
  }
}

async function hasMacBluetoothController(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('system_profiler', ['SPBluetoothDataType', '-json'], {
      timeout: 3500
    });
    return stdout.includes('controller_properties') || stdout.includes('device_connected');
  } catch {
    return false;
  }
}

export function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const result: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) {
        result.push(net.address);
      }
    }
  }
  return result;
}

export async function probeEnvironment(): Promise<EnvironmentProbe> {
  const platform = getPlatformKind();
  const notes: string[] = [];
  const detectedTools: Record<string, boolean> = {};
  let hasPhysicalBluetooth = false;

  if (platform === 'linux') {
    const [bluetoothctl, pactl, pwCli, busctl] = await Promise.all([
      commandExists('bluetoothctl', ['--version']),
      commandExists('pactl', ['--version']),
      commandExists('pw-cli', ['--version']),
      commandExists('busctl', ['--version'])
    ]);
    detectedTools.bluetoothctl = bluetoothctl;
    detectedTools.pactl = pactl;
    detectedTools['pw-cli'] = pwCli;
    detectedTools.busctl = busctl;

    if (bluetoothctl) {
      hasPhysicalBluetooth = await hasLinuxHciController();
    }
    if (!hasPhysicalBluetooth) {
      notes.push(
        'No active BlueZ HCI controller detected on this host. Running Virtual Radio Lab automatically; plug in a Bluetooth 5.x adapter and install bluez + pipewire-pulse for native hardware control.'
      );
    } else {
      notes.push(
        pwCli
          ? 'Detected BlueZ HCI controller with PipeWire audio routing and per-sink latency offset support.'
          : 'Detected BlueZ HCI controller with PulseAudio combined-sink routing.'
      );
    }
  } else if (platform === 'windows') {
    const powershell = await commandExists('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']);
    detectedTools.powershell = powershell;
    if (powershell) {
      hasPhysicalBluetooth = await hasWindowsBluetoothRadio();
    }
    if (!hasPhysicalBluetooth) {
      notes.push('No active Windows Bluetooth radio detected. Using Virtual Radio Lab fallback.');
    } else {
      notes.push('Detected Windows Bluetooth radio with WinRT device management and WASAPI multi-endpoint bridge.');
    }
  } else if (platform === 'macos') {
    const [sysProfiler, blueutil, swift] = await Promise.all([
      commandExists('system_profiler', ['-listDataTypes']),
      commandExists('blueutil', ['--version']),
      commandExists('swift', ['--version'])
    ]);
    detectedTools.system_profiler = sysProfiler;
    detectedTools.blueutil = blueutil;
    detectedTools.swift = swift;
    if (sysProfiler) {
      hasPhysicalBluetooth = await hasMacBluetoothController();
    }
    if (!hasPhysicalBluetooth) {
      notes.push('No active macOS Bluetooth controller detected. Using Virtual Radio Lab fallback.');
    } else {
      notes.push(
        'Detected macOS Bluetooth controller with CoreAudio Multi-Output Aggregate Device drift compensation.'
      );
    }
  } else {
    notes.push(`Platform "${process.platform}" detected; using Virtual Radio Lab with browser Web Bluetooth bridge.`);
  }

  let recommendedDriver: Exclude<DriverMode, 'auto'> = 'virtual';
  if (hasPhysicalBluetooth && (platform === 'linux' || platform === 'windows' || platform === 'macos')) {
    recommendedDriver = platform;
  }

  return {
    platform,
    osRelease: `${os.type()} ${os.release()} (${os.arch()})`,
    detectedTools,
    hasPhysicalBluetooth,
    recommendedDriver,
    lanAddresses: getLanAddresses(),
    notes
  };
}
