using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace LiveArena.Live
{
    /// <summary>
    /// Decoupled WebSocket Client connecting Unity 6 to the unified Node.js LiveBridge server.
    /// Defaults to ws://localhost:3000/ws (same server also mirrors ws://localhost:8080/ws).
    /// Runs socket IO on background tasks and marshals events safely to the Unity Main Thread queue.
    /// </summary>
    public class LiveBridgeClient : MonoBehaviour
    {
        [SerializeField] private string webSocketUrl = "ws://localhost:3000/ws";
        [SerializeField] private float reconnectDelaySec = 3f;
        [SerializeField] private float heartbeatIntervalSec = 3f;

        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<string> _incomingQueue = new ConcurrentQueue<string>();
        private float _nextHeartbeatAt;

        public bool IsConnected => _ws != null && _ws.State == WebSocketState.Open;
        public event Action<string> OnRawBridgeMessage;
        public event Action<bool> OnConnectionChanged;

        private void Start()
        {
            ConnectLoop();
        }

        private async void ConnectLoop()
        {
            _cts = new CancellationTokenSource();
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    _ws = new ClientWebSocket();
                    await _ws.ConnectAsync(new Uri(webSocketUrl), _cts.Token);
                    Debug.Log($"[LiveBridgeClient] Connected to {webSocketUrl}");
                    OnConnectionChanged?.Invoke(true);
                    await ReceiveLoop(_cts.Token);
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[LiveBridgeClient] Connection issue: {ex.Message}");
                }
                finally
                {
                    OnConnectionChanged?.Invoke(false);
                }

                if (!_cts.IsCancellationRequested)
                {
                    await Task.Delay(TimeSpan.FromSeconds(reconnectDelaySec), _cts.Token);
                }
            }
        }

        private async Task ReceiveLoop(CancellationToken token)
        {
            var buffer = new byte[32768];
            var sb = new StringBuilder();

            while (_ws.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, token);
                    break;
                }
                sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                if (result.EndOfMessage)
                {
                    if (_incomingQueue.Count < 2000)
                        _incomingQueue.Enqueue(sb.ToString());
                    sb.Clear();
                }
            }
        }

        public async void SendPing()
        {
            if (!IsConnected) return;
            try
            {
                long ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                string json = $"{{\"type\":\"ping\",\"clientTs\":{ts}}}";
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
            }
            catch
            {
                // Reconnect loop handles broken socket cleanly
            }
        }

        private void Update()
        {
            if (IsConnected && Time.unscaledTime >= _nextHeartbeatAt)
            {
                _nextHeartbeatAt = Time.unscaledTime + heartbeatIntervalSec;
                SendPing();
            }

            int processed = 0;
            while (processed < 60 && _incomingQueue.TryDequeue(out string json))
            {
                OnRawBridgeMessage?.Invoke(json);
                processed++;
            }
        }

        private void OnDestroy()
        {
            _cts?.Cancel();
            _ws?.Dispose();
        }
    }
}
