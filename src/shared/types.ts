export type TeamId = 'BOY' | 'GIRL';
export type GiftTeamTarget = TeamId | 'AUTO';
export type RecordedTeamId = TeamId | 'NEUTRAL';

export type CharacterState =
  | 'Idle'
  | 'Approach'
  | 'Attack'
  | 'Push'
  | 'Resist'
  | 'Slide'
  | 'Knockback'
  | 'Fall'
  | 'Victory'
  | 'Defeat';

export type GameModeId = 'ClassicPush';

export type MatchPhase =
  | 'Idle'
  | 'Countdown'
  | 'Clash'
  | 'Overtime'
  | 'Victory'
  | 'Cooldown'
  | 'Paused'
  | 'EmergencyStopped';

export type ArenaTheme = 'ModernStadium' | 'NeonBattleArena' | 'ExtremePlatformArena';

export type GiftTier = 'Small' | 'Medium' | 'Large' | 'Special' | 'Ultimate';

export type LiveEventType =
  | 'Chat'
  | 'Gift'
  | 'Like'
  | 'Follow'
  | 'Share'
  | 'Join'
  | 'Disconnect'
  | 'StreamEnd';

export type ChatCommand = 'BOY' | 'GIRL' | 'NONE';

export type ConnectionMode = 'SIMULATION' | 'LIVE';

export type LiveConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED_SIMULATION'
  | 'CONNECTED_LIVE'
  | 'RECONNECTING'
  | 'ERROR';

export type EventPriority = 1 | 2 | 3;

export interface NormalizedLiveEvent {
  eventId: string;
  dedupKey: string;
  eventType: LiveEventType;
  priority: EventPriority;
  timestamp: number;
  senderId: string;
  uniqueId?: string;
  displayName: string;
  avatarUrl?: string | null;
  payload: {
    message?: string;
    command?: ChatCommand;
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
  };
  status:
    | 'QUEUED'
    | 'STREAK_PROGRESS'
    | 'PROCESSED'
    | 'DUPLICATE_DROPPED'
    | 'RATE_LIMITED'
    | 'REJECTED'
    | 'ERROR';
}

export interface GiftRule {
  giftId: string;
  giftName: string;
  giftIcon?: string;
  tier: GiftTier;
  team: GiftTeamTarget;
  powerPoints: number;
  vfxId: string;
  sfxId?: string;
  maxImpact: number;
  enabled: boolean;
  neutralBehavior?: 'ALLOW_NEUTRAL' | 'REQUIRE_TEAM';
}

export interface TeamSettings {
  basePower: number;
  maxPower: number;
  chatPowerReward: number;
  chatCooldownSec: number;
  teamSwitchCooldownSec: number;
  neutralGiftEnabled: boolean;
  neutralGiftPower: number;
  showNormalChat: boolean;
}

export interface MatchSettings {
  activeGameMode: GameModeId;
  matchDurationSec: number;
  overtimeSec: number;
  cooldownSec: number;
  autoRound: boolean;
  arenaBoundaryHalfWidth: number;
}

export interface LiveGoalSettings {
  enabled: boolean;
  title: string;
  giftId: string;
  giftName: string;
  targetCount: number;
  reserveTikTokZone: boolean;
}

export interface GeneralSettings {
  arenaTheme: ArenaTheme;
  targetFps: 30 | 60;
  resolutionWidth: number;
  resolutionHeight: number;
  masterVolume: number;
  vfxQuality: 'Low' | 'Medium' | 'High';
  autoReduceVfxOnLowFps: boolean;
  tiktokUsername: string;
  connectionMode: ConnectionMode;
  showHowToPlayGuide: boolean;
  topSafeZonePx?: number;
  liveGoal: LiveGoalSettings;
}

export interface AllSettings {
  team: TeamSettings;
  match: MatchSettings;
  general: GeneralSettings;
}

export interface FighterSnapshot {
  team: TeamId;
  positionX: number;
  velocityX: number;
  state: CharacterState;
  totalPower: number;
  chatPower: number;
  giftPower: number;
  leanAngleDeg: number;
  memberCount: number;
}

export interface ActiveGiftStreakSnapshot {
  streakKey: string;
  senderId: string;
  displayName: string;
  team: RecordedTeamId;
  giftId: string;
  giftName: string;
  currentCount: number;
  updatedAt: number;
}

export interface ActionCallout {
  id: string;
  kind: 'CHAT' | 'GIFT' | 'NEUTRAL';
  team: RecordedTeamId;
  displayName: string;
  actionLabel: string;
  powerAdded: number;
  timestamp: number;
}

export interface ActiveFeedItem {
  id: string;
  kind: 'CHAT' | 'GIFT' | 'SYSTEM' | 'NEUTRAL';
  team?: RecordedTeamId;
  displayName: string;
  text: string;
  powerDelta?: number;
  timestamp: number;
}

export interface LiveGoalSnapshot {
  enabled: boolean;
  title: string;
  giftId: string;
  giftName: string;
  currentCount: number;
  targetCount: number;
  reserveTikTokZone: boolean;
  syncedFromLive?: boolean;
}

export interface MatchStateSnapshot {
  matchId: string;
  gameMode: GameModeId;
  phase: MatchPhase;
  phaseRemainingSec: number;
  totalElapsedSec: number;
  totalMatchDurationSec: number;
  boy: FighterSnapshot;
  girl: FighterSnapshot;
  centerLineX: number;
  boundaryHalfWidth: number;
  safeZoneHalfWidth: number;
  nearWinTeam: TeamId | null;
  nearWinProgressPct: number;
  lastActionCallout: ActionCallout | null;
  liveGoal: LiveGoalSnapshot;
  activeGiftStreaks: ActiveGiftStreakSnapshot[];
  boyMembers: string[];
  girlMembers: string[];
  boyWinsSession: number;
  girlWinsSession: number;
  boyWinStreak: number;
  girlWinStreak: number;
  viewerCount: number | null;
  mvp: {
    senderId: string;
    displayName: string;
    team: TeamId;
    points: number;
  } | null;
  winnerTeam: TeamId | null;
  winReason: string | null;
  recentFeed: ActiveFeedItem[];
  activeBanner: {
    title: string;
    subtitle: string;
    team?: TeamId;
    expiresAt: number;
  } | null;
}

export interface LiveConnectionInfo {
  mode: ConnectionMode;
  status: LiveConnectionStatus;
  tiktokUsername: string;
  connectedAt: number | null;
  reconnectAttempts: number;
  lastError: string | null;
  lastEventAt: number | null;
  eventsReceived: number;
  roomId?: string | null;
  simulationRunning: boolean;
  simulationRatePerSec: number;
}

export interface PerformanceMetrics {
  serverTickHz: number;
  wsClientsCount: number;
  wsLatencyMs: number;
  eventQueueSize: number;
  maxQueueSize: number;
  eventsReceivedTotal: number;
  eventsProcessedTotal: number;
  duplicatesDroppedTotal: number;
  eventsRejectedTotal: number;
  eventsFailedTotal: number;
  eventsDroppedOverflowTotal: number;
  avgEventProcessMs: number;
  maxEventProcessMs: number;
  errorCount: number;
  memoryRssMb: number;
  uptimeSec: number;
}

export interface EventInspectorRecord {
  id: string;
  kind: 'GIFT' | 'CHAT' | 'DEAD_LETTER';
  dedupKey: string;
  eventId: string;
  senderId: string;
  displayName: string;
  team: RecordedTeamId | null;
  summary: string;
  giftId?: string;
  powerAwarded: number;
  status: string;
  errorMessage?: string;
  createdAt: number;
}

export interface MatchHistoryRecord {
  id?: number;
  matchId: string;
  gameMode?: GameModeId;
  winnerTeam: TeamId;
  boyScore: number;
  girlScore: number;
  boyPushProgress: number;
  girlPushProgress: number;
  mvpName: string;
  mvpPoints: number;
  durationSec: number;
  arenaTheme: ArenaTheme;
  winReason: string;
  startedAt: number;
  endedAt: number;
}

export interface LeaderboardEntry {
  senderId: string;
  displayName: string;
  team: RecordedTeamId;
  contributionPoints: number;
  giftCount: number;
  longestStreak: number;
  matchesPlayed: number;
  matchesWon: number;
  updatedAt: number;
}

export interface DailyStatRecord {
  dateKey: string;
  totalMatches: number;
  boyWins: number;
  girlWins: number;
  totalGifts: number;
  totalChatCommands: number;
  peakPower: number;
  updatedAt: number;
}

export interface EventLogRecord {
  id: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  metadataJson: string;
  createdAt: number;
}
