import { WebSocket, type WebSocketServer } from 'ws';
import { ArenaDatabase } from './db/database.js';
import {
  SimulationConnectorAdapter,
  TikTokLiveConnectorAdapter,
} from './bridge/tiktokAdapter.js';
import { MatchEngine } from './engine/matchEngine.js';
import type { ConnectionMode, LiveConnectionInfo } from '../src/shared/types.js';

export interface LiveBridgeRuntime {
  db: ArenaDatabase;
  simAdapter: SimulationConnectorAdapter;
  liveAdapter: TikTokLiveConnectorAdapter;
  engine: MatchEngine;
  getActiveMode: () => ConnectionMode;
  setActiveMode: (mode: ConnectionMode) => Promise<LiveConnectionInfo>;
  getConnectionInfo: () => LiveConnectionInfo;
  attachWebSocketServer: (wss: WebSocketServer) => void;
  broadcast: (type: string, payload: unknown) => void;
  getTotalWsClients: () => number;
  getWsLatencyMs: () => number;
  startLoop: () => void;
  stopLoop: () => void;
}

export function createLiveBridgeRuntime(dbPath?: string): LiveBridgeRuntime {
  const db = new ArenaDatabase(dbPath);
  const simAdapter = new SimulationConnectorAdapter(() => db.getGiftRules());
  const liveAdapter = new TikTokLiveConnectorAdapter();

  let activeMode: ConnectionMode = db.getAllSettings().general.connectionMode;
  let lastWsLatencyMs = 1;
  const attachedServers: WebSocketServer[] = [];
  let tickTimer: NodeJS.Timeout | null = null;

  function broadcast(type: string, payload: unknown): void {
    const msg = JSON.stringify({ type, payload, ts: Date.now() });
    for (const wss of attachedServers) {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    }
  }

  function getTotalWsClients(): number {
    return attachedServers.reduce((acc, s) => acc + s.clients.size, 0);
  }

  const engine = new MatchEngine(db, {
    onNormalizedEvent: (ev) => {
      broadcast('live_event', ev);
    },
  });

  simAdapter.onEvent((raw) => {
    if (activeMode === 'SIMULATION') engine.ingestRawEvent(raw);
  });
  liveAdapter.onEvent((raw) => {
    if (activeMode === 'LIVE') engine.ingestRawEvent(raw);
  });
  liveAdapter.onViewerCount((count) => {
    if (activeMode === 'LIVE') engine.setViewerCount(count);
  });
  liveAdapter.onGoalUpdate((goal) => {
    if (activeMode === 'LIVE') engine.syncExternalLiveGoal(goal);
  });

  const getConnectionInfo = (): LiveConnectionInfo =>
    activeMode === 'SIMULATION' ? simAdapter.getInfo() : liveAdapter.getInfo();

  simAdapter.onStatus((info) => {
    if (activeMode === 'SIMULATION') broadcast('connection_status', info);
  });
  liveAdapter.onStatus((info) => {
    if (activeMode === 'LIVE') broadcast('connection_status', info);
  });

  engine.startMatch(false);

  const setActiveMode = async (mode: ConnectionMode): Promise<LiveConnectionInfo> => {
    activeMode = mode;
    const settings = db.getAllSettings();
    settings.general.connectionMode = mode;
    db.saveAllSettings(settings);
    if (mode === 'SIMULATION') {
      await liveAdapter.disconnect();
      await simAdapter.connect('simulation');
    } else {
      simAdapter.stopAutoStream();
    }
    const info = getConnectionInfo();
    broadcast('connection_status', info);
    return info;
  };

  const attachWebSocketServer = (wss: WebSocketServer): void => {
    attachedServers.push(wss);
    wss.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          type: 'init',
          payload: {
            snapshot: engine.getSnapshot(),
            connection: getConnectionInfo(),
            settings: db.getAllSettings(),
            metrics: engine.getPerformanceMetrics(getTotalWsClients(), lastWsLatencyMs),
          },
          ts: Date.now(),
        })
      );

      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'ping' && typeof parsed.clientTs === 'number') {
            lastWsLatencyMs = Math.max(1, Math.round(Date.now() - parsed.clientTs));
            ws.send(JSON.stringify({ type: 'pong', clientTs: parsed.clientTs, serverTs: Date.now() }));
          } else if (parsed.type === 'raw_event' && parsed.payload) {
            engine.ingestRawEvent(parsed.payload);
          } else if (parsed.type === 'admin_command' && parsed.action) {
            if (parsed.action === 'start') engine.startMatch(true);
            else if (parsed.action === 'pause') engine.pauseMatch();
            else if (parsed.action === 'resume') engine.resumeMatch();
            else if (parsed.action === 'reset') engine.resetMatch();
            else if (parsed.action === 'emergency_stop') engine.emergencyStop();
          }
        } catch {
          // Ignore malformed WS payloads safely
        }
      });
    });
  };

  const startLoop = (): void => {
    if (tickTimer) return;
    const TICK_MS = Math.round(1000 / 30);
    let lastTick = Date.now();
    let metricsCounter = 0;

    tickTimer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - lastTick) / 1000);
      lastTick = now;
      const snap = engine.step(dt, now);
      broadcast('match_snapshot', snap);

      metricsCounter += 1;
      if (metricsCounter % 30 === 0) {
        broadcast(
          'metrics',
          engine.getPerformanceMetrics(getTotalWsClients(), lastWsLatencyMs)
        );
      }
    }, TICK_MS);
  };

  const stopLoop = (): void => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };

  return {
    db,
    simAdapter,
    liveAdapter,
    engine,
    getActiveMode: () => activeMode,
    setActiveMode,
    getConnectionInfo,
    attachWebSocketServer,
    broadcast,
    getTotalWsClients,
    getWsLatencyMs: () => lastWsLatencyMs,
    startLoop,
    stopLoop,
  };
}
