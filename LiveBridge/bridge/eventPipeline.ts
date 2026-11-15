import crypto from 'node:crypto';
import type {
  ChatCommand,
  EventPriority,
  GiftTier,
  LiveEventType,
  NormalizedLiveEvent,
  TeamId,
} from '../../src/shared/types.js';

export interface RawIncomingEvent {
  eventId?: string;
  dedupKey?: string;
  eventType: LiveEventType;
  timestamp?: number;
  senderId?: string;
  uniqueId?: string;
  displayName?: string;
  avatarUrl?: string | null;
  message?: string;
  giftId?: string;
  giftName?: string;
  giftTier?: GiftTier;
  team?: TeamId;
  quantity?: number;
  streakCount?: number;
  repeatEnd?: boolean;
  groupId?: string | null;
  msgId?: string | null;
  diamondCount?: number;
  likeCount?: number;
}

export function sanitizeText(input: string): string {
  // Strip ASCII control characters while preserving full Vietnamese Unicode
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160);
}

/**
 * Simplified 2-action command parser:
 * Chat BOY -> support BOY team
 * Chat GIRL -> support GIRL team
 * Everything else -> NONE
 */
export function parseChatCommand(message: string): { command: ChatCommand } {
  const cleaned = sanitizeText(message).normalize('NFC').toUpperCase();
  if (!cleaned) return { command: 'NONE' };

  const tokens = cleaned.split(/\s+/);
  const first = tokens[0];

  if (first === 'BOY' || first === '!BOY' || first === 'NAM' || cleaned === 'TEAM BOY') {
    return { command: 'BOY' };
  }
  if (first === 'GIRL' || first === '!GIRL' || first === 'NỮ' || first === 'NU' || cleaned === 'TEAM GIRL') {
    return { command: 'GIRL' };
  }
  return { command: 'NONE' };
}

export class EventNormalizer {
  public normalize(raw: RawIncomingEvent): NormalizedLiveEvent {
    const timestamp = raw.timestamp ?? Date.now();
    const senderId = sanitizeText(raw.senderId || raw.uniqueId || 'anon') || 'anon';
    const displayName = sanitizeText(raw.displayName || raw.uniqueId || 'Khán giả') || 'Khán giả';
    const eventId = raw.eventId || crypto.randomUUID();

    const parsedChat =
      raw.eventType === 'Chat' && raw.message ? parseChatCommand(raw.message) : undefined;

    let priority: EventPriority = 3;
    if (
      raw.eventType === 'Gift' ||
      raw.eventType === 'StreamEnd' ||
      raw.eventType === 'Disconnect' ||
      (raw.eventType === 'Chat' && parsedChat && parsedChat.command !== 'NONE')
    ) {
      priority = 1;
    } else if (
      raw.eventType === 'Join' ||
      raw.eventType === 'Follow' ||
      raw.eventType === 'Share'
    ) {
      priority = 2;
    }

    let dedupKey = raw.dedupKey;
    if (!dedupKey) {
      if (raw.eventType === 'Gift') {
        const streakPart = raw.streakCount ?? raw.quantity ?? 1;
        const groupPart = raw.groupId || raw.msgId || eventId;
        dedupKey = `gift:${senderId}:${raw.giftId || 'gift'}:${groupPart}:${streakPart}`;
      } else if (raw.eventType === 'Chat') {
        dedupKey = `chat:${raw.msgId || eventId}`;
      } else {
        dedupKey = `${raw.eventType.toLowerCase()}:${raw.msgId || eventId}`;
      }
    }

    return {
      eventId,
      dedupKey,
      eventType: raw.eventType,
      priority,
      timestamp,
      senderId,
      uniqueId: raw.uniqueId ? sanitizeText(raw.uniqueId) : undefined,
      displayName,
      avatarUrl: raw.avatarUrl ?? null,
      payload: {
        message: raw.message ? sanitizeText(raw.message) : undefined,
        command: parsedChat?.command ?? (raw.eventType === 'Chat' ? 'NONE' : undefined),
        giftId: raw.giftId,
        giftName: raw.giftName,
        giftTier: raw.giftTier,
        team: raw.team,
        quantity: raw.quantity ?? 1,
        streakCount: raw.streakCount ?? raw.quantity ?? 1,
        repeatEnd: raw.repeatEnd ?? true,
        groupId: raw.groupId ?? null,
        msgId: raw.msgId ?? null,
        diamondCount: raw.diamondCount ?? 0,
        likeCount: raw.likeCount,
      },
      status: 'QUEUED',
    };
  }
}

export class EventDeduplicator {
  private readonly seenKeys: Set<string> = new Set();
  private readonly order: string[] = [];
  private readonly maxEntries: number;
  private readonly externalLookup?: (key: string) => boolean;

  constructor(maxEntries = 20000, externalLookup?: (key: string) => boolean) {
    this.maxEntries = maxEntries;
    this.externalLookup = externalLookup;
  }

  public isDuplicate(dedupKey: string): boolean {
    if (this.seenKeys.has(dedupKey)) return true;
    if (this.externalLookup && this.externalLookup(dedupKey)) {
      this.remember(dedupKey);
      return true;
    }
    return false;
  }

  public markProcessed(dedupKey: string): void {
    this.remember(dedupKey);
  }

  private remember(key: string): void {
    if (this.seenKeys.has(key)) return;
    this.seenKeys.add(key);
    this.order.push(key);
    if (this.order.length > this.maxEntries) {
      const oldest = this.order.shift();
      if (oldest) this.seenKeys.delete(oldest);
    }
  }

  public clear(): void {
    this.seenKeys.clear();
    this.order.length = 0;
  }
}

/**
 * Priority Bounded Event Queue:
 * - P1: Gift, BOY/GIRL Chat Commands, StreamEnd/Disconnect (never dropped ahead of P2/P3)
 * - P2: Join, Follow, Share
 * - P3: Like, Normal Chat
 */
export class BoundedEventQueue {
  private readonly p1: NormalizedLiveEvent[] = [];
  private readonly p2: NormalizedLiveEvent[] = [];
  private readonly p3: NormalizedLiveEvent[] = [];
  public readonly maxSize: number;
  private droppedOverflowCount = 0;
  private rejectedCount = 0;

  constructor(maxSize = 2500) {
    this.maxSize = maxSize;
  }

  public enqueue(
    event: NormalizedLiveEvent
  ): { accepted: boolean; droppedOldest: boolean; shedLowPriority: boolean; nearCapacity: boolean } {
    let droppedOldest = false;
    let shedLowPriority = false;
    const currentTotal = this.size();

    if (currentTotal >= this.maxSize) {
      if (event.priority === 3) {
        this.rejectedCount += 1;
        this.droppedOverflowCount += 1;
        event.status = 'REJECTED';
        return {
          accepted: false,
          droppedOldest: false,
          shedLowPriority: true,
          nearCapacity: true,
        };
      }

      if (this.p3.length > 0) {
        this.p3.shift();
        shedLowPriority = true;
      } else if (this.p2.length > 0) {
        this.p2.shift();
        shedLowPriority = true;
      } else if (this.p1.length > 0) {
        this.p1.shift();
      }
      this.droppedOverflowCount += 1;
      droppedOldest = true;
    }

    if (event.priority === 1) this.p1.push(event);
    else if (event.priority === 2) this.p2.push(event);
    else this.p3.push(event);

    return {
      accepted: true,
      droppedOldest,
      shedLowPriority,
      nearCapacity: this.size() >= Math.floor(this.maxSize * 0.8),
    };
  }

  public dequeueBatch(maxBatch = 150): NormalizedLiveEvent[] {
    const out: NormalizedLiveEvent[] = [];
    while (out.length < maxBatch && this.p1.length > 0) {
      out.push(this.p1.shift()!);
    }
    while (out.length < maxBatch && this.p2.length > 0) {
      out.push(this.p2.shift()!);
    }
    while (out.length < maxBatch && this.p3.length > 0) {
      out.push(this.p3.shift()!);
    }
    return out;
  }

  public size(): number {
    return this.p1.length + this.p2.length + this.p3.length;
  }

  public getDroppedOverflowCount(): number {
    return this.droppedOverflowCount;
  }

  public getRejectedCount(): number {
    return this.rejectedCount;
  }

  public clear(): void {
    this.p1.length = 0;
    this.p2.length = 0;
    this.p3.length = 0;
  }
}
