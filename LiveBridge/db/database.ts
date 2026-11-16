import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AllSettings,
  DailyStatRecord,
  EventInspectorRecord,
  EventLogRecord,
  GameModeId,
  GiftRule,
  GiftTier,
  LeaderboardEntry,
  MatchHistoryRecord,
  NormalizedLiveEvent,
  RecordedTeamId,
  TeamId,
} from '../../src/shared/types.js';

export interface PendingStreakRecord {
  streakKey: string;
  senderId: string;
  displayName: string;
  giftId: string;
  giftName: string;
  team: RecordedTeamId;
  explicitTeam: TeamId | null;
  currentCount: number;
  diamondCount: number;
  lastUpdatedAt: number;
  status: 'ACTIVE' | 'COMMITTED';
}

export interface PlayerRecord {
  senderId: string;
  displayName: string;
  team: RecordedTeamId;
  totalPoints: number;
  totalGifts: number;
  lastSeenAt: number;
}

export const DEFAULT_GIFT_RULES: GiftRule[] = [
  {
    giftId: '5655',
    giftName: 'Hoa Hồng',
    giftIcon: 'rose',
    tier: 'Small',
    team: 'AUTO',
    powerPoints: 25,
    vfxId: 'vfx_spark_auto',
    sfxId: 'sfx_gift_small',
    maxImpact: 500,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: '5269',
    giftName: 'TikTok Logo',
    giftIcon: 'tiktok',
    tier: 'Small',
    team: 'AUTO',
    powerPoints: 30,
    vfxId: 'vfx_spark_auto',
    sfxId: 'sfx_gift_small',
    maxImpact: 500,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: '5487',
    giftName: 'Tim Tay',
    giftIcon: 'heart',
    tier: 'Medium',
    team: 'AUTO',
    powerPoints: 90,
    vfxId: 'vfx_med_push',
    sfxId: 'sfx_gift_med',
    maxImpact: 900,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: '5658',
    giftName: 'Nước Hoa',
    giftIcon: 'perfume',
    tier: 'Medium',
    team: 'AUTO',
    powerPoints: 150,
    vfxId: 'vfx_med_push',
    sfxId: 'sfx_gift_med',
    maxImpact: 1200,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: '6064',
    giftName: 'Bánh Donut',
    giftIcon: 'gg',
    tier: 'Large',
    team: 'AUTO',
    powerPoints: 300,
    vfxId: 'vfx_large_push',
    sfxId: 'sfx_gift_large',
    maxImpact: 1800,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: '5879',
    giftName: 'Sư Tử',
    giftIcon: 'lion',
    tier: 'Special',
    team: 'AUTO',
    powerPoints: 600,
    vfxId: 'vfx_special_push',
    sfxId: 'sfx_gift_special',
    maxImpact: 3000,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: 'galaxy_1000',
    giftName: 'Thiên Hà',
    giftIcon: 'universe',
    tier: 'Ultimate',
    team: 'AUTO',
    powerPoints: 1000,
    vfxId: 'vfx_ultimate_push',
    sfxId: 'sfx_gift_ultimate',
    maxImpact: 5000,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: 'rose_blue',
    giftName: 'Hoa Hồng Xanh',
    giftIcon: 'rose_blue',
    tier: 'Small',
    team: 'AUTO',
    powerPoints: 25,
    vfxId: 'vfx_spark_blue',
    sfxId: 'sfx_gift_small',
    maxImpact: 500,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
  {
    giftId: 'rose_pink',
    giftName: 'Hoa Hồng Hồng',
    giftIcon: 'rose_pink',
    tier: 'Small',
    team: 'AUTO',
    powerPoints: 25,
    vfxId: 'vfx_spark_pink',
    sfxId: 'sfx_gift_small',
    maxImpact: 500,
    enabled: true,
    neutralBehavior: 'ALLOW_NEUTRAL',
  },
];

export const DEFAULT_SETTINGS: AllSettings = {
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

export class ArenaDatabase {
  public readonly db: Database.Database;
  public readonly dbPath: string;
  public readonly backupDir: string;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath || path.resolve(process.cwd(), 'LiveBridge', 'data', 'arena.db');
    this.dbPath = resolvedPath;
    this.backupDir = path.resolve(path.dirname(resolvedPath), '..', 'backups');

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.migrate();
    this.seedDefaults();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private getTableSql(table: string): string {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as { sql?: string } | undefined;
    return row?.sql || '';
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS Settings (
        key TEXT PRIMARY KEY,
        valueJson TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS GiftRules (
        giftId TEXT PRIMARY KEY,
        giftName TEXT NOT NULL,
        giftIcon TEXT NOT NULL DEFAULT 'gift',
        tier TEXT NOT NULL,
        team TEXT NOT NULL DEFAULT 'AUTO' CHECK(team IN ('BOY', 'GIRL', 'AUTO')),
        powerPoints INTEGER NOT NULL,
        skillId TEXT NOT NULL DEFAULT '',
        vfxId TEXT NOT NULL,
        sfxId TEXT NOT NULL DEFAULT 'sfx_gift_small',
        cooldownSec REAL NOT NULL DEFAULT 0,
        maxImpact INTEGER NOT NULL DEFAULT 500,
        enabled INTEGER NOT NULL DEFAULT 1,
        neutralBehavior TEXT NOT NULL DEFAULT 'ALLOW_NEUTRAL'
      );

      CREATE TABLE IF NOT EXISTS Players (
        senderId TEXT PRIMARY KEY,
        displayName TEXT NOT NULL,
        team TEXT NOT NULL CHECK(team IN ('BOY', 'GIRL', 'NEUTRAL')),
        totalPoints INTEGER NOT NULL DEFAULT 0,
        totalGifts INTEGER NOT NULL DEFAULT 0,
        lastSeenAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS GiftEvents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dedupKey TEXT NOT NULL UNIQUE,
        eventId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        displayName TEXT NOT NULL,
        giftId TEXT NOT NULL,
        giftName TEXT NOT NULL,
        team TEXT NOT NULL CHECK(team IN ('BOY', 'GIRL', 'NEUTRAL')),
        quantity INTEGER NOT NULL,
        streakCount INTEGER NOT NULL DEFAULT 1,
        powerAwarded INTEGER NOT NULL,
        skillId TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PROCESSED',
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS PendingGiftStreaks (
        streakKey TEXT PRIMARY KEY,
        senderId TEXT NOT NULL,
        displayName TEXT NOT NULL,
        giftId TEXT NOT NULL,
        giftName TEXT NOT NULL,
        team TEXT NOT NULL,
        explicitTeam TEXT,
        currentCount INTEGER NOT NULL DEFAULT 1,
        diamondCount INTEGER NOT NULL DEFAULT 0,
        lastUpdatedAt INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS ChatEvents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dedupKey TEXT NOT NULL UNIQUE,
        eventId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        displayName TEXT NOT NULL,
        message TEXT NOT NULL,
        command TEXT NOT NULL,
        team TEXT,
        powerAwarded INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS DeadLetterEvents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eventId TEXT NOT NULL,
        dedupKey TEXT NOT NULL,
        eventType TEXT NOT NULL,
        senderId TEXT NOT NULL,
        displayName TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        errorMessage TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS MatchHistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matchId TEXT NOT NULL UNIQUE,
        gameMode TEXT NOT NULL DEFAULT 'ClassicPush',
        winnerTeam TEXT NOT NULL CHECK(winnerTeam IN ('BOY', 'GIRL')),
        boyScore INTEGER NOT NULL,
        girlScore INTEGER NOT NULL,
        boyPushProgress REAL NOT NULL,
        girlPushProgress REAL NOT NULL,
        mvpName TEXT NOT NULL,
        mvpPoints INTEGER NOT NULL,
        durationSec REAL NOT NULL,
        arenaTheme TEXT NOT NULL,
        winReason TEXT NOT NULL,
        startedAt INTEGER NOT NULL,
        endedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS Leaderboard (
        senderId TEXT PRIMARY KEY,
        displayName TEXT NOT NULL,
        team TEXT NOT NULL CHECK(team IN ('BOY', 'GIRL', 'NEUTRAL')),
        contributionPoints INTEGER NOT NULL DEFAULT 0,
        attackPoints INTEGER NOT NULL DEFAULT 0,
        defensePoints INTEGER NOT NULL DEFAULT 0,
        giftCount INTEGER NOT NULL DEFAULT 0,
        longestStreak INTEGER NOT NULL DEFAULT 0,
        matchesPlayed INTEGER NOT NULL DEFAULT 0,
        matchesWon INTEGER NOT NULL DEFAULT 0,
        titlesJson TEXT NOT NULL DEFAULT '[]',
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS DailyStats (
        dateKey TEXT PRIMARY KEY,
        totalMatches INTEGER NOT NULL DEFAULT 0,
        boyWins INTEGER NOT NULL DEFAULT 0,
        girlWins INTEGER NOT NULL DEFAULT 0,
        totalGifts INTEGER NOT NULL DEFAULT 0,
        totalChatCommands INTEGER NOT NULL DEFAULT 0,
        peakPower INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS EventLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR')),
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_giftevents_created ON GiftEvents(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_chatevents_created ON ChatEvents(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_deadletter_created ON DeadLetterEvents(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_matchhistory_ended ON MatchHistory(endedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON Leaderboard(contributionPoints DESC);
      CREATE INDEX IF NOT EXISTS idx_eventlogs_created ON EventLogs(createdAt DESC);
    `);

    this.upgradeOldCheckConstraints();

    this.ensureColumn('MatchHistory', 'gameMode', "TEXT NOT NULL DEFAULT 'ClassicPush'");
    this.ensureColumn('Leaderboard', 'attackPoints', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('Leaderboard', 'defensePoints', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('Leaderboard', 'longestStreak', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('Leaderboard', 'titlesJson', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('GiftRules', 'giftIcon', "TEXT NOT NULL DEFAULT 'gift'");
    this.ensureColumn('GiftRules', 'sfxId', "TEXT NOT NULL DEFAULT 'sfx_gift_small'");
    this.ensureColumn('GiftRules', 'neutralBehavior', "TEXT NOT NULL DEFAULT 'ALLOW_NEUTRAL'");
    this.ensureColumn('GiftEvents', 'skillId', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('GiftEvents', 'status', "TEXT NOT NULL DEFAULT 'PROCESSED'");
  }

  private upgradeOldCheckConstraints(): void {
    const giftRulesSql = this.getTableSql('GiftRules');
    if (giftRulesSql && !giftRulesSql.includes("'AUTO'")) {
      const tx = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE GiftRules_v2 (
            giftId TEXT PRIMARY KEY,
            giftName TEXT NOT NULL,
            giftIcon TEXT NOT NULL DEFAULT 'gift',
            tier TEXT NOT NULL,
            team TEXT NOT NULL DEFAULT 'AUTO' CHECK(team IN ('BOY', 'GIRL', 'AUTO')),
            powerPoints INTEGER NOT NULL,
            skillId TEXT NOT NULL DEFAULT '',
            vfxId TEXT NOT NULL,
            sfxId TEXT NOT NULL DEFAULT 'sfx_gift_small',
            cooldownSec REAL NOT NULL DEFAULT 0,
            maxImpact INTEGER NOT NULL DEFAULT 500,
            enabled INTEGER NOT NULL DEFAULT 1,
            neutralBehavior TEXT NOT NULL DEFAULT 'ALLOW_NEUTRAL'
          );
          INSERT INTO GiftRules_v2 (giftId, giftName, tier, team, powerPoints, skillId, vfxId, cooldownSec, maxImpact, enabled)
          SELECT giftId, giftName, tier, 'AUTO', powerPoints, skillId, vfxId, cooldownSec, maxImpact, enabled FROM GiftRules;
          DROP TABLE GiftRules;
          ALTER TABLE GiftRules_v2 RENAME TO GiftRules;
        `);
      });
      tx();
    }

    const giftEventsSql = this.getTableSql('GiftEvents');
    if (giftEventsSql && !giftEventsSql.includes("'NEUTRAL'")) {
      const tx = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE GiftEvents_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dedupKey TEXT NOT NULL UNIQUE,
            eventId TEXT NOT NULL,
            senderId TEXT NOT NULL,
            displayName TEXT NOT NULL,
            giftId TEXT NOT NULL,
            giftName TEXT NOT NULL,
            team TEXT NOT NULL CHECK(team IN ('BOY', 'GIRL', 'NEUTRAL')),
            quantity INTEGER NOT NULL,
            streakCount INTEGER NOT NULL DEFAULT 1,
            powerAwarded INTEGER NOT NULL,
            skillId TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'PROCESSED',
            createdAt INTEGER NOT NULL
          );
          INSERT INTO GiftEvents_v2 (id, dedupKey, eventId, senderId, displayName, giftId, giftName, team, quantity, streakCount, powerAwarded, createdAt)
          SELECT id, dedupKey, eventId, senderId, displayName, giftId, giftName, team, quantity, streakCount, powerAwarded, createdAt FROM GiftEvents;
          DROP TABLE GiftEvents;
          ALTER TABLE GiftEvents_v2 RENAME TO GiftEvents;
          CREATE INDEX IF NOT EXISTS idx_giftevents_created ON GiftEvents(createdAt DESC);
        `);
      });
      tx();
    }

    const playersSql = this.getTableSql('Players');
    if (playersSql && !playersSql.includes("'NEUTRAL'")) {
      const tx = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE Players_v2 (
            senderId TEXT PRIMARY KEY,
            displayName TEXT NOT NULL,
            team TEXT NOT NULL CHECK(team IN ('BOY', 'GIRL', 'NEUTRAL')),
            totalPoints INTEGER NOT NULL DEFAULT 0,
            totalGifts INTEGER NOT NULL DEFAULT 0,
            lastSeenAt INTEGER NOT NULL
          );
          INSERT INTO Players_v2 SELECT * FROM Players;
          DROP TABLE Players;
          ALTER TABLE Players_v2 RENAME TO Players;
        `);
      });
      tx();
    }

    const lbSql = this.getTableSql('Leaderboard');
    if (lbSql && !lbSql.includes("'NEUTRAL'")) {
      const tx = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE Leaderboard_v2 (
            senderId TEXT PRIMARY KEY,
            displayName TEXT NOT NULL,
            team TEXT NOT NULL CHECK(team IN ('BOY', 'GIRL', 'NEUTRAL')),
            contributionPoints INTEGER NOT NULL DEFAULT 0,
            attackPoints INTEGER NOT NULL DEFAULT 0,
            defensePoints INTEGER NOT NULL DEFAULT 0,
            giftCount INTEGER NOT NULL DEFAULT 0,
            longestStreak INTEGER NOT NULL DEFAULT 0,
            matchesPlayed INTEGER NOT NULL DEFAULT 0,
            matchesWon INTEGER NOT NULL DEFAULT 0,
            titlesJson TEXT NOT NULL DEFAULT '[]',
            updatedAt INTEGER NOT NULL
          );
          INSERT INTO Leaderboard_v2 (senderId, displayName, team, contributionPoints, attackPoints, defensePoints, giftCount, longestStreak, matchesPlayed, matchesWon, titlesJson, updatedAt)
          SELECT senderId, displayName, team, contributionPoints, COALESCE(attackPoints,0), COALESCE(defensePoints,0), giftCount, COALESCE(longestStreak,0), matchesPlayed, matchesWon, COALESCE(titlesJson,'[]'), updatedAt FROM Leaderboard;
          DROP TABLE Leaderboard;
          ALTER TABLE Leaderboard_v2 RENAME TO Leaderboard;
          CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON Leaderboard(contributionPoints DESC);
        `);
      });
      tx();
    }
  }

  private seedDefaults(): void {
    const existingSettings = this.db
      .prepare('SELECT COUNT(*) as cnt FROM Settings')
      .get() as { cnt: number };

    if (existingSettings.cnt === 0) {
      this.saveAllSettings(DEFAULT_SETTINGS);
      this.db
        .prepare('INSERT OR IGNORE INTO Settings (key, valueJson, updatedAt) VALUES (?, ?, ?)')
        .run('pk_zero_init_v1', '1', Date.now());
    } else {
      const migratedZero = this.db
        .prepare('SELECT key FROM Settings WHERE key = ?')
        .get('pk_zero_init_v1');
      const current = this.getAllSettings();
      if (!migratedZero) {
        current.team.basePower = 0;
        this.saveAllSettings(current);
        this.db
          .prepare('INSERT OR IGNORE INTO Settings (key, valueJson, updatedAt) VALUES (?, ?, ?)')
          .run('pk_zero_init_v1', '1', Date.now());
      } else {
        this.saveAllSettings(current);
      }
    }

    const insertGiftIgnore = this.db.prepare(`
      INSERT OR IGNORE INTO GiftRules
        (giftId, giftName, giftIcon, tier, team, powerPoints, skillId, vfxId, sfxId, cooldownSec, maxImpact, enabled, neutralBehavior)
      VALUES (@giftId, @giftName, @giftIcon, @tier, @team, @powerPoints, '', @vfxId, @sfxId, 0, @maxImpact, @enabled, @neutralBehavior)
    `);
    const tx = this.db.transaction((rules: GiftRule[]) => {
      for (const r of rules) {
        insertGiftIgnore.run({
          ...r,
          giftIcon: r.giftIcon || 'gift',
          sfxId: r.sfxId || 'sfx_gift_small',
          neutralBehavior: r.neutralBehavior || 'ALLOW_NEUTRAL',
          enabled: r.enabled ? 1 : 0,
        });
      }
    });
    tx(DEFAULT_GIFT_RULES);
  }

  public getAllSettings(): AllSettings {
    const rows = this.db.prepare('SELECT key, valueJson FROM Settings').all() as {
      key: string;
      valueJson: string;
    }[];
    const map = new Map(rows.map((r) => [r.key, r.valueJson]));
    const rawTeam = map.has('team') ? JSON.parse(map.get('team')!) : {};
    const rawMatch = map.has('match') ? JSON.parse(map.get('match')!) : {};
    const rawGeneral = map.has('general') ? JSON.parse(map.get('general')!) : {};

    const durationRaw = Number(rawMatch.matchDurationSec ?? DEFAULT_SETTINGS.match.matchDurationSec);
    const matchDurationSec = Number.isFinite(durationRaw)
      ? Math.max(60, Math.min(120, Math.round(durationRaw)))
      : DEFAULT_SETTINGS.match.matchDurationSec;

    return {
      team: {
        basePower: Math.max(0, Number(rawTeam.basePower ?? DEFAULT_SETTINGS.team.basePower)),
        maxPower: Math.max(500, Number(rawTeam.maxPower ?? DEFAULT_SETTINGS.team.maxPower)),
        chatPowerReward: Math.max(1, Number(rawTeam.chatPowerReward ?? DEFAULT_SETTINGS.team.chatPowerReward)),
        chatCooldownSec: Math.max(0, Number(rawTeam.chatCooldownSec ?? DEFAULT_SETTINGS.team.chatCooldownSec)),
        teamSwitchCooldownSec: Math.max(
          0,
          Number(rawTeam.teamSwitchCooldownSec ?? DEFAULT_SETTINGS.team.teamSwitchCooldownSec)
        ),
        neutralGiftEnabled:
          typeof rawTeam.neutralGiftEnabled === 'boolean'
            ? rawTeam.neutralGiftEnabled
            : DEFAULT_SETTINGS.team.neutralGiftEnabled,
        neutralGiftPower: Math.max(0, Number(rawTeam.neutralGiftPower ?? DEFAULT_SETTINGS.team.neutralGiftPower)),
        showNormalChat:
          typeof rawTeam.showNormalChat === 'boolean'
            ? rawTeam.showNormalChat
            : DEFAULT_SETTINGS.team.showNormalChat,
      },
      match: {
        activeGameMode: 'ClassicPush',
        matchDurationSec,
        overtimeSec: Math.max(5, Math.min(30, Number(rawMatch.overtimeSec ?? DEFAULT_SETTINGS.match.overtimeSec))),
        cooldownSec: Math.max(2, Math.min(15, Number(rawMatch.cooldownSec ?? DEFAULT_SETTINGS.match.cooldownSec))),
        autoRound:
          typeof rawMatch.autoRound === 'boolean' ? rawMatch.autoRound : DEFAULT_SETTINGS.match.autoRound,
        arenaBoundaryHalfWidth: Math.max(
          3.5,
          Math.min(8, Number(rawMatch.arenaBoundaryHalfWidth ?? DEFAULT_SETTINGS.match.arenaBoundaryHalfWidth))
        ),
      },
      general: {
        ...DEFAULT_SETTINGS.general,
        ...rawGeneral,
        showHowToPlayGuide:
          typeof rawGeneral.showHowToPlayGuide === 'boolean'
            ? rawGeneral.showHowToPlayGuide
            : DEFAULT_SETTINGS.general.showHowToPlayGuide,
        topSafeZonePx: Math.max(
          60,
          Math.min(200, Math.round(Number(rawGeneral.topSafeZonePx ?? DEFAULT_SETTINGS.general.topSafeZonePx ?? 120)))
        ),
        liveGoal: {
          ...DEFAULT_SETTINGS.general.liveGoal,
          ...(rawGeneral.liveGoal || {}),
          targetCount: Math.max(
            1,
            Math.round(Number(rawGeneral.liveGoal?.targetCount ?? DEFAULT_SETTINGS.general.liveGoal.targetCount))
          ),
        },
      },
    };
  }

  public saveAllSettings(settings: AllSettings): void {
    const sanitized: AllSettings = {
      team: {
        basePower: Math.max(0, Number(settings.team?.basePower ?? DEFAULT_SETTINGS.team.basePower)),
        maxPower: Math.max(500, Number(settings.team?.maxPower ?? DEFAULT_SETTINGS.team.maxPower)),
        chatPowerReward: Math.max(1, Number(settings.team?.chatPowerReward ?? DEFAULT_SETTINGS.team.chatPowerReward)),
        chatCooldownSec: Math.max(0, Number(settings.team?.chatCooldownSec ?? DEFAULT_SETTINGS.team.chatCooldownSec)),
        teamSwitchCooldownSec: Math.max(
          0,
          Number(settings.team?.teamSwitchCooldownSec ?? DEFAULT_SETTINGS.team.teamSwitchCooldownSec)
        ),
        neutralGiftEnabled:
          typeof settings.team?.neutralGiftEnabled === 'boolean'
            ? settings.team.neutralGiftEnabled
            : DEFAULT_SETTINGS.team.neutralGiftEnabled,
        neutralGiftPower: Math.max(
          0,
          Number(settings.team?.neutralGiftPower ?? DEFAULT_SETTINGS.team.neutralGiftPower)
        ),
        showNormalChat:
          typeof settings.team?.showNormalChat === 'boolean'
            ? settings.team.showNormalChat
            : DEFAULT_SETTINGS.team.showNormalChat,
      },
      match: {
        activeGameMode: 'ClassicPush',
        matchDurationSec: Math.max(
          60,
          Math.min(120, Math.round(Number(settings.match?.matchDurationSec ?? DEFAULT_SETTINGS.match.matchDurationSec)))
        ),
        overtimeSec: Math.max(5, Math.min(30, Number(settings.match?.overtimeSec ?? DEFAULT_SETTINGS.match.overtimeSec))),
        cooldownSec: Math.max(2, Math.min(15, Number(settings.match?.cooldownSec ?? DEFAULT_SETTINGS.match.cooldownSec))),
        autoRound:
          typeof settings.match?.autoRound === 'boolean'
            ? settings.match.autoRound
            : DEFAULT_SETTINGS.match.autoRound,
        arenaBoundaryHalfWidth: Math.max(
          3.5,
          Math.min(8, Number(settings.match?.arenaBoundaryHalfWidth ?? DEFAULT_SETTINGS.match.arenaBoundaryHalfWidth))
        ),
      },
      general: {
        ...DEFAULT_SETTINGS.general,
        ...(settings.general || {}),
        showHowToPlayGuide:
          typeof settings.general?.showHowToPlayGuide === 'boolean'
            ? settings.general.showHowToPlayGuide
            : DEFAULT_SETTINGS.general.showHowToPlayGuide,
        topSafeZonePx: Math.max(
          60,
          Math.min(200, Math.round(Number(settings.general?.topSafeZonePx ?? DEFAULT_SETTINGS.general.topSafeZonePx ?? 120)))
        ),
        liveGoal: {
          ...DEFAULT_SETTINGS.general.liveGoal,
          ...(settings.general?.liveGoal || {}),
          title:
            String(settings.general?.liveGoal?.title || DEFAULT_SETTINGS.general.liveGoal.title).trim().slice(0, 60) ||
            DEFAULT_SETTINGS.general.liveGoal.title,
          giftId: String(settings.general?.liveGoal?.giftId || DEFAULT_SETTINGS.general.liveGoal.giftId),
          giftName:
            String(settings.general?.liveGoal?.giftName || DEFAULT_SETTINGS.general.liveGoal.giftName)
              .trim()
              .slice(0, 40) || DEFAULT_SETTINGS.general.liveGoal.giftName,
          targetCount: Math.max(
            1,
            Math.round(Number(settings.general?.liveGoal?.targetCount ?? DEFAULT_SETTINGS.general.liveGoal.targetCount))
          ),
          reserveTikTokZone: Boolean(settings.general?.liveGoal?.reserveTikTokZone),
        },
      },
    };

    const now = Date.now();
    const upsert = this.db.prepare(`
      INSERT INTO Settings (key, valueJson, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET valueJson = excluded.valueJson, updatedAt = excluded.updatedAt
    `);
    const tx = this.db.transaction((s: AllSettings) => {
      upsert.run('team', JSON.stringify(s.team), now);
      upsert.run('match', JSON.stringify(s.match), now);
      upsert.run('general', JSON.stringify(s.general), now);
    });
    tx(sanitized);
  }

  public getGiftRules(): GiftRule[] {
    const rows = this.db.prepare('SELECT * FROM GiftRules ORDER BY powerPoints ASC').all() as Array<
      Omit<GiftRule, 'enabled'> & { enabled: number }
    >;
    return rows.map((r) => ({
      giftId: r.giftId,
      giftName: r.giftName,
      giftIcon: r.giftIcon,
      tier: r.tier,
      team: r.team,
      powerPoints: r.powerPoints,
      vfxId: r.vfxId,
      sfxId: r.sfxId,
      maxImpact: r.maxImpact,
      enabled: Boolean(r.enabled),
      neutralBehavior: r.neutralBehavior,
    }));
  }

  public upsertGiftRule(rule: GiftRule): void {
    this.db
      .prepare(`
        INSERT INTO GiftRules
          (giftId, giftName, giftIcon, tier, team, powerPoints, skillId, vfxId, sfxId, cooldownSec, maxImpact, enabled, neutralBehavior)
        VALUES (@giftId, @giftName, @giftIcon, @tier, @team, @powerPoints, '', @vfxId, @sfxId, 0, @maxImpact, @enabled, @neutralBehavior)
        ON CONFLICT(giftId) DO UPDATE SET
          giftName = excluded.giftName,
          giftIcon = excluded.giftIcon,
          tier = excluded.tier,
          team = excluded.team,
          powerPoints = excluded.powerPoints,
          vfxId = excluded.vfxId,
          sfxId = excluded.sfxId,
          maxImpact = excluded.maxImpact,
          enabled = excluded.enabled,
          neutralBehavior = excluded.neutralBehavior
      `)
      .run({
        giftId: rule.giftId,
        giftName: rule.giftName,
        giftIcon: rule.giftIcon || 'gift',
        tier: rule.tier || 'Small',
        team: rule.team || 'AUTO',
        powerPoints: rule.powerPoints,
        vfxId: rule.vfxId || 'vfx_spark_auto',
        sfxId: rule.sfxId || 'sfx_gift_small',
        maxImpact: rule.maxImpact || Math.max(500, rule.powerPoints * 4),
        neutralBehavior: rule.neutralBehavior || 'ALLOW_NEUTRAL',
        enabled: rule.enabled ? 1 : 0,
      });
  }

  public syncDiscoveredGifts(
    gifts: Array<{ giftId: string; giftName: string; diamondCount: number; giftIcon?: string }>
  ): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO GiftRules
        (giftId, giftName, giftIcon, tier, team, powerPoints, skillId, vfxId, sfxId, cooldownSec, maxImpact, enabled, neutralBehavior)
      VALUES (@giftId, @giftName, @giftIcon, @tier, 'AUTO', @powerPoints, '', @vfxId, @sfxId, 0, @maxImpact, 1, 'ALLOW_NEUTRAL')
    `);
    let added = 0;
    const tx = this.db.transaction(() => {
      for (const g of gifts) {
        if (!g.giftId) continue;
        const d = Math.max(1, g.diamondCount || 1);
        const tier: GiftTier =
          d >= 1000 ? 'Ultimate' : d >= 300 ? 'Special' : d >= 50 ? 'Large' : d >= 10 ? 'Medium' : 'Small';
        const powerPoints = Math.min(2000, Math.max(20, d * 5));
        const res = stmt.run({
          giftId: g.giftId,
          giftName: g.giftName || `Gift #${g.giftId}`,
          giftIcon: g.giftIcon || 'gift',
          tier,
          powerPoints,
          vfxId: `vfx_${tier.toLowerCase()}`,
          sfxId: `sfx_${tier.toLowerCase()}`,
          maxImpact: Math.max(500, Math.round(powerPoints * 4)),
        });
        if (res.changes > 0) added += 1;
      }
    });
    tx();
    return added;
  }

  public deleteGiftRule(giftId: string): void {
    this.db.prepare('DELETE FROM GiftRules WHERE giftId = ?').run(giftId);
  }

  public hasDedupKey(dedupKey: string): boolean {
    const g = this.db.prepare('SELECT 1 FROM GiftEvents WHERE dedupKey = ? LIMIT 1').get(dedupKey);
    if (g) return true;
    const c = this.db.prepare('SELECT 1 FROM ChatEvents WHERE dedupKey = ? LIMIT 1').get(dedupKey);
    return Boolean(c);
  }

  public upsertPendingStreak(streak: Omit<PendingStreakRecord, 'status'>): void {
    this.db
      .prepare(`
        INSERT INTO PendingGiftStreaks
          (streakKey, senderId, displayName, giftId, giftName, team, explicitTeam, currentCount, diamondCount, lastUpdatedAt, status)
        VALUES (@streakKey, @senderId, @displayName, @giftId, @giftName, @team, @explicitTeam, @currentCount, @diamondCount, @lastUpdatedAt, 'ACTIVE')
        ON CONFLICT(streakKey) DO UPDATE SET
          displayName = excluded.displayName,
          team = excluded.team,
          explicitTeam = COALESCE(excluded.explicitTeam, PendingGiftStreaks.explicitTeam),
          currentCount = MAX(PendingGiftStreaks.currentCount, excluded.currentCount),
          diamondCount = MAX(PendingGiftStreaks.diamondCount, excluded.diamondCount),
          lastUpdatedAt = excluded.lastUpdatedAt
      `)
      .run(streak);
  }

  public getActivePendingStreaks(): PendingStreakRecord[] {
    return this.db
      .prepare("SELECT * FROM PendingGiftStreaks WHERE status = 'ACTIVE' ORDER BY lastUpdatedAt ASC")
      .all() as PendingStreakRecord[];
  }

  public markPendingStreakCommitted(streakKey: string): void {
    this.db.prepare('DELETE FROM PendingGiftStreaks WHERE streakKey = ?').run(streakKey);
  }

  public recordGiftEvent(
    ev: NormalizedLiveEvent,
    team: RecordedTeamId,
    powerAwarded: number,
    status = 'PROCESSED'
  ): boolean {
    const today = new Date(ev.timestamp).toISOString().slice(0, 10);
    const qty = ev.payload.quantity ?? 1;
    const streak = ev.payload.streakCount ?? qty;
    const giftId = ev.payload.giftId ?? 'unknown';
    const giftName = ev.payload.giftName ?? giftId;

    const tx = this.db.transaction(() => {
      const insertResult = this.db
        .prepare(`
          INSERT OR IGNORE INTO GiftEvents
            (dedupKey, eventId, senderId, displayName, giftId, giftName, team, quantity, streakCount, powerAwarded, skillId, status, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
        `)
        .run(
          ev.dedupKey,
          ev.eventId,
          ev.senderId,
          ev.displayName,
          giftId,
          giftName,
          team,
          qty,
          streak,
          powerAwarded,
          status,
          ev.timestamp
        );

      if (insertResult.changes === 0) return false;

      if (team === 'BOY' || team === 'GIRL') {
        this.db
          .prepare(`
            INSERT INTO Players (senderId, displayName, team, totalPoints, totalGifts, lastSeenAt)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(senderId) DO UPDATE SET
              displayName = excluded.displayName,
              team = excluded.team,
              totalPoints = Players.totalPoints + excluded.totalPoints,
              totalGifts = Players.totalGifts + excluded.totalGifts,
              lastSeenAt = excluded.lastSeenAt
          `)
          .run(ev.senderId, ev.displayName, team, powerAwarded, qty, ev.timestamp);

        this.db
          .prepare(`
            INSERT INTO Leaderboard (senderId, displayName, team, contributionPoints, attackPoints, defensePoints, giftCount, longestStreak, matchesPlayed, matchesWon, titlesJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1, 0, '[]', ?)
            ON CONFLICT(senderId) DO UPDATE SET
              displayName = excluded.displayName,
              team = excluded.team,
              contributionPoints = Leaderboard.contributionPoints + excluded.contributionPoints,
              attackPoints = Leaderboard.attackPoints + excluded.attackPoints,
              giftCount = Leaderboard.giftCount + excluded.giftCount,
              longestStreak = MAX(Leaderboard.longestStreak, excluded.longestStreak),
              updatedAt = excluded.updatedAt
          `)
          .run(ev.senderId, ev.displayName, team, powerAwarded, powerAwarded, qty, streak, ev.timestamp);
      } else {
        this.db
          .prepare(`
            INSERT INTO Players (senderId, displayName, team, totalPoints, totalGifts, lastSeenAt)
            VALUES (?, ?, 'NEUTRAL', ?, ?, ?)
            ON CONFLICT(senderId) DO UPDATE SET
              displayName = excluded.displayName,
              totalPoints = Players.totalPoints + excluded.totalPoints,
              totalGifts = Players.totalGifts + excluded.totalGifts,
              lastSeenAt = excluded.lastSeenAt
          `)
          .run(ev.senderId, ev.displayName, powerAwarded, qty, ev.timestamp);
      }

      this.db
        .prepare(`
          INSERT INTO DailyStats (dateKey, totalMatches, boyWins, girlWins, totalGifts, totalChatCommands, peakPower, updatedAt)
          VALUES (?, 0, 0, 0, ?, 0, ?, ?)
          ON CONFLICT(dateKey) DO UPDATE SET
            totalGifts = DailyStats.totalGifts + excluded.totalGifts,
            peakPower = MAX(DailyStats.peakPower, excluded.peakPower),
            updatedAt = excluded.updatedAt
        `)
        .run(today, qty, powerAwarded, ev.timestamp);

      return true;
    });

    return tx();
  }

  public recordChatEvent(
    ev: NormalizedLiveEvent,
    team: TeamId | null,
    powerAwarded: number
  ): boolean {
    const today = new Date(ev.timestamp).toISOString().slice(0, 10);
    const msg = ev.payload.message ?? '';
    const cmd = ev.payload.command ?? 'NONE';

    const tx = this.db.transaction(() => {
      const res = this.db
        .prepare(`
          INSERT OR IGNORE INTO ChatEvents
            (dedupKey, eventId, senderId, displayName, message, command, team, powerAwarded, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(ev.dedupKey, ev.eventId, ev.senderId, ev.displayName, msg, cmd, team, powerAwarded, ev.timestamp);

      if (res.changes === 0) return false;

      if (team && powerAwarded > 0) {
        this.db
          .prepare(`
            INSERT INTO Players (senderId, displayName, team, totalPoints, totalGifts, lastSeenAt)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT(senderId) DO UPDATE SET
              displayName = excluded.displayName,
              team = excluded.team,
              totalPoints = Players.totalPoints + excluded.totalPoints,
              lastSeenAt = excluded.lastSeenAt
          `)
          .run(ev.senderId, ev.displayName, team, powerAwarded, ev.timestamp);

        this.db
          .prepare(`
            INSERT INTO Leaderboard (senderId, displayName, team, contributionPoints, attackPoints, defensePoints, giftCount, longestStreak, matchesPlayed, matchesWon, titlesJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0, 1, 0, '[]', ?)
            ON CONFLICT(senderId) DO UPDATE SET
              displayName = excluded.displayName,
              team = excluded.team,
              contributionPoints = Leaderboard.contributionPoints + excluded.contributionPoints,
              attackPoints = Leaderboard.attackPoints + excluded.attackPoints,
              updatedAt = excluded.updatedAt
          `)
          .run(ev.senderId, ev.displayName, team, powerAwarded, powerAwarded, ev.timestamp);

        this.db
          .prepare(`
            INSERT INTO DailyStats (dateKey, totalMatches, boyWins, girlWins, totalGifts, totalChatCommands, peakPower, updatedAt)
            VALUES (?, 0, 0, 0, 0, 1, 0, ?)
            ON CONFLICT(dateKey) DO UPDATE SET
              totalChatCommands = DailyStats.totalChatCommands + 1,
              updatedAt = excluded.updatedAt
          `)
          .run(today, ev.timestamp);
      }

      return true;
    });

    return tx();
  }

  public recordDeadLetterEvent(ev: NormalizedLiveEvent, errorMessage: string): void {
    try {
      this.db
        .prepare(`
          INSERT INTO DeadLetterEvents (eventId, dedupKey, eventType, senderId, displayName, payloadJson, errorMessage, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          ev.eventId,
          ev.dedupKey,
          ev.eventType,
          ev.senderId,
          ev.displayName,
          JSON.stringify(ev.payload),
          errorMessage,
          Date.now()
        );
    } catch {
      // Never throw from dead letter logging
    }
  }

  public getEventInspector(limit = 80, search = ''): EventInspectorRecord[] {
    const q = search.trim().toLowerCase();
    const gifts = this.db
      .prepare('SELECT id, dedupKey, eventId, senderId, displayName, giftId, giftName, team, quantity, streakCount, powerAwarded, status, createdAt FROM GiftEvents ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<{
        id: number;
        dedupKey: string;
        eventId: string;
        senderId: string;
        displayName: string;
        giftId: string;
        giftName: string;
        team: RecordedTeamId;
        quantity: number;
        streakCount: number;
        powerAwarded: number;
        status: string;
        createdAt: number;
      }>;

    const chats = this.db
      .prepare('SELECT id, dedupKey, eventId, senderId, displayName, message, command, team, powerAwarded, createdAt FROM ChatEvents ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<{
        id: number;
        dedupKey: string;
        eventId: string;
        senderId: string;
        displayName: string;
        message: string;
        command: string;
        team: RecordedTeamId | null;
        powerAwarded: number;
        createdAt: number;
      }>;

    const dead = this.db
      .prepare('SELECT id, eventId, dedupKey, eventType, senderId, displayName, payloadJson, errorMessage, createdAt FROM DeadLetterEvents ORDER BY id DESC LIMIT ?')
      .all(Math.min(limit, 30)) as Array<{
        id: number;
        eventId: string;
        dedupKey: string;
        eventType: string;
        senderId: string;
        displayName: string;
        payloadJson: string;
        errorMessage: string;
        createdAt: number;
      }>;

    const combined: EventInspectorRecord[] = [
      ...gifts.map((g) => ({
        id: `g-${g.id}`,
        kind: 'GIFT' as const,
        dedupKey: g.dedupKey,
        eventId: g.eventId,
        senderId: g.senderId,
        displayName: g.displayName,
        team: g.team,
        summary: `${g.giftName} x${g.quantity} (streak ${g.streakCount})`,
        giftId: g.giftId,
        powerAwarded: g.powerAwarded,
        status: g.status || 'PROCESSED',
        createdAt: g.createdAt,
      })),
      ...chats.map((c) => ({
        id: `c-${c.id}`,
        kind: 'CHAT' as const,
        dedupKey: c.dedupKey,
        eventId: c.eventId,
        senderId: c.senderId,
        displayName: c.displayName,
        team: c.team,
        summary: `[${c.command}] ${c.message}`,
        powerAwarded: c.powerAwarded,
        status: 'PROCESSED',
        createdAt: c.createdAt,
      })),
      ...dead.map((d) => ({
        id: `d-${d.id}`,
        kind: 'DEAD_LETTER' as const,
        dedupKey: d.dedupKey,
        eventId: d.eventId,
        senderId: d.senderId,
        displayName: d.displayName,
        team: null,
        summary: `${d.eventType}: ${d.payloadJson.slice(0, 80)}`,
        powerAwarded: 0,
        status: 'ERROR',
        errorMessage: d.errorMessage,
        createdAt: d.createdAt,
      })),
    ];

    const filtered = q
      ? combined.filter(
          (r) =>
            r.displayName.toLowerCase().includes(q) ||
            r.senderId.toLowerCase().includes(q) ||
            r.summary.toLowerCase().includes(q) ||
            (r.giftId || '').toLowerCase().includes(q) ||
            r.dedupKey.toLowerCase().includes(q)
        )
      : combined;

    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  public getPlayers(limit = 100): PlayerRecord[] {
    return this.db
      .prepare('SELECT * FROM Players ORDER BY lastSeenAt DESC LIMIT ?')
      .all(limit) as PlayerRecord[];
  }

  public recordMatchResult(record: MatchHistoryRecord, peakPower: number): void {
    const today = new Date(record.endedAt).toISOString().slice(0, 10);
    const mode: GameModeId = 'ClassicPush';
    const tx = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT OR REPLACE INTO MatchHistory
            (matchId, gameMode, winnerTeam, boyScore, girlScore, boyPushProgress, girlPushProgress, mvpName, mvpPoints, durationSec, arenaTheme, winReason, startedAt, endedAt)
          VALUES (@matchId, @gameMode, @winnerTeam, @boyScore, @girlScore, @boyPushProgress, @girlPushProgress, @mvpName, @mvpPoints, @durationSec, @arenaTheme, @winReason, @startedAt, @endedAt)
        `)
        .run({ ...record, gameMode: mode });

      this.db
        .prepare(`
          INSERT INTO DailyStats (dateKey, totalMatches, boyWins, girlWins, totalGifts, totalChatCommands, peakPower, updatedAt)
          VALUES (?, 1, ?, ?, 0, 0, ?, ?)
          ON CONFLICT(dateKey) DO UPDATE SET
            totalMatches = DailyStats.totalMatches + 1,
            boyWins = DailyStats.boyWins + excluded.boyWins,
            girlWins = DailyStats.girlWins + excluded.girlWins,
            peakPower = MAX(DailyStats.peakPower, excluded.peakPower),
            updatedAt = excluded.updatedAt
        `)
        .run(
          today,
          record.winnerTeam === 'BOY' ? 1 : 0,
          record.winnerTeam === 'GIRL' ? 1 : 0,
          Math.round(peakPower),
          record.endedAt
        );

      this.db
        .prepare(`
          UPDATE Leaderboard
          SET matchesWon = matchesWon + 1
          WHERE team = ? AND updatedAt >= ?
        `)
        .run(record.winnerTeam, record.startedAt);
    });
    tx();
  }

  public getLeaderboard(limit = 30): LeaderboardEntry[] {
    return this.db
      .prepare('SELECT senderId, displayName, team, contributionPoints, giftCount, longestStreak, matchesPlayed, matchesWon, updatedAt FROM Leaderboard ORDER BY contributionPoints DESC LIMIT ?')
      .all(limit) as LeaderboardEntry[];
  }

  public getMatchHistory(limit = 40): MatchHistoryRecord[] {
    return this.db
      .prepare('SELECT * FROM MatchHistory ORDER BY endedAt DESC LIMIT ?')
      .all(limit) as MatchHistoryRecord[];
  }

  public getDailyStats(limit = 30): DailyStatRecord[] {
    return this.db
      .prepare('SELECT * FROM DailyStats ORDER BY dateKey DESC LIMIT ?')
      .all(limit) as DailyStatRecord[];
  }

  public log(
    level: 'INFO' | 'WARN' | 'ERROR',
    module: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    try {
      this.db
        .prepare(
          'INSERT INTO EventLogs (level, module, message, metadataJson, createdAt) VALUES (?, ?, ?, ?, ?)'
        )
        .run(level, module, message, JSON.stringify(metadata), Date.now());
    } catch {
      // Never throw on logging
    }
  }

  public getLogs(limit = 100): EventLogRecord[] {
    return this.db
      .prepare('SELECT * FROM EventLogs ORDER BY id DESC LIMIT ?')
      .all(limit) as EventLogRecord[];
  }

  public async createBackup(): Promise<{
    dbBackupFile: string;
    jsonBackupFile: string;
    createdAt: number;
    sizeBytes: number;
  }> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbBackupFile = path.join(this.backupDir, `arena-${stamp}.db`);
    const jsonBackupFile = path.join(this.backupDir, `arena-${stamp}.json`);

    await this.db.backup(dbBackupFile);

    const payload = {
      exportedAt: Date.now(),
      settings: this.getAllSettings(),
      giftRules: this.getGiftRules(),
      leaderboard: this.getLeaderboard(200),
      matchHistory: this.getMatchHistory(200),
      dailyStats: this.getDailyStats(90),
    };
    fs.writeFileSync(jsonBackupFile, JSON.stringify(payload, null, 2), 'utf-8');
    const stat = fs.statSync(dbBackupFile);
    this.log('INFO', 'Backup', 'Created SQLite + JSON backup snapshot', {
      dbBackupFile: path.basename(dbBackupFile),
      sizeBytes: stat.size,
    });
    return {
      dbBackupFile: path.basename(dbBackupFile),
      jsonBackupFile: path.basename(jsonBackupFile),
      createdAt: Date.now(),
      sizeBytes: stat.size,
    };
  }

  public listBackups(): Array<{ fileName: string; sizeBytes: number; mtimeMs: number }> {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.json') || f.endsWith('.db'))
      .map((fileName) => {
        const stat = fs.statSync(path.join(this.backupDir, fileName));
        return {
          fileName,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  public restoreFromJsonBackup(fileName: string): { restored: boolean; message: string } {
    const safeName = path.basename(fileName);
    const fullPath = path.join(this.backupDir, safeName);
    if (!fs.existsSync(fullPath) || !safeName.endsWith('.json')) {
      return { restored: false, message: 'Backup JSON file not found' };
    }
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const tx = this.db.transaction(() => {
      if (raw.settings) this.saveAllSettings(raw.settings);
      if (Array.isArray(raw.giftRules)) {
        for (const r of raw.giftRules) this.upsertGiftRule(r);
      }
      if (Array.isArray(raw.leaderboard)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO Leaderboard
            (senderId, displayName, team, contributionPoints, attackPoints, defensePoints, giftCount, longestStreak, matchesPlayed, matchesWon, titlesJson, updatedAt)
          VALUES (@senderId, @displayName, @team, @contributionPoints, 0, 0, @giftCount, @longestStreak, @matchesPlayed, @matchesWon, '[]', @updatedAt)
        `);
        for (const entry of raw.leaderboard) {
          stmt.run({
            longestStreak: 0,
            ...entry,
          });
        }
      }
      if (Array.isArray(raw.matchHistory)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO MatchHistory
            (matchId, gameMode, winnerTeam, boyScore, girlScore, boyPushProgress, girlPushProgress, mvpName, mvpPoints, durationSec, arenaTheme, winReason, startedAt, endedAt)
          VALUES (@matchId, 'ClassicPush', @winnerTeam, @boyScore, @girlScore, @boyPushProgress, @girlPushProgress, @mvpName, @mvpPoints, @durationSec, @arenaTheme, @winReason, @startedAt, @endedAt)
        `);
        for (const mh of raw.matchHistory) {
          stmt.run({ ...mh });
        }
      }
    });
    tx();
    this.log('INFO', 'Recovery', `Restored database from ${safeName}`);
    return { restored: true, message: `Khôi phục dữ liệu thành công từ ${safeName}` };
  }

  public verifyIntegrity(): { ok: boolean; result: string } {
    const row = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const status = row[0]?.integrity_check ?? 'unknown';
    return { ok: status === 'ok', result: status };
  }

  public close(): void {
    this.db.close();
  }
}
