namespace LiveArena.Core
{
    public enum TeamId
    {
        BOY = 0,
        GIRL = 1
    }

    public enum CharacterState
    {
        Idle,
        Approach,
        Attack,
        Push,
        Resist,
        Block,
        Dodge,
        Stagger,
        Slide,
        Knockback,
        Fall,
        Recover,
        Victory,
        Defeat
    }

    public enum GameModeId
    {
        ClassicPush,
        SurvivalArena,
        TeamTugOfWar,
        ViewerChampion,
        BossBattle,
        ChaosArena,
        KingOfArena,
        SpecialEvent
    }

    public enum MatchPhase
    {
        Idle,
        Countdown,
        Warmup,
        Clash,
        Frenzy,
        SuddenDeath,
        Overtime,
        Victory,
        Result,
        Cooldown,
        Paused,
        EmergencyStopped
    }

    public enum SkillId
    {
        ThunderPush,
        EnergyShield,
        RageMode,
        UltimateBlast,
        Recovery,
        CounterStrike,
        SpeedDash,
        GroundSlam,
        DoublePush,
        TeamAssist
    }

    public enum ComboId
    {
        ShieldCounterCombo,
        ComboAttack,
        ComboDefense,
        PerfectBlock,
        RescueCombo,
        TeamCombo,
        ComebackBonus
    }

    public enum ArenaTheme
    {
        ModernStadium,
        NeonBattleArena,
        ExtremePlatformArena
    }

    public enum ArenaHazardType
    {
        None,
        ShrinkingZone,
        SlipperyFloor,
        WindPush,
        FloorShake,
        HazardZone,
        LowGravity,
        TiltedFloor,
        EnergyVortex,
        ReversePush,
        PowerSwap
    }
}
