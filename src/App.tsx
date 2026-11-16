import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { LivestreamPortraitView } from './components/LivestreamPortraitView';
import { DEFAULT_GIFT_RULES } from './shared/defaultsFallback';
import { arenaSfx } from './lib/audioSfx';
import type {
  AllSettings,
  GiftRule,
  LiveConnectionInfo,
  MatchStateSnapshot,
  PerformanceMetrics,
} from './shared/types';

type WorkspaceTab = 'studio' | 'obs';

const INITIAL_SNAPSHOT: MatchStateSnapshot = {
  matchId: 'init',
  gameMode: 'ClassicPush',
  phase: 'Countdown',
  phaseRemainingSec: 3,
  totalElapsedSec: 0,
  totalMatchDurationSec: 90,
  boy: {
    team: 'BOY',
    positionX: -0.75,
    velocityX: 0,
    state: 'Idle',
    totalPower: 0,
    chatPower: 0,
    giftPower: 0,
    leanAngleDeg: 0,
    memberCount: 0,
  },
  girl: {
    team: 'GIRL',
    positionX: 0.75,
    velocityX: 0,
    state: 'Idle',
    totalPower: 0,
    chatPower: 0,
    giftPower: 0,
    leanAngleDeg: 0,
    memberCount: 0,
  },
  centerLineX: 0,
  boundaryHalfWidth: 5.5,
  safeZoneHalfWidth: 5.5,
  nearWinTeam: null,
  nearWinProgressPct: 14,
  lastActionCallout: null,
  liveGoal: {
    enabled: true,
    title: 'Ý muốn TikTok LIVE',
    giftId: '5655',
    giftName: 'Hoa Hồng',
    currentCount: 0,
    targetCount: 100,
    reserveTikTokZone: false,
  },
  activeGiftStreaks: [],
  boyMembers: [],
  girlMembers: [],
  boyWinsSession: 0,
  girlWinsSession: 0,
  boyWinStreak: 0,
  girlWinStreak: 0,
  viewerCount: null,
  mvp: null,
  winnerTeam: null,
  winReason: null,
  recentFeed: [],
  activeBanner: null,
};

const INITIAL_SETTINGS: AllSettings = {
  team: {
    basePower: 0,
    maxPower: 5000,
    chatPowerReward: 15,
    chatCooldownSec: 2,
    teamSwitchCooldownSec: 15,
    neutralGiftEnabled: true,
    neutralGiftPower: 10,
    showNormalChat: false,
  },
  match: {
    activeGameMode: 'ClassicPush',
    matchDurationSec: 90,
    overtimeSec: 10,
    cooldownSec: 5,
    autoRound: true,
    arenaBoundaryHalfWidth: 5.5,
  },
  general: {
    arenaTheme: 'ModernStadium',
    targetFps: 30,
    resolutionWidth: 1080,
    resolutionHeight: 1920,
    masterVolume: 0.75,
    vfxQuality: 'High',
    autoReduceVfxOnLowFps: true,
    tiktokUsername: '',
    connectionMode: 'SIMULATION',
    showHowToPlayGuide: true,
    topSafeZonePx: 120,
    liveGoal: {
      enabled: true,
      title: 'Ý muốn TikTok LIVE',
      giftId: '5655',
      giftName: 'Hoa Hồng',
      targetCount: 100,
      reserveTikTokZone: false,
    },
  },
};

const INITIAL_CONNECTION: LiveConnectionInfo = {
  mode: 'SIMULATION',
  status: 'CONNECTED_SIMULATION',
  tiktokUsername: 'simulation_arena',
  connectedAt: null,
  reconnectAttempts: 0,
  lastError: null,
  lastEventAt: null,
  eventsReceived: 0,
  roomId: null,
  simulationRunning: false,
  simulationRatePerSec: 2,
};

const INITIAL_METRICS: PerformanceMetrics = {
  serverTickHz: 30,
  wsClientsCount: 1,
  wsLatencyMs: 1,
  eventQueueSize: 0,
  maxQueueSize: 2500,
  eventsReceivedTotal: 0,
  eventsProcessedTotal: 0,
  duplicatesDroppedTotal: 0,
  eventsRejectedTotal: 0,
  eventsFailedTotal: 0,
  eventsDroppedOverflowTotal: 0,
  avgEventProcessMs: 0,
  maxEventProcessMs: 0,
  errorCount: 0,
  memoryRssMb: 0,
  uptimeSec: 0,
};

function readInitialWorkspaceMode(): { tab: WorkspaceTab; obsClean: boolean } {
  const params = new URLSearchParams(window.location.search);
  const obsClean = params.get('obs') === '1';
  const tabParam = params.get('tab');
  if (obsClean || tabParam === 'obs') return { tab: 'obs', obsClean };
  return { tab: 'studio', obsClean: false };
}

export default function App() {
  const initialMode = readInitialWorkspaceMode();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialMode.tab);
  const [obsCleanMode, setObsCleanMode] = useState<boolean>(initialMode.obsClean);
  const [snapshot, setSnapshot] = useState<MatchStateSnapshot>(INITIAL_SNAPSHOT);
  const [connection, setConnection] = useState<LiveConnectionInfo>(INITIAL_CONNECTION);
  const [settings, setSettings] = useState<AllSettings>(INITIAL_SETTINGS);
  const [giftRules, setGiftRules] = useState<GiftRule[]>(DEFAULT_GIFT_RULES);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(INITIAL_METRICS);
  const [clientFps, setClientFps] = useState(30);
  const [muted, setMuted] = useState(true);

  const prevWinnerMatchRef = useRef<string | null>(null);
  const prevNearWinRef = useRef<string | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = await res.json();
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.connection) setConnection(data.connection);
      if (data.settings) setSettings(data.settings);
      if (data.giftRules) setGiftRules(data.giftRules);
      if (data.metrics) setMetrics(data.metrics);
    } catch {
      // retry via ws
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    arenaSfx.setVolume(settings.general.masterVolume);
  }, [settings.general.masterVolume]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let closedByUnmount = false;

    const connectWs = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);

      ws.onopen = () => {
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', clientTs: Date.now() }));
          }
        }, 3000);
      };

      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          if (parsed.type === 'init') {
            if (parsed.payload.snapshot) setSnapshot(parsed.payload.snapshot);
            if (parsed.payload.connection) setConnection(parsed.payload.connection);
            if (parsed.payload.settings) setSettings(parsed.payload.settings);
            if (parsed.payload.metrics) setMetrics(parsed.payload.metrics);
          } else if (parsed.type === 'match_snapshot') {
            const nextSnap = parsed.payload as MatchStateSnapshot;
            setSnapshot(nextSnap);
            if (nextSnap.winnerTeam && prevWinnerMatchRef.current !== nextSnap.matchId) {
              prevWinnerMatchRef.current = nextSnap.matchId;
              arenaSfx.playVictoryFanfare();
            }
            if (nextSnap.nearWinTeam && prevNearWinRef.current !== nextSnap.nearWinTeam) {
              prevNearWinRef.current = nextSnap.nearWinTeam;
              arenaSfx.playNearWinWarning();
            } else if (!nextSnap.nearWinTeam) {
              prevNearWinRef.current = null;
            }
          } else if (parsed.type === 'connection_status') {
            setConnection(parsed.payload);
          } else if (parsed.type === 'settings_updated') {
            setSettings(parsed.payload);
          } else if (parsed.type === 'metrics') {
            setMetrics(parsed.payload);
          } else if (parsed.type === 'live_event') {
            const ev = parsed.payload;
            if (ev?.eventType === 'Gift' && ev?.status === 'PROCESSED') {
              arenaSfx.playGiftChime(ev.payload?.giftTier || 'Small');
            } else if (
              ev?.eventType === 'Chat' &&
              ev?.status === 'PROCESSED' &&
              (ev?.payload?.command === 'BOY' || ev?.payload?.command === 'GIRL')
            ) {
              arenaSfx.playChatPushCue(ev.payload.command);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connectWs, 2000);
        }
      };
    };

    connectWs();

    return () => {
      closedByUnmount = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    arenaSfx.setMuted(next);
  };

  const toggleSimulation = async () => {
    await fetch('/api/simulation/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        running: !connection.simulationRunning,
        ratePerSec: 2,
      }),
    });
    await refreshState();
  };

  if (obsCleanMode) {
    return (
      <div className="min-h-screen w-screen bg-black flex items-center justify-center overflow-hidden">
        <LivestreamPortraitView
          snapshot={snapshot}
          arenaTheme={settings.general.arenaTheme}
          vfxQuality={settings.general.vfxQuality}
          chatPowerReward={settings.team.chatPowerReward}
          giftRules={giftRules}
          showHowToPlayGuide={settings.general.showHowToPlayGuide}
          topSafeZonePx={settings.general.topSafeZonePx}
          onFpsSample={setClientFps}
          fullscreen
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <header className="border-b border-slate-800/90 bg-slate-950/90 px-6 py-3 flex items-center justify-between gap-8">
        <span className="font-display text-xl font-extrabold tracking-wide text-white whitespace-nowrap shrink-0">
          BOY vs GIRL · LIVE ARENA
        </span>

        <nav className="flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveTab('studio')}
            className={`whitespace-nowrap shrink-0 pb-0.5 border-b-2 transition-colors ${
              activeTab === 'studio'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            Admin View + 9:16
          </button>
          <button
            onClick={() => setActiveTab('obs')}
            className={`whitespace-nowrap shrink-0 pb-0.5 border-b-2 transition-colors ${
              activeTab === 'obs'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            Stream View (OBS 9:16)
          </button>
          <button
            onClick={toggleSound}
            title={muted ? 'Bật âm thanh SFX' : 'Tắt âm thanh SFX'}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white whitespace-nowrap shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            {muted ? 'Âm thanh: Tắt' : 'Âm thanh: Bật'}
          </button>
        </nav>

        <div className="shrink-0 flex items-center gap-2">
          {activeTab === 'obs' && (
            <button
              onClick={() => setObsCleanMode(true)}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white whitespace-nowrap shrink-0"
            >
              Ẩn thanh Admin (OBS Sạch)
            </button>
          )}
          <button
            onClick={toggleSimulation}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors ${
              connection.simulationRunning
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {connection.simulationRunning ? 'Dừng Simulation' : 'Chạy Simulation'}
          </button>
        </div>
      </header>

      <main className={activeTab === 'obs' ? 'flex-1 flex items-center justify-center bg-black' : 'flex-1 p-4 lg:p-6'}>
        {activeTab === 'studio' && (
          <div className="max-w-[1520px] mx-auto grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
            <div className="xl:sticky xl:top-4">
              <LivestreamPortraitView
                snapshot={snapshot}
                arenaTheme={settings.general.arenaTheme}
                vfxQuality={settings.general.vfxQuality}
                chatPowerReward={settings.team.chatPowerReward}
                giftRules={giftRules}
                showHowToPlayGuide={settings.general.showHowToPlayGuide}
                topSafeZonePx={settings.general.topSafeZonePx}
                onFpsSample={setClientFps}
              />
            </div>

            <AdminDashboard
              snapshot={snapshot}
              connection={connection}
              settings={settings}
              giftRules={giftRules}
              metrics={metrics}
              clientFps={clientFps}
              onRefreshState={refreshState}
              onSettingsUpdated={setSettings}
              onGiftRulesUpdated={setGiftRules}
            />
          </div>
        )}

        {activeTab === 'obs' && (
          <div className="flex items-center justify-center">
            <LivestreamPortraitView
              snapshot={snapshot}
              arenaTheme={settings.general.arenaTheme}
              vfxQuality={settings.general.vfxQuality}
              chatPowerReward={settings.team.chatPowerReward}
              giftRules={giftRules}
              showHowToPlayGuide={settings.general.showHowToPlayGuide}
              topSafeZonePx={settings.general.topSafeZonePx}
              onFpsSample={setClientFps}
              fullscreen
            />
          </div>
        )}
      </main>
    </div>
  );
}
