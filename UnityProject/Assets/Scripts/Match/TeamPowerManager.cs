using UnityEngine;
using LiveArena.Core;

namespace LiveArena.Match
{
    public class TeamPowerManager : MonoBehaviour
    {
        [Header("Balance Tuning")]
        [SerializeField] private float basePower = 100f;
        [SerializeField] private float maxPower = 2800f;
        [SerializeField] private float diminishingFactor = 0.0011f;
        [SerializeField] private float baseDefensiveMultiplier = 1.25f;
        [SerializeField] private float comebackBoostFactor = 0.35f;

        private float _boyChat, _boyGift, _boySkill;
        private float _girlChat, _girlGift, _girlSkill;
        private float _boySkillMult = 1f, _girlSkillMult = 1f;
        private float _boyDefMult = 1f, _girlDefMult = 1f;
        private float _authoritativeBoyPower = -1f;
        private float _authoritativeGirlPower = -1f;

        public void SyncAuthoritativePower(float boyTotal, float girlTotal)
        {
            _authoritativeBoyPower = boyTotal;
            _authoritativeGirlPower = girlTotal;
        }

        public void ResetMatchPower()
        {
            _boyChat = _boyGift = _boySkill = 0f;
            _girlChat = _girlGift = _girlSkill = 0f;
            _boySkillMult = _girlSkillMult = 1f;
            _boyDefMult = _girlDefMult = 1f;
            _authoritativeBoyPower = -1f;
            _authoritativeGirlPower = -1f;
        }

        public float GetTotalPower(TeamId team)
        {
            if (team == TeamId.BOY && _authoritativeBoyPower >= 0f) return _authoritativeBoyPower;
            if (team == TeamId.GIRL && _authoritativeGirlPower >= 0f) return _authoritativeGirlPower;
            return team == TeamId.BOY
                ? basePower + _boyChat + _boyGift + _boySkill
                : basePower + _girlChat + _girlGift + _girlSkill;
        }

        public float GetEffectivePower(TeamId team) =>
            GetTotalPower(team) * (team == TeamId.BOY ? _boySkillMult : _girlSkillMult);

        public float GetDefenseMultiplier(TeamId team) =>
            baseDefensiveMultiplier * (team == TeamId.BOY ? _boyDefMult : _girlDefMult);

        public void SetSkillModifiers(TeamId team, float powerMult, float defMult)
        {
            if (team == TeamId.BOY)
            {
                _boySkillMult = Mathf.Max(1f, powerMult);
                _boyDefMult = Mathf.Max(1f, defMult);
            }
            else
            {
                _girlSkillMult = Mathf.Max(1f, powerMult);
                _girlDefMult = Mathf.Max(1f, defMult);
            }
        }

        public void AddPower(TeamId team, string sourceBucket, float rawAmount)
        {
            float current = GetTotalPower(team);
            float opponent = GetTotalPower(team == TeamId.BOY ? TeamId.GIRL : TeamId.BOY);
            float comeback = opponent > current * 1.25f ? 1f + comebackBoostFactor : 1f;
            float excess = Mathf.Max(0f, current - basePower);
            float diminishing = 1f / (1f + diminishingFactor * excess);
            float allowedRoom = Mathf.Max(0f, maxPower - current);
            float finalGain = Mathf.Min(allowedRoom, rawAmount * diminishing * comeback);

            if (team == TeamId.BOY)
            {
                if (sourceBucket == "chat") _boyChat += finalGain;
                else if (sourceBucket == "gift") _boyGift += finalGain;
                else _boySkill += finalGain;
            }
            else
            {
                if (sourceBucket == "chat") _girlChat += finalGain;
                else if (sourceBucket == "gift") _girlGift += finalGain;
                else _girlSkill += finalGain;
            }
        }
    }
}
