using UnityEngine;
using LiveArena.Core;
using LiveArena.Characters;
using LiveArena.Match;

namespace LiveArena.Physics
{
    /// <summary>
    /// Centralized Physics Controller for BOY vs GIRL push combat.
    /// Drives Rigidbody forces/velocity smoothly toward authoritative server targets when connected to LiveBridge,
    /// or resolves local Rigidbody physics in offline Editor test mode. Never teleports via Transform.position.
    /// </summary>
    public class PushPhysicsController : MonoBehaviour
    {
        [Header("Authority Reference")]
        [SerializeField] private MatchController matchController;

        [Header("Character Rigidbodies")]
        [SerializeField] private Rigidbody boyRb;
        [SerializeField] private Rigidbody girlRb;
        [SerializeField] private CharacterStateMachine boyStateMachine;
        [SerializeField] private CharacterStateMachine girlStateMachine;

        [Header("Arena Bounds & Safety")]
        [SerializeField] private float arenaBoundaryHalfWidth = 5.5f;
        [SerializeField] private float minCharacterSeparation = 1.15f;
        [SerializeField] private float maxHorizontalSpeed = 4.2f;
        [SerializeField] private float groundY = 0f;
        [SerializeField] private Transform arenaStageTransform;

        [Header("Force & Balance Tuning")]
        [SerializeField] private float forceScaleFactor = 0.045f;
        [SerializeField] private float groundFriction = 6.5f;
        [SerializeField] private float balanceRecoveryPerSec = 8.0f;
        [SerializeField] private float authoritativeServoGain = 18.0f;

        public float BoyBalance { get; private set; } = 100f;
        public float GirlBalance { get; private set; } = 100f;
        public float BoyStamina { get; private set; } = 100f;
        public float GirlStamina { get; private set; } = 100f;

        private float _boyKnockbackImpulse;
        private float _girlKnockbackImpulse;
        private float _boyForceInput;
        private float _girlForceInput;
        private float _boyDefenseMult = 1.25f;
        private float _girlDefenseMult = 1.25f;

        private float _serverBoyTargetX = -0.75f;
        private float _serverGirlTargetX = 0.75f;
        private float _serverFloorTiltDeg = 0f;
        private bool _hasServerTarget;
        private bool _physicsActive;

        public event System.Action<TeamId> OnBoundaryRingOut;

        public void SyncFromAuthoritativeTarget(float boyX, float girlX, float safeZoneHalfWidth, float floorTiltDeg)
        {
            _serverBoyTargetX = boyX;
            _serverGirlTargetX = girlX;
            _serverFloorTiltDeg = floorTiltDeg;
            _hasServerTarget = true;
            arenaBoundaryHalfWidth = Mathf.Max(2.5f, safeZoneHalfWidth);
        }

        private void Awake()
        {
            ConfigureRigidbody(boyRb);
            ConfigureRigidbody(girlRb);
        }

        private static void ConfigureRigidbody(Rigidbody rb)
        {
            if (rb == null) return;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            rb.constraints = RigidbodyConstraints.FreezeRotationX
                           | RigidbodyConstraints.FreezeRotationZ
                           | RigidbodyConstraints.FreezePositionZ;
        }

        public void SetPhysicsActive(bool active)
        {
            _physicsActive = active;
            if (!active)
            {
                StopAllMotion();
            }
        }

        public void ResetPositions()
        {
            _boyKnockbackImpulse = 0f;
            _girlKnockbackImpulse = 0f;
            _hasServerTarget = false;
            BoyBalance = 100f;
            GirlBalance = 100f;
            BoyStamina = 100f;
            GirlStamina = 100f;

            if (boyRb != null)
            {
                boyRb.linearVelocity = Vector3.zero;
                boyRb.angularVelocity = Vector3.zero;
                boyRb.position = new Vector3(-0.75f, groundY, 0f);
            }
            if (girlRb != null)
            {
                girlRb.linearVelocity = Vector3.zero;
                girlRb.angularVelocity = Vector3.zero;
                girlRb.position = new Vector3(0.75f, groundY, 0f);
            }

            boyStateMachine?.SetState(CharacterState.Idle, 0f);
            girlStateMachine?.SetState(CharacterState.Idle, 0f);
        }

        public void UpdatePowerInputs(float boyEffectivePower, float girlEffectivePower, float boyDefense, float girlDefense)
        {
            _boyForceInput = boyEffectivePower;
            _girlForceInput = girlEffectivePower;
            _boyDefenseMult = Mathf.Max(0.5f, boyDefense);
            _girlDefenseMult = Mathf.Max(0.5f, girlDefense);
        }

        public void ApplyKnockback(TeamId targetTeam, float impulseStrength, float balanceDamage)
        {
            if (!_physicsActive) return;
            if (targetTeam == TeamId.BOY)
            {
                _boyKnockbackImpulse -= Mathf.Abs(impulseStrength);
                BoyBalance = Mathf.Max(5f, BoyBalance - balanceDamage);
            }
            else
            {
                _girlKnockbackImpulse += Mathf.Abs(impulseStrength);
                GirlBalance = Mathf.Max(5f, GirlBalance - balanceDamage);
            }
        }

        private void FixedUpdate()
        {
            if (arenaStageTransform != null)
            {
                Quaternion targetRot = Quaternion.Euler(0f, 0f, -_serverFloorTiltDeg);
                arenaStageTransform.localRotation = Quaternion.Slerp(arenaStageTransform.localRotation, targetRot, Time.fixedDeltaTime * 6f);
            }

            if (boyRb == null || girlRb == null) return;

            bool serverAuthoritative = matchController != null && matchController.FollowServerAuthority && _hasServerTarget;
            if (serverAuthoritative)
            {
                StepAuthoritativePhysicsServo(Time.fixedDeltaTime);
                return;
            }

            if (!_physicsActive) return;

            float dt = Time.fixedDeltaTime;
            float distance = girlRb.position.x - boyRb.position.x;

            EnforceSafetyBounds();

            if (distance > minCharacterSeparation + 0.12f)
            {
                boyRb.AddForce(Vector3.right * 18f, ForceMode.Acceleration);
                girlRb.AddForce(Vector3.left * 18f, ForceMode.Acceleration);
                boyStateMachine?.SetState(CharacterState.Approach, 12f);
                girlStateMachine?.SetState(CharacterState.Approach, -12f);
                ClampVelocity(boyRb);
                ClampVelocity(girlRb);
                return;
            }

            float netForce;
            if (_boyForceInput >= _girlForceInput)
            {
                netForce = (_boyForceInput - _girlForceInput) / _girlDefenseMult * forceScaleFactor;
            }
            else
            {
                netForce = -(_girlForceInput - _boyForceInput) / _boyDefenseMult * forceScaleFactor;
            }

            float totalAccel = netForce + _boyKnockbackImpulse + _girlKnockbackImpulse;
            _boyKnockbackImpulse = Mathf.MoveTowards(_boyKnockbackImpulse, 0f, groundFriction * dt);
            _girlKnockbackImpulse = Mathf.MoveTowards(_girlKnockbackImpulse, 0f, groundFriction * dt);

            Vector3 sharedForce = new Vector3(totalAccel, 0f, 0f);
            boyRb.AddForce(sharedForce, ForceMode.Acceleration);
            girlRb.AddForce(sharedForce, ForceMode.Acceleration);

            boyRb.linearVelocity = new Vector3(
                Mathf.Lerp(boyRb.linearVelocity.x, 0f, groundFriction * 0.25f * dt),
                boyRb.linearVelocity.y,
                0f
            );
            girlRb.linearVelocity = new Vector3(
                Mathf.Lerp(girlRb.linearVelocity.x, 0f, groundFriction * 0.25f * dt),
                girlRb.linearVelocity.y,
                0f
            );

            ClampVelocity(boyRb);
            ClampVelocity(girlRb);

            if (girlRb.position.x - boyRb.position.x < minCharacterSeparation)
            {
                float mid = (boyRb.position.x + girlRb.position.x) * 0.5f;
                boyRb.MovePosition(new Vector3(mid - minCharacterSeparation * 0.5f, boyRb.position.y, 0f));
                girlRb.MovePosition(new Vector3(mid + minCharacterSeparation * 0.5f, girlRb.position.y, 0f));
            }

            float velX = (boyRb.linearVelocity.x + girlRb.linearVelocity.x) * 0.5f;
            UpdateCombatStates(velX, dt);

            if (boyRb.position.x <= -arenaBoundaryHalfWidth)
            {
                _physicsActive = false;
                boyStateMachine?.SetState(CharacterState.Fall, -35f);
                girlStateMachine?.SetState(CharacterState.Victory, 0f);
                OnBoundaryRingOut?.Invoke(TeamId.GIRL);
            }
            else if (girlRb.position.x >= arenaBoundaryHalfWidth)
            {
                _physicsActive = false;
                girlStateMachine?.SetState(CharacterState.Fall, 35f);
                boyStateMachine?.SetState(CharacterState.Victory, 0f);
                OnBoundaryRingOut?.Invoke(TeamId.BOY);
            }
        }

        private void StepAuthoritativePhysicsServo(float dt)
        {
            EnforceSafetyBounds();

            float boyErr = _serverBoyTargetX - boyRb.position.x;
            float girlErr = _serverGirlTargetX - girlRb.position.x;

            // Physical PD velocity tracking using Rigidbody forces so inertia, colliders, and interpolation stay smooth
            float boyDesiredVel = Mathf.Clamp(boyErr * 8f, -maxHorizontalSpeed, maxHorizontalSpeed);
            float girlDesiredVel = Mathf.Clamp(girlErr * 8f, -maxHorizontalSpeed, maxHorizontalSpeed);

            float boyAccel = (boyDesiredVel - boyRb.linearVelocity.x) * authoritativeServoGain;
            float girlAccel = (girlDesiredVel - girlRb.linearVelocity.x) * authoritativeServoGain;

            boyRb.AddForce(new Vector3(boyAccel, 0f, 0f), ForceMode.Acceleration);
            girlRb.AddForce(new Vector3(girlAccel, 0f, 0f), ForceMode.Acceleration);

            ClampVelocity(boyRb);
            ClampVelocity(girlRb);

            if (girlRb.position.x - boyRb.position.x < minCharacterSeparation)
            {
                float mid = (boyRb.position.x + girlRb.position.x) * 0.5f;
                boyRb.MovePosition(new Vector3(mid - minCharacterSeparation * 0.5f, boyRb.position.y, 0f));
                girlRb.MovePosition(new Vector3(mid + minCharacterSeparation * 0.5f, girlRb.position.y, 0f));
            }
        }

        private void UpdateCombatStates(float velX, float dt)
        {
            if (velX > 0.15f)
            {
                BoyBalance = Mathf.Min(100f, BoyBalance + balanceRecoveryPerSec * dt);
                GirlBalance = Mathf.Max(5f, GirlBalance - Mathf.Abs(velX) * 14f * dt);
                boyStateMachine?.SetState(CharacterState.Push, 20f);
                girlStateMachine?.SetState(
                    GirlBalance < 28f ? CharacterState.Stagger : (velX > 1.3f ? CharacterState.Slide : CharacterState.Resist),
                    -16f
                );
            }
            else if (velX < -0.15f)
            {
                GirlBalance = Mathf.Min(100f, GirlBalance + balanceRecoveryPerSec * dt);
                BoyBalance = Mathf.Max(5f, BoyBalance - Mathf.Abs(velX) * 14f * dt);
                girlStateMachine?.SetState(CharacterState.Push, -20f);
                boyStateMachine?.SetState(
                    BoyBalance < 28f ? CharacterState.Stagger : (velX < -1.3f ? CharacterState.Slide : CharacterState.Resist),
                    16f
                );
            }
            else
            {
                BoyBalance = Mathf.Min(100f, BoyBalance + balanceRecoveryPerSec * dt);
                GirlBalance = Mathf.Min(100f, GirlBalance + balanceRecoveryPerSec * dt);
                boyStateMachine?.SetState(BoyBalance < 45f ? CharacterState.Recover : CharacterState.Push, 12f);
                girlStateMachine?.SetState(GirlBalance < 45f ? CharacterState.Recover : CharacterState.Push, -12f);
            }
        }

        private void ClampVelocity(Rigidbody rb)
        {
            Vector3 v = rb.linearVelocity;
            v.x = Mathf.Clamp(v.x, -maxHorizontalSpeed, maxHorizontalSpeed);
            v.z = 0f;
            if (rb.position.y <= groundY + 0.01f && v.y < 0f) v.y = 0f;
            rb.linearVelocity = v;
        }

        private void EnforceSafetyBounds()
        {
            float hardLimit = arenaBoundaryHalfWidth + 0.65f;
            if (boyRb.position.y < groundY - 0.1f)
                boyRb.MovePosition(new Vector3(Mathf.Clamp(boyRb.position.x, -hardLimit, hardLimit), groundY, 0f));
            if (girlRb.position.y < groundY - 0.1f)
                girlRb.MovePosition(new Vector3(Mathf.Clamp(girlRb.position.x, -hardLimit, hardLimit), groundY, 0f));
        }

        private void StopAllMotion()
        {
            if (boyRb != null) boyRb.linearVelocity = Vector3.zero;
            if (girlRb != null) girlRb.linearVelocity = Vector3.zero;
        }
    }
}
