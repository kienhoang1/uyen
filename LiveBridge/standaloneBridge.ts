import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createLiveBridgeRuntime } from './runtime.js';

/**
 * Headless Standalone LiveBridge Launcher (when running without server.ts).
 * Uses the EXACT SAME LiveBridgeRuntime / MatchEngine / ArenaDatabase implementation.
 * Note: Do NOT launch alongside server.ts if UNITY_WS_PORT=8080 is already bound by server.ts.
 */
const PORT = Number(process.env.LIVEBRIDGE_PORT || 8080);

const runtime = createLiveBridgeRuntime();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        mode: runtime.getActiveMode(),
        db: runtime.db.verifyIntegrity(),
      })
    );
    return;
  }
  if (req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runtime.engine.getSnapshot()));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/ws' });
runtime.attachWebSocketServer(wss);
runtime.startLoop();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[LiveBridge Headless] Listening on ws://0.0.0.0:${PORT}/ws`);
});
