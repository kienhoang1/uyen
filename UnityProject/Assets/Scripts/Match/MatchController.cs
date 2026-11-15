using UnityEngine;
using LiveArena.Core;
using LiveArena.Physics;

namespace LiveArena.Match
{
    /// <summary>
    /// Controls Unity match presentation. When connected to LiveBridge (default),
    /// LiveBridge is the single authoritative owner of phase, timers, and winner state.
    /// Offline standalone fallback is available only for isolated Unity Editor scene testing.
    /// </summary>
    public class MatchController : MonoBehaviour
    {
        [Header("Authority Mode")]
        [Tooltip("True = LiveBridge Server owns match state (Production). False = Local Editor test only.")]
        [SerializeField] private bool followServerAuthority = true;

        [Header("Offline Fallback Timers (seconds)")]
        [SerializeField] private float warmupSec = 30f;
        [SerializeField] private float clashSec = 60f;
        [SerializeField] private float frenzySec = 60f;
        [SerializeField] private float suddenDeathSec = 30f;

        [Header("References")]
        [SerializeField] private PushPhysicsController physicsController;
        [SerializeField] private TeamPowerManager powerManager;

        public MatchPhase CurrentPhase { get; private set; } = MatchPhase.Idle;
        public GameModeId CurrentGameMode { get; private set; } = GameModeId.ClassicPush;
        public float PhaseRemainingSec { get; private set; }
        public bool FollowServerAuthority => followServerAuthority;

        public void SyncFromServerSnapshot(MatchPhase serverPhase, GameModeId serverMode, float remainingSec)
        {
            bool enteringCombat = !IsCombatPhase(CurrentPhase) && IsCombatPhase(serverPhase);
            bool leavingCombat = IsCombatPhase(CurrentPhase) && !IsCombatPhase(serverPhase);

            CurrentPhase = serverPhase;
            CurrentGameMode = serverMode;
            PhaseRemainingSec = remainingSec;

            if (serverPhase == MatchPhase.Countdown)
            {
                physicsController?.ResetPositions();
                physicsController?.SetPhysicsActive(false);
            }
            else if (enteringCombat)
            {
                physicsController?.SetPhysicsActive(true);
            }
            else if (leavingCombat)
            {
                physicsController?.SetPhysicsActive(false);
            }
        }

        private void Start()
        {
            if (!followServerAuthority)
            {
                StartLocalOfflineMatch();
            }
        }

        public void StartLocalOfflineMatch()
        {
            powerManager?.ResetMatchPower();
            physicsController?.ResetPositions();
            physicsController?.SetPhysicsActive(true);
            CurrentPhase = MatchPhase.Warmup;
            PhaseRemainingSec = warmupSec;
        }

        private void Update()
        {
            if (followServerAuthority) return; // Single Source of Truth enforced!

            if (!IsCombatPhase(CurrentPhase)) return;
            PhaseRemainingSec -= Time.deltaTime;
            if (powerManager != null && physicsController != null)
            {
                physicsController.UpdatePowerInputs(
                    powerManager.GetEffectivePower(TeamId.BOY),
                    powerManager.GetEffectivePower(TeamId.GIRL),
                    powerManager.GetDefenseMultiplier(TeamId.BOY),
                    powerManager.GetDefenseMultiplier(TeamId.GIRL)
                );
            }
            if (PhaseRemainingSec <= 0f)
            {
                if (CurrentPhase == MatchPhase.Warmup) { CurrentPhase = MatchPhase.Clash; PhaseRemainingSec = clashSec; }
                else if (CurrentPhase == MatchPhase.Clash) { CurrentPhase = MatchPhase.Frenzy; PhaseRemainingSec = frenzySec; }
                else if (CurrentPhase == MatchPhase.Frenzy) { CurrentPhase = MatchPhase.SuddenDeath; PhaseRemainingSec = suddenDeathSec; }
                else CurrentPhase = MatchPhase.Victory;
            }
        }

        private static bool IsCombatPhase(MatchPhase p) =>
            p == MatchPhase.Warmup || p == MatchPhase.Clash || p == MatchPhase.Frenzy ||
            p == MatchPhase.SuddenDeath || p == MatchPhase.Overtime;
    }
}
