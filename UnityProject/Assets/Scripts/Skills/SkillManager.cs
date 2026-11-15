using System;
using System.Collections.Generic;
using UnityEngine;
using LiveArena.Core;
using LiveArena.Match;
using LiveArena.Physics;

namespace LiveArena.Skills
{
    [Serializable]
    public class SkillDefinition
    {
        public SkillId skillId;
        public float durationSec = 5f;
        public float cooldownSec = 8f;
        public float powerMultiplier = 1.4f;
        public float defensiveBoost = 1.2f;
        public float knockbackImpulse = 2.0f;
        public AudioClip sfxClip;
        public GameObject vfxPrefab;
    }

    public class SkillManager : MonoBehaviour
    {
        [SerializeField] private TeamPowerManager powerManager;
        [SerializeField] private PushPhysicsController physicsController;
        [SerializeField] private Transform boyAnchor;
        [SerializeField] private Transform girlAnchor;
        [SerializeField] private AudioSource sfxSource;
        [SerializeField] private List<SkillDefinition> definitions = new List<SkillDefinition>();

        private readonly Dictionary<string, float> _cooldowns = new Dictionary<string, float>();
        private readonly Dictionary<string, float> _activeUntil = new Dictionary<string, float>();

        public event Action<TeamId, SkillId, string> OnSkillActivated;

        /// <summary>
        /// Plays VFX and SFX cues triggered authoritatively by the LiveBridge server without double-adding local points.
        /// </summary>
        public void PlayServerSkillCue(TeamId team, SkillId skillId, string activatorName)
        {
            var def = definitions.Find(d => d.skillId == skillId);
            if (def != null)
            {
                if (sfxSource != null && def.sfxClip != null)
                {
                    sfxSource.PlayOneShot(def.sfxClip);
                }
                if (def.vfxPrefab != null)
                {
                    Transform anchor = team == TeamId.BOY ? boyAnchor : girlAnchor;
                    Vector3 spawnPos = anchor != null ? anchor.position + Vector3.up * 1.1f : Vector3.zero;
                    GameObject fx = Instantiate(def.vfxPrefab, spawnPos, Quaternion.identity);
                    Destroy(fx, Mathf.Max(2f, def.durationSec));
                }
            }
            OnSkillActivated?.Invoke(team, skillId, activatorName);
        }

        public bool ActivateSkill(TeamId team, SkillId skillId, string activatorName)
        {
            var def = definitions.Find(d => d.skillId == skillId);
            if (def == null) return false;

            string key = $"{team}:{skillId}";
            if (_cooldowns.TryGetValue(key, out float readyAt) && Time.time < readyAt)
                return false;

            _cooldowns[key] = Time.time + def.cooldownSec;
            _activeUntil[key] = Time.time + def.durationSec;

            powerManager?.AddPower(team, "skill", 120f * def.powerMultiplier);

            if (def.knockbackImpulse > 0f)
            {
                TeamId target = team == TeamId.BOY ? TeamId.GIRL : TeamId.BOY;
                physicsController?.ApplyKnockback(target, def.knockbackImpulse, def.knockbackImpulse * 6f);
            }

            PlayServerSkillCue(team, skillId, activatorName);
            return true;
        }

        private void Update()
        {
            UpdateTeamModifiers(TeamId.BOY);
            UpdateTeamModifiers(TeamId.GIRL);
        }

        private void UpdateTeamModifiers(TeamId team)
        {
            float pMult = 1f;
            float dMult = 1f;
            foreach (var def in definitions)
            {
                string key = $"{team}:{def.skillId}";
                if (_activeUntil.TryGetValue(key, out float exp) && Time.time < exp)
                {
                    pMult *= def.powerMultiplier;
                    dMult *= def.defensiveBoost;
                }
            }
            powerManager?.SetSkillModifiers(team, pMult, dMult);
        }
    }
}
