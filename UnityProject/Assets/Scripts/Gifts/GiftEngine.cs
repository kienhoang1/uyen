using System;
using System.Collections.Generic;
using UnityEngine;
using LiveArena.Core;
using LiveArena.Match;

namespace LiveArena.Gifts
{
    [Serializable]
    public class GiftRuleData
    {
        public string giftId;
        public string giftName;
        public TeamId team;
        public float powerPoints;
        public string skillId;
        public string vfxId;
        public float cooldownSec;
        public float maxImpact;
        public bool enabled = true;
    }

    public class GiftEngine : MonoBehaviour
    {
        [SerializeField] private TeamPowerManager powerManager;
        [SerializeField] private Skills.SkillManager skillManager;
        [SerializeField] private List<GiftRuleData> giftMapping = new List<GiftRuleData>();

        private readonly HashSet<string> _processedDedupKeys = new HashSet<string>();
        private readonly Dictionary<string, int> _streakTracker = new Dictionary<string, int>();
        private readonly Dictionary<string, float> _ruleCooldownUntil = new Dictionary<string, float>();

        public void ProcessGiftEvent(string dedupKey, string senderId, string displayName, string giftId, int streakCount, string groupId)
        {
            if (string.IsNullOrEmpty(dedupKey) || _processedDedupKeys.Contains(dedupKey))
                return;

            var rule = giftMapping.Find(r => r.giftId == giftId && r.enabled);
            if (rule == null) return;

            int deltaQty = 1;
            if (streakCount > 1 && !string.IsNullOrEmpty(groupId))
            {
                string streakKey = $"{senderId}:{giftId}:{groupId}";
                _streakTracker.TryGetValue(streakKey, out int prevStreak);
                if (streakCount <= prevStreak) return;
                deltaQty = streakCount - prevStreak;
                _streakTracker[streakKey] = streakCount;
            }

            float cappedPower = Mathf.Min(rule.maxImpact, rule.powerPoints * deltaQty);
            _processedDedupKeys.Add(dedupKey);
            powerManager?.AddPower(rule.team, "gift", cappedPower);

            if (!string.IsNullOrEmpty(rule.skillId) && Enum.TryParse(rule.skillId, out SkillId parsedSkill))
            {
                _ruleCooldownUntil.TryGetValue(rule.giftId, out float readyAt);
                if (Time.time >= readyAt)
                {
                    skillManager?.ActivateSkill(rule.team, parsedSkill, displayName);
                    _ruleCooldownUntil[rule.giftId] = Time.time + rule.cooldownSec;
                }
            }
        }
    }
}
