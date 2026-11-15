using UnityEngine;
using UnityEngine.Profiling;
using System.Collections.Generic;

namespace LiveArena.Utilities
{
    /// <summary>
    /// Enforces 1080x1920 Portrait Windows standalone window, 30/60 FPS cap,
    /// Object Pooling, and automatic VFX downscaling when FPS drops.
    /// </summary>
    public class PortraitDisplayAndPerfManager : MonoBehaviour
    {
        [Header("Display Settings")]
        [SerializeField] private int targetWidth = 1080;
        [SerializeField] private int targetHeight = 1920;
        [SerializeField] private int targetFrameRate = 30;
        [SerializeField] private bool borderlessFullscreen = false;

        [Header("Performance Monitoring")]
        [SerializeField] private float lowFpsThreshold = 25f;
        [SerializeField] private ParticleSystem[] arenaVfxSystems;

        public float CurrentFps { get; private set; }
        public long AllocatedMemoryMb { get; private set; }
        public bool LowFpsVfxReductionActive { get; private set; }

        private int _frames;
        private float _accum;

        private void Awake()
        {
            ApplyDisplaySettings(targetWidth, targetHeight, targetFrameRate, borderlessFullscreen);
        }

        public void ApplyDisplaySettings(int width, int height, int fps, bool fullscreen)
        {
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = Mathf.Clamp(fps, 30, 60);
            FullScreenMode mode = fullscreen ? FullScreenMode.FullScreenWindow : FullScreenMode.Windowed;
            Screen.SetResolution(width, height, mode);
        }

        private void Update()
        {
            _frames++;
            _accum += Time.unscaledDeltaTime;
            if (_accum >= 1.0f)
            {
                CurrentFps = _frames / _accum;
                AllocatedMemoryMb = Profiler.GetTotalAllocatedMemoryLong() / (1024 * 1024);
                _frames = 0;
                _accum = 0f;

                bool shouldReduce = CurrentFps < lowFpsThreshold;
                if (shouldReduce != LowFpsVfxReductionActive)
                {
                    LowFpsVfxReductionActive = shouldReduce;
                    SetVfxEmissionScale(shouldReduce ? 0.45f : 1.0f);
                }
            }
        }

        private void SetVfxEmissionScale(float scale)
        {
            if (arenaVfxSystems == null) return;
            foreach (var ps in arenaVfxSystems)
            {
                if (ps == null) continue;
                var emission = ps.emission;
                emission.rateOverTimeMultiplier = scale;
            }
        }
    }

    public class ObjectPooler : MonoBehaviour
    {
        [SerializeField] private GameObject prefab;
        [SerializeField] private int initialSize = 20;
        private readonly Queue<GameObject> _pool = new Queue<GameObject>();

        private void Awake()
        {
            for (int i = 0; i < initialSize; i++)
            {
                var obj = Instantiate(prefab, transform);
                obj.SetActive(false);
                _pool.Enqueue(obj);
            }
        }

        public GameObject Spawn(Vector3 pos, Quaternion rot)
        {
            GameObject obj = _pool.Count > 0 ? _pool.Dequeue() : Instantiate(prefab, transform);
            obj.transform.SetPositionAndRotation(pos, rot);
            obj.SetActive(true);
            return obj;
        }

        public void Despawn(GameObject obj)
        {
            obj.SetActive(false);
            _pool.Enqueue(obj);
        }
    }
}
