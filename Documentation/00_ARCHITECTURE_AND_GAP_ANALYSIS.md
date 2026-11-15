# 00. Kiến Trúc Tổng Thể & Phân Định Môi Trường — BOY vs GIRL – LIVE ARENA

## 1. Kiến trúc hệ thống tách rời (Decoupled Architecture)

```
TikTok LIVE / Simulation Source
        │
        ▼
[ ILiveConnectorAdapter ] (SimulationConnectorAdapter / TikTokLiveConnectorAdapter)
        │
        ▼
[ EventNormalizer ] ──▶ [ EventDeduplicator ] ──▶ [ BoundedEventQueue (2000) ]
                                                            │
                                                            ▼
                                               [ MatchEngine & PushPhysics ]
                                               (30Hz Server-Authoritative Tick)
                                                    │               │
                                                    ▼               ▼
                                          [ SQLite Database ]  [ WebSocket Server (/ws) ]
                                          (9 bảng + WAL +         ├──▶ Web 3D Studio + Admin 14 trang
                                           Backup/Recovery)       └──▶ Unity 6 Windows Client (C#)
```

## 2. Phân định minh bạch theo môi trường

### A. Những phần đã chạy thực tế ngay trong AI Studio Workspace
1. **LiveBridge Server (`server.ts` & `LiveBridge/`)**:
   - WebSocket Server (`/ws`), REST API (`/api/*`).
   - Event Normalizer, Deduplicator, Bounded Event Queue, Simulation Engine (Chat, Gift, Gift Streak, Burst Stress, Duplicate Test).
   - SQLite Database (`LiveBridge/data/arena.db`) với đủ 9 bảng, index, transaction, backup & recovery JSON/DB.
2. **Authoritative Match & Push Physics Engine (`LiveBridge/engine/matchEngine.ts`)**:
   - 4 giai đoạn trận đấu (30/60/60/30s) + Hiệp phụ 15s + Auto Round + Pause/Resume/Reset/Emergency Stop.
   - Hệ thống sức mạnh (`TotalPower = Base + Chat + Gift + Skill`, Diminishing returns, Comeback boost).
   - 5 kỹ năng (`ThunderPush`, `EnergyShield`, `RageMode`, `UltimateBlast`, `Recovery`).
3. **Web 3D Arena & Broadcast HUD (`src/components/`)**:
   - Giao diện Livestream Portrait 9:16 (1080×1920) dựng bằng Three.js WebGL PBR với 3 đấu trường (`ModernStadium`, `NeonBattleArena`, `ExtremePlatformArena`), hai nhân vật 3D đa khớp cân bằng sức mạnh, và Bảng điều khiển Admin đầy đủ 14 trang.
4. **Bộ Script Unity 6 C# & Automated Tests (`UnityProject/` & `Tests/`)**:
   - Toàn bộ script C# cốt lõi cho Physics (`PushPhysicsController.cs`), Animator/IK (`CharacterStateMachine.cs`), Match, Power, Chat, Gift, Skill, WebSocket Client, Object Pool, Portrait Display & Unity Test Framework.

### B. Những phần cần thực hiện trên máy Windows của bạn (ngoài sandbox Linux)
1. **Unity 6 LTS Editor (Windows)**: Mở `UnityProject/`, gắn model 3D Humanoid Rig (từ Blender hoặc Asset Store), thiết lập Scene/URP và chạy `Tools/build-windows.ps1` để xuất file `.exe`.
2. **Blender / 3D Assets**: Tạo hoặc nhập model Boy & Girl chuẩn Humanoid PBR + Animator Controller (chi tiết trong `02_UNITY6_AND_BLENDER_ASSET_GUIDE.md`).
3. **OBS Studio**: Cài OBS trên Windows (1080×1920), bắt cửa sổ Unity `.exe` hoặc URL Web OBS Portrait.
4. **TikTok LIVE thật**: Cài `npm install tiktok-live-connector` và kết nối khi kênh TikTok đang bật livestream thực tế (không có luồng livestream thật bên trong container thử nghiệm).
