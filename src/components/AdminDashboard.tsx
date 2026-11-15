import React, { useEffect, useState } from 'react';
import {
  Activity,
  Copy,
  DatabaseBackup,
  Gamepad2,
  Gift,
  History,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sliders,
  Square,
  Users,
  Zap,
} from 'lucide-react';
import type {
  AllSettings,
  ArenaTheme,
  DailyStatRecord,
  EventInspectorRecord,
  EventLogRecord,
  GiftRule,
  GiftTeamTarget,
  GiftTier,
  LeaderboardEntry,
  LiveConnectionInfo,
  MatchHistoryRecord,
  MatchStateSnapshot,
  PerformanceMetrics,
  TeamId,
} from '../shared/types';

export type AdminPageId =
  | 'dashboard'
  | 'live'
  | 'simulation'
  | 'gifts'
  | 'settings'
  | 'viewers'
  | 'inspector'
  | 'history';

interface AdminDashboardProps {
  snapshot: MatchStateSnapshot;
  connection: LiveConnectionInfo;
  settings: AllSettings;
  giftRules: GiftRule[];
  metrics: PerformanceMetrics;
  clientFps: number;
  onRefreshState: () => Promise<void>;
  onSettingsUpdated: (next: AllSettings) => void;
  onGiftRulesUpdated: (next: GiftRule[]) => void;
}

const NAV_ITEMS: { id: AdminPageId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: '1. Điều khiển Trận', icon: Gamepad2 },
  { id: 'live', label: '2. Kết nối TikTok LIVE', icon: Radio },
  { id: 'simulation', label: '3. Giả lập & Stress', icon: Zap },
  { id: 'gifts', label: '4. Bảng Quà tặng', icon: Gift },
  { id: 'settings', label: '5. Sân đấu & Ý muốn', icon: Sliders },
  { id: 'viewers', label: '6. Người xem & BXH', icon: Users },
  { id: 'inspector', label: '7. Kiểm tra Sự kiện', icon: Search },
  { id: 'history', label: '8. Lịch sử & Backup', icon: History },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  snapshot,
  connection,
  settings,
  giftRules,
  metrics,
  clientFps,
  onRefreshState,
  onSettingsUpdated,
  onGiftRulesUpdated,
}) => {
  const [activePage, setActivePage] = useState<AdminPageId>('dashboard');
  const [draftSettings, setDraftSettings] = useState<AllSettings>(settings);
  const [draftUsername, setDraftUsername] = useState(settings.general.tiktokUsername || '');
  const [simRate, setSimRate] = useState(2);
  const [customChatName, setCustomChatName] = useState('Khán giả VIP');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<MatchHistoryRecord[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatRecord[]>([]);
  const [logs, setLogs] = useState<EventLogRecord[]>([]);
  const [inspectorRecords, setInspectorRecords] = useState<EventInspectorRecord[]>([]);
  const [inspectorQuery, setInspectorQuery] = useState('');
  const [backups, setBackups] = useState<Array<{ fileName: string; sizeBytes: number; mtimeMs: number }>>([]);
  const [newGift, setNewGift] = useState<GiftRule>({
    giftId: '',
    giftName: '',
    giftIcon: 'gift',
    tier: 'Small',
    team: 'AUTO',
    powerPoints: 50,
    vfxId: 'vfx_spark_auto',
    sfxId: 'sfx_gift_small',
    maxImpact: 500,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  });

  useEffect(() => {
    setDraftSettings(settings);
    if (settings.general.tiktokUsername) setDraftUsername(settings.general.tiktokUsername);
  }, [settings]);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice((prev) => (prev === msg ? null : prev)), 3500);
  };

  const fetchTabData = async (page: AdminPageId, queryOverride?: string) => {
    try {
      if (page === 'viewers') {
        const res = await fetch('/api/leaderboard');
        setLeaderboard(await res.json());
      } else if (page === 'inspector') {
        const q = encodeURIComponent(queryOverride ?? inspectorQuery);
        const res = await fetch(`/api/events/inspector?q=${q}`);
        setInspectorRecords(await res.json());
      } else if (page === 'history') {
        const [hRes, sRes, lRes, bRes] = await Promise.all([
          fetch('/api/history'),
          fetch('/api/stats/daily'),
          fetch('/api/logs'),
          fetch('/api/backups'),
        ]);
        setHistory(await hRes.json());
        setDailyStats(await sRes.json());
        setLogs(await lRes.json());
        setBackups(await bRes.json());
      }
    } catch {
      showNotice('Không thể tải dữ liệu từ máy chủ LiveBridge');
    }
  };

  useEffect(() => {
    void fetchTabData(activePage);
  }, [activePage]);

  const callMatchAction = async (endpoint: string, label: string) => {
    await fetch(`/api/match/${endpoint}`, { method: 'POST' });
    showNotice(label);
    await onRefreshState();
  };

  const saveSettings = async (next: AllSettings) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      const data = await res.json();
      onSettingsUpdated(data.settings || next);
      showNotice('Đã lưu cấu hình vào SQLite');
    }
  };

  const saveGiftRule = async (rule: GiftRule) => {
    const res = await fetch(`/api/gifts/${encodeURIComponent(rule.giftId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (res.ok) {
      const data = await res.json();
      onGiftRulesUpdated(data.giftRules);
      showNotice(`Đã cập nhật quà: ${rule.giftName}`);
    }
  };

  const emitQuickAction = async (payload: Record<string, unknown>, label: string) => {
    await fetch('/api/simulation/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showNotice(label);
  };

  return (
    <div className="flex flex-col lg:flex-row bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[700px]">
      <aside className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60 p-2.5 shrink-0">
        <div className="px-2.5 py-2 text-xs font-semibold text-slate-400 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          Classic Push Studio
        </div>
        <nav className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 p-5 overflow-y-auto max-h-[820px]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">
              {NAV_ITEMS.find((n) => n.id === activePage)?.label}
            </h2>
            <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
              <span>Classic Push</span>
              <span aria-hidden="true">·</span>
              <span>Nguồn: {connection.mode} ({connection.status})</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Pha: {snapshot.phase}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => callMatchAction('start', 'Đã bắt đầu trận đấu mới')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" /> Start Match
            </button>
            {snapshot.phase === 'Paused' ? (
              <button
                onClick={() => callMatchAction('resume', 'Đã tiếp tục trận đấu')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
            ) : (
              <button
                onClick={() => callMatchAction('pause', 'Đã tạm dừng trận đấu')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" /> Pause
              </button>
            )}
            <button
              onClick={() => callMatchAction('reset', 'Đã Reset vòng đấu')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button
              onClick={() => callMatchAction('emergency-stop', 'Đã kích hoạt Emergency Stop!')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600/90 hover:bg-red-500 text-white whitespace-nowrap shrink-0"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        </div>

        {statusNotice && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-blue-950/70 border border-blue-500/40 text-xs text-blue-200">
            {statusNotice}
          </div>
        )}

        {/* 1. MATCH DASHBOARD */}
        {activePage === 'dashboard' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-xs text-slate-400">BOY ({snapshot.boy.memberCount} TV)</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-blue-400">
                  {snapshot.boy.totalPower}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Chat {snapshot.boy.chatPower} · Quà {snapshot.boy.giftPower}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-xs text-slate-400">GIRL ({snapshot.girl.memberCount} TV)</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-pink-400">
                  {snapshot.girl.totalPower}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Chat {snapshot.girl.chatPower} · Quà {snapshot.girl.giftPower}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-xs text-slate-400">Sự kiện đã xử lý</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                  {metrics.eventsProcessedTotal}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Chặn trùng: {metrics.duplicatesDroppedTotal}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-xs text-slate-400">Hiệu năng / Mạng</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-400">
                  {clientFps} FPS
                </div>
                <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Latency: {metrics.wsLatencyMs}ms
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-white">Test nhanh 2 hành động khán giả</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      emitQuickAction(
                        { eventType: 'Chat', senderId: 'test_boy', displayName: 'Tuấn Kiệt', message: 'BOY' },
                        'Đã test Chat BOY'
                      )
                    }
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30"
                  >
                    Chat BOY (+{settings.team.chatPowerReward})
                  </button>
                  <button
                    onClick={() =>
                      emitQuickAction(
                        { eventType: 'Chat', senderId: 'test_girl', displayName: 'Minh Anh', message: 'GIRL' },
                        'Đã test Chat GIRL'
                      )
                    }
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-pink-600/20 border border-pink-500/40 text-pink-300 hover:bg-pink-600/30"
                  >
                    Chat GIRL (+{settings.team.chatPowerReward})
                  </button>
                  <button
                    onClick={() =>
                      emitQuickAction(
                        {
                          eventType: 'Gift',
                          senderId: 'test_boy',
                          displayName: 'Tuấn Kiệt',
                          giftId: '5655',
                          team: 'BOY',
                          quantity: 1,
                        },
                        'Đã test Tặng Hoa Hồng cho BOY (+25)'
                      )
                    }
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-sky-600/20 border border-sky-500/40 text-sky-300 hover:bg-sky-600/30"
                  >
                    Tặng Hoa Hồng (BOY)
                  </button>
                  <button
                    onClick={() =>
                      emitQuickAction(
                        {
                          eventType: 'Gift',
                          senderId: 'test_girl',
                          displayName: 'Minh Anh',
                          giftId: '5655',
                          team: 'GIRL',
                          quantity: 1,
                        },
                        'Đã test Tặng Hoa Hồng cho GIRL (+25)'
                      )
                    }
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30"
                  >
                    Tặng Hoa Hồng (GIRL)
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-white">Thời lượng mỗi trận (1–2 phút)</h3>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Thời gian đẩy chính thức:</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {draftSettings.match.matchDurationSec} giây
                  </span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={120}
                  step={15}
                  value={draftSettings.match.matchDurationSec}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      match: { ...draftSettings.match, matchDurationSec: Number(e.target.value) },
                    })
                  }
                  className="w-full"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                  <span>60s (1 phút)</span>
                  <span>90s (Mặc định)</span>
                  <span>120s (2 phút)</span>
                </div>
                <button
                  onClick={() => saveSettings(draftSettings)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
                >
                  <Save className="w-3.5 h-3.5" /> Áp dụng thời lượng
                </button>
              </div>
            </div>

            {/* Top Safe Zone Info Card */}
            <div className="p-4 rounded-lg bg-slate-950/50 border border-sky-500/35 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-sky-300">
                  Vùng trống trên cùng cho TikTok LIVE & Bảng Ý muốn gốc
                </div>
                <div className="text-xs text-slate-300 mt-0.5 tabular-nums">
                  Đang chừa khoảng trống trên cùng:{' '}
                  <span className="font-mono font-bold text-white">
                    {settings.general.topSafeZonePx ?? 120}px
                  </span>{' '}
                  · Hoàn toàn sạch, không có chữ hay thanh game che lên.
                </div>
              </div>
              <button
                onClick={() => setActivePage('settings')}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
              >
                Chỉnh vùng trống
              </button>
            </div>
          </div>
        )}

        {/* 2. LIVE CONNECTION */}
        {activePage === 'live' && (
          <div className="space-y-4 max-w-3xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400">Trạng thái</div>
                <div className="mt-1 font-mono font-semibold text-white">{connection.status}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400">Sự kiện nhận</div>
                <div className="mt-1 font-mono font-semibold tabular-nums text-emerald-400">
                  {connection.eventsReceived}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400">Sự kiện gần nhất</div>
                <div className="mt-1 font-mono text-slate-200 tabular-nums">
                  {connection.lastEventAt ? new Date(connection.lastEventAt).toLocaleTimeString('vi-VN') : '—'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400">Reconnect / WS</div>
                <div className="mt-1 font-mono text-slate-200 tabular-nums">
                  {connection.reconnectAttempts} lần · {metrics.wsLatencyMs}ms
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="text-sm font-semibold text-white">Chế độ kết nối LiveBridge</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    await fetch('/api/connection/mode', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mode: 'SIMULATION' }),
                    });
                    await onRefreshState();
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium border ${
                    connection.mode === 'SIMULATION'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  Simulation Mode
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/connection/mode', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mode: 'LIVE' }),
                    });
                    await onRefreshState();
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium border ${
                    connection.mode === 'LIVE'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  TikTok LIVE Mode
                </button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                TikTok Username (không lưu mật khẩu)
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={draftUsername}
                  onChange={(e) => setDraftUsername(e.target.value)}
                  placeholder="ví dụ: @ten_kenh_tiktok"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                />
                <button
                  onClick={async () => {
                    const res = await fetch('/api/connection/connect-live', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username: draftUsername }),
                    });
                    const info = (await res.json()) as LiveConnectionInfo;
                    await onRefreshState();
                    showNotice(info.lastError || `Trạng thái: ${info.status}`);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap"
                >
                  Connect LIVE
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/connection/reconnect', { method: 'POST' });
                    const info = (await res.json()) as LiveConnectionInfo;
                    await onRefreshState();
                    showNotice(info.lastError || `Reconnect: ${info.status}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reconnect
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/connection/disconnect', { method: 'POST' });
                    await onRefreshState();
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Disconnect
                </button>
              </div>
              {connection.roomId && (
                <div className="text-xs text-slate-400 font-mono">
                  Room ID: {connection.roomId}
                </div>
              )}
              {connection.lastError && (
                <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200">
                  {connection.lastError}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-white">OBS Studio Browser Source (9:16 Sạch 100%)</div>
                <div className="text-slate-400 font-mono mt-0.5">
                  {`${window.location.origin}/?obs=1`}
                </div>
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard?.writeText(`${window.location.origin}/?obs=1`);
                  showNotice('Đã sao chép URL OBS Sạch (?obs=1)');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                <Copy className="w-3.5 h-3.5" /> Copy OBS URL
              </button>
            </div>
          </div>
        )}

        {/* 3. SIMULATION & STRESS */}
        {activePage === 'simulation' && (
          <div className="space-y-5">
            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">Luồng khán giả giả lập tự động</div>
                <div className="text-xs text-slate-400">Chỉ giả lập 2 hành động: Chat BOY/GIRL & Tặng quà</div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-300">
                  Tốc độ (event/s):
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={simRate}
                    onChange={(e) => setSimRate(Number(e.target.value))}
                    className="ml-2 w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                  />
                </label>
                <button
                  onClick={async () => {
                    await fetch('/api/simulation/auto', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        running: !connection.simulationRunning,
                        ratePerSec: simRate,
                      }),
                    });
                    await onRefreshState();
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium text-white ${
                    connection.simulationRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {connection.simulationRunning ? 'Simulation OFF' : 'Simulation ON'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-sm font-semibold text-white">Gửi thử Chat / Quà thủ công</div>
                <input
                  value={customChatName}
                  onChange={(e) => setCustomChatName(e.target.value)}
                  placeholder="Tên người xem"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                />
                <div className="flex flex-wrap gap-2">
                  {(['BOY', 'GIRL'] as const).map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() =>
                        emitQuickAction(
                          {
                            eventType: 'Chat',
                            senderId: `sim_${customChatName.toLowerCase().replace(/\s+/g, '_')}`,
                            displayName: customChatName,
                            message: cmd,
                          },
                          `Đã gửi ${cmd} từ ${customChatName}`
                        )
                      }
                      className={`px-3 py-1.5 rounded text-xs font-semibold border ${
                        cmd === 'BOY'
                          ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                          : 'bg-pink-600/20 border-pink-500/40 text-pink-300'
                      }`}
                    >
                      Chat {cmd}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      emitQuickAction(
                        {
                          eventType: 'Gift',
                          senderId: `sim_${customChatName.toLowerCase().replace(/\s+/g, '_')}`,
                          displayName: customChatName,
                          giftId: '5658',
                          quantity: 1,
                        },
                        `Đã gửi Nước Hoa từ ${customChatName}`
                      )
                    }
                    className="px-3 py-1.5 rounded bg-amber-600/20 border border-amber-500/40 text-xs font-semibold text-amber-300"
                  >
                    Tặng Nước Hoa (+150)
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-sm font-semibold text-white">Kịch bản Streak, Stress & Chống trùng</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      await fetch('/api/simulation/streak', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ team: 'BOY', streakCount: 5 }),
                      });
                      showNotice('Đã test Gift Streak x5 (BOY)');
                    }}
                    className="px-3 py-1.5 rounded bg-blue-600/20 border border-blue-500/40 text-xs text-blue-300"
                  >
                    Streak x5 (BOY)
                  </button>
                  {[100, 400, 1000].map((n) => (
                    <button
                      key={n}
                      onClick={async () => {
                        await fetch('/api/simulation/burst', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ count: n }),
                        });
                        showNotice(`Đã bơm ${n} sự kiện vào Queue`);
                      }}
                      className="px-3 py-1.5 rounded bg-amber-600/20 border border-amber-500/40 text-xs text-amber-300"
                    >
                      Stress {n}
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      const res = await fetch('/api/simulation/duplicate-test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ team: 'BOY' }),
                      });
                      const data = await res.json();
                      showNotice(`Test chống trùng ${data.dedupKey}`);
                    }}
                    className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                  >
                    Test Trùng lặp
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. GIFT RULES */}
        {activePage === 'gifts' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-400">
                Đội <code className="font-mono text-slate-200">AUTO</code> sẽ tự động đẩy cho đội người tặng đã chọn (BOY/GIRL).
              </div>
              <button
                onClick={async () => {
                  const res = await fetch('/api/gifts/sync', { method: 'POST' });
                  const data = await res.json();
                  if (data.giftRules) onGiftRulesUpdated(data.giftRules);
                  showNotice(data.message);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-medium text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Sync Quà từ TikTok LIVE
              </button>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-wrap items-end gap-2 text-xs">
              <label className="text-slate-400">
                Gift ID
                <input
                  value={newGift.giftId}
                  onChange={(e) => setNewGift({ ...newGift, giftId: e.target.value })}
                  placeholder="vd: 7123"
                  className="mt-1 block w-28 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                />
              </label>
              <label className="text-slate-400">
                Tên quà
                <input
                  value={newGift.giftName}
                  onChange={(e) => setNewGift({ ...newGift, giftName: e.target.value })}
                  placeholder="Hoa Hồng VIP"
                  className="mt-1 block w-36 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </label>
              <label className="text-slate-400">
                Đội
                <select
                  value={newGift.team}
                  onChange={(e) => setNewGift({ ...newGift, team: e.target.value as GiftTeamTarget })}
                  className="mt-1 block px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="AUTO">AUTO</option>
                  <option value="BOY">BOY</option>
                  <option value="GIRL">GIRL</option>
                </select>
              </label>
              <label className="text-slate-400">
                Điểm đẩy
                <input
                  type="number"
                  value={newGift.powerPoints}
                  onChange={(e) => setNewGift({ ...newGift, powerPoints: Number(e.target.value) })}
                  className="mt-1 block w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                />
              </label>
              <label className="text-slate-400">
                Hạng
                <select
                  value={newGift.tier}
                  onChange={(e) => setNewGift({ ...newGift, tier: e.target.value as GiftTier })}
                  className="mt-1 block px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="Small">Small</option>
                  <option value="Medium">Medium</option>
                  <option value="Large">Large</option>
                  <option value="Special">Special</option>
                  <option value="Ultimate">Ultimate</option>
                </select>
              </label>
              <button
                onClick={async () => {
                  if (!newGift.giftId.trim() || !newGift.giftName.trim()) {
                    showNotice('Nhập đủ Gift ID và Tên quà!');
                    return;
                  }
                  const res = await fetch('/api/gifts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newGift),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    onGiftRulesUpdated(data.giftRules);
                    showNotice(`Đã thêm quà ${newGift.giftName}`);
                    setNewGift({ ...newGift, giftId: '', giftName: '' });
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Quà
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3">Gift ID</th>
                    <th className="py-2 pr-3">Tên quà</th>
                    <th className="py-2 pr-3">Đội</th>
                    <th className="py-2 pr-3 text-right">Điểm đẩy</th>
                    <th className="py-2 pr-3 text-right">Tối đa/lần</th>
                    <th className="py-2 pr-3">Bật</th>
                    <th className="py-2">Lưu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {giftRules.map((rule) => (
                    <GiftRuleRow key={rule.giftId} rule={rule} onSave={saveGiftRule} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. ARENA & POINT SETTINGS */}
        {activePage === 'settings' && (
          <div className="space-y-5 max-w-2xl">
            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="text-sm font-semibold text-white">Bản đồ Đấu trường 3D</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['ModernStadium', 'NeonBattleArena', 'ExtremePlatformArena'] as ArenaTheme[]).map(
                  (theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        const next = {
                          ...draftSettings,
                          general: { ...draftSettings.general, arenaTheme: theme },
                        };
                        setDraftSettings(next);
                        void saveSettings(next);
                      }}
                      className={`p-3 rounded-lg border text-xs font-medium ${
                        draftSettings.general.arenaTheme === theme
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      {theme}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 block mb-1">Điểm cộng mỗi Chat BOY/GIRL</span>
                <input
                  type="number"
                  value={draftSettings.team.chatPowerReward}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      team: { ...draftSettings.team, chatPowerReward: Number(e.target.value) },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono tabular-nums"
                />
              </label>

              <label className="block p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 block mb-1">Cooldown Chat mỗi người (giây)</span>
                <input
                  type="number"
                  value={draftSettings.team.chatCooldownSec}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      team: { ...draftSettings.team, chatCooldownSec: Number(e.target.value) },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono tabular-nums"
                />
              </label>

              <label className="block p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 block mb-1">Cooldown đổi đội (giây)</span>
                <input
                  type="number"
                  value={draftSettings.team.teamSwitchCooldownSec}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      team: { ...draftSettings.team, teamSwitchCooldownSec: Number(e.target.value) },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono tabular-nums"
                />
              </label>

              <label className="block p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 block mb-1">Thời lượng trận (60–120 giây)</span>
                <input
                  type="number"
                  min={60}
                  max={120}
                  value={draftSettings.match.matchDurationSec}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      match: { ...draftSettings.match, matchDurationSec: Number(e.target.value) },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono tabular-nums"
                />
              </label>

              <label className="block p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 block mb-1">Chất lượng Hiệu ứng (VFX)</span>
                <select
                  value={draftSettings.general.vfxQuality}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      general: {
                        ...draftSettings.general,
                        vfxQuality: e.target.value as 'Low' | 'Medium' | 'High',
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="Low">Low (Tiết kiệm GPU)</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>

              <label className="block p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 block mb-1">
                  Âm lượng SFX ({Math.round(draftSettings.general.masterVolume * 100)}%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draftSettings.general.masterVolume}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      general: { ...draftSettings.general, masterVolume: Number(e.target.value) },
                    })
                  }
                  className="w-full mt-2"
                />
              </label>
            </div>

            <div className="p-4 rounded-lg bg-slate-950/60 border border-sky-500/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-sky-300">
                    Vùng trống trên cùng cho UI & Bảng Ý muốn TikTok LIVE
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Toàn bộ dải trên cùng màn hình được giữ trống hoàn toàn để không che Bảng Ý muốn, tên kênh và nút TikTok.
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-amber-300 tabular-nums shrink-0">
                  {draftSettings.general.topSafeZonePx ?? 120}px
                </span>
              </div>
              <input
                type="range"
                min={60}
                max={200}
                step={5}
                value={draftSettings.general.topSafeZonePx ?? 120}
                onChange={(e) =>
                  setDraftSettings({
                    ...draftSettings,
                    general: {
                      ...draftSettings.general,
                      topSafeZonePx: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                <span>60px (Gọn)</span>
                <span>120px (Mặc định TikTok LIVE)</span>
                <span>200px (Rộng)</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.general.showHowToPlayGuide}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      general: { ...draftSettings.general, showHowToPlayGuide: e.target.checked },
                    })
                  }
                />
                Hiển thị Bảng Hướng dẫn Cách chơi trên màn hình LIVE
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.match.autoRound}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      match: { ...draftSettings.match, autoRound: e.target.checked },
                    })
                  }
                />
                Tự động sang trận mới sau khi hết giờ
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftSettings.team.neutralGiftEnabled}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      team: { ...draftSettings.team, neutralGiftEnabled: e.target.checked },
                    })
                  }
                />
                Hiển thị nhắc chọn đội khi người chưa vào đội tặng quà
              </label>
            </div>

            <button
              onClick={() => saveSettings(draftSettings)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
            >
              <Save className="w-3.5 h-3.5" /> Lưu Cấu Hình
            </button>
          </div>
        )}

        {/* 6. VIEWERS & LEADERBOARD */}
        {activePage === 'viewers' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="font-semibold text-blue-400 mb-2">
                  Thành viên đội BOY ({snapshot.boy.memberCount})
                </div>
                <div className="text-slate-300">
                  {snapshot.boyMembers.length > 0 ? snapshot.boyMembers.join(', ') : 'Chưa có thành viên'}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="font-semibold text-pink-400 mb-2">
                  Thành viên đội GIRL ({snapshot.girl.memberCount})
                </div>
                <div className="text-slate-300">
                  {snapshot.girlMembers.length > 0 ? snapshot.girlMembers.join(', ') : 'Chưa có thành viên'}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-300">Bảng Xếp Hạng Đóng Góp</div>
                <button
                  onClick={() => fetchTabData('viewers')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  Làm mới
                </button>
              </div>
              {leaderboard.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
                  Chưa có dữ liệu bảng xếp hạng.
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Người chơi</th>
                      <th className="py-2 pr-3">Đội</th>
                      <th className="py-2 pr-3 text-right">Tổng điểm</th>
                      <th className="py-2 text-right">Quà</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 tabular-nums">
                    {leaderboard.map((row, i) => (
                      <tr key={row.senderId} className="hover:bg-slate-800/40">
                        <td className="py-2 pr-3 font-mono text-slate-400">{i + 1}</td>
                        <td className="py-2 pr-3 font-medium text-white">{row.displayName}</td>
                        <td className={`py-2 pr-3 font-semibold ${row.team === 'BOY' ? 'text-blue-400' : 'text-pink-400'}`}>
                          {row.team}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-amber-300">
                          {row.contributionPoints.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2 text-right font-mono text-slate-300">{row.giftCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 7. EVENT INSPECTOR */}
        {activePage === 'inspector' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={inspectorQuery}
                onChange={(e) => setInspectorQuery(e.target.value)}
                placeholder="Lọc theo người gửi, quà, lệnh, trạng thái..."
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
              />
              <button
                onClick={() => fetchTabData('inspector', inspectorQuery)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white"
              >
                <Search className="w-3.5 h-3.5" /> Lọc & Tải lại
              </button>
            </div>
            <div className="max-h-[480px] overflow-y-auto border border-slate-800 rounded-lg">
              {inspectorRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Chưa có sự kiện nào khớp bộ lọc.
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                      <th className="py-2 px-3">Loại</th>
                      <th className="py-2 pr-3">Người gửi</th>
                      <th className="py-2 pr-3">Đội</th>
                      <th className="py-2 pr-3">Chi tiết</th>
                      <th className="py-2 pr-3 text-right">Điểm</th>
                      <th className="py-2 pr-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                    {inspectorRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/30">
                        <td className="py-1.5 px-3 text-slate-300">{rec.kind}</td>
                        <td className="py-1.5 pr-3 text-white font-sans">{rec.displayName}</td>
                        <td
                          className={`py-1.5 pr-3 font-semibold ${
                            rec.team === 'BOY'
                              ? 'text-blue-400'
                              : rec.team === 'GIRL'
                                ? 'text-pink-400'
                                : 'text-amber-300'
                          }`}
                        >
                          {rec.team || '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-200 font-sans">
                          {rec.summary}
                          {rec.errorMessage ? ` · ERR: ${rec.errorMessage}` : ''}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-amber-300 tabular-nums">{rec.powerAwarded}</td>
                        <td className="py-1.5 pr-3 text-emerald-300">{rec.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 8. HISTORY, DAILY STATS, LOGS & BACKUP */}
        {activePage === 'history' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                Sao lưu SQLite (.db) & JSON (.json) vào <code className="font-mono text-slate-200">LiveBridge/backups/</code>.
              </div>
              <button
                onClick={async () => {
                  const res = await fetch('/api/backups/create', { method: 'POST' });
                  const info = await res.json();
                  showNotice(`Đã tạo backup: ${info.jsonBackupFile}`);
                  await fetchTabData('history');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
              >
                <DatabaseBackup className="w-3.5 h-3.5" /> Tạo Backup Ngay
              </button>
            </div>

            {history.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">Lịch sử Trận đấu gần đây</div>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Giờ kết thúc</th>
                      <th className="py-2 pr-3">Thắng</th>
                      <th className="py-2 pr-3 text-right">BOY / GIRL</th>
                      <th className="py-2 pr-3">MVP</th>
                      <th className="py-2">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 tabular-nums">
                    {history.slice(0, 10).map((m) => (
                      <tr key={m.matchId}>
                        <td className="py-2 pr-3 font-mono text-slate-400">
                          {new Date(m.endedAt).toLocaleTimeString('vi-VN')}
                        </td>
                        <td className={`py-2 pr-3 font-bold ${m.winnerTeam === 'BOY' ? 'text-blue-400' : 'text-pink-400'}`}>
                          {m.winnerTeam}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-200">
                          {m.boyScore} / {m.girlScore}
                        </td>
                        <td className="py-2 pr-3 text-amber-300">
                          {m.mvpName} ({m.mvpPoints}đ)
                        </td>
                        <td className="py-2 text-slate-300">{m.winReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dailyStats.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">Thống kê theo Ngày</div>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Ngày</th>
                      <th className="py-2 pr-3 text-right">Tổng trận</th>
                      <th className="py-2 pr-3 text-right">BOY</th>
                      <th className="py-2 pr-3 text-right">GIRL</th>
                      <th className="py-2 pr-3 text-right">Quà</th>
                      <th className="py-2 text-right">Chat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 tabular-nums">
                    {dailyStats.slice(0, 7).map((d) => (
                      <tr key={d.dateKey}>
                        <td className="py-2 pr-3 font-mono text-white">{d.dateKey}</td>
                        <td className="py-2 pr-3 text-right font-mono">{d.totalMatches}</td>
                        <td className="py-2 pr-3 text-right font-mono text-blue-400">{d.boyWins}</td>
                        <td className="py-2 pr-3 text-right font-mono text-pink-400">{d.girlWins}</td>
                        <td className="py-2 pr-3 text-right font-mono text-amber-300">{d.totalGifts}</td>
                        <td className="py-2 text-right font-mono">{d.totalChatCommands}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-[220px] overflow-y-auto">
                <div className="px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-950/60">
                  Bản sao lưu ({backups.length})
                </div>
                {backups.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400">Chưa có bản sao lưu.</div>
                ) : (
                  backups.slice(0, 8).map((b) => (
                    <div key={b.fileName} className="px-3 py-2 flex items-center justify-between text-xs">
                      <div className="truncate pr-2">
                        <div className="font-mono text-white truncate">{b.fileName}</div>
                        <div className="text-slate-500 tabular-nums">{(b.sizeBytes / 1024).toFixed(1)} KB</div>
                      </div>
                      {b.fileName.endsWith('.json') && (
                        <button
                          onClick={async () => {
                            const res = await fetch('/api/backups/restore', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ fileName: b.fileName }),
                            });
                            const data = await res.json();
                            showNotice(data.message);
                            await onRefreshState();
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-[220px] overflow-y-auto font-mono text-[11px]">
                <div className="px-3 py-2 text-xs font-sans font-semibold text-slate-300 bg-slate-950/60">
                  Nhật ký Hệ thống
                </div>
                {logs.slice(0, 20).map((log) => (
                  <div key={log.id} className="px-3 py-1.5 flex items-start gap-2">
                    <span className="text-slate-500 shrink-0 tabular-nums">
                      {new Date(log.createdAt).toLocaleTimeString('vi-VN')}
                    </span>
                    <span className="text-blue-300 shrink-0">[{log.module}]</span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const GiftRuleRow: React.FC<{ rule: GiftRule; onSave: (r: GiftRule) => Promise<void> }> = ({
  rule,
  onSave,
}) => {
  const [draft, setDraft] = useState(rule);
  useEffect(() => setDraft(rule), [rule]);

  return (
    <tr className="hover:bg-slate-800/30">
      <td className="py-2 pr-3 font-mono text-slate-400">{draft.giftId}</td>
      <td className="py-2 pr-3">
        <input
          value={draft.giftName}
          onChange={(e) => setDraft({ ...draft, giftName: e.target.value })}
          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white w-44"
        />
      </td>
      <td className="py-2 pr-3">
        <select
          value={draft.team}
          onChange={(e) => setDraft({ ...draft, team: e.target.value as GiftTeamTarget })}
          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white"
        >
          <option value="AUTO">AUTO</option>
          <option value="BOY">BOY</option>
          <option value="GIRL">GIRL</option>
        </select>
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          value={draft.powerPoints}
          onChange={(e) => setDraft({ ...draft, powerPoints: Number(e.target.value) })}
          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono w-20 text-right tabular-nums"
        />
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          value={draft.maxImpact}
          onChange={(e) => setDraft({ ...draft, maxImpact: Number(e.target.value) })}
          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono w-20 text-right tabular-nums"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
      </td>
      <td className="py-2">
        <button
          onClick={() => onSave(draft)}
          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
        >
          Lưu
        </button>
      </td>
    </tr>
  );
};
