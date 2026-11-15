# BÁO CÁO GIAI ĐOẠN 1: KIỂM TRA MÃ NGUỒN HIỆN TẠI & KẾ HOẠCH NÂNG CẤP

## 1. Kiểm kê các Module hiện có (Audit Inventory)

### A. Các module đang hoạt động tốt (GIỮ NGUYÊN & MỞ RỘNG)
1. **`LiveBridge/db/database.ts`**: SQLite `better-sqlite3` với WAL mode, index, transaction, backup `.db`/`.json`, recovery. Đang hoạt động ổn định.
2. **`LiveBridge/bridge/eventPipeline.ts`**: `EventNormalizer`, `EventDeduplicator`, `BoundedEventQueue`. Hoạt động tốt; cần mở rộng lệnh `VOTE` và chuẩn hóa Like/Follow/Share.
3. **`LiveBridge/bridge/tiktokAdapter.ts`**: `SimulationConnectorAdapter` và `TikTokLiveConnectorAdapter` tách rời qua `ILiveConnectorAdapter`. Không giả mạo `CONNECTED_LIVE`, không lưu mật khẩu.
4. **`server.ts`**: Express + `ws` WebSocket `/ws` + Vite middleware cổng 3000.
5. **`src/components/Arena3DCanvas.tsx`**: Three.js WebGL PBR + 3 bản đồ + nhân vật đa khớp + `afterDraw` cho software WebGL.

### B. Các lỗi kết nối & lỗ hổng kiến trúc phát hiện khi Audit
1. **Lỗi xung đột nguồn chân lý (Unity vs LiveBridge)**:
   - `UnityProject/Assets/Scripts/Match/MatchController.cs` đang tự chạy bộ đếm trận đấu riêng trong `Update()`, trong khi `LiveBridge/engine/matchEngine.ts` cũng chạy một trận đấu độc lập.
   - `LiveBridgeClient.cs` chỉ nhận JSON string (`OnRawBridgeMessage`) nhưng **chưa có `BridgeStateDispatcher.cs`** để phân giải snapshot từ Server đồng bộ vào `PushPhysicsController`, `MatchController`, `SkillManager` và `LivestreamHUD`.
   - `UnityProject/` thiếu `Packages/manifest.json` và `ProjectSettings/ProjectVersion.txt` để Unity 6 Hub mở trực tiếp không báo lỗi.
2. **Thiếu tính năng gameplay nâng cấp so với Master Prompt**:
   - Mới chỉ có 1 chế độ (`ClassicPush`); thiếu 7 chế độ còn lại (`SurvivalArena`, `TeamTugOfWar`, `ViewerChampion`, `BossBattle`, `ChaosArena`, `KingOfArena`, `SpecialEvent`).
   - Mới chỉ có 5 kỹ năng; thiếu 5 kỹ năng chiến đấu mới (`CounterStrike`, `SpeedDash`, `GroundSlam`, `DoublePush`, `TeamAssist`) và **Hệ thống Combo** (7 loại combo).
   - `CharacterState` mới có 11 trạng thái; thiếu `Attack`, `Block`, `Dodge` (đủ 14 trạng thái).
   - Chưa theo dõi `memberCount` từng đội, cooldown đổi đội, giới hạn Like/Follow/Share, và 9 danh hiệu người xem.
   - `AdminDashboard.tsx` mới có 14 trang; cần mở rộng đủ **20 chức năng quản trị** (bao gồm Game Mode, Arena Configuration, Viewer Management, Combo Triggers, Stream View sạch sẽ).
   - `LiveBridge/standaloneBridge.ts` chưa đồng bộ đầy đủ REST/Admin API như `server.ts`.

---

## 2. Kế hoạch sửa & nâng cấp theo từng file (Single Unified Source of Truth)

| Tệp | Hành động | Mục đích |
|---|---|---|
| `src/shared/types.ts` | Nâng cấp | Định nghĩa thống nhất 8 chế độ, 10 kỹ năng, 7 combo, 14 trạng thái, 9 danh hiệu, Boss, Hazard, Avatar |
| `LiveBridge/db/database.ts` | Nâng cấp | Bổ sung cột `attackPoints`, `defensePoints`, `longestStreak`, `titlesJson`, `gameMode` qua migration an toàn |
| `LiveBridge/bridge/eventPipeline.ts` | Nâng cấp | Hỗ trợ lệnh `VOTE`, chuẩn hóa sự kiện Like/Follow/Share/Join |
| `LiveBridge/engine/matchEngine.ts` | Nâng cấp | Nguồn chân lý duy nhất cho 8 Game Modes, 10 Skills, 7 Combos, Team Members, Boss, Chaos/Survival Hazards, 9 Titles |
| `LiveBridge/bridge/tiktokAdapter.ts` | Nâng cấp | Bổ sung kịch bản mô phỏng Boss, Chaos, Survival, TugOfWar, Vote, Like/Follow/Share |
| `server.ts` | Nâng cấp | Thêm endpoints `/api/mode`, `/api/hazard`, `/api/combo`, `/api/viewers`, `/api/vote` |
| `src/components/Arena3DCanvas.tsx` | Nâng cấp | Dựng 3D Boss, dây kéo co Tug-of-War, vòng thu hẹp Survival, sàn nghiêng Chaos, avatar Viewer Champion, vương miện King |
| `src/components/LivestreamPortraitView.tsx` | Nâng cấp | HUD 9:16 hỗ trợ đủ 8 chế độ, Boss HP, Combo alert, Member counts, Stream View sạch |
| `src/components/AdminDashboard.tsx` | Nâng cấp | Đầy đủ 20 mục quản trị (Game Mode, Arena Config, Viewer Management, Combo, v.v.) |
| `UnityProject/...` | Nâng cấp | Thêm `BridgeStateDispatcher.cs`, `Packages/manifest.json`, `ProjectSettings/ProjectVersion.txt`, đồng bộ `MatchController.cs` & `PushPhysicsController.cs` theo Server Snapshot |
| `Tests/livebridge.test.ts` | Nâng cấp | Kiểm thử thêm 8 chế độ, 10 kỹ năng, Combo, Like cooldown, Team Switch cooldown, và Stress 100/400/1000 events |

---

## 3. Phân định rõ trách nhiệm điều khiển trạng thái trận đấu
- **Authoritative Owner**: `MatchEngine` (LiveBridge Server) là **chủ sở hữu duy nhất** trạng thái trận đấu (`phase`, `phaseRemainingSec`, `totalPower`, `gameMode`, `activeHazard`, `boss`, `winnerTeam`).
- **Unity Client**: Kết nối WebSocket tới LiveBridge -> `BridgeStateDispatcher` nhận `match_snapshot` và `live_event`, đẩy vào `PushPhysicsController` (thực thi va chạm/Rigidbody/lực đẩy thực sự trong Unity), `CharacterStateMachine`, `SkillManager`, và `LivestreamHUD`. Unity **không chạy đồng hồ trận đấu độc lập song song**.
- **Web Admin & Stream View**: Hiển thị và gửi lệnh điều khiển qua REST/WebSocket về `MatchEngine`.
