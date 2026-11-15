using System;
using UnityEngine;
using LiveArena.Core;
using LiveArena.Characters;
using LiveArena.Match;
using LiveArena.Physics;
using LiveArena.Skills;
using LiveArena.UI;

namespace LiveArena.Live
{
    [Serializable]
    public class BridgeEnvelopeJson
    {
        public string type;
        public long ts;
    }

    [Serializable]
    public class FighterSnapshotJson
    {
        public string team;
        public float positionX;
        public float velocityX;
        public string state;
        public float totalPower;
        public float balance;
        public float stamina;
        public bool shieldActive;
        public bool rageActive;
        public float leanAngleDeg;
        public int memberCount;
    }

    [Serializable]
    public class BannerSnapshotJson
    {
        public string title;
        public string subtitle;
        public string team;
    }

    [Serializable]
    public class ComboSnapshotJson
    {
        public string comboId;
        public string label;
        public string team;
    }

    [Serializable]
    public class MvpSnapshotJson
    {
        public string senderId;
        public string displayName;
        public string team;
        public int points;
    }

    [Serializable]
    public class BossSnapshotJson
    {
        public bool active;
        public string name;
        public int hp;
        public int maxHp;
        public int phase;
        public bool attackWarning;
        public bool defeated;
    }

    [Serializable]
    public class MatchSnapshotJson
    {
        public string matchId;
        public string gameMode;
        public string phase;
        public float phaseRemainingSec;
        public float safeZoneHalfWidth;
        public string activeHazard;
        public float hazardFloorTiltDeg;
        public string winnerTeam;
        public FighterSnapshotJson boy;
        public FighterSnapshotJson girl;
        public BannerSnapshotJson activeBanner;
        public ComboSnapshotJson activeCombo;
        public MvpSnapshotJson mvp;
        public BossSnapshotJson boss;
    }

    [Serializable]
    public class MatchSnapshotWrapper
    {
        public string type;
        public MatchSnapshotJson payload;
    }

    [Serializable]
    public class InitPayloadJson
    {
        public MatchSnapshotJson snapshot;
    }

    [Serializable]
    public class InitWrapper
    {
        public string type;
        public InitPayloadJson payload;
    }

    [Serializable]
    public class LiveEventPayloadDataJson
    {
        public string message;
        public string command;
        public string giftId;
        public string giftName;
        public string giftTier;
        public string team;
        public int quantity;
        public int streakCount;
        public bool repeatEnd;
    }

    [Serializable]
    public class LiveEventJson
    {
        public string eventId;
        public string eventType;
        public string senderId;
        public string displayName;
        public string status;
        public LiveEventPayloadDataJson payload;
    }

    [Serializable]
    public class LiveEventWrapper
    {
        public string type;
        public LiveEventJson payload;
    }

    /// <summary>
    /// Single Source of Truth Dispatcher: routes LiveBridge WebSocket snapshots and live_events
    /// into Unity MatchController, PushPhysicsController, CharacterStateMachines, SkillManager, and LivestreamHUD.
    /// </summary>
    public class BridgeStateDispatcher : MonoBehaviour
    {
        [SerializeField] private LiveBridgeClient bridgeClient;
        [SerializeField] private MatchController matchController;
        [SerializeField] private PushPhysicsController physicsController;
        [SerializeField] private TeamPowerManager powerManager;
        [SerializeField] private CharacterStateMachine boyStateMachine;
        [SerializeField] private CharacterStateMachine girlStateMachine;
        [SerializeField] private SkillManager skillManager;
        [SerializeField] private LivestreamHUD hud;

        private string _lastBannerTitle;
        private string _lastComboId;

        private void OnEnable()
        {
            if (bridgeClient != null)
                bridgeClient.OnRawBridgeMessage += HandleBridgeMessage;
        }

        private void OnDisable()
        {
            if (bridgeClient != null)
                bridgeClient.OnRawBridgeMessage -= HandleBridgeMessage;
        }

        private void HandleBridgeMessage(string rawJson)
        {
            if (string.IsNullOrEmpty(rawJson)) return;

            var env = JsonUtility.FromJson<BridgeEnvelopeJson>(rawJson);
            if (env == null) return;

            if (env.type == "match_snapshot")
            {
                var wrapper = JsonUtility.FromJson<MatchSnapshotWrapper>(rawJson);
                if (wrapper?.payload != null) ApplyAuthoritativeSnapshot(wrapper.payload);
            }
            else if (env.type == "init")
            {
                var wrapper = JsonUtility.FromJson<InitWrapper>(rawJson);
                if (wrapper?.payload?.snapshot != null) ApplyAuthoritativeSnapshot(wrapper.payload.snapshot);
            }
            else if (env.type == "live_event")
            {
                var wrapper = JsonUtility.FromJson<LiveEventWrapper>(rawJson);
                if (wrapper?.payload != null) HandleLiveEventReaction(wrapper.payload);
            }
        }

        private void ApplyAuthoritativeSnapshot(MatchSnapshotJson snap)
        {
            if (Enum.TryParse(snap.phase, out MatchPhase phase) &&
                Enum.TryParse(snap.gameMode, out GameModeId mode))
            {
                matchController?.SyncFromServerSnapshot(phase, mode, snap.phaseRemainingSec);
            }

            if (snap.boy != null && snap.girl != null)
            {
                powerManager?.SyncAuthoritativePower(snap.boy.totalPower, snap.girl.totalPower);
                physicsController?.SyncFromAuthoritativeTarget(
                    snap.boy.positionX,
                    snap.girl.positionX,
                    snap.safeZoneHalfWidth,
                    snap.hazardFloorTiltDeg
                );

                if (Enum.TryParse(snap.boy.state, out CharacterState boyState))
                {
                    boyStateMachine?.SetState(boyState, snap.boy.leanAngleDeg);
                }
                if (Enum.TryParse(snap.girl.state, out CharacterState girlState))
                {
                    girlStateMachine?.SetState(girlState, snap.girl.leanAngleDeg);
                }
            }

            if (hud != null)
            {
                hud.UpdateRosterAndMatchInfo(
                    snap.boy?.memberCount ?? 0,
                    snap.girl?.memberCount ?? 0,
                    snap.mvp != null ? $"{snap.mvp.displayName} ({snap.mvp.points})" : "-",
                    snap.activeCombo != null ? snap.activeCombo.label : string.Empty,
                    snap.boss != null && snap.boss.active ? (float)snap.boss.hp / Mathf.Max(1, snap.boss.maxHp) : -1f
                );

                if (snap.activeBanner != null && !string.IsNullOrEmpty(snap.activeBanner.title) && snap.activeBanner.title != _lastBannerTitle)
                {
                    _lastBannerTitle = snap.activeBanner.title;
                    hud.ShowBanner($"{snap.activeBanner.title}\n{snap.activeBanner.subtitle}");
                }
            }

            if (snap.activeCombo != null && snap.activeCombo.comboId != _lastComboId)
            {
                _lastComboId = snap.activeCombo.comboId;
                if (Enum.TryParse(snap.activeCombo.team, out TeamId comboTeam))
                {
                    skillManager?.PlayServerSkillCue(comboTeam, SkillId.UltimateBlast, snap.activeCombo.label);
                }
            }
        }

        private void HandleLiveEventReaction(LiveEventJson ev)
        {
            if (ev.status != "PROCESSED" && ev.status != "STREAK_PROGRESS") return;

            if (ev.eventType == "Gift")
            {
                TeamId team = TeamId.BOY;
                bool hasTeam = ev.payload != null && Enum.TryParse(ev.payload.team, out team);
                string giftLabel = ev.payload?.giftName ?? "Gift";
                int qty = ev.payload?.streakCount ?? 1;

                if (ev.status == "STREAK_PROGRESS")
                {
                    hud?.ShowBanner($"{ev.displayName} đang combo x{qty} {giftLabel}...");
                    return;
                }

                if (hasTeam)
                {
                    var sm = team == TeamId.BOY ? boyStateMachine : girlStateMachine;
                    sm?.SetState(CharacterState.Attack, team == TeamId.BOY ? 24f : -24f);
                    skillManager?.PlayServerSkillCue(team, SkillId.ThunderPush, ev.displayName);
                }
                else
                {
                    hud?.ShowBanner($"{ev.displayName} tặng {giftLabel}! Comment BOY/GIRL để chọn đội");
                }
            }
            else if (ev.eventType == "Chat" && ev.payload != null)
            {
                if (ev.payload.command == "ATTACK")
                {
                    boyStateMachine?.SetState(CharacterState.Attack, 22f);
                }
                else if (ev.payload.command == "SHIELD")
                {
                    skillManager?.PlayServerSkillCue(TeamId.BOY, SkillId.EnergyShield, ev.displayName);
                }
            }
        }
    }
}
