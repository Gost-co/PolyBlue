const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const DAEMON_PORT = process.env.POLYBLUE_PORT || '4720';
const APP_URL = process.env.POLYBLUE_UI_URL || `http://127.0.0.1:${DAEMON_PORT}`;

let mainWindow = null;
let tray = null;
let daemonProc = null;

function startEmbeddedDaemon() {
  const daemonEntry = path.resolve(__dirname, '../daemon/dist/index.js');
  daemonProc = spawn(process.execPath, [daemonEntry], {
    env: { ...process.env, POLYBLUE_HOST: '127.0.0.1', POLYBLUE_PORT: DAEMON_PORT },
    stdio: 'inherit'
  });
}

async function waitForDaemon(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}/api/health`);
      if (res.ok) return true;
    } catch {
      // Daemon still booting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#090B10',
    title: 'PolyBlue — Simultaneous Multi-Device Bluetooth & Zero-Drift Sync',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('PolyBlue Multi-Device Bluetooth');

  const menu = Menu.buildFromTemplate([
    { label: 'Open PolyBlue Studio', click: () => mainWindow?.show() },
    {
      label: 'Auto-Align Audio Sync',
      click: () => {
        void fetch(`http://127.0.0.1:${DAEMON_PORT}/api/sync/auto-align`, { method: 'POST' });
      }
    },
    { type: 'separator' },
    {
      label: 'Quit PolyBlue',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

app.whenReady().then(async () => {
  if (!process.env.POLYBLUE_UI_URL) {
    startEmbeddedDaemon();
    await waitForDaemon();
  }
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  if (daemonProc) {
    daemonProc.kill('SIGTERM');
  }
});
