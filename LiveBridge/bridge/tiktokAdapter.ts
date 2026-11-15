import crypto from 'node:crypto';
import type {
  ConnectionMode,
  GiftRule,
  LiveConnectionInfo,
  LiveConnectionStatus,
  TeamId,
} from '../../src/shared/types.js';
import type { RawIncomingEvent } from './eventPipeline.js';

export type EventCallback = (event: RawIncomingEvent) => void;
export type StatusCallback = (info: LiveConnectionInfo) => void;
export type ViewerCountCallback = (count: number) => void;

export interface GoalUpdatePayload {
  title?: string;
  giftId?: string;
  giftName?: string;
  currentCount: number;
  targetCount: number;
}

export type GoalUpdateCallback = (goal: GoalUpdatePayload) => void;

export interface ILiveConnectorAdapter {
  connect(username: string): Promise<void>;
  disconnect(): Promise<void>;
  reconnect?(): Promise<void>;
  getInfo(): LiveConnectionInfo;
  onEvent(cb: EventCallback): void;
  onStatus(cb: StatusCallback): void;
}

const SAMPLE_VIEWERS = [
  { id: 'u_minhanh', name: 'Minh Anh' },
  { id: 'u_hoangnam', name: 'Hoàng Nam' },
  { id: 'u_thao_vy', name: 'Thảo Vy' },
  { id: 'u_quocbao', name: 'Quốc Bảo' },
  { id: 'u_linhchi', name: 'Linh Chi' },
  { id: 'u_tuankiet', name: 'Tuấn Kiệt' },
  { id: 'u_ngocmai', name: 'Ngọc Mai' },
  { id: 'u_ducduy', name: 'Đức Duy' },
];

export class SimulationConnectorAdapter implements ILiveConnectorAdapter {
  private status: LiveConnectionStatus = 'CONNECTED_SIMULATION';
  private connectedAt: number | null = Date.now();
  private running = false;
  private ratePerSec = 2;
  private timer: NodeJS.Timeout | null = null;
  private eventListeners: EventCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private giftRulesProvider: () => GiftRule[];
  private lastError: string | null = null;
  private lastEventAt: number | null = null;
  private eventsReceived = 0;

  constructor(giftRulesProvider: () => GiftRule[]) {
    this.giftRulesProvider = giftRulesProvider;
  }

  public async connect(_username: string): Promise<void> {
    this.status = 'CONNECTED_SIMULATION';
    this.connectedAt = Date.now();
    this.lastError = null;
    this.emitStatus();
  }

  public async disconnect(): Promise<void> {
    this.stopAutoStream();
    this.status = 'DISCONNECTED';
    this.connectedAt = null;
    this.emitStatus();
  }

  public startAutoStream(ratePerSec = 2): void {
    this.ratePerSec = Math.max(0.5, Math.min(30, ratePerSec));
    this.stopAutoStream();
    this.running = true;
    const intervalMs = Math.max(40, Math.round(1000 / this.ratePerSec));
    this.timer = setInterval(() => {
      this.emitRandomSimulationEvent();
    }, intervalMs);
    this.emitStatus();
  }

  public stopAutoStream(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.emitStatus();
  }

  public emitManualEvent(raw: RawIncomingEvent): void {
    this.eventsReceived += 1;
    this.lastEventAt = Date.now();
    for (const cb of this.eventListeners) cb(raw);
  }

  public simulateBurst(count: number): void {
    for (let i = 0; i < count; i++) {
      this.emitRandomSimulationEvent();
    }
  }

  public simulateGiftStreak(team: TeamId, streakCount = 5): void {
    const viewer = SAMPLE_VIEWERS[Math.floor(Math.random() * SAMPLE_VIEWERS.length)];
    const rules = this.giftRulesProvider().filter((r) => r.enabled);
    const rule = rules.find((r) => r.team === team) || rules[0];
    if (!rule) return;

    this.emitManualEvent({
      eventType: 'Chat',
      senderId: viewer.id,
      displayName: viewer.name,
      message: team,
    });

    const groupId = `streak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    for (let s = 1; s <= streakCount; s++) {
      this.emitManualEvent({
        eventType: 'Gift',
        senderId: viewer.id,
        displayName: viewer.name,
        giftId: rule.giftId,
        giftName: rule.giftName,
        giftTier: rule.tier,
        quantity: 1,
        streakCount: s,
        repeatEnd: s === streakCount,
        groupId,
      });
    }
  }

  public simulateDuplicateTest(team: TeamId): { dedupKey: string } {
    const viewer = SAMPLE_VIEWERS[0];
    const dedupKey = `dup_test_${Date.now()}`;
    const rules = this.giftRulesProvider().filter((r) => r.enabled);
    const rule = rules.find((r) => r.team === team) || rules[0];
    const payload: RawIncomingEvent = rule
      ? {
          dedupKey,
          eventType: 'Gift',
          senderId: viewer.id,
          displayName: viewer.name,
          giftId: rule.giftId,
          giftName: rule.giftName,
          giftTier: rule.tier,
          team,
          quantity: 1,
          streakCount: 1,
          repeatEnd: true,
        }
      : {
          dedupKey,
          eventType: 'Chat',
          senderId: viewer.id,
          displayName: viewer.name,
          message: team,
        };
    this.emitManualEvent(payload);
    this.emitManualEvent(payload);
    return { dedupKey };
  }

  private emitRandomSimulationEvent(): void {
    const viewer = SAMPLE_VIEWERS[Math.floor(Math.random() * SAMPLE_VIEWERS.length)];
    const roll = Math.random();

    if (roll < 0.62) {
      const message = Math.random() < 0.5 ? 'BOY' : 'GIRL';
      this.emitManualEvent({
        eventType: 'Chat',
        senderId: viewer.id,
        displayName: viewer.name,
        message,
      });
    } else {
      const rules = this.giftRulesProvider().filter((r) => r.enabled);
      if (rules.length === 0) return;
      const smallOrMed = rules.filter((r) => r.tier === 'Small' || r.tier === 'Medium');
      const pool = Math.random() < 0.8 && smallOrMed.length > 0 ? smallOrMed : rules;
      const rule = pool[Math.floor(Math.random() * pool.length)];
      this.emitManualEvent({
        eventType: 'Gift',
        senderId: viewer.id,
        displayName: viewer.name,
        giftId: rule.giftId,
        giftName: rule.giftName,
        giftTier: rule.tier,
        quantity: 1,
        streakCount: 1,
        repeatEnd: true,
      });
    }
  }

  public getInfo(): LiveConnectionInfo {
    return {
      mode: 'SIMULATION',
      status: this.status,
      tiktokUsername: 'simulation_arena',
      connectedAt: this.connectedAt,
      reconnectAttempts: 0,
      lastError: this.lastError,
      lastEventAt: this.lastEventAt,
      eventsReceived: this.eventsReceived,
      roomId: null,
      simulationRunning: this.running,
      simulationRatePerSec: this.ratePerSec,
    };
  }

  public onEvent(cb: EventCallback): void {
    this.eventListeners.push(cb);
  }

  public onStatus(cb: StatusCallback): void {
    this.statusListeners.push(cb);
  }

  private emitStatus(): void {
    const info = this.getInfo();
    for (const cb of this.statusListeners) cb(info);
  }
}

export function extractTikTokSender(data: Record<string, unknown>): {
  senderId: string;
  uniqueId: string;
  displayName: string;
  avatarUrl: string | null;
} {
  const userObj = (data.user && typeof data.user === 'object' ? data.user : {}) as Record<string, unknown>;
  const senderId = String(userObj.userId ?? data.userId ?? userObj.uniqueId ?? data.uniqueId ?? 'tiktok_anon');
  const uniqueId = String(userObj.uniqueId ?? data.uniqueId ?? senderId);
  const displayName = String(userObj.nickname ?? data.nickname ?? uniqueId ?? 'Viewer');
  const avatarUrl =
    typeof (userObj.profilePictureUrl ?? data.profilePictureUrl) === 'string'
      ? String(userObj.profilePictureUrl ?? data.profilePictureUrl)
      : null;

  return { senderId, uniqueId, displayName, avatarUrl };
}

export class TikTokLiveConnectorAdapter implements ILiveConnectorAdapter {
  private status: LiveConnectionStatus = 'DISCONNECTED';
  private tiktokUsername = '';
  private connectedAt: number | null = null;
  private reconnectAttempts = 0;
  private lastError: string | null = null;
  private lastEventAt: number | null = null;
  private eventsReceived = 0;
  private roomId: string | null = null;

  private eventListeners: EventCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private viewerCountListeners: ViewerCountCallback[] = [];
  private goalUpdateListeners: GoalUpdateCallback[] = [];

  private activeClient: {
    disconnect?: () => void;
    fetchAvailableGifts?: () => Promise<Array<Record<string, unknown>>>;
  } | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualDisconnect = false;
  private readonly openStreakSessions = new Map<string, string>();

  public async connect(username: string): Promise<void> {
    const cleaned = username.replace(/^@/, '').trim();
    if (!cleaned) {
      this.status = 'ERROR';
      this.lastError = 'Vui lòng nhập TikTok Username hợp lệ trước khi kết nối LIVE.';
      this.emitStatus();
      throw new Error(this.lastError);
    }

    await this.cleanupClientOnly();
    this.manualDisconnect = false;
    this.tiktokUsername = cleaned;
    this.status = 'CONNECTING';
    this.lastError = null;
    this.roomId = null;
    this.emitStatus();

    try {
      const connectorPkg = 'tiktok-live-connector';
      const mod = await import(/* @vite-ignore */ connectorPkg).catch(() => null);
      if (!mod || !mod.WebcastPushConnection) {
        this.status = 'ERROR';
        this.lastError =
          'Chưa cài gói unofficial "tiktok-live-connector" hoặc môi trường sandbox không có luồng TikTok LIVE trực tiếp. Trên máy Windows livestream, hãy chạy "npm install tiktok-live-connector" rồi nhấn Connect LIVE.';
        this.emitStatus();
        return;
      }

      const client = new mod.WebcastPushConnection(cleaned, {
        enableExtendedGiftInfo: true,
        processInitialData: false,
      });

      this.activeClient = client;

      client.on('chat', (data: Record<string, unknown>) => {
        const sender = extractTikTokSender(data);
        const msgId = data.msgId ? String(data.msgId) : null;
        this.emitEvent({
          eventId: msgId || crypto.randomUUID(),
          eventType: 'Chat',
          senderId: sender.senderId,
          uniqueId: sender.uniqueId,
          displayName: sender.displayName,
          avatarUrl: sender.avatarUrl,
          msgId,
          message: String(data.comment ?? data.text ?? ''),
        });
      });

      client.on('gift', (data: Record<string, unknown>) => {
        const sender = extractTikTokSender(data);
        const giftObj = (data.gift && typeof data.gift === 'object' ? data.gift : {}) as Record<string, unknown>;
        const extObj = (
          data.extendedGiftInfo && typeof data.extendedGiftInfo === 'object' ? data.extendedGiftInfo : {}
        ) as Record<string, unknown>;

        const giftId = String(data.giftId ?? giftObj.gift_id ?? giftObj.id ?? 'unknown_gift');
        const giftName = String(
          data.giftName ?? extObj.name ?? giftObj.name ?? `Gift #${giftId}`
        );
        const diamondCount = Number(data.diamondCount ?? extObj.diamond_count ?? giftObj.diamond_count ?? 0);
        const repeatCount = Math.max(1, Number(data.repeatCount ?? data.comboCount ?? 1));
        const giftType = Number(data.giftType ?? giftObj.type ?? 0);
        const repeatEnd =
          typeof data.repeatEnd === 'boolean'
            ? data.repeatEnd
            : giftType === 1
              ? false
              : true;
        const msgId = data.msgId ? String(data.msgId) : null;

        let groupId = data.groupId ? String(data.groupId) : null;
        if (!groupId) {
          const sessionMapKey = `${sender.senderId}:${giftId}`;
          if (!repeatEnd) {
            let activeSid = this.openStreakSessions.get(sessionMapKey);
            if (!activeSid) {
              activeSid = `fallback_streak_${crypto.randomUUID()}`;
              this.openStreakSessions.set(sessionMapKey, activeSid);
            }
            groupId = activeSid;
          } else {
            const existingSid = this.openStreakSessions.get(sessionMapKey);
            if (existingSid) {
              groupId = existingSid;
              this.openStreakSessions.delete(sessionMapKey);
            } else {
              groupId = msgId || crypto.randomUUID();
            }
          }
        }

        this.emitEvent({
          eventId: msgId || crypto.randomUUID(),
          eventType: 'Gift',
          senderId: sender.senderId,
          uniqueId: sender.uniqueId,
          displayName: sender.displayName,
          avatarUrl: sender.avatarUrl,
          giftId,
          giftName,
          quantity: 1,
          streakCount: repeatCount,
          repeatEnd,
          groupId,
          msgId,
          diamondCount,
        });
      });

      client.on('roomUser', (data: Record<string, unknown>) => {
        if (typeof data.viewerCount === 'number') {
          for (const cb of this.viewerCountListeners) cb(data.viewerCount);
        }
      });

      client.on('goalUpdate', (data: Record<string, unknown>) => {
        try {
          const goalObj = (data.goal && typeof data.goal === 'object' ? data.goal : data) as Record<string, unknown>;
          const subGoals = Array.isArray(goalObj.subGoals)
            ? (goalObj.subGoals as Array<Record<string, unknown>>)
            : Array.isArray(data.subGoals)
              ? (data.subGoals as Array<Record<string, unknown>>)
              : [];
          const firstSub = subGoals[0] || {};
          const giftObj = (firstSub.gift && typeof firstSub.gift === 'object' ? firstSub.gift : {}) as Record<string, unknown>;

          const currentRaw = Number(
            firstSub.progress ?? goalObj.currentProgress ?? data.currentProgress ?? 0
          );
          const targetRaw = Number(
            firstSub.target ?? goalObj.targetProgress ?? data.targetProgress ?? 0
          );
          if (!Number.isFinite(targetRaw) || targetRaw <= 0) return;

          const payload: GoalUpdatePayload = {
            title:
              typeof goalObj.description === 'string' && goalObj.description.trim()
                ? goalObj.description.trim()
                : undefined,
            giftId: firstSub.id ? String(firstSub.id) : giftObj.id ? String(giftObj.id) : undefined,
            giftName:
              typeof giftObj.name === 'string' && giftObj.name.trim() ? giftObj.name.trim() : undefined,
            currentCount: Math.max(0, Math.round(currentRaw)),
            targetCount: Math.max(1, Math.round(targetRaw)),
          };
          for (const cb of this.goalUpdateListeners) cb(payload);
        } catch {
          // Ignore unexpected goalUpdate schema without disrupting live stream
        }
      });

      client.on('streamEnd', () => {
        this.emitEvent({ eventType: 'StreamEnd', senderId: 'system', displayName: 'TikTok' });
        this.status = 'DISCONNECTED';
        this.connectedAt = null;
        this.lastError = 'Phiên livestream TikTok đã kết thúc (StreamEnd).';
        this.emitStatus();
      });

      client.on('disconnected', () => {
        this.emitEvent({ eventType: 'Disconnect', senderId: 'system', displayName: 'TikTok' });
        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      });

      client.on('error', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.lastError = `Lỗi luồng TikTok LIVE: ${msg}`;
        this.emitStatus();
      });

      const state = (await client.connect()) as Record<string, unknown> | undefined;
      const roomId = state?.roomId ? String(state.roomId) : null;
      const isConnected = state?.isConnected !== false;

      if (!isConnected) {
        this.status = 'ERROR';
        this.lastError = `Tài khoản @${cleaned} hiện không ở trạng thái đang phát LIVE.`;
        this.emitStatus();
        return;
      }

      this.roomId = roomId;
      this.status = 'CONNECTED_LIVE';
      this.connectedAt = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.emitStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = 'ERROR';
      this.lastError = `Không thể kết nối TikTok LIVE (@${cleaned}): ${msg}`;
      this.emitStatus();
    }
  }

  public async fetchAvailableGifts(): Promise<
    Array<{ giftId: string; giftName: string; diamondCount: number; giftIcon?: string }>
  > {
    if (!this.activeClient?.fetchAvailableGifts) return [];
    const list = await this.activeClient.fetchAvailableGifts();
    return (list || []).map((g) => ({
      giftId: String(g.id ?? g.gift_id ?? ''),
      giftName: String(g.name ?? `Gift #${g.id}`),
      diamondCount: Number(g.diamond_count ?? 1),
      giftIcon: typeof g.icon === 'object' && g.icon !== null
        ? String((g.icon as Record<string, unknown>).url_list ?? '')
        : undefined,
    }));
  }

  public async reconnect(): Promise<void> {
    if (!this.tiktokUsername) {
      throw new Error('Chưa có TikTok Username để kết nối lại.');
    }
    await this.connect(this.tiktokUsername);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manualDisconnect || !this.tiktokUsername) return;
    if (this.reconnectAttempts >= 5) {
      this.status = 'ERROR';
      this.lastError = 'Mất kết nối TikTok LIVE sau 5 lần thử kết nối lại.';
      this.emitStatus();
      return;
    }
    this.reconnectAttempts += 1;
    this.status = 'RECONNECTING';
    this.emitStatus();
    const delay = Math.min(15000, 2000 * this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(this.tiktokUsername);
    }, delay);
  }

  private async cleanupClientOnly(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.activeClient?.disconnect) {
      try {
        this.activeClient.disconnect();
      } catch {
        // ignore
      }
      this.activeClient = null;
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    await this.cleanupClientOnly();
    this.status = 'DISCONNECTED';
    this.connectedAt = null;
    this.roomId = null;
    this.emitStatus();
  }

  public getInfo(): LiveConnectionInfo {
    return {
      mode: 'LIVE' as ConnectionMode,
      status: this.status,
      tiktokUsername: this.tiktokUsername,
      connectedAt: this.connectedAt,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      lastEventAt: this.lastEventAt,
      eventsReceived: this.eventsReceived,
      roomId: this.roomId,
      simulationRunning: false,
      simulationRatePerSec: 0,
    };
  }

  public onEvent(cb: EventCallback): void {
    this.eventListeners.push(cb);
  }

  public onStatus(cb: StatusCallback): void {
    this.statusListeners.push(cb);
  }

  public onViewerCount(cb: ViewerCountCallback): void {
    this.viewerCountListeners.push(cb);
  }

  public onGoalUpdate(cb: GoalUpdateCallback): void {
    this.goalUpdateListeners.push(cb);
  }

  private emitEvent(ev: RawIncomingEvent): void {
    this.eventsReceived += 1;
    this.lastEventAt = Date.now();
    for (const cb of this.eventListeners) cb(ev);
  }

  private emitStatus(): void {
    const info = this.getInfo();
    for (const cb of this.statusListeners) cb(info);
  }
}
