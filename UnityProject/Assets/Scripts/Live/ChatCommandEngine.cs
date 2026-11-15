using System;
using System.Collections.Generic;
using UnityEngine;
using LiveArena.Core;
using LiveArena.Match;

namespace LiveArena.Live
{
    public class ChatCommandEngine : MonoBehaviour
    {
        [SerializeField] private MatchController matchController;
        [SerializeField] private TeamPowerManager powerManager;
        [SerializeField] private float perUserCooldownSec = 2f;
        [SerializeField] private float chatRewardPoints = 15f;

        private readonly Dictionary<string, float> _lastCommandTime = new Dictionary<string, float>();
        private readonly Dictionary<string, TeamId> _userTeams = new Dictionary<string, TeamId>();
        private readonly HashSet<string> _seenEventIds = new HashSet<string>();

        public string LastVoteOption { get; private set; } = string.Empty;

        public void ProcessChat(string eventId, string senderId, string displayName, string rawMessage)
        {
            // When connected to LiveBridge, BridgeStateDispatcher applies authoritative state;
            // local chat parsing runs only when MatchController is in offline fallback mode.
            if (matchController != null && matchController.FollowServerAuthority) return;

            if (string.IsNullOrEmpty(eventId) || _seenEventIds.Contains(eventId)) return;
            _seenEventIds.Add(eventId);

            if (string.IsNullOrWhiteSpace(rawMessage)) return;
            string upper = rawMessage.Trim().ToUpperInvariant();
            string[] tokens = upper.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (tokens.Length == 0) return;
            string firstToken = tokens[0];

            if (firstToken == "VOTE" || firstToken == "!VOTE")
            {
                if (tokens.Length > 1) LastVoteOption = tokens[1];
                return;
            }

            if (_lastCommandTime.TryGetValue(senderId, out float lastAt) && Time.time - lastAt < perUserCooldownSec)
                return;

            TeamId team;
            if (firstToken == "BOY" || firstToken == "!BOY" || firstToken == "NAM")
            {
                team = TeamId.BOY;
            }
            else if (firstToken == "GIRL" || firstToken == "!GIRL" || firstToken == "NỮ" || firstToken == "NU")
            {
                team = TeamId.GIRL;
            }
            else if (firstToken == "ATTACK" || firstToken == "SHIELD" || firstToken == "BUFF" || firstToken == "TẤN" || firstToken == "KHIÊN")
            {
                if (!_userTeams.TryGetValue(senderId, out team)) return;
            }
            else
            {
                return; // Do not treat arbitrary chat messages as commands
            }

            _userTeams[senderId] = team;
            _lastCommandTime[senderId] = Time.time;
            powerManager?.AddPower(team, "chat", chatRewardPoints);
        }
    }
}
