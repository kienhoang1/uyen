import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ArenaDatabase } from '../LiveBridge/db/database.js';
import { MatchEngine } from '../LiveBridge/engine/matchEngine.js';

function createTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-test-'));
  const dbPath = path.join(dir, 'arena-test.db');
  return { dir, db: new ArenaDatabase(dbPath) };
}

test('1. Characters never penetrate each other and never fly infinitely out of bounds', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);

  // Skip 3s countdown
  for (let i = 0; i < 40; i++) engine.step(0.1, Date.now() + i * 100);

  // Inject strong gifts for BOY to push GIRL toward boundary
  for (let i = 0; i < 6; i++) {
    engine.ingestRawEvent({
      eventType: 'Gift',
      senderId: `u_${i}`,
      displayName: `Tester ${i}`,
      giftId: 'galaxy_1000',
      team: 'BOY',
      quantity: 1,
    });
  }

  let finished = false;
  for (let i = 0; i < 200; i++) {
    const snap = engine.step(0.05, Date.now() + 5000 + i * 50);
    const separation = snap.girl.positionX - snap.boy.positionX;
    assert.ok(separation >= 1.14, `Separation violated: ${separation}`);
    assert.ok(Math.abs(snap.boy.positionX) <= 6.2, `Boy position out of safe bounds: ${snap.boy.positionX}`);
    assert.ok(Math.abs(snap.girl.positionX) <= 6.2, `Girl position out of safe bounds: ${snap.girl.positionX}`);
    if (snap.phase === 'Victory') {
      assert.equal(snap.winnerTeam, 'BOY');
      finished = true;
      break;
    }
  }
  assert.equal(finished, true, 'BOY should push GIRL out to Victory');
  db.close();
});

test('2. Direct linear power math and comeback counter-push work without hidden multipliers', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);
  const t0 = Date.now() + 5000;
  for (let i = 0; i < 40; i++) engine.step(0.1, Date.now() + i * 100);

  // Chat BOY (+15) + Gift Sư Tử 5879 (+600) => totalPower = 100 + 15 + 600 = 715
  engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'b1',
    displayName: 'BoyFan',
    message: 'BOY',
  });
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'b1',
    displayName: 'BoyFan',
    giftId: '5879',
    team: 'BOY',
    quantity: 1,
  });
  for (let i = 0; i < 20; i++) engine.step(0.05, t0 + i * 50);
  const midSnap = engine.getSnapshot(t0 + 1000);
  assert.equal(midSnap.boy.chatPower, 15);
  assert.equal(midSnap.boy.giftPower, 600);
  assert.equal(midSnap.boy.totalPower, 715);
  assert.ok(midSnap.boy.totalPower > midSnap.girl.totalPower);

  // GIRL counter-pushes with Thiên Hà (galaxy_1000 = +1000) -> 1100 totalPower
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'g1',
    displayName: 'GirlFan',
    giftId: 'galaxy_1000',
    team: 'GIRL',
    quantity: 1,
  });
  for (let i = 0; i < 30; i++) engine.step(0.05, t0 + 2000 + i * 50);
  const afterSnap = engine.getSnapshot(t0 + 3500);
  assert.equal(afterSnap.girl.giftPower, 1000);
  assert.equal(afterSnap.girl.totalPower, 1100);
  assert.ok(afterSnap.girl.totalPower > afterSnap.boy.totalPower, 'Girl comeback should overtake Boy cleanly');
  db.close();
});

test('3. ChatCommand parser handles case-insensitive BOY/GIRL Unicode & ignores regular chat', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);

  const nonCmd = engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'c1',
    displayName: 'Viewer 1',
    message: 'Chào cả nhà nha!',
  });
  const cmdBoy = engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'c2',
    displayName: 'Viewer 2',
    message: 'boy cố lên',
  });
  const cmdGirl = engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'c3',
    displayName: 'Viewer 3',
    message: 'NỮ',
  });

  const snap = engine.step(0.05);
  assert.equal(nonCmd.payload.command, 'NONE');
  assert.equal(cmdBoy.payload.command, 'BOY');
  assert.equal(cmdGirl.payload.command, 'GIRL');
  assert.equal(snap.boy.chatPower, 15);
  assert.equal(snap.girl.chatPower, 15);
  assert.equal(snap.lastActionCallout?.displayName, 'Viewer 3');
  assert.equal(snap.lastActionCallout?.powerAdded, 15);
  db.close();
});

test('4. Gift streak and duplicate dedupKey never double-count points', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);

  engine.ingestRawEvent({
    dedupKey: 'exact-dup-1',
    eventType: 'Gift',
    senderId: 's1',
    displayName: 'Sender 1',
    giftId: 'rose_blue',
    team: 'BOY',
    quantity: 1,
  });
  engine.ingestRawEvent({
    dedupKey: 'exact-dup-1',
    eventType: 'Gift',
    senderId: 's1',
    displayName: 'Sender 1',
    giftId: 'rose_blue',
    team: 'BOY',
    quantity: 1,
  });

  engine.step(0.05);
  const snapAfterDup = engine.getSnapshot();
  assert.equal(snapAfterDup.boy.giftPower, 25);

  // Gift streak cumulative repeatCount 1 -> 2 -> 3 awards 3 * 25 = 75 -> 100 exact
  const grp = 'streak_grp_99';
  for (let s = 1; s <= 3; s++) {
    engine.ingestRawEvent({
      eventType: 'Gift',
      senderId: 's2',
      displayName: 'Streak Fan',
      giftId: 'rose_blue',
      team: 'BOY',
      quantity: 1,
      streakCount: s,
      groupId: grp,
    });
  }
  engine.step(0.05);
  const snapAfterStreak = engine.getSnapshot();
  assert.equal(snapAfterStreak.boy.giftPower, 100);
  db.close();
});

test('5. SQLite Database Backup, JSON Recovery, and ClassicPush settings clamping work cleanly', async () => {
  const { db } = createTempDb();
  const backupInfo = await db.createBackup();
  assert.ok(backupInfo.sizeBytes > 0);

  const settings = db.getAllSettings();
  assert.equal(settings.match.activeGameMode, 'ClassicPush');
  assert.equal(settings.match.matchDurationSec, 90);

  settings.team.basePower = 777;
  settings.match.matchDurationSec = 999; // Should clamp to max 120s
  db.saveAllSettings(settings);
  const modified = db.getAllSettings();
  assert.equal(modified.team.basePower, 777);
  assert.equal(modified.match.matchDurationSec, 120);
  assert.equal(modified.match.activeGameMode, 'ClassicPush');

  const restored = db.restoreFromJsonBackup(backupInfo.jsonBackupFile);
  assert.equal(restored.restored, true);
  assert.equal(db.getAllSettings().team.basePower, 100);
  assert.equal(db.getAllSettings().match.matchDurationSec, 90);
  assert.equal(db.verifyIntegrity().ok, true);
  db.close();
});

test('6. High-load bounded EventQueue handles burst without losing queue stability', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db, {}, 500);
  engine.startMatch(false);

  for (let i = 0; i < 400; i++) {
    engine.ingestRawEvent({
      eventType: 'Chat',
      senderId: `burst_${i}`,
      displayName: `Burst ${i}`,
      message: i % 2 === 0 ? 'BOY' : 'GIRL',
    });
  }

  for (let i = 0; i < 5; i++) {
    engine.step(0.033);
  }

  const metrics = engine.getPerformanceMetrics(1, 2);
  assert.equal(metrics.eventQueueSize, 0);
  assert.equal(metrics.eventsProcessedTotal, 400);
  assert.equal(metrics.errorCount, 0);
  db.close();
});

test('7. ClassicPush match countdown, 90s clock, and Near-Win warning trigger cleanly before Victory', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);
  const t0 = Date.now();

  const countdownSnap = engine.getSnapshot(t0);
  assert.equal(countdownSnap.gameMode, 'ClassicPush');
  assert.equal(countdownSnap.phase, 'Countdown');
  assert.equal(countdownSnap.totalMatchDurationSec, 90);
  assert.equal(countdownSnap.nearWinTeam, null);

  // Advance past 3s countdown into Clash
  let snap = countdownSnap;
  for (let i = 1; i <= 35; i++) {
    snap = engine.step(0.1, t0 + i * 100);
  }
  assert.equal(snap.phase, 'Clash');

  // BOY sends gift to push GIRL near the edge without instant full ring-out yet
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'pusher_1',
    displayName: 'TopBoy',
    giftId: '5879', // +600
    team: 'BOY',
  });

  let sawNearWin = false;
  let sawVictory = false;
  for (let i = 1; i <= 150; i++) {
    snap = engine.step(0.05, t0 + 4000 + i * 50);
    if (snap.phase === 'Clash' && snap.nearWinTeam === 'BOY' && snap.nearWinProgressPct >= 68) {
      sawNearWin = true;
    }
    if (snap.phase === 'Victory') {
      assert.equal(snap.winnerTeam, 'BOY');
      sawVictory = true;
      break;
    }
  }
  assert.equal(sawNearWin, true, 'Should trigger near-win danger alert when opponent crosses 68% edge threshold');
  assert.equal(sawVictory, true, 'Should reach Victory when pushed out of boundary');
  db.close();
});

test('8. lastActionCallout accurately surfaces latest viewer action and power added', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);
  const t0 = Date.now() + 5000;
  for (let i = 0; i < 40; i++) engine.step(0.1, Date.now() + i * 100);

  engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'v_chat',
    displayName: 'Minh Anh',
    message: 'GIRL',
  });
  const afterChat = engine.step(0.05, t0);
  assert.equal(afterChat.lastActionCallout?.kind, 'CHAT');
  assert.equal(afterChat.lastActionCallout?.team, 'GIRL');
  assert.equal(afterChat.lastActionCallout?.displayName, 'Minh Anh');
  assert.equal(afterChat.lastActionCallout?.powerAdded, 15);

  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'v_gift',
    displayName: 'Tuấn Pro',
    giftId: '6064', // Bánh Donut = 300
    team: 'BOY',
    quantity: 1,
  });
  const afterGift = engine.step(0.05, t0 + 200);
  assert.equal(afterGift.lastActionCallout?.kind, 'GIFT');
  assert.equal(afterGift.lastActionCallout?.team, 'BOY');
  assert.equal(afterGift.lastActionCallout?.displayName, 'Tuấn Pro');
  assert.equal(afterGift.lastActionCallout?.powerAdded, 300);
  db.close();
});

test('9. Team switch cooldown and chat cooldown prevent instant spam while allowing initial join', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);

  const t0 = Date.now() + 5000;
  for (let i = 0; i < 40; i++) engine.step(0.1, Date.now() + i * 100);

  // Initial join BOY at t0
  engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'switcher_1',
    displayName: 'Switcher',
    message: 'BOY',
  });
  engine.step(0.05, t0);
  assert.equal(engine.getSnapshot(t0).boy.memberCount, 1);
  assert.equal(engine.getSnapshot(t0).boy.chatPower, 15);

  // Immediate spam BOY within chatCooldownSec (2s) -> RATE_LIMITED
  const spamBoy = engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'switcher_1',
    displayName: 'Switcher',
    message: 'BOY',
  });
  engine.step(0.05, t0 + 500);
  assert.equal(spamBoy.status, 'RATE_LIMITED');
  assert.equal(engine.getSnapshot(t0 + 500).boy.chatPower, 15);

  // Immediate switch to GIRL within teamSwitchCooldownSec (15s) -> RATE_LIMITED, stays BOY
  const switchEarly = engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'switcher_1',
    displayName: 'Switcher',
    message: 'GIRL',
  });
  engine.step(0.05, t0 + 3000);
  assert.equal(switchEarly.status, 'RATE_LIMITED');
  assert.equal(engine.getSnapshot(t0 + 3000).boy.memberCount, 1);
  assert.equal(engine.getSnapshot(t0 + 3000).girl.memberCount, 0);

  // After chatCooldownSec passes, repeating BOY awards another +15 cleanly
  const validRepeat = engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'switcher_1',
    displayName: 'Switcher',
    message: 'BOY',
  });
  engine.step(0.05, t0 + 6000);
  assert.equal(validRepeat.status, 'PROCESSED');
  assert.equal(engine.getSnapshot(t0 + 6000).boy.chatPower, 30);
  db.close();
});

test('10. Stress test 1000 burst events drains cleanly via BoundedEventQueue with zero errors', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db, {}, 2000);
  engine.startMatch(false);

  for (let i = 0; i < 1000; i++) {
    engine.ingestRawEvent({
      eventType: 'Chat',
      senderId: `stress_${i}`,
      displayName: `Stress ${i}`,
      message: i % 2 === 0 ? 'BOY' : 'GIRL',
    });
  }

  for (let i = 0; i < 10; i++) {
    engine.step(0.033);
  }

  const metrics = engine.getPerformanceMetrics(2, 1);
  assert.equal(metrics.eventQueueSize, 0);
  assert.equal(metrics.eventsProcessedTotal, 1000);
  assert.equal(metrics.errorCount, 0);
  db.close();
});

test('11. Auto-Team gift routing supports sender team and treats unaligned senders as NEUTRAL', () => {
  const { db } = createTempDb();
  const engine = new MatchEngine(db);
  engine.startMatch(false);
  const t0 = Date.now() + 5000;
  for (let i = 0; i < 40; i++) engine.step(0.1, Date.now() + i * 100);

  engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'viewer_a',
    displayName: 'FanBoy',
    message: 'BOY',
  });
  engine.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'viewer_b',
    displayName: 'FanGirl',
    message: 'GIRL',
  });
  engine.step(0.05, t0);

  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'viewer_a',
    displayName: 'FanBoy',
    giftId: '5655',
    quantity: 1,
  });
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'viewer_b',
    displayName: 'FanGirl',
    giftId: '5655',
    quantity: 2,
  });
  // Viewer C has NOT joined any team -> must be recorded as NEUTRAL
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'viewer_c',
    displayName: 'NeutralViewer',
    giftId: '5655',
    quantity: 1,
  });

  const snap = engine.step(0.05, t0 + 1000);
  assert.equal(snap.boy.giftPower, 25, 'Rose (25 pts) should boost BOY for Viewer A');
  assert.equal(snap.girl.giftPower, 50, '2x Rose (50 pts exact) should boost GIRL for Viewer B');
  assert.ok(snap.boyMembers.includes('FanBoy'));
  assert.ok(snap.girlMembers.includes('FanGirl'));
  assert.equal(snap.girlMembers.includes('NeutralViewer'), false);
  assert.equal(snap.boyMembers.includes('NeutralViewer'), false);
  assert.equal(snap.lastActionCallout?.kind, 'NEUTRAL');
  assert.ok(snap.activeBanner?.title.includes('QUÀ TRUNG LẬP'));
  assert.ok(snap.activeBanner?.subtitle.includes('BOY hoặc GIRL'));

  const girlGiftRows = db.getEventInspector(20, 'FanGirl').filter((r) => r.kind === 'GIFT');
  assert.equal(girlGiftRows.length, 1);
  assert.equal(girlGiftRows[0].team, 'GIRL');
  assert.equal(girlGiftRows[0].powerAwarded, 50);

  const neutralRecords = db.getEventInspector(20, 'NeutralViewer');
  assert.equal(neutralRecords.length, 1);
  assert.equal(neutralRecords[0].team, 'NEUTRAL');
  assert.equal(neutralRecords[0].status, 'NEUTRAL_WAIT_TEAM');
  db.close();
});

test('12. repeatEnd streak commits once, separate identical gifts both count, and PendingGiftStreaks recover on restart', () => {
  const { dir } = createTempDb();
  const dbPath = path.join(dir, 'streak-recovery.db');
  const db1 = new ArenaDatabase(dbPath);
  const engine1 = new MatchEngine(db1);
  engine1.startMatch(false);
  const t0 = Date.now() + 5000;
  for (let i = 0; i < 40; i++) engine1.step(0.1, Date.now() + i * 100);

  engine1.ingestRawEvent({
    eventType: 'Chat',
    senderId: 'streaker',
    displayName: 'StreakMaster',
    message: 'BOY',
  });
  engine1.step(0.05, t0);

  for (let s = 1; s <= 4; s++) {
    engine1.ingestRawEvent({
      eventType: 'Gift',
      senderId: 'streaker',
      displayName: 'StreakMaster',
      giftId: '5655',
      quantity: 1,
      streakCount: s,
      repeatEnd: false,
      groupId: 'grp_live_1',
    });
  }
  const midSnap = engine1.step(0.05, t0 + 500);
  assert.equal(midSnap.boy.giftPower, 0, 'Do not commit giftPower while repeatEnd=false');
  assert.equal(midSnap.activeGiftStreaks.length, 1);
  assert.equal(midSnap.activeGiftStreaks[0].currentCount, 4);

  engine1.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'streaker',
    displayName: 'StreakMaster',
    giftId: '5655',
    quantity: 1,
    streakCount: 5,
    repeatEnd: true,
    groupId: 'grp_live_1',
  });
  const endSnap = engine1.step(0.05, t0 + 900);
  assert.equal(endSnap.boy.giftPower, 125, 'Final repeatEnd=true commits exact 5x streak');
  assert.equal(endSnap.activeGiftStreaks.length, 0);
  const committedRows = db1.getEventInspector(20, 'StreakMaster').filter((r) => r.kind === 'GIFT');
  assert.equal(committedRows.length, 1, 'Exactly ONE GiftEvents DB row for streak 1..5');
  assert.equal(committedRows[0].powerAwarded, 125);

  engine1.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'streaker',
    displayName: 'StreakMaster',
    giftId: '5655',
    quantity: 1,
  });
  engine1.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'streaker',
    displayName: 'StreakMaster',
    giftId: '5655',
    quantity: 1,
  });
  const afterTwoSingles = engine1.step(0.05, t0 + 1200);
  const giftRowsAfterSingles = db1.getEventInspector(20, 'StreakMaster').filter((r) => r.kind === 'GIFT');
  assert.equal(giftRowsAfterSingles.length, 3);
  assert.equal(afterTwoSingles.boy.giftPower, 175);

  // Crash while streak repeatEnd=false, then reboot on same SQLite DB
  engine1.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'streaker',
    displayName: 'StreakMaster',
    giftId: '5655',
    team: 'BOY',
    quantity: 1,
    streakCount: 3,
    repeatEnd: false,
    groupId: 'grp_crashed_99',
  });
  engine1.step(0.05, t0 + 1500);
  assert.equal(db1.getActivePendingStreaks().length, 1);
  db1.close();

  const db2 = new ArenaDatabase(dbPath);
  const engine2 = new MatchEngine(db2);
  assert.equal(db2.getActivePendingStreaks().length, 0, 'Pending streak should commit & clear on recovery');
  assert.equal(engine2.getSnapshot().boy.giftPower, 75, 'Recovered 3x Rose (75 pts exact) should be credited');
  db2.close();
});

test('13. Priority Queue sheds low-priority P3 normal chats/likes ahead of P1 Gifts and BOY/GIRL commands', async () => {
  const { BoundedEventQueue, EventNormalizer } = await import('../LiveBridge/bridge/eventPipeline.js');
  const normalizer = new EventNormalizer();
  const q = new BoundedEventQueue(6);

  // Fill with 6 P3 normal chat events
  for (let i = 0; i < 6; i++) {
    const res = q.enqueue(
      normalizer.normalize({ eventType: 'Chat', senderId: `l_${i}`, message: 'hello world' })
    );
    assert.equal(res.accepted, true);
  }
  // Enqueue 3 P1 events (Gifts + BOY command) while full -> P1 must evict P3 and survive
  for (let i = 0; i < 2; i++) {
    const res = q.enqueue(normalizer.normalize({ eventType: 'Gift', senderId: `g_${i}`, giftId: '5655' }));
    assert.equal(res.accepted, true);
    assert.equal(res.shedLowPriority, true);
  }
  const boyCmdRes = q.enqueue(
    normalizer.normalize({ eventType: 'Chat', senderId: 'b_cmd', message: 'BOY' })
  );
  assert.equal(boyCmdRes.accepted, true);
  assert.equal(boyCmdRes.shedLowPriority, true);

  // Incoming P3 normal chat when queue full -> rejected immediately
  const rejectedNormal = q.enqueue(
    normalizer.normalize({ eventType: 'Chat', senderId: 'l_extra', message: 'spam text' })
  );
  assert.equal(rejectedNormal.accepted, false);
  assert.equal(q.getRejectedCount(), 1);

  const drained = q.dequeueBatch(10);
  const drainedGifts = drained.filter((e) => e.eventType === 'Gift');
  const drainedCmds = drained.filter((e) => e.eventType === 'Chat' && e.payload.command === 'BOY');
  assert.equal(drainedGifts.length, 2, 'All P1 Gift events must survive queue saturation');
  assert.equal(drainedCmds.length, 1, 'All P1 BOY/GIRL commands must survive queue saturation');
});

test('14. TikTok LIVE Goal (Bảng Ý muốn) tracks matching gifts, announces completion, and resets cleanly', () => {
  const { db } = createTempDb();
  const cfg = db.getAllSettings();
  cfg.general.liveGoal = {
    enabled: true,
    title: 'Ý muốn LIVE',
    giftId: '5655',
    giftName: 'Hoa Hồng',
    targetCount: 5,
    reserveTikTokZone: false,
  };
  db.saveAllSettings(cfg);

  const engine = new MatchEngine(db);
  engine.startMatch(false);
  const t0 = Date.now() + 5000;
  for (let i = 0; i < 40; i++) engine.step(0.1, Date.now() + i * 100);

  // Send non-matching gift (5487 Tim Tay) -> goal count stays 0
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'g_other',
    displayName: 'OtherGiftFan',
    giftId: '5487',
    team: 'BOY',
    quantity: 2,
  });
  let snap = engine.step(0.05, t0);
  assert.equal(snap.liveGoal.currentCount, 0);

  // Send 5x matching gift 5655 -> goal completes and triggers banner
  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'g_rose',
    displayName: 'RoseGoalFan',
    giftId: '5655',
    team: 'GIRL',
    quantity: 5,
  });
  snap = engine.step(0.05, t0 + 300);
  assert.equal(snap.liveGoal.currentCount, 5);
  assert.equal(snap.liveGoal.targetCount, 5);
  assert.ok(snap.activeBanner?.title.includes('ĐẠT Ý MUỐN LIVE'));

  engine.resetLiveGoal();
  snap = engine.getSnapshot();
  assert.equal(snap.liveGoal.currentCount, 0);
  assert.equal(snap.liveGoal.syncedFromLive, false);

  // Real TikTok LIVE goalUpdate override syncs exact count/target without double-counting
  engine.syncExternalLiveGoal({
    title: 'Mục tiêu LIVE thật',
    giftId: '5487',
    giftName: 'Tim Tay',
    currentCount: 12,
    targetCount: 50,
  });
  snap = engine.getSnapshot();
  assert.equal(snap.liveGoal.syncedFromLive, true);
  assert.equal(snap.liveGoal.title, 'Mục tiêu LIVE thật');
  assert.equal(snap.liveGoal.giftName, 'Tim Tay');
  assert.equal(snap.liveGoal.currentCount, 12);
  assert.equal(snap.liveGoal.targetCount, 50);

  engine.ingestRawEvent({
    eventType: 'Gift',
    senderId: 'g_live_gift',
    displayName: 'LiveViewer',
    giftId: '5655',
    team: 'BOY',
    quantity: 1,
  });
  snap = engine.step(0.05, t0 + 600);
  assert.equal(snap.liveGoal.currentCount, 12, 'External goalUpdate sync must not double-count local gift counter');
  db.close();
});

