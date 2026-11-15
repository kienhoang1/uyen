# 03. Hướng Dẫn Tích Hợp TikTok LIVE & LiveBridge

## 1. Kiến trúc bảo mật & Tuyên bố minh bạch
- Unity **không kết nối trực tiếp** vào TikTok. Toàn bộ sự kiện đi qua **LiveBridge Server** (`Node.js + WebSocket + SQLite`).
- **Không lưu mật khẩu TikTok**. Người vận hành chỉ nhập `@username` của kênh đang phát livestream công khai.
- **Lưu ý về thư viện bên thứ ba**:
  - Khi bật **LIVE MODE**, hệ thống sử dụng gói cộng đồng **không chính thức** `tiktok-live-connector` (giấy phép MIT, miễn phí).
  - TikTok không cung cấp Webcast Chat/Gift API công khai miễn phí cho tài khoản cá nhân; nếu sử dụng thư viện không chính thức, cần tuân thủ Điều khoản dịch vụ của TikTok và không dùng tài khoản chính để spam.
  - Phương án thay thế chính thức: Nếu có quyền đối tác TikTok LIVE Interactive / TikTok Research API hoặc dịch vụ webhook trung gian được cấp phép, chỉ cần viết thêm 1 class triển khai `ILiveConnectorAdapter` trong `LiveBridge/bridge/tiktokAdapter.ts` mà **không phải sửa bất kỳ dòng code nào của Unity hay MatchEngine**.

## 2. Các bước cài đặt LIVE MODE trên Windows
1. Cài đặt **Node.js 20 LTS** hoặc **22 LTS** trên Windows.
2. Mở Terminal tại thư mục gốc dự án và chạy:
   ```bash
   npm install
   npm install tiktok-live-connector
   ```
3. Khởi chạy hệ thống:
   - Cách A (Web Studio + LiveBridge tích hợp): `npm run dev` -> Mở `http://localhost:3000`.
   - Cách B (Chạy LiveBridge độc lập cho Unity `.exe`): Chạy `Scripts/start-livebridge.ps1` (cổng WebSocket `ws://localhost:8080/ws`).
4. Mở trang **2. Live Connection** trong Admin Dashboard -> Chọn **TikTok LIVE Mode** -> Nhập `@username` đang livestream -> Nhấn **Connect LIVE**.
5. Nếu kênh chưa phát livestream hoặc mạng bị ngắt, hệ thống sẽ báo lỗi rõ ràng và tự động thử kết nối lại tối đa 5 lần (exponential backoff).

## 3. Quy tắc kiểm thử Simulation Mode trước khi lên sóng
Trước mỗi buổi livestream, mở trang **3. Simulation** để kiểm tra:
1. Bấm **Simulation ON** -> Kiểm tra hai nhân vật đẩy nhau mượt.
2. Bấm **Test Gift Streak x5** -> Kiểm tra chỉ cộng đúng 5 phần quà, không cộng dồn sai.
3. Bấm **Test Chống cộng trùng** -> Kiểm tra bộ đếm `Duplicates Dropped` tăng lên và điểm không bị cộng 2 lần.
4. Bấm **Bơm tải cao (60 events)** -> Kiểm tra `Event Queue Size` xả hết về `0` và không rớt FPS.
