# 04. Hướng Dẫn OBS Studio, Build Windows & Release Checklist

## 1. Cấu hình OBS Studio (1080 × 1920 Portrait)
1. Mở **OBS Studio** -> **Settings** -> **Video**:
   - **Base (Canvas) Resolution**: `1080x1920`
   - **Output (Scaled) Resolution**: `1080x1920`
   - **Common FPS Values**: `30` (hoặc `60` nếu máy có GPU rời RTX/GTX).
2. **Cách lấy hình vào OBS**:
   - **Với bản Unity Windows (`BoyVsGirlLiveArena.exe`)**: Thêm Source **Game Capture** (hoặc **Window Capture**) -> Chọn cửa sổ `BoyVsGirlLiveArena.exe` -> Bật **Borderless** để ẩn thanh tiêu đề Unity.
   - **Với bản Web 3D Preview**: Thêm **Browser Source** -> URL `http://localhost:3000` -> Width `1080`, Height `1920` -> Chuyển sang tab **Chế độ OBS Portrait**.

## 2. Build Windows Standalone (.exe)
1. Mở Unity 6 Editor -> **File > Build Profiles > Windows**.
2. Vào **Player Settings > Resolution and Presentation**:
   - Fullscreen Mode: `Windowed` hoặc `FullScreenWindow` (Borderless).
   - Default Screen Width: `1080`, Default Screen Height: `1920`.
   - Resizable Window: `Tắt` (hoặc giữ tỷ lệ 9:16).
   - Run In Background: `Bật` (bắt buộc để game vẫn chạy khi bạn bấm sang cửa sổ Admin/OBS).
3. Hoặc chạy PowerShell script `Tools/build-windows.ps1`.

## 3. RELEASE CHECKLIST (Kiểm tra trước khi thương mại hóa)
- [ ] Đã chạy `npm test` và tất cả test vật lý / chống trùng / SQLite Backup-Recovery đều PASS.
- [ ] Đã kiểm tra hai nhân vật 3D không xuyên qua nhau và không rơi xuyên sàn.
- [ ] Đã test liên tục tối thiểu 2 giờ trong Simulation Mode ở tốc độ 5–10 event/s (RAM ổn định, Queue = 0).
- [ ] Đã kiểm tra nút **Emergency Stop**, **Pause**, **Resume**, **Reset** hoạt động tức thì và ghi log.
- [ ] Đã tạo Backup SQLite + JSON trước khi lên sóng tại mục **13. Backup**.
- [ ] Đã hiển thị rõ quy tắc bình luận & quà tặng cho khán giả trên khung hình livestream.
- [ ] Đã kiểm tra OBS nhận đủ khung hình `1080x1920` sắc nét và âm thanh không bị rè.
