import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { DriverMode, ServerEvent } from '@polyblue/shared';
import { PolyBlueEngine } from './engine/connection-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  host?: string;
  port?: number;
  dataDir?: string;
  forcedDriver?: DriverMode;
  serveUi?: boolean;
}

export interface RunningPolyBlueServer {
  engine: PolyBlueEngine;
  httpServer: http.Server;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function paramStr(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return decodeURIComponent(raw ?? '');
}

function parseDeviceIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return true;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export async function createPolyBlueServer(options?: ServerOptions): Promise<RunningPolyBlueServer> {
  const host = options?.host ?? process.env.POLYBLUE_HOST ?? '0.0.0.0';
  const port = options?.port ?? Number.parseInt(process.env.POLYBLUE_PORT ?? '4720', 10);
  const engine = new PolyBlueEngine({
    dataDir: options?.dataDir,
    port,
    forcedDriver: options?.forcedDriver
  });

  await engine.initialize();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Enforce LAN Companion Remote access setting (always permits localhost & local reverse proxies)
  app.use((req, res, next) => {
    if (!engine.getSettings().lanRemoteEnabled && !isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: 'LAN Companion Remote is disabled in PolyBlue Settings.' });
      return;
    }
    next();
  });

  // ---- Health & Snapshot ----
  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      const snap = await engine.getSnapshot();
      res.json({
        ok: true,
        driver: snap.adapter.driver,
        activeLinks: snap.adapter.activeLinks,
        syncLocked: snap.sync.syncLocked,
        uptimeSec: snap.diagnostics.uptimeSec
      });
    })
  );

  app.get(
    '/api/state',
    asyncRoute(async (_req, res) => {
      res.json(await engine.getSnapshot());
    })
  );

  // ---- Adapter Controls ----
  app.post(
    '/api/adapter/power',
    asyncRoute(async (req, res) => {
      const powered = Boolean(req.body?.powered);
      const adapter = await engine.setAdapterPower(powered);
      res.json(adapter);
    })
  );

  app.post(
    '/api/scan/start',
    asyncRoute(async (req, res) => {
      const durationMs =
        typeof req.body?.durationMs === 'number' && Number.isFinite(req.body.durationMs)
          ? req.body.durationMs
          : 8000;
      const adapter = await engine.startScan(durationMs);
      res.json(adapter);
    })
  );

  app.post(
    '/api/scan/stop',
    asyncRoute(async (_req, res) => {
      const adapter = await engine.stopScan();
      res.json(adapter);
    })
  );

  // ---- Simultaneous Multi-Device Connection Controls ----
  app.post(
    '/api/devices/connect-multi',
    asyncRoute(async (req, res) => {
      const ids = parseDeviceIdArray(req.body?.deviceIds);
      const result = await engine.connectMany(ids);
      res.json(result);
    })
  );

  app.post(
    '/api/devices/disconnect-multi',
    asyncRoute(async (req, res) => {
      const ids = parseDeviceIdArray(req.body?.deviceIds);
      await engine.disconnectMany(ids);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/devices/external',
    asyncRoute(async (req, res) => {
      const { id, name } = req.body ?? {};
      if (typeof id !== 'string' || typeof name !== 'string' || !id.trim() || !name.trim()) {
        res.status(400).json({ error: 'id and name are required' });
        return;
      }
      const device = await engine.registerExternalDevice(req.body);
      res.status(201).json(device);
    })
  );

  app.post(
    '/api/devices/:id/connect',
    asyncRoute(async (req, res) => {
      const id = paramStr(req.params.id);
      const result = await engine.connectMany([id]);
      if (result.failed.length > 0) {
        res.status(400).json({ error: result.failed[0].error });
        return;
      }
      res.json(result);
    })
  );

  app.post(
    '/api/devices/:id/disconnect',
    asyncRoute(async (req, res) => {
      const id = paramStr(req.params.id);
      await engine.disconnectMany([id]);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/devices/:id/pair',
    asyncRoute(async (req, res) => {
      const id = paramStr(req.params.id);
      const dev = await engine.pairDevice(id);
      res.json(dev);
    })
  );

  app.delete(
    '/api/devices/:id',
    asyncRoute(async (req, res) => {
      const id = paramStr(req.params.id);
      await engine.removeDevice(id);
      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/devices/:id',
    asyncRoute(async (req, res) => {
      const id = paramStr(req.params.id);
      const updated = await engine.updateDeviceAudio(id, req.body ?? {});
      res.json(updated);
    })
  );

  // ---- Zero-Drift Audio Sync Controls ----
  app.patch(
    '/api/sync',
    asyncRoute(async (req, res) => {
      const sync = await engine.updateSyncConfig(req.body ?? {});
      res.json(sync);
    })
  );

  app.post(
    '/api/sync/auto-align',
    asyncRoute(async (_req, res) => {
      const sync = await engine.autoAlignAll();
      res.json(sync);
    })
  );

  // ---- Device Groups ("Scenes") ----
  app.post(
    '/api/groups',
    asyncRoute(async (req, res) => {
      const { name, description, accent, members } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim() || !Array.isArray(members) || members.length === 0) {
        res.status(400).json({ error: 'name and non-empty members array are required' });
        return;
      }
      const created = engine.createGroup({
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        accent: ['cyan', 'emerald', 'violet', 'amber', 'rose'].includes(accent) ? accent : 'cyan',
        members
      });
      res.status(201).json(created);
    })
  );

  app.post(
    '/api/groups/:id/activate',
    asyncRoute(async (req, res) => {
      const exclusive = Boolean(req.body?.exclusive);
      const group = await engine.activateGroup(paramStr(req.params.id), exclusive);
      res.json(group);
    })
  );

  app.delete(
    '/api/groups/:id',
    asyncRoute(async (req, res) => {
      engine.deleteGroup(paramStr(req.params.id));
      res.json({ ok: true });
    })
  );

  // ---- Settings & Config Export/Import ----
  app.patch(
    '/api/settings',
    asyncRoute(async (req, res) => {
      const settings = await engine.updateSettings(req.body ?? {});
      res.json(settings);
    })
  );

  app.get('/api/config/export', (_req, res) => {
    res.json(engine.exportConfig());
  });

  app.post(
    '/api/config/import',
    asyncRoute(async (req, res) => {
      const snap = await engine.importConfig(req.body ?? {});
      res.json(snap);
    })
  );

  app.post(
    '/api/config/reset',
    asyncRoute(async (_req, res) => {
      const snap = await engine.resetToDefaults();
      res.json(snap);
    })
  );

  // ---- Production UI Static Serving ----
  if (options?.serveUi !== false) {
    const uiDist = path.resolve(__dirname, '../../ui/dist');
    if (fs.existsSync(uiDist)) {
      app.use(express.static(uiDist));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
          next();
          return;
        }
        res.sendFile(path.join(uiDist, 'index.html'));
      });
    }
  }

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message || 'Internal daemon error' });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (socket: WebSocket, req) => {
    if (!engine.getSettings().lanRemoteEnabled && !isLoopbackAddress(req.socket.remoteAddress)) {
      socket.close(1008, 'LAN Companion Remote disabled');
      return;
    }
    try {
      const snapshot = await engine.getSnapshot();
      const event: ServerEvent = { type: 'snapshot', payload: snapshot };
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    } catch {
      // Ignore closed socket
    }
  });

  const onEngineEvent = (event: ServerEvent) => {
    const serialized = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };
  engine.on('event', onEngineEvent);

  const boundPort = await new Promise<number>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      const addr = httpServer.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });

  return {
    engine,
    httpServer,
    wss,
    port: boundPort,
    close: async () => {
      engine.off('event', onEngineEvent);
      await engine.shutdown();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };
}
