using UnityEngine;
using UnityEngine.UI;
using TMPro;
using LiveArena.Match;
using LiveArena.Physics;
using LiveArena.Core;

namespace LiveArena.UI
{
    public class LivestreamHUD : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private MatchController matchController;
        [SerializeField] private TeamPowerManager powerManager;
        [SerializeField] private PushPhysicsController physicsController;

        [Header("TextMeshPro UI Elements")]
        [SerializeField] private TextMeshProUGUI timerText;
        [SerializeField] private TextMeshProUGUI phaseText;
        [SerializeField] private TextMeshProUGUI boyPowerText;
        [SerializeField] private TextMeshProUGUI girlPowerText;
        [SerializeField] private TextMeshProUGUI boyMembersText;
        [SerializeField] private TextMeshProUGUI girlMembersText;
        [SerializeField] private TextMeshProUGUI mvpText;
        [SerializeField] private TextMeshProUGUI comboText;
        [SerializeField] private Slider powerBalanceSlider;
        [SerializeField] private Slider bossHpSlider;
        [SerializeField] private TextMeshProUGUI bannerTitleText;
        [SerializeField] private GameObject bannerContainer;

        private float _bannerHideAt;

        private void Update()
        {
            if (matchController != null)
            {
                int sec = Mathf.CeilToInt(Mathf.Max(0f, matchController.PhaseRemainingSec));
                if (timerText != null) timerText.text = $"{sec / 60:00}:{sec % 60:00}";
                if (phaseText != null) phaseText.text = $"{matchController.CurrentGameMode} · {matchController.CurrentPhase}";
            }

            if (powerManager != null)
            {
                float bp = powerManager.GetTotalPower(TeamId.BOY);
                float gp = powerManager.GetTotalPower(TeamId.GIRL);
                if (boyPowerText != null) boyPowerText.text = Mathf.RoundToInt(bp).ToString("N0");
                if (girlPowerText != null) girlPowerText.text = Mathf.RoundToInt(gp).ToString("N0");
                if (powerBalanceSlider != null)
                    powerBalanceSlider.value = bp / Mathf.Max(1f, bp + gp);
            }

            if (bannerContainer != null && bannerContainer.activeSelf && Time.unscaledTime >= _bannerHideAt)
            {
                bannerContainer.SetActive(false);
            }
        }

        public void UpdateRosterAndMatchInfo(int boyMembers, int girlMembers, string mvpLabel, string comboLabel, float bossHpRatio)
        {
            if (boyMembersText != null) boyMembersText.text = $"BOY ({boyMembers})";
            if (girlMembersText != null) girlMembersText.text = $"({girlMembers}) GIRL";
            if (mvpText != null) mvpText.text = $"MVP: {mvpLabel}";
            if (comboText != null)
            {
                comboText.gameObject.SetActive(!string.IsNullOrEmpty(comboLabel));
                comboText.text = comboLabel;
            }
            if (bossHpSlider != null)
            {
                bossHpSlider.gameObject.SetActive(bossHpRatio >= 0f);
                if (bossHpRatio >= 0f) bossHpSlider.value = Mathf.Clamp01(bossHpRatio);
            }
        }

        public void ShowBanner(string title, float durationSec = 2.8f)
        {
            if (bannerContainer != null && bannerTitleText != null)
            {
                bannerTitleText.text = title;
                bannerContainer.SetActive(true);
                _bannerHideAt = Time.unscaledTime + durationSec;
            }
        }
    }
}
