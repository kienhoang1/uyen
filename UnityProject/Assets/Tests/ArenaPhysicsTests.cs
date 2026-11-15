using NUnit.Framework;
using UnityEngine;
using LiveArena.Core;
using LiveArena.Match;
using LiveArena.Gifts;

namespace LiveArena.Tests
{
    public class ArenaPhysicsTests
    {
        [Test]
        public void PowerManager_AppliesDiminishingReturns_AndCapsAtMaxPower()
        {
            var go = new GameObject("PowerManagerTest");
            var pm = go.AddComponent<TeamPowerManager>();
            pm.ResetMatchPower();

            for (int i = 0; i < 100; i++)
            {
                pm.AddPower(TeamId.BOY, "gift", 200f);
            }

            float total = pm.GetTotalPower(TeamId.BOY);
            Assert.LessOrEqual(total, 2500f);
            Assert.Greater(total, 100f);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void GiftEngine_PreventsDuplicateGiftStreakCounting()
        {
            var go = new GameObject("GiftTest");
            var pm = go.AddComponent<TeamPowerManager>();
            var ge = go.AddComponent<GiftEngine>();
            pm.ResetMatchPower();

            // Verify duplicate dedupKey never adds power twice
            ge.ProcessGiftEvent("dup-key-1", "u1", "Tester", "rose_blue", 1, "grp1");
            float afterFirst = pm.GetTotalPower(TeamId.BOY);
            ge.ProcessGiftEvent("dup-key-1", "u1", "Tester", "rose_blue", 1, "grp1");
            float afterDup = pm.GetTotalPower(TeamId.BOY);

            Assert.AreEqual(afterFirst, afterDup);
            Object.DestroyImmediate(go);
        }
    }
}
