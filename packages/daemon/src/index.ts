import { createPolyBlueServer } from './server.js';

async function main() {
  const host = process.env.POLYBLUE_HOST ?? '0.0.0.0';
  const port = Number.parseInt(process.env.POLYBLUE_PORT ?? '4720', 10);

  const server = await createPolyBlueServer({ host, port });
  const snap = await server.engine.getSnapshot();

  console.log(`[polyblue] daemon listening on http://${host}:${server.port}`);
  console.log(`[polyblue] driver=${snap.adapter.driver} backend="${snap.adapter.audioBackend}"`);
  console.log(`[polyblue] active_links=${snap.adapter.activeLinks} sync_locked=${snap.sync.syncLocked}`);

  const shutdown = async () => {
    console.log('\n[polyblue] shutting down daemon...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[polyblue] failed to start daemon:', err);
  process.exit(1);
});
