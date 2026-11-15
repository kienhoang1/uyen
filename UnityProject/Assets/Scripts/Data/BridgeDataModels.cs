using UnityEngine;
using LiveArena.Core;

namespace LiveArena.Data
{
    [System.Serializable]
    public class BridgeEnvelope
    {
        public string type;
        public long ts;
        public string payloadJson;
    }

    [System.Serializable]
    public class ArenaConfigModel
    {
        public ArenaTheme arenaTheme = ArenaTheme.ModernStadium;
        public int targetFps = 30;
        public int resolutionWidth = 1080;
        public int resolutionHeight = 1920;
    }
}
