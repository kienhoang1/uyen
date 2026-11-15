import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createLiveBridgeRuntime } from './LiveBridge/runtime.js';
import type {
  AllSettings,
  ConnectionMode,
  GiftRule,
  TeamId,
} from './src/shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const runtime = createLiveBridgeRuntime();
  const { db, simAdapter, liveAdapter, engine, broadcast } = runtime;

  const wss = new WebSocketServer({ noServer: true });
  runtime.attachWebSocketServer(wss);
  runtime.startLoop();

  const UNITY_MIRROR_PORT = Number(process.env.UNITY_WS_PORT || 8080);
  if (UNITY_MIRROR_PORT > 0 && process.env.DISABLE_UNITY_MIRROR_PORT !== '1') {
    const mirrorServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, unifiedWithPort: Number(process.env.PORT || 3000) }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const mirrorWss = new WebSocketServer({ noServer: true });
    runtime.attachWebSocketServer(mirrorWss);
    mirrorServer.on('upgrade', (request, socket, head) => {
      const urlPath = request.url?.split('?')[0];
      if (urlPath === '/ws') {
        mirrorWss.handleUpgrade(request, socket, head, (ws) => {
          mirrorWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    mirrorWss.on('error', (err) => {
      db.log('WARN', 'LiveBridge', `Mirror WS error: ${err.message}`);
    });
    mirrorServer.on('error', (err) => {
      db.log('WARN', 'LiveBridge', `Optional mirror WS port ${UNITY_MIRROR_PORT} unavailable: ${err.message}`);
    });
    mirrorServer.listen(UNITY_MIRROR_PORT, '0.0.0.0', () => {
      console.log(`[LiveArena] Unity WS mirror attached to SAME MatchEngine on ws://0.0.0.0:${UNITY_MIRROR_PORT}/ws`);
    });
  }

  // --- REST API Routes ---
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'ClassicPush',
      dbIntegrity: db.verifyIntegrity(),
      connection: runtime.getConnectionInfo(),
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      snapshot: engine.getSnapshot(),
      connection: runtime.getConnectionInfo(),
      settings: db.getAllSettings(),
      giftRules: db.getGiftRules(),
      metrics: engine.getPerformanceMetrics(runtime.getTotalWsClients(), runtime.getWsLatencyMs()),
    });
  });

  // Match controls
  app.post('/api/match/start', (_req, res) => {
    engine.startMatch(true);
    const snap = engine.getSnapshot();
    broadcast('match_snapshot', snap);
    res.json(snap);
  });

  app.post('/api/match/pause', (_req, res) => {
    engine.pauseMatch();
    const snap = engine.getSnapshot();
    broadcast('match_snapshot', snap);
    res.json(snap);
  });

  app.post('/api/match/resume', (_req, res) => {
    engine.resumeMatch();
    const snap = engine.getSnapshot();
    broadcast('match_snapshot', snap);
    res.json(snap);
  });

  app.post('/api/match/reset', (_req, res) => {
    engine.resetMatch();
    const snap = engine.getSnapshot();
    broadcast('match_snapshot', snap);
    res.json(snap);
  });

  app.post('/api/match/emergency-stop', (_req, res) => {
    engine.emergencyStop();
    const snap = engine.getSnapshot();
    broadcast('match_snapshot', snap);
    res.json(snap);
  });

  app.post('/api/goal/reset', (_req, res) => {
    engine.resetLiveGoal();
    const snap = engine.getSnapshot();
    broadcast('match_snapshot', snap);
    res.json({ ok: true, snapshot: snap });
  });

  // Settings
  app.get('/api/settings', (_req, res) => {
    res.json(db.getAllSettings());
  });

  app.put('/api/settings', async (req, res) => {
    const body = req.body as AllSettings;
    db.saveAllSettings(body);
    if (body.general?.connectionMode && body.general.connectionMode !== runtime.getActiveMode()) {
      await runtime.setActiveMode(body.general.connectionMode);
    }
    engine.reloadConfigFromDb();
    const saved = db.getAllSettings();
    const snap = engine.getSnapshot();
    db.log('INFO', 'Settings', 'Updated system settings from Admin');
    broadcast('settings_updated', saved);
    broadcast('match_snapshot', snap);
    broadcast('connection_status', runtime.getConnectionInfo());
    res.json({ ok: true, settings: saved, snapshot: snap });
  });

  // Gift Rules + Sync
  app.get('/api/gifts', (_req, res) => {
    res.json(db.getGiftRules());
  });

  app.put('/api/gifts/:giftId', (req, res) => {
    const rule = { ...req.body, giftId: req.params.giftId } as GiftRule;
    db.upsertGiftRule(rule);
    engine.reloadConfigFromDb();
    db.log('INFO', 'GiftEngine', `Saved gift rule ${rule.giftId}`);
    res.json({ ok: true, giftRules: db.getGiftRules() });
  });

  app.post('/api/gifts', (req, res) => {
    const rule = req.body as GiftRule;
    db.upsertGiftRule(rule);
    engine.reloadConfigFromDb();
    db.log('INFO', 'GiftEngine', `Created gift rule ${rule.giftId}`);
    res.json({ ok: true, giftRules: db.getGiftRules() });
  });

  app.post('/api/gifts/sync', async (_req, res) => {
    try {
      const gifts = await liveAdapter.fetchAvailableGifts();
      if (gifts.length === 0) {
        res.json({
          ok: false,
          added: 0,
          message: 'Chưa kết nối TikTok LIVE thật hoặc connector không trả danh sách quà.',
          giftRules: db.getGiftRules(),
        });
        return;
      }
      const added = db.syncDiscoveredGifts(gifts);
      engine.reloadConfigFromDb();
      db.log('INFO', 'GiftEngine', `Synced ${gifts.length} TikTok gifts (${added} newly added)`);
      res.json({
        ok: true,
        added,
        totalDiscovered: gifts.length,
        message: `Đã đồng bộ ${gifts.length} quà từ TikTok (thêm mới ${added} quà).`,
        giftRules: db.getGiftRules(),
      });
    } catch (err) {
      res.json({
        ok: false,
        added: 0,
        message: err instanceof Error ? err.message : 'Lỗi đồng bộ quà từ connector',
        giftRules: db.getGiftRules(),
      });
    }
  });

  app.delete('/api/gifts/:giftId', (req, res) => {
    db.deleteGiftRule(req.params.giftId);
    engine.reloadConfigFromDb();
    res.json({ ok: true, giftRules: db.getGiftRules() });
  });

  // Live Connection & Simulation
  app.post('/api/connection/mode', async (req, res) => {
    const { mode } = req.body as { mode: ConnectionMode };
    const info = await runtime.setActiveMode(mode);
    res.json(info);
  });

  app.post('/api/connection/connect-live', async (req, res) => {
    const { username } = req.body as { username: string };
    await runtime.setActiveMode('LIVE');
    const settings = db.getAllSettings();
    settings.general.connectionMode = 'LIVE';
    settings.general.tiktokUsername = username;
    db.saveAllSettings(settings);

    try {
      await liveAdapter.connect(username);
    } catch {
      // status reflects error cleanly
    }
    const info = liveAdapter.getInfo();
    db.log(
      info.status === 'CONNECTED_LIVE' ? 'INFO' : 'WARN',
      'LiveBridge',
      `Connect LIVE @${username}: ${info.status}`,
      { error: info.lastError, roomId: info.roomId }
    );
    broadcast('connection_status', info);
    res.json(info);
  });

  app.post('/api/connection/reconnect', async (_req, res) => {
    try {
      await runtime.setActiveMode('LIVE');
      await liveAdapter.reconnect();
    } catch {
      // status reflects error cleanly
    }
    const info = liveAdapter.getInfo();
    broadcast('connection_status', info);
    res.json(info);
  });

  app.post('/api/connection/disconnect', async (_req, res) => {
    await liveAdapter.disconnect();
    simAdapter.stopAutoStream();
    const info = runtime.getConnectionInfo();
    db.log('INFO', 'LiveBridge', 'Disconnected LiveBridge');
    broadcast('connection_status', info);
    res.json(info);
  });

  app.post('/api/simulation/auto', async (req, res) => {
    const { running, ratePerSec } = req.body as { running: boolean; ratePerSec?: number };
    await runtime.setActiveMode('SIMULATION');
    if (running) {
      simAdapter.startAutoStream(ratePerSec ?? 2);
      db.log('INFO', 'Simulation', 'Started auto simulation stream', { ratePerSec: ratePerSec ?? 2 });
    } else {
      simAdapter.stopAutoStream();
      db.log('INFO', 'Simulation', 'Stopped auto simulation stream');
    }
    const info = simAdapter.getInfo();
    broadcast('connection_status', info);
    res.json(info);
  });

  app.post('/api/simulation/emit', async (req, res) => {
    if (runtime.getActiveMode() !== 'SIMULATION') {
      await runtime.setActiveMode('SIMULATION');
    }
    simAdapter.emitManualEvent(req.body);
    res.json({ ok: true });
  });

  app.post('/api/simulation/streak', async (req, res) => {
    if (runtime.getActiveMode() !== 'SIMULATION') {
      await runtime.setActiveMode('SIMULATION');
    }
    const { team, streakCount } = req.body as { team: TeamId; streakCount?: number };
    simAdapter.simulateGiftStreak(team, streakCount ?? 5);
    res.json({ ok: true });
  });

  app.post('/api/simulation/burst', async (req, res) => {
    if (runtime.getActiveMode() !== 'SIMULATION') {
      await runtime.setActiveMode('SIMULATION');
    }
    const { count } = req.body as { count?: number };
    const n = Math.min(1000, Math.max(1, count ?? 100));
    simAdapter.simulateBurst(n);
    db.log('INFO', 'Simulation', `Burst stress injected ${n} events`);
    res.json({ ok: true, count: n });
  });

  app.post('/api/simulation/duplicate-test', async (req, res) => {
    if (runtime.getActiveMode() !== 'SIMULATION') {
      await runtime.setActiveMode('SIMULATION');
    }
    const { team } = req.body as { team: TeamId };
    const result = simAdapter.simulateDuplicateTest(team || 'BOY');
    db.log('INFO', 'Simulation', 'Executed duplicate event test', result);
    res.json({ ok: true, ...result });
  });

  // Leaderboard, Players, Event Inspector, History, Stats, Logs, Backups
  app.get('/api/leaderboard', (_req, res) => {
    res.json(db.getLeaderboard(80));
  });

  app.get('/api/players', (_req, res) => {
    res.json(db.getPlayers(150));
  });

  app.get('/api/events/inspector', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Number(req.query.limit || 80);
    res.json(db.getEventInspector(Math.min(200, Math.max(10, limit)), q));
  });

  app.get('/api/history', (_req, res) => {
    res.json(db.getMatchHistory(50));
  });

  app.get('/api/stats/daily', (_req, res) => {
    res.json(db.getDailyStats(30));
  });

  app.get('/api/logs', (_req, res) => {
    res.json(db.getLogs(150));
  });

  app.get('/api/metrics', (_req, res) => {
    res.json(engine.getPerformanceMetrics(runtime.getTotalWsClients(), runtime.getWsLatencyMs()));
  });

  app.get('/api/backups', (_req, res) => {
    res.json(db.listBackups());
  });

  app.post('/api/backups/create', async (_req, res) => {
    const result = await db.createBackup();
    res.json(result);
  });

  app.post('/api/backups/restore', (req, res) => {
    const { fileName } = req.body as { fileName: string };
    const result = db.restoreFromJsonBackup(fileName);
    engine.reloadConfigFromDb();
    res.json(result);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);

  server.on('upgrade', (request, socket, head) => {
    const urlPath = request.url?.split('?')[0];
    if (urlPath === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      if (isProd) socket.destroy();
    }
  });

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LiveArena] Unified Server & LiveBridge running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap server:', err);
  process.exit(1);
});
