using UnityEngine;
using LiveArena.Core;

namespace LiveArena.Characters
{
    [RequireComponent(typeof(Animator))]
    public class CharacterStateMachine : MonoBehaviour
    {
        [Header("Animator & IK")]
        [SerializeField] private Animator animator;
        [SerializeField] private Transform opponentHandTarget;
        [SerializeField] private float blendSmoothSpeed = 10f;

        private static readonly int HashState = Animator.StringToHash("StateIndex");
        private static readonly int HashPushIntensity = Animator.StringToHash("PushIntensity");
        private static readonly int HashLeanAngle = Animator.StringToHash("LeanAngle");

        public CharacterState CurrentState { get; private set; } = CharacterState.Idle;
        private float _targetLeanDeg;
        private float _currentLeanDeg;
        private float _ikWeight;

        private void Reset()
        {
            animator = GetComponent<Animator>();
        }

        public void SetState(CharacterState newState, float leanAngleDeg)
        {
            CurrentState = newState;
            _targetLeanDeg = leanAngleDeg;

            if (animator != null)
            {
                animator.SetInteger(HashState, (int)newState);
                float intensity = (newState == CharacterState.Push || newState == CharacterState.Resist) ? 1f : 0f;
                animator.SetFloat(HashPushIntensity, intensity, 0.12f, Time.deltaTime);
            }
        }

        private void Update()
        {
            _currentLeanDeg = Mathf.Lerp(_currentLeanDeg, _targetLeanDeg, Time.deltaTime * blendSmoothSpeed);
            if (animator != null)
            {
                animator.SetFloat(HashLeanAngle, _currentLeanDeg);
            }

            bool inContact = CurrentState == CharacterState.Push
                          || CurrentState == CharacterState.Resist
                          || CurrentState == CharacterState.Slide;
            _ikWeight = Mathf.MoveTowards(_ikWeight, inContact ? 0.85f : 0f, Time.deltaTime * 6f);
        }

        private void OnAnimatorIK(int layerIndex)
        {
            if (animator == null || opponentHandTarget == null || _ikWeight <= 0.01f) return;

            animator.SetIKPositionWeight(AvatarIKGoal.LeftHand, _ikWeight);
            animator.SetIKPositionWeight(AvatarIKGoal.RightHand, _ikWeight);
            animator.SetIKPosition(AvatarIKGoal.LeftHand, opponentHandTarget.position + new Vector3(0f, 0.1f, -0.18f));
            animator.SetIKPosition(AvatarIKGoal.RightHand, opponentHandTarget.position + new Vector3(0f, 0.1f, 0.18f));
        }
    }
}
