# 01. Lộ Trình Triển Khai 12 Giai Đoạn & Tiêu Chí Nghiệm Thu

| Phase | Tên giai đoạn | Tệp nguồn chính | Tiêu chí nghiệm thu |
|---|---|---|---|
| **Phase 1** | Architecture & Project Setup | `server.ts`, `src/shared/types.ts`, `UnityProject/Assets/Scripts/Core/ArenaEnums.cs` | Cây thư mục đầy đủ, server chạy cổng 3000, WebSocket `/ws` kết nối ổn định |
| **Phase 2** | Character & 3 Arenas | `src/components/Arena3DCanvas.tsx`, `Documentation/02_UNITY6_AND_BLENDER_ASSET_GUIDE.md` | 3 đấu trường chuyển đổi mượt, 2 nhân vật đa khớp có đổ bóng tiếp xúc |
| **Phase 3** | Push Physics | `LiveBridge/engine/matchEngine.ts`, `UnityProject/Assets/Scripts/Physics/PushPhysicsController.cs` | Không xuyên nhau, không văng vô hạn, lực đẩy/chống đẩy/loạng choạng hoạt động |
| **Phase 4** | Gameplay & Match System | `UnityProject/Assets/Scripts/Match/MatchController.cs` | 30/60/60/30s + 15s Overtime, Auto Round, Pause/Resume/Reset/EmergencyStop |
| **Phase 5** | Gift & Skill System | `GiftEngine.cs`, `SkillManager.cs`, `LiveBridge/db/database.ts` | 5 nhóm quà, 5 tuyệt chiêu, chống cộng trùng streak, không 1 quà kết thúc ngay trận |
| **Phase 6** | UI & 14-Page Admin | `LivestreamPortraitView.tsx`, `AdminDashboard.tsx`, `LivestreamHUD.cs` | Portrait 9:16 dễ đọc trên điện thoại, đủ 14 trang Admin lưu cấu hình vào SQLite |
| **Phase 7** | Live Simulation | `LiveBridge/bridge/tiktokAdapter.ts` (`SimulationConnectorAdapter`) | Test chat Unicode, gift streak, burst tải cao, duplicate test |
| **Phase 8** | TikTok LIVE Integration | `LiveBridge/bridge/tiktokAdapter.ts` (`TikTokLiveConnectorAdapter`) | Tách adapter, reconnect tự động, không lưu mật khẩu, nghiệm thu khi live thật |
| **Phase 9** | Database & Leaderboard | `LiveBridge/db/database.ts` | 9 bảng SQLite, WAL, Transaction, Backup/Recovery JSON & DB |
| **Phase 10** | OBS & Performance | `PortraitDisplayAndPerfManager.cs`, `Documentation/04_OBS_AND_WINDOWS_RELEASE_CHECKLIST.md` | 30/60 FPS, Object Pooling, tự giảm VFX khi tụt FPS |
| **Phase 11** | Stress Test & Stability | `Tests/livebridge.test.ts`, `UnityProject/Assets/Tests/ArenaPhysicsTests.cs` | Chạy `npm test` đạt 100%, không rò rỉ bộ nhớ, chạy ổn định 2+ giờ |
| **Phase 12** | Windows Release | `Tools/build-windows.ps1`, `Scripts/start-livebridge.ps1` | Xuất `.exe` 1080×1920 Borderless trên Windows & kiểm tra OBS Capture |
