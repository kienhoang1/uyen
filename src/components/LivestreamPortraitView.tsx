import React, { useMemo } from 'react';
import {
  Bell,
  BookOpen,
  Crown,
  Gift,
  MessageSquare,
  Trophy,
  Zap,
} from 'lucide-react';
import type {
  ArenaTheme,
  GiftRule,
  MatchStateSnapshot,
} from '../shared/types';
import { Arena3DCanvas } from './Arena3DCanvas';

interface LivestreamPortraitViewProps {
  snapshot: MatchStateSnapshot;
  arenaTheme: ArenaTheme;
  vfxQuality: 'Low' | 'Medium' | 'High';
  chatPowerReward?: number;
  giftRules?: GiftRule[];
  showHowToPlayGuide?: boolean;
  topSafeZonePx?: number;
  onFpsSample?: (fps: number) => void;
  fullscreen?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  Idle: 'Chờ trận',
  Countdown: 'Sẵn sàng',
  Clash: 'Đang PK',
  Overtime: 'Hiệp phụ',
  Victory: 'Kết quả',
  Cooldown: 'Ván mới',
  Paused: 'Tạm dừng',
  EmergencyStopped: 'Đã dừng',
};

export const LivestreamPortraitView: React.FC<LivestreamPortraitViewProps> = ({
  snapshot,
  arenaTheme,
  vfxQuality,
  chatPowerReward = 15,
  giftRules = [],
  showHowToPlayGuide = true,
  topSafeZonePx = 120,
  onFpsSample,
  fullscreen = false,
}) => {
  const totalPowerSum = snapshot.boy.totalPower + snapshot.girl.totalPower;
  const boySharePct =
    totalPowerSum === 0 || snapshot.boy.totalPower === snapshot.girl.totalPower
      ? 50
      : Math.max(14, Math.min(86, Math.round((snapshot.boy.totalPower / totalPowerSum) * 100)));
  const girlSharePct = 100 - boySharePct;

  const timeMin = Math.floor(snapshot.phaseRemainingSec / 60);
  const timeSec = Math.floor(snapshot.phaseRemainingSec % 60);
  const timerStr = `${String(timeMin).padStart(2, '0')}:${String(timeSec).padStart(2, '0')}`;

  const callout = snapshot.lastActionCallout;
  const showResultCard =
    (snapshot.phase === 'Victory' || snapshot.phase === 'Cooldown') && Boolean(snapshot.winnerTeam);

  const highlightGifts = useMemo(() => {
    const enabled = giftRules.filter((g) => g.enabled);
    if (enabled.length === 0) {
      return [
        { giftName: 'Hoa Hồng', powerPoints: 25 },
        { giftName: 'Tim Tay', powerPoints: 90 },
        { giftName: 'Sư Tử', powerPoints: 600 },
      ];
    }
    const sorted = [...enabled].sort((a, b) => a.powerPoints - b.powerPoints);
    if (sorted.length <= 3) return sorted;
    return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
  }, [giftRules]);

  const safeTopPx = Math.max(60, Math.min(200, Math.round(topSafeZonePx)));

  return (
    <div
      className={`relative bg-slate-950 overflow-hidden select-none border border-slate-800 ${
        fullscreen
          ? 'h-screen max-h-screen w-auto max-w-[100vw] aspect-[9/16] mx-auto rounded-none sm:rounded-xl'
          : 'w-full max-w-[420px] aspect-[9/16] mx-auto rounded-xl shadow-2xl'
      }`}
    >
      {/* 3D Arena Background */}
      <div className="absolute inset-0">
        <Arena3DCanvas
          snapshot={snapshot}
          arenaTheme={arenaTheme}
          vfxQuality={vfxQuality}
          onFpsSample={onFpsSample}
        />
      </div>

      {/* Subtle Neon Rim Borders */}
      <div className="pointer-events-none absolute inset-y-28 left-0 w-0.5 bg-gradient-to-b from-transparent via-sky-400/75 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-28 right-0 w-0.5 bg-gradient-to-b from-transparent via-pink-500/75 to-transparent z-10" />

      {/* FULL-BLEED 9:16 OVERLAY: CLEAN EMPTY TOP SAFE ZONE + NEON PK BAR + LEFT-ALIGNED CARDS */}
      <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
        <div>
          {/* 1. COMPLETELY EMPTY TOP SAFE ZONE FOR TIKTOK LIVE HEADER & NATIVE WISHLIST/GOAL */}
          <div aria-hidden="true" style={{ height: `${safeTopPx}px` }} />

          {/* 2. SLEEK NEON PK BAR + NOTIFICATIONS IMMEDIATELY BELOW TOP SAFE ZONE */}
          <div className="px-2.5 pb-2 bg-gradient-to-b from-slate-950/85 via-slate-950/65 to-transparent space-y-1.5">
            {/* Timer & Session Win Tally */}
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
              <div className="font-mono font-black text-sky-300 px-2 py-0.5 rounded bg-slate-950/90 border border-sky-500/45 tabular-nums">
                BOY {snapshot.boyWinsSession}
                {snapshot.boyWinStreak > 1 ? ` (x${snapshot.boyWinStreak})` : ''}
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-md bg-slate-950 border border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.28)] text-amber-300 tabular-nums shrink-0">
                <span className="font-mono text-sm font-black leading-none">{timerStr}</span>
                <span className="text-[9px] font-extrabold uppercase text-slate-200">
                  {PHASE_LABELS[snapshot.phase] || snapshot.phase}
                </span>
              </div>

              <div className="font-mono font-black text-pink-300 px-2 py-0.5 rounded bg-slate-950/90 border border-pink-500/45 tabular-nums">
                GIRL {snapshot.girlWinsSession}
                {snapshot.girlWinStreak > 1 ? ` (x${snapshot.girlWinStreak})` : ''}
              </div>
            </div>

            {/* Neon Esports PK Progress Bar */}
            <div className="relative h-10 w-full rounded-lg bg-slate-950 border border-sky-400/60 overflow-hidden flex shadow-[0_0_18px_rgba(37,99,235,0.3),0_0_18px_rgba(236,72,153,0.25)]">
              <div
                className="h-full bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-400 transition-all duration-150 flex items-center justify-between px-2.5 shadow-[inset_0_0_12px_rgba(56,189,248,0.45)]"
                style={{ width: `${boySharePct}%` }}
              >
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="text-[10px] font-black text-sky-100 uppercase tracking-wider">
                    BOY
                  </span>
                  <span className="font-mono text-lg font-black text-white drop-shadow tabular-nums">
                    {snapshot.boy.totalPower.toLocaleString('vi-VN')}
                  </span>
                </div>
                <span className="font-mono text-[10px] font-black text-white/95 tabular-nums">
                  {boySharePct}%
                </span>
              </div>

              <div
                className="h-full bg-gradient-to-r from-rose-400 via-pink-500 to-fuchsia-800 transition-all duration-150 flex items-center justify-between px-2.5 shadow-[inset_0_0_12px_rgba(244,114,182,0.45)]"
                style={{ width: `${girlSharePct}%` }}
              >
                <span className="font-mono text-[10px] font-black text-white/95 tabular-nums">
                  {girlSharePct}%
                </span>
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="font-mono text-lg font-black text-white drop-shadow tabular-nums">
                    {snapshot.girl.totalPower.toLocaleString('vi-VN')}
                  </span>
                  <span className="text-[10px] font-black text-pink-100 uppercase tracking-wider">
                    GIRL
                  </span>
                </div>
              </div>

              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-950 border-2 border-amber-400 text-[10px] font-black text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.7)] flex items-center gap-0.5"
                style={{ left: `${boySharePct}%` }}
              >
                <Zap className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                PK
              </div>
            </div>

            {/* Match Result / Alerts / Notifications (Left Column w-[73%], right side open for TikTok UI) */}
            <div className="w-[73%] space-y-1.5">
              {showResultCard && snapshot.winnerTeam && (
                <div
                  className={`rounded-lg px-2.5 py-2 border-2 shadow-xl ${
                    snapshot.winnerTeam === 'BOY'
                      ? 'bg-blue-950/95 border-sky-400 text-white shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                      : 'bg-pink-950/95 border-pink-400 text-white shadow-[0_0_16px_rgba(244,114,182,0.35)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-display text-sm font-black text-amber-300">
                    <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>KẾT QUẢ · ĐỘI {snapshot.winnerTeam} THẮNG!</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono font-bold tabular-nums">
                    <span className="text-sky-300">BOY {snapshot.boy.totalPower.toLocaleString('vi-VN')}</span>
                    <span className="text-slate-400 mx-1.5">vs</span>
                    <span className="text-pink-300">{snapshot.girl.totalPower.toLocaleString('vi-VN')} GIRL</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-200 truncate">
                    {snapshot.winReason}
                    {snapshot.mvp ? ` · MVP: ${snapshot.mvp.displayName}` : ''}
                  </div>
                </div>
              )}

              {!showResultCard && snapshot.nearWinTeam && (
                <div
                  className={`rounded-lg px-2.5 py-1.5 border-2 shadow-lg ${
                    snapshot.nearWinTeam === 'BOY'
                      ? 'bg-blue-950/95 border-amber-400 text-white'
                      : 'bg-pink-950/95 border-amber-400 text-white'
                  }`}
                >
                  <div className="font-display text-xs font-black text-amber-300">
                    CẢNH BÁO · {snapshot.nearWinTeam} SẮP THẮNG!
                  </div>
                  <div className="text-[10px] font-semibold text-white tabular-nums">
                    Còn cách mép sàn {Math.max(1, 100 - snapshot.nearWinProgressPct)}% — Mau đẩy!
                  </div>
                </div>
              )}

              {snapshot.activeGiftStreaks.slice(0, 1).map((st) => (
                <div
                  key={st.streakKey}
                  className={`rounded-lg px-2.5 py-1 flex items-center justify-between text-[11px] font-semibold border ${
                    st.team === 'BOY'
                      ? 'bg-blue-950/95 border-sky-400/70 text-blue-100'
                      : st.team === 'GIRL'
                        ? 'bg-pink-950/95 border-pink-400/70 text-pink-100'
                        : 'bg-slate-900/95 border-amber-400/70 text-amber-200'
                  }`}
                >
                  <span className="truncate flex items-center gap-1">
                    <Gift className="w-3 h-3 text-amber-300 shrink-0" />
                    {st.displayName} · {st.giftName}
                  </span>
                  <span className="font-mono font-black text-amber-300 ml-1.5 shrink-0 tabular-nums">
                    x{st.currentCount}
                  </span>
                </div>
              ))}

              {!showResultCard && !snapshot.nearWinTeam && snapshot.activeBanner && (
                <div
                  className={`rounded-lg px-2.5 py-1.5 border shadow-md ${
                    snapshot.activeBanner.team === 'BOY'
                      ? 'bg-blue-950/95 border-sky-400/75'
                      : snapshot.activeBanner.team === 'GIRL'
                        ? 'bg-pink-950/95 border-pink-400/75'
                        : 'bg-slate-900/95 border-amber-400/75'
                  }`}
                >
                  <div className="text-[11px] font-extrabold text-white flex items-center gap-1 truncate">
                    <Bell className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="truncate">{snapshot.activeBanner.title}</span>
                  </div>
                  <div className="text-[10px] text-slate-200 truncate">
                    {snapshot.activeBanner.subtitle}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* === MIDDLE: OPEN 3D FIGHT ARENA === */}
        <div className="flex-1 min-h-[120px]" />

        {/* === BOTTOM LEFT STACK (w-[73%]): CALLOUT + HOW TO PLAY GUIDE + FEED + MVP === */}
        <div className="p-2.5 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-transparent">
          <div className="w-[73%] space-y-1.5">
            {callout && (
              <div
                className={`rounded-lg px-2.5 py-1.5 border flex items-center justify-between gap-2 shadow-lg ${
                  callout.team === 'BOY'
                    ? 'bg-blue-950/95 border-sky-400/80 text-white shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                    : callout.team === 'GIRL'
                      ? 'bg-pink-950/95 border-pink-400/80 text-white shadow-[0_0_12px_rgba(244,114,182,0.2)]'
                      : 'bg-amber-950/95 border-amber-400/80 text-amber-100'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold truncate">{callout.displayName}</div>
                  <div className="text-[10px] text-slate-200 truncate">{callout.actionLabel}</div>
                </div>
                <div
                  className={`font-mono text-base font-black tabular-nums shrink-0 ${
                    callout.team === 'BOY'
                      ? 'text-sky-300'
                      : callout.team === 'GIRL'
                        ? 'text-pink-300'
                        : 'text-amber-300'
                  }`}
                >
                  +{callout.powerAdded}
                </div>
              </div>
            )}

            {showHowToPlayGuide && (
              <div className="rounded-lg bg-slate-950/92 border border-sky-500/45 px-2.5 py-1.5 shadow-lg space-y-1">
                <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-sky-300">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-2.5 h-2.5 text-amber-300" />
                    Cách chơi · Đẩy rơi sàn = Thắng
                  </span>
                </div>
                <div className="space-y-1 text-[10px]">
                  <div className="rounded bg-slate-900/95 border border-sky-500/35 px-2 py-1 flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1 text-slate-200 truncate">
                      <MessageSquare className="w-3 h-3 text-sky-400 shrink-0" />
                      <span>
                        Chat <b className="text-sky-400">BOY</b> / <b className="text-pink-400">GIRL</b>
                      </span>
                    </span>
                    <span className="font-mono font-black text-amber-300 tabular-nums shrink-0">
                      +{chatPowerReward}
                    </span>
                  </div>
                  <div className="rounded bg-slate-900/95 border border-pink-500/35 px-2 py-1 flex items-center gap-1 text-slate-200 truncate">
                    <Gift className="w-3 h-3 text-pink-400 shrink-0" />
                    <span className="truncate tabular-nums">
                      {highlightGifts.map((g) => `${g.giftName} +${g.powerPoints}`).join(' · ')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {snapshot.recentFeed.length > 0 && (
              <div className="space-y-1 max-h-[48px] overflow-hidden">
                {snapshot.recentFeed.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-1.5 text-[10px] rounded px-2 py-0.5 bg-slate-900/90 border border-slate-800"
                  >
                    <div className="truncate">
                      <span
                        className={`font-bold mr-1 ${
                          item.team === 'BOY'
                            ? 'text-sky-400'
                            : item.team === 'GIRL'
                              ? 'text-pink-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {item.displayName}
                      </span>
                      <span className="text-slate-200">{item.text}</span>
                    </div>
                    {typeof item.powerDelta === 'number' && item.powerDelta > 0 && (
                      <span className="text-[10px] font-mono font-bold text-amber-300 tabular-nums shrink-0">
                        +{item.powerDelta}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-slate-950/92 border border-slate-800 px-2.5 py-1 flex items-center justify-between gap-2 text-[10px]">
              <span className="text-slate-400 flex items-center gap-1 shrink-0">
                <Crown className="w-3 h-3 text-amber-400" />
                MVP:
              </span>
              <span className="font-bold text-amber-300 truncate tabular-nums">
                {snapshot.mvp
                  ? `${snapshot.mvp.displayName} (${snapshot.mvp.points}đ)`
                  : 'Đang chờ người dẫn đầu'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
