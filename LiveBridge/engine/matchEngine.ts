import crypto from 'node:crypto';
import type {
  ActionCallout,
  ActiveFeedItem,
  ActiveGiftStreakSnapshot,
  AllSettings,
  CharacterState,
  FighterSnapshot,
  GameModeId,
  GiftRule,
  MatchPhase,
  MatchStateSnapshot,
  NormalizedLiveEvent,
  PerformanceMetrics,
  RecordedTeamId,
  TeamId,
} from '../../src/shared/types.js';
import type { ArenaDatabase } from '../db/database.js';
import {
  BoundedEventQueue,
  EventDeduplicator,
  EventNormalizer,
  type RawIncomingEvent,
} from '../bridge/eventPipeline.js';

interface InternalFighterState {
  team: TeamId;
  positionX: number;
  velocityX: number;
  state: CharacterState;
  chatPower: number;
  giftPower: number;
  knockbackVelocity: number;
  attackAnimUntilMs: number;
  staggerUntilMs: number;
  leanAngleDeg: number;
}

interface ViewerContribEntry {
  senderId: string;
  displayName: string;
  team: TeamId;
  points: number;
  giftCount: number;
  maxStreak: number;
}

interface ActiveStreakState extends ActiveGiftStreakSnapshot {
  explicitTeam?: TeamId;
  ruleGiftId: string;
  lastEvent: NormalizedLiveEvent;
}

export interface MatchEngineHooks {
  onSnapshot?: (snapshot: MatchStateSnapshot) => void;
  onNormalizedEvent?: (event: NormalizedLiveEvent) => void;
}

const STREAK_IDLE_FINALIZE_MS = 3500;
const NEAR_WIN_THRESHOLD = 0.68;

export class MatchEngine {
  private readonly db: ArenaDatabase;
  private readonly normalizer = new EventNormalizer();
  private readonly deduplicator: EventDeduplicator;
  private readonly queue: BoundedEventQueue;
  private readonly hooks: MatchEngineHooks;

  private settings: AllSettings;
  private giftRules: GiftRule[];

  private matchId: string = crypto.randomUUID();
  private readonly activeGameMode: GameModeId = 'ClassicPush';
  private phase: MatchPhase = 'Idle';
  private pausedFromPhase: MatchPhase = 'Clash';
  private phaseRemainingSec = 0;
  private totalElapsedSec = 0;
  private matchStartedAt = Date.now();
  private peakPowerThisMatch = 0;

  private boy: InternalFighterState;
  private girl: InternalFighterState;

  private boyWinsSession = 0;
  private girlWinsSession = 0;
  private boyWinStreak = 0;
  private girlWinStreak = 0;
  private winnerTeam: TeamId | null = null;
  private winReason: string | null = null;
  private viewerCount: number | null = null;

  private readonly matchContrib = new Map<string, ViewerContribEntry>();
  private readonly userLastChatMs = new Map<string, number>();
  private readonly userLastNormalChatDisplayMs = new Map<string, number>();
  private readonly userLastTeam = new Map<string, TeamId>();
  private readonly userDisplayNames = new Map<string, string>();
  private readonly userTeamSwitchAt = new Map<string, number>();

  private readonly activeStreaks = new Map<string, ActiveStreakState>();
  private readonly committedStreakCounts = new Map<string, number>();

  private lastActionCallout: ActionCallout | null = null;
  private liveGoalCurrent = 0;
  private liveGoalSyncedFromLive = false;
  private externalLiveGoalOverride: {
    title?: string;
    giftId?: string;
    giftName?: string;
    targetCount?: number;
  } | null = null;
  private recentFeed: ActiveFeedItem[] = [];
  private activeBanner: MatchStateSnapshot['activeBanner'] = null;

  private eventsReceivedTotal = 0;
  private eventsProcessedTotal = 0;
  private duplicatesDroppedTotal = 0;
  private eventsFailedTotal = 0;
  private errorCount = 0;
  private totalEventProcessMs = 0;
  private maxEventProcessMs = 0;
  private lastStepNowMs = Date.now();
  private readonly startedAt = Date.now();

  constructor(db: ArenaDatabase, hooks: MatchEngineHooks = {}, maxQueueSize = 2500) {
    this.db = db;
    this.hooks = hooks;
    this.queue = new BoundedEventQueue(maxQueueSize);
    this.deduplicator = new EventDeduplicator(20000, (k) => this.db.hasDedupKey(k));
    this.settings = this.db.getAllSettings();
    this.giftRules = this.db.getGiftRules();

    this.boy = this.createInitialFighter('BOY', -0.75);
    this.girl = this.createInitialFighter('GIRL', 0.75);

    this.recoverPendingStreaks(Date.now());
  }

  private createInitialFighter(team: TeamId, posX: number): InternalFighterState {
    return {
      team,
      positionX: posX,
      velocityX: 0,
      state: 'Idle',
      chatPower: 0,
      giftPower: 0,
      knockbackVelocity: 0,
      attackAnimUntilMs: 0,
      staggerUntilMs: 0,
      leanAngleDeg: 0,
    };
  }

  public recoverPendingStreaks(nowMs = Date.now()): number {
    const pendingList = this.db.getActivePendingStreaks();
    let recovered = 0;
    for (const p of pendingList) {
      const syntheticEv: NormalizedLiveEvent = {
        eventId: crypto.randomUUID(),
        dedupKey: `gift_final:${p.streakKey}`,
        eventType: 'Gift',
        priority: 1,
        timestamp: p.lastUpdatedAt,
        senderId: p.senderId,
        displayName: p.displayName,
        payload: {
          giftId: p.giftId,
          giftName: p.giftName,
          team: p.explicitTeam ?? undefined,
          quantity: p.currentCount,
          streakCount: p.currentCount,
          repeatEnd: true,
          diamondCount: p.diamondCount,
        },
        status: 'QUEUED',
      };
      this.commitFinalGiftTransaction(
        p.streakKey,
        syntheticEv,
        p.currentCount,
        p.explicitTeam ?? undefined,
        nowMs
      );
      this.db.markPendingStreakCommitted(p.streakKey);
      recovered += 1;
    }
    if (recovered > 0) {
      this.db.log('INFO', 'Recovery', `Recovered ${recovered} interrupted Gift Streaks from SQLite`);
    }
    return recovered;
  }

  public reloadConfigFromDb(): void {
    this.settings = this.db.getAllSettings();
    this.giftRules = this.db.getGiftRules();
  }

  public ingestRawEvent(raw: RawIncomingEvent): NormalizedLiveEvent {
    this.eventsReceivedTotal += 1;
    const ev = this.normalizer.normalize(raw);
    if (this.deduplicator.isDuplicate(ev.dedupKey)) {
      ev.status = 'DUPLICATE_DROPPED';
      this.duplicatesDroppedTotal += 1;
      this.hooks.onNormalizedEvent?.(ev);
      return ev;
    }

    const res = this.queue.enqueue(ev);
    if (!res.accepted) {
      this.db.log('WARN', 'EventQueue', 'Queue saturated: shed low-priority event to protect Gifts/Commands', {
        eventType: ev.eventType,
        maxSize: this.queue.maxSize,
      });
      this.hooks.onNormalizedEvent?.(ev);
      return ev;
    }
    if (res.nearCapacity) {
      this.db.log('WARN', 'EventQueue', 'Queue above 80% capacity', {
        size: this.queue.size(),
        maxSize: this.queue.maxSize,
      });
    }
    return ev;
  }

  public startMatch(manual = true): void {
    this.reloadConfigFromDb();
    this.matchId = crypto.randomUUID();
    this.lastStepNowMs = Date.now();
    this.matchStartedAt = this.lastStepNowMs;
    this.totalElapsedSec = 0;
    this.peakPowerThisMatch = this.settings.team.basePower;
    this.winnerTeam = null;
    this.winReason = null;
    this.lastActionCallout = null;
    this.matchContrib.clear();

    this.boy = this.createInitialFighter('BOY', -0.75);
    this.girl = this.createInitialFighter('GIRL', 0.75);

    this.phase = 'Countdown';
    this.phaseRemainingSec = 3;
    this.setBanner(
      'TRẬN ĐẤU MỚI SẮP BẮT ĐẦU!',
      'Chat BOY hoặc GIRL để đẩy đối thủ ra khỏi sàn!',
      undefined,
      3000
    );
    if (manual) {
      this.db.log('INFO', 'MatchControl', 'Manual Start Match', {
        matchId: this.matchId,
        durationSec: this.settings.match.matchDurationSec,
      });
    }
    this.pushFeed({
      id: crypto.randomUUID(),
      kind: 'SYSTEM',
      displayName: 'Trọng tài',
      text: 'Trận Classic Push mới bắt đầu — Chat BOY hoặc GIRL để đẩy!',
      timestamp: Date.now(),
    });
  }

  public pauseMatch(): void {
    if (this.phase === 'Idle' || this.phase === 'Paused' || this.phase === 'EmergencyStopped') return;
    this.pausedFromPhase = this.phase;
    this.phase = 'Paused';
    this.db.log('INFO', 'MatchControl', 'Match Paused', { from: this.pausedFromPhase });
  }

  public resumeMatch(): void {
    if (this.phase !== 'Paused') return;
    this.phase = this.pausedFromPhase;
    this.db.log('INFO', 'MatchControl', 'Match Resumed', { to: this.phase });
  }

  public resetMatch(): void {
    this.db.log('INFO', 'MatchControl', 'Match Reset (History preserved)', { matchId: this.matchId });
    this.startMatch(false);
  }

  public emergencyStop(): void {
    this.phase = 'EmergencyStopped';
    this.boy.velocityX = 0;
    this.girl.velocityX = 0;
    this.boy.knockbackVelocity = 0;
    this.girl.knockbackVelocity = 0;
    this.boy.state = 'Idle';
    this.girl.state = 'Idle';
    this.setBanner('DỪNG KHẨN CẤP', 'Quản trị viên đã kích hoạt Emergency Stop', undefined, 5000);
    this.db.log('WARN', 'MatchControl', 'Emergency Stop triggered');
  }

  public setViewerCount(count: number | null): void {
    this.viewerCount = count;
  }

  public resetLiveGoal(): void {
    this.liveGoalCurrent = 0;
    this.liveGoalSyncedFromLive = false;
    this.externalLiveGoalOverride = null;
    this.db.log('INFO', 'LiveGoal', 'Reset tiến độ Ý muốn TikTok LIVE về 0');
  }

  public syncExternalLiveGoal(goal: {
    title?: string;
    giftId?: string;
    giftName?: string;
    currentCount: number;
    targetCount: number;
  }): void {
    this.liveGoalSyncedFromLive = true;
    this.liveGoalCurrent = Math.max(0, Math.round(goal.currentCount));
    this.externalLiveGoalOverride = {
      title: goal.title,
      giftId: goal.giftId,
      giftName: goal.giftName,
      targetCount: Math.max(1, Math.round(goal.targetCount)),
    };
  }

  private applyLiveGoalProgress(giftId: string, giftName: string, qty: number, nowMs: number): void {
    void giftName;
    if (this.liveGoalSyncedFromLive) return;
    const goal = this.settings.general.liveGoal;
    if (!goal?.enabled) return;
    if (goal.giftId !== 'ALL' && goal.giftId !== giftId) return;
    const prev = this.liveGoalCurrent;
    this.liveGoalCurrent += Math.max(1, qty);
    if (prev < goal.targetCount && this.liveGoalCurrent >= goal.targetCount) {
      this.setBanner(
        `ĐẠT Ý MUỐN LIVE: ${goal.giftName.toUpperCase()}!`,
        `Cảm ơn khán giả đã hoàn thành mốc ${goal.targetCount} ${goal.giftName}!`,
        undefined,
        3600,
        nowMs
      );
      this.pushFeed({
        id: crypto.randomUUID(),
        kind: 'SYSTEM',
        displayName: 'Ý muốn LIVE',
        text: `Đã hoàn thành mục tiêu ${goal.targetCount} ${goal.giftName}!`,
        timestamp: nowMs,
      });
    }
  }

  public step(dtSec: number, nowMs = Date.now()): MatchStateSnapshot {
    this.lastStepNowMs = nowMs;
    const batch = this.queue.dequeueBatch(150);
    for (const ev of batch) {
      const evStart = performance.now();
      this.processEventWithRetry(ev, nowMs);
      const dur = performance.now() - evStart;
      this.totalEventProcessMs += dur;
      if (dur > this.maxEventProcessMs) this.maxEventProcessMs = dur;
    }

    this.flushTimedOutStreaks(nowMs);

    if (this.activeBanner && nowMs >= this.activeBanner.expiresAt) {
      this.activeBanner = null;
    }

    if (this.phase !== 'Idle' && this.phase !== 'Paused' && this.phase !== 'EmergencyStopped') {
      this.advancePhaseAndPhysics(dtSec, nowMs);
    }

    const snap = this.getSnapshot(nowMs);
    this.hooks.onSnapshot?.(snap);
    return snap;
  }

  private flushTimedOutStreaks(nowMs: number, forceAll = false): void {
    for (const [streakKey, st] of this.activeStreaks.entries()) {
      if (forceAll || nowMs - st.updatedAt >= STREAK_IDLE_FINALIZE_MS) {
        this.activeStreaks.delete(streakKey);
        this.commitFinalGiftTransaction(
          streakKey,
          st.lastEvent,
          st.currentCount,
          st.explicitTeam,
          nowMs
        );
        this.db.markPendingStreakCommitted(streakKey);
      }
    }
  }

  private processEventWithRetry(ev: NormalizedLiveEvent, nowMs: number): void {
    try {
      this.processEvent(ev, nowMs);
    } catch (firstErr) {
      try {
        this.processEvent(ev, nowMs);
      } catch (err) {
        this.errorCount += 1;
        this.eventsFailedTotal += 1;
        ev.status = 'ERROR';
        const msg = err instanceof Error ? err.message : String(firstErr);
        this.db.recordDeadLetterEvent(ev, msg);
        this.db.log('ERROR', 'EventPipeline', 'Failed event written to DeadLetterEvents', {
          eventId: ev.eventId,
          error: msg,
        });
        this.hooks.onNormalizedEvent?.(ev);
      }
    }
  }

  private processEvent(ev: NormalizedLiveEvent, nowMs: number): void {
    if (this.deduplicator.isDuplicate(ev.dedupKey)) {
      ev.status = 'DUPLICATE_DROPPED';
      this.duplicatesDroppedTotal += 1;
      this.hooks.onNormalizedEvent?.(ev);
      return;
    }

    if (ev.eventType === 'Chat') {
      this.handleChatEvent(ev, nowMs);
    } else if (ev.eventType === 'Gift') {
      this.handleGiftEvent(ev, nowMs);
    } else if (ev.eventType === 'Disconnect' || ev.eventType === 'StreamEnd') {
      this.flushTimedOutStreaks(nowMs, true);
      ev.status = 'PROCESSED';
    } else {
      ev.status = 'PROCESSED';
    }

    this.deduplicator.markProcessed(ev.dedupKey);
    this.eventsProcessedTotal += 1;
    this.hooks.onNormalizedEvent?.(ev);
  }

  private handleChatEvent(ev: NormalizedLiveEvent, nowMs: number): void {
    const cmd = ev.payload.command ?? 'NONE';
    if (cmd === 'NONE') {
      if (this.settings.team.showNormalChat && ev.payload.message) {
        const lastDisplayAt = this.userLastNormalChatDisplayMs.get(ev.senderId) ?? 0;
        if (nowMs - lastDisplayAt >= 4000) {
          this.userLastNormalChatDisplayMs.set(ev.senderId, nowMs);
          this.pushFeed({
            id: ev.eventId,
            kind: 'CHAT',
            team: this.userLastTeam.get(ev.senderId),
            displayName: ev.displayName,
            text: ev.payload.message,
            timestamp: ev.timestamp,
          });
        }
      }
      ev.status = 'PROCESSED';
      return;
    }

    // Only 2 team commands: BOY or GIRL
    const requestedTeam: TeamId = cmd;
    const prevTeam = this.userLastTeam.get(ev.senderId) ?? null;
    let isInitialJoin = false;

    if (prevTeam && prevTeam !== requestedTeam) {
      const lastSwitch = this.userTeamSwitchAt.get(ev.senderId) ?? 0;
      if (nowMs - lastSwitch < this.settings.team.teamSwitchCooldownSec * 1000) {
        ev.status = 'RATE_LIMITED';
        return;
      }
      this.userTeamSwitchAt.set(ev.senderId, nowMs);
    } else if (!prevTeam) {
      isInitialJoin = true;
      this.userTeamSwitchAt.set(ev.senderId, nowMs);
    }

    const lastAt = this.userLastChatMs.get(ev.senderId) ?? 0;
    if (!isInitialJoin && nowMs - lastAt < this.settings.team.chatCooldownSec * 1000) {
      ev.status = 'RATE_LIMITED';
      return;
    }

    this.userLastChatMs.set(ev.senderId, nowMs);
    this.userLastTeam.set(ev.senderId, requestedTeam);
    this.userDisplayNames.set(ev.senderId, ev.displayName);

    const fighter = requestedTeam === 'BOY' ? this.boy : this.girl;
    const opponent = requestedTeam === 'BOY' ? this.girl : this.boy;
    const awarded = this.settings.team.chatPowerReward;

    const recorded = this.db.recordChatEvent(ev, requestedTeam, awarded);
    if (!recorded) {
      ev.status = 'DUPLICATE_DROPPED';
      this.duplicatesDroppedTotal += 1;
      return;
    }

    const actualAdded = this.addDirectPower(fighter, 'chat', awarded);
    this.addContribution(ev.senderId, ev.displayName, requestedTeam, awarded, 0);

    // Immediate visible push lunge + opponent knockback
    const dir = requestedTeam === 'BOY' ? 1 : -1;
    fighter.attackAnimUntilMs = nowMs + 480;
    opponent.knockbackVelocity += dir * 0.42;

    this.lastActionCallout = {
      id: ev.eventId,
      kind: 'CHAT',
      team: requestedTeam,
      displayName: ev.displayName,
      actionLabel: `Chat ${requestedTeam}`,
      powerAdded: actualAdded,
      timestamp: nowMs,
    };

    this.pushFeed({
      id: ev.eventId,
      kind: 'CHAT',
      team: requestedTeam,
      displayName: ev.displayName,
      text: `Chat ${requestedTeam} (+${actualAdded})`,
      powerDelta: actualAdded,
      timestamp: ev.timestamp,
    });
    ev.status = 'PROCESSED';
  }

  private resolveGiftTeam(
    senderId: string,
    rule: GiftRule | undefined,
    explicitTeam?: TeamId
  ): RecordedTeamId {
    const joined = this.userLastTeam.get(senderId);
    if (joined) return joined;
    if (rule && (rule.team === 'BOY' || rule.team === 'GIRL')) return rule.team;
    if (explicitTeam) return explicitTeam;
    return 'NEUTRAL';
  }

  private handleGiftEvent(ev: NormalizedLiveEvent, nowMs: number): void {
    const giftId = ev.payload.giftId || 'unknown';
    const rule = this.giftRules.find((r) => r.giftId === giftId && r.enabled);
    const resolvedTeam = this.resolveGiftTeam(ev.senderId, rule, ev.payload.team);
    const giftName = rule?.giftName ?? ev.payload.giftName ?? `Quà #${giftId}`;

    const groupPart = ev.payload.groupId || ev.payload.msgId || ev.eventId;
    const streakKey = `${ev.senderId}:${giftId}:${groupPart}`;
    const incomingStreak = Math.max(1, ev.payload.streakCount ?? ev.payload.quantity ?? 1);
    const repeatEnd = ev.payload.repeatEnd !== false;

    if (!repeatEnd) {
      const existing = this.activeStreaks.get(streakKey);
      const updatedCount = Math.max(existing?.currentCount ?? 0, incomingStreak);
      const streakEntry: ActiveStreakState = {
        streakKey,
        senderId: ev.senderId,
        displayName: ev.displayName,
        team: resolvedTeam,
        giftId,
        giftName,
        currentCount: updatedCount,
        updatedAt: nowMs,
        explicitTeam: ev.payload.team,
        ruleGiftId: giftId,
        lastEvent: ev,
      };
      this.activeStreaks.set(streakKey, streakEntry);
      this.db.upsertPendingStreak({
        streakKey,
        senderId: ev.senderId,
        displayName: ev.displayName,
        giftId,
        giftName,
        team: resolvedTeam,
        explicitTeam: ev.payload.team ?? null,
        currentCount: updatedCount,
        diamondCount: ev.payload.diamondCount ?? 0,
        lastUpdatedAt: nowMs,
      });
      ev.status = 'STREAK_PROGRESS';
      return;
    }

    const pending = this.activeStreaks.get(streakKey);
    if (pending) {
      this.activeStreaks.delete(streakKey);
      this.db.markPendingStreakCommitted(streakKey);
    }

    const totalStreakQty = Math.max(
      incomingStreak,
      pending?.currentCount ?? 0,
      ev.payload.quantity ?? 1
    );

    const committedSoFar = this.committedStreakCounts.get(streakKey) ?? 0;
    if (ev.payload.groupId && committedSoFar > 0) {
      if (totalStreakQty <= committedSoFar) {
        ev.status = 'DUPLICATE_DROPPED';
        this.duplicatesDroppedTotal += 1;
        return;
      }
      const deltaQty = totalStreakQty - committedSoFar;
      this.committedStreakCounts.set(streakKey, totalStreakQty);
      this.commitFinalGiftTransaction(streakKey, ev, deltaQty, ev.payload.team, nowMs, totalStreakQty);
      return;
    }

    if (ev.payload.groupId) {
      this.committedStreakCounts.set(streakKey, totalStreakQty);
    }
    this.commitFinalGiftTransaction(
      streakKey,
      ev,
      totalStreakQty,
      ev.payload.team,
      nowMs,
      totalStreakQty
    );
  }

  private commitFinalGiftTransaction(
    streakKey: string,
    ev: NormalizedLiveEvent,
    awardQty: number,
    explicitTeam: TeamId | undefined,
    nowMs: number,
    displayStreakCount = awardQty
  ): void {
    const giftId = ev.payload.giftId || 'unknown';
    const rule = this.giftRules.find((r) => r.giftId === giftId && r.enabled);
    const resolvedTeam = this.resolveGiftTeam(ev.senderId, rule, explicitTeam ?? ev.payload.team);
    const giftName = rule?.giftName ?? ev.payload.giftName ?? `Quà #${giftId}`;

    const commitEv: NormalizedLiveEvent = {
      ...ev,
      dedupKey:
        ev.payload.groupId &&
        ev.payload.repeatEnd === true &&
        !ev.dedupKey.startsWith('dup_test') &&
        !ev.dedupKey.startsWith('exact-dup')
          ? `gift_final:${streakKey}:${displayStreakCount}`
          : ev.dedupKey,
      payload: {
        ...ev.payload,
        quantity: awardQty,
        streakCount: displayStreakCount,
      },
    };

    if (resolvedTeam === 'NEUTRAL') {
      const neutralAllowed =
        this.settings.team.neutralGiftEnabled && rule?.neutralBehavior !== 'REQUIRE_TEAM';
      const neutralPts = neutralAllowed ? this.settings.team.neutralGiftPower * awardQty : 0;

      const recorded = this.db.recordGiftEvent(
        commitEv,
        'NEUTRAL',
        neutralPts,
        'NEUTRAL_WAIT_TEAM'
      );
      if (!recorded) {
        ev.status = 'DUPLICATE_DROPPED';
        this.duplicatesDroppedTotal += 1;
        return;
      }

      this.applyLiveGoalProgress(giftId, giftName, awardQty, nowMs);

      this.lastActionCallout = {
        id: ev.eventId,
        kind: 'NEUTRAL',
        team: 'NEUTRAL',
        displayName: ev.displayName,
        actionLabel: `Tặng ${giftName} x${displayStreakCount} · Chat BOY/GIRL để chọn đội!`,
        powerAdded: neutralPts,
        timestamp: nowMs,
      };
      this.setBanner(
        `QUÀ TRUNG LẬP: ${ev.displayName}`,
        `Vừa tặng ${giftName} x${displayStreakCount}! Chat BOY hoặc GIRL để chọn đội!`,
        undefined,
        3000,
        nowMs
      );
      this.pushFeed({
        id: ev.eventId,
        kind: 'NEUTRAL',
        displayName: ev.displayName,
        text: `tặng ${giftName} x${displayStreakCount} — Chat BOY hoặc GIRL để chọn đội!`,
        timestamp: ev.timestamp,
      });
      ev.status = 'PROCESSED';
      return;
    }

    const diamondFallback = Math.max(25, (ev.payload.diamondCount ?? 1) * 10);
    const basePts = rule ? rule.powerPoints : diamondFallback;
    const maxImpact = rule ? rule.maxImpact : 3000;
    const powerAwarded = Math.min(maxImpact, basePts * awardQty);

    const recorded = this.db.recordGiftEvent(commitEv, resolvedTeam, powerAwarded, 'PROCESSED');
    if (!recorded) {
      ev.status = 'DUPLICATE_DROPPED';
      this.duplicatesDroppedTotal += 1;
      return;
    }

    this.applyLiveGoalProgress(giftId, giftName, awardQty, nowMs);
    this.userDisplayNames.set(ev.senderId, ev.displayName);

    const fighter = resolvedTeam === 'BOY' ? this.boy : this.girl;
    const opponent = resolvedTeam === 'BOY' ? this.girl : this.boy;

    const actualAdded = this.addDirectPower(fighter, 'gift', powerAwarded);
    this.addContribution(ev.senderId, ev.displayName, resolvedTeam, powerAwarded, displayStreakCount);

    // Immediate, unmistakably strong physical push reaction on Gifts
    const dir = resolvedTeam === 'BOY' ? 1 : -1;
    fighter.attackAnimUntilMs = nowMs + 700;
    const impulse = Math.min(2.6, 0.55 + Math.sqrt(powerAwarded) * 0.08);
    opponent.knockbackVelocity += dir * impulse;
    if (powerAwarded >= 150) {
      opponent.staggerUntilMs = nowMs + 650;
    }

    const actionText = `Tặng ${giftName}${displayStreakCount > 1 ? ` x${displayStreakCount}` : ''}`;
    this.lastActionCallout = {
      id: ev.eventId,
      kind: 'GIFT',
      team: resolvedTeam,
      displayName: ev.displayName,
      actionLabel: actionText,
      powerAdded: actualAdded,
      timestamp: nowMs,
    };

    if (powerAwarded >= 150) {
      this.setBanner(
        `${ev.displayName} · TẶNG ${giftName.toUpperCase()}!`,
        `+${actualAdded} sức mạnh đẩy cho đội ${resolvedTeam}!`,
        resolvedTeam,
        2400,
        nowMs
      );
    }

    this.pushFeed({
      id: ev.eventId,
      kind: 'GIFT',
      team: resolvedTeam,
      displayName: ev.displayName,
      text: `${actionText} (+${actualAdded})`,
      powerDelta: actualAdded,
      timestamp: ev.timestamp,
    });
    ev.status = 'PROCESSED';
  }

  private addDirectPower(
    fighter: InternalFighterState,
    bucket: 'chat' | 'gift',
    rawAmount: number
  ): number {
    const currentTotal = this.getTotalPower(fighter);
    const allowedRoom = Math.max(0, this.settings.team.maxPower - currentTotal);
    const finalAdd = Math.min(allowedRoom, Math.max(0, Math.round(rawAmount)));

    if (bucket === 'chat') fighter.chatPower += finalAdd;
    else fighter.giftPower += finalAdd;

    const updatedTotal = this.getTotalPower(fighter);
    if (updatedTotal > this.peakPowerThisMatch) {
      this.peakPowerThisMatch = updatedTotal;
    }
    return finalAdd;
  }

  private advancePhaseAndPhysics(dtSec: number, nowMs: number): void {
    this.phaseRemainingSec -= dtSec;

    if (this.phase === 'Countdown') {
      this.boy.state = 'Idle';
      this.girl.state = 'Idle';
      if (this.phaseRemainingSec <= 0) {
        this.phase = 'Clash';
        this.phaseRemainingSec = this.settings.match.matchDurationSec;
        this.setBanner('BẮT ĐẦU ĐẨY!', 'Chat BOY hoặc GIRL để đẩy đối thủ khỏi sàn!', undefined, 2500, nowMs);
      }
      return;
    }

    if (this.phase === 'Clash' || this.phase === 'Overtime') {
      this.totalElapsedSec += dtSec;
      this.stepClassicPushPhysics(dtSec, nowMs);

      const bound = this.settings.match.arenaBoundaryHalfWidth;
      if (this.boy.positionX <= -bound) {
        this.finishMatch('GIRL', 'Đẩy BOY rơi khỏi sàn đấu!', nowMs);
        return;
      }
      if (this.girl.positionX >= bound) {
        this.finishMatch('BOY', 'Đẩy GIRL rơi khỏi sàn đấu!', nowMs);
        return;
      }

      if (this.phaseRemainingSec <= 0) {
        this.transitionOnClockZero(nowMs);
      }
      return;
    }

    if (this.phase === 'Victory') {
      if (this.phaseRemainingSec <= 0) {
        this.phase = 'Cooldown';
        this.phaseRemainingSec = this.settings.match.cooldownSec;
      }
      return;
    }

    if (this.phase === 'Cooldown') {
      if (this.phaseRemainingSec <= 0) {
        if (this.settings.match.autoRound) {
          this.startMatch(false);
        } else {
          this.phase = 'Idle';
          this.phaseRemainingSec = 0;
        }
      }
    }
  }

  private transitionOnClockZero(nowMs: number): void {
    const centerMid = (this.boy.positionX + this.girl.positionX) * 0.5;
    const boyPower = this.getTotalPower(this.boy);
    const girlPower = this.getTotalPower(this.girl);

    if (this.phase === 'Clash') {
      const isTie = Math.abs(centerMid) < 0.12 && Math.abs(boyPower - girlPower) < 15;
      if (isTie) {
        this.phase = 'Overtime';
        this.phaseRemainingSec = this.settings.match.overtimeSec;
        this.setBanner(
          `HIỆP PHỤ ${this.settings.match.overtimeSec} GIÂY!`,
          'Hai đội đang ngang sức — đẩy quyết định!',
          undefined,
          2800,
          nowMs
        );
        return;
      }
    }

    const winner: TeamId =
      centerMid > 0.05
        ? 'BOY'
        : centerMid < -0.05
          ? 'GIRL'
          : boyPower >= girlPower
            ? 'BOY'
            : 'GIRL';

    this.finishMatch(
      winner,
      this.phase === 'Overtime' ? 'Thắng hiệp phụ!' : 'Hết giờ — dẫn trước trên sàn đấu!',
      nowMs
    );
  }

  private stepClassicPushPhysics(dtSec: number, nowMs: number): void {
    const minSep = 1.15;
    const gap = this.girl.positionX - this.boy.positionX;

    if (gap > minSep + 0.14) {
      const approachSpeed = 2.4;
      this.boy.velocityX = approachSpeed;
      this.girl.velocityX = -approachSpeed;
      this.boy.positionX += this.boy.velocityX * dtSec;
      this.girl.positionX += this.girl.velocityX * dtSec;
      this.boy.state = 'Approach';
      this.girl.state = 'Approach';
      this.boy.leanAngleDeg = 12;
      this.girl.leanAngleDeg = -12;
      return;
    }

    const boyPower = this.getTotalPower(this.boy);
    const girlPower = this.getTotalPower(this.girl);
    const diff = boyPower - girlPower;

    // Direct, transparent push velocity proportional to net power difference
    const netPush = (diff / 140) * 1.15;
    const totalVel = netPush + this.boy.knockbackVelocity + this.girl.knockbackVelocity;
    const clampedVel = Math.max(-4.0, Math.min(4.0, totalVel));

    const decay = Math.exp(-5.5 * dtSec);
    this.boy.knockbackVelocity *= decay;
    this.girl.knockbackVelocity *= decay;

    const currentMid = (this.boy.positionX + this.girl.positionX) * 0.5;
    const nextMid = currentMid + clampedVel * dtSec;

    const bound = this.settings.match.arenaBoundaryHalfWidth;
    const boundClamp = bound + 0.55;
    this.boy.positionX = Math.max(-boundClamp, Math.min(boundClamp - minSep, nextMid - minSep * 0.5));
    this.girl.positionX = Math.min(boundClamp, Math.max(-boundClamp + minSep, this.boy.positionX + minSep));
    this.boy.velocityX = clampedVel;
    this.girl.velocityX = clampedVel;

    if (clampedVel > 0.12) {
      this.boy.state = 'Push';
      this.boy.leanAngleDeg = 22;
      this.girl.state =
        nowMs < this.girl.staggerUntilMs
          ? 'Knockback'
          : Math.abs(clampedVel) > 1.2
            ? 'Slide'
            : 'Resist';
      this.girl.leanAngleDeg = -18;
    } else if (clampedVel < -0.12) {
      this.girl.state = 'Push';
      this.girl.leanAngleDeg = -22;
      this.boy.state =
        nowMs < this.boy.staggerUntilMs
          ? 'Knockback'
          : Math.abs(clampedVel) > 1.2
            ? 'Slide'
            : 'Resist';
      this.boy.leanAngleDeg = 18;
    } else {
      this.boy.state = 'Push';
      this.girl.state = 'Push';
      this.boy.leanAngleDeg = 14;
      this.girl.leanAngleDeg = -14;
    }

    for (const f of [this.boy, this.girl]) {
      if (nowMs < f.attackAnimUntilMs) f.state = 'Attack';
      else if (Math.abs(f.knockbackVelocity) > 0.85) f.state = 'Knockback';
    }
  }

  private finishMatch(winner: TeamId, reason: string, nowMs: number): void {
    this.winnerTeam = winner;
    this.winReason = reason;
    this.phase = 'Victory';
    this.phaseRemainingSec = 5;

    if (winner === 'BOY') {
      this.boy.state = 'Victory';
      this.girl.state = reason.includes('rơi') ? 'Fall' : 'Defeat';
      this.boyWinsSession += 1;
      this.boyWinStreak += 1;
      this.girlWinStreak = 0;
    } else {
      this.girl.state = 'Victory';
      this.boy.state = reason.includes('rơi') ? 'Fall' : 'Defeat';
      this.girlWinsSession += 1;
      this.girlWinStreak += 1;
      this.boyWinStreak = 0;
    }

    const mvp = this.getCurrentMvp();
    const bound = this.settings.match.arenaBoundaryHalfWidth;
    const mid = (this.boy.positionX + this.girl.positionX) * 0.5;
    const boyProg = Math.max(0, Math.min(100, Math.round(((mid + bound) / (2 * bound)) * 100)));

    this.db.recordMatchResult(
      {
        matchId: this.matchId,
        gameMode: 'ClassicPush',
        winnerTeam: winner,
        boyScore: Math.round(this.getTotalPower(this.boy)),
        girlScore: Math.round(this.getTotalPower(this.girl)),
        boyPushProgress: boyProg,
        girlPushProgress: 100 - boyProg,
        mvpName: mvp?.displayName ?? 'Không có',
        mvpPoints: mvp?.points ?? 0,
        durationSec: Math.round(this.totalElapsedSec),
        arenaTheme: this.settings.general.arenaTheme,
        winReason: reason,
        startedAt: this.matchStartedAt,
        endedAt: nowMs,
      },
      this.peakPowerThisMatch
    );

    this.setBanner(
      `ĐỘI ${winner} CHIẾN THẮNG!`,
      `${reason}${mvp ? ` · MVP: ${mvp.displayName} (${mvp.points}đ)` : ''}`,
      winner,
      5000,
      nowMs
    );

    this.pushFeed({
      id: crypto.randomUUID(),
      kind: 'SYSTEM',
      team: winner,
      displayName: 'Kết quả',
      text: `Đội ${winner} chiến thắng — ${reason}`,
      timestamp: nowMs,
    });
  }

  private getTotalPower(f: InternalFighterState): number {
    return Math.round(this.settings.team.basePower + f.chatPower + f.giftPower);
  }

  private getTeamMemberCount(team: TeamId): number {
    let count = 0;
    for (const t of this.userLastTeam.values()) {
      if (t === team) count += 1;
    }
    return count;
  }

  private getTeamMemberNames(team: TeamId, limit = 12): string[] {
    const names: string[] = [];
    for (const [sid, t] of this.userLastTeam.entries()) {
      if (t === team) {
        names.push(this.userDisplayNames.get(sid) || sid);
      }
    }
    return names.slice(-limit).reverse();
  }

  private addContribution(
    senderId: string,
    displayName: string,
    team: TeamId,
    points: number,
    streak: number
  ): void {
    const existing = this.matchContrib.get(senderId);
    if (existing) {
      existing.points += points;
      existing.team = team;
      existing.displayName = displayName;
      if (streak > 0) existing.giftCount += 1;
      existing.maxStreak = Math.max(existing.maxStreak, streak);
    } else {
      this.matchContrib.set(senderId, {
        senderId,
        displayName,
        team,
        points,
        giftCount: streak > 0 ? 1 : 0,
        maxStreak: streak,
      });
    }
  }

  private getCurrentMvp(): MatchStateSnapshot['mvp'] {
    let best: MatchStateSnapshot['mvp'] = null;
    for (const c of this.matchContrib.values()) {
      if (!best || c.points > best.points) {
        best = {
          senderId: c.senderId,
          displayName: c.displayName,
          team: c.team,
          points: c.points,
        };
      }
    }
    return best;
  }

  private setBanner(
    title: string,
    subtitle: string,
    team?: TeamId,
    durationMs = 2800,
    nowMs = this.lastStepNowMs
  ): void {
    this.activeBanner = {
      title,
      subtitle,
      team,
      expiresAt: nowMs + durationMs,
    };
  }

  private pushFeed(item: ActiveFeedItem): void {
    this.recentFeed.unshift(item);
    if (this.recentFeed.length > 20) {
      this.recentFeed.length = 20;
    }
  }

  private toFighterSnapshot(f: InternalFighterState): FighterSnapshot {
    return {
      team: f.team,
      positionX: Number(f.positionX.toFixed(3)),
      velocityX: Number(f.velocityX.toFixed(3)),
      state: f.state,
      totalPower: this.getTotalPower(f),
      chatPower: Math.round(f.chatPower),
      giftPower: Math.round(f.giftPower),
      leanAngleDeg: Number(f.leanAngleDeg.toFixed(1)),
      memberCount: this.getTeamMemberCount(f.team),
    };
  }

  public getSnapshot(nowMs = Date.now()): MatchStateSnapshot {
    void nowMs;
    const m = this.settings.match;
    const bound = Math.max(1, m.arenaBoundaryHalfWidth);
    const girlEdgeRatio = Math.max(0, this.girl.positionX / bound);
    const boyEdgeRatio = Math.max(0, -this.boy.positionX / bound);

    let nearWinTeam: TeamId | null = null;
    if (this.phase === 'Clash' || this.phase === 'Overtime') {
      if (girlEdgeRatio >= NEAR_WIN_THRESHOLD && girlEdgeRatio >= boyEdgeRatio) {
        nearWinTeam = 'BOY';
      } else if (boyEdgeRatio >= NEAR_WIN_THRESHOLD) {
        nearWinTeam = 'GIRL';
      }
    }
    const nearWinProgressPct = Math.min(100, Math.round(Math.max(girlEdgeRatio, boyEdgeRatio) * 100));

    return {
      matchId: this.matchId,
      gameMode: this.activeGameMode,
      phase: this.phase,
      phaseRemainingSec: Math.max(0, Number(this.phaseRemainingSec.toFixed(1))),
      totalElapsedSec: Number(this.totalElapsedSec.toFixed(1)),
      totalMatchDurationSec: m.matchDurationSec,
      boy: this.toFighterSnapshot(this.boy),
      girl: this.toFighterSnapshot(this.girl),
      centerLineX: Number(((this.boy.positionX + this.girl.positionX) * 0.5).toFixed(3)),
      boundaryHalfWidth: m.arenaBoundaryHalfWidth,
      safeZoneHalfWidth: m.arenaBoundaryHalfWidth,
      nearWinTeam,
      nearWinProgressPct,
      lastActionCallout: this.lastActionCallout,
      liveGoal: {
        enabled: this.settings.general.liveGoal?.enabled ?? true,
        title:
          this.externalLiveGoalOverride?.title ??
          this.settings.general.liveGoal?.title ??
          'Ý muốn người xem',
        giftId:
          this.externalLiveGoalOverride?.giftId ??
          this.settings.general.liveGoal?.giftId ??
          '5655',
        giftName:
          this.externalLiveGoalOverride?.giftName ??
          this.settings.general.liveGoal?.giftName ??
          'Hoa Hồng',
        currentCount: this.liveGoalCurrent,
        targetCount: Math.max(
          1,
          this.externalLiveGoalOverride?.targetCount ??
            this.settings.general.liveGoal?.targetCount ??
            100
        ),
        reserveTikTokZone: Boolean(this.settings.general.liveGoal?.reserveTikTokZone),
        syncedFromLive: this.liveGoalSyncedFromLive,
      },
      activeGiftStreaks: Array.from(this.activeStreaks.values()).map((s) => ({
        streakKey: s.streakKey,
        senderId: s.senderId,
        displayName: s.displayName,
        team: s.team,
        giftId: s.giftId,
        giftName: s.giftName,
        currentCount: s.currentCount,
        updatedAt: s.updatedAt,
      })),
      boyMembers: this.getTeamMemberNames('BOY'),
      girlMembers: this.getTeamMemberNames('GIRL'),
      boyWinsSession: this.boyWinsSession,
      girlWinsSession: this.girlWinsSession,
      boyWinStreak: this.boyWinStreak,
      girlWinStreak: this.girlWinStreak,
      viewerCount: this.viewerCount,
      mvp: this.getCurrentMvp(),
      winnerTeam: this.winnerTeam,
      winReason: this.winReason,
      recentFeed: this.recentFeed.slice(0, 10),
      activeBanner: this.activeBanner,
    };
  }

  public getPerformanceMetrics(wsClientsCount: number, wsLatencyMs: number): PerformanceMetrics {
    const rssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
    return {
      serverTickHz: 30,
      wsClientsCount,
      wsLatencyMs,
      eventQueueSize: this.queue.size(),
      maxQueueSize: this.queue.maxSize,
      eventsReceivedTotal: this.eventsReceivedTotal,
      eventsProcessedTotal: this.eventsProcessedTotal,
      duplicatesDroppedTotal: this.duplicatesDroppedTotal,
      eventsRejectedTotal: this.queue.getRejectedCount(),
      eventsFailedTotal: this.eventsFailedTotal,
      eventsDroppedOverflowTotal: this.queue.getDroppedOverflowCount(),
      avgEventProcessMs:
        this.eventsProcessedTotal > 0
          ? Number((this.totalEventProcessMs / this.eventsProcessedTotal).toFixed(4))
          : 0,
      maxEventProcessMs: Number(this.maxEventProcessMs.toFixed(4)),
      errorCount: this.errorCount,
      memoryRssMb: rssMb,
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }
}
