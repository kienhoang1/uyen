# 02. Hướng Dẫn Asset 3D Nhân Vật, Đấu Trường (Blender & Unity 6 URP)

Vì AI Studio không thể tự kết xuất model nhân vật `.fbx` có rig xương và animation clip hoàn chỉnh, bạn cần chuẩn bị hoặc tạo trong **Blender 4.x** / **Unity Asset Store** theo chuẩn **Premium Stylized Realism** sau:

## 1. Danh sách Asset 3D cần có (Định dạng `.fbx` hoặc `.glb`)

### Nhân vật BOY (Đội Xanh Dương)
- **Tỷ lệ**: Nam trưởng thành, cao ~1.80m, thể hình vận động viên cân đối.
- **Trang phục**: Áo giáp thể thao hiện đại màu xanh dương (`#2563EB`) + găng đẩy chiến đấu + giày đế bám sàn.
- **Chuẩn kỹ thuật**:
  - Humanoid Rig (xương Hips, Spine, Chest, Neck, Head, Left/Right Arm & Leg chuẩn Unity Humanoid Avatar).
  - PBR Materials (Albedo, Normal Map, Metallic/Smoothness, Skin Shader URP Lit / Subsurface).
  - Blend Shapes khuôn mặt: `Neutral`, `Effort_Push`, `Strain_Resist`, `Stagger_Pain`, `Victory_Smile`.

### Nhân vật GIRL (Đội Hồng)
- **Tỷ lệ**: Nữ trưởng thành, cao ~1.72m, thể hình khỏe khoắn, dẻo dai — **tuyệt đối cân bằng sức mạnh với BOY**.
- **Trang phục**: Bộ đồ thể thao hiện đại màu hồng/bạc (`#EC4899`) + găng tay năng lượng + tóc cột đuôi ngựa có xương động hoặc Cloth.
- **Chuẩn kỹ thuật**: Giống BOY (Humanoid Rig, PBR, Blend Shapes).

### Bộ Animation Clips bắt buộc (`.fbx` từ Mixamo hoặc Blender)
1. `Idle_Combat` (đứng thủ thế).
2. `Walk_Approach` (tiến vào trung tâm).
3. `Push_Forward` (hai tay tỳ đẩy đối phương, người nghiêng về trước).
4. `Resist_Hold` (chân trụ chống lực đẩy).
5. `Stagger_Hit` (mất thăng bằng lảo đảo).
6. `Slide_Back` (trượt lùi trên sàn).
7. `Recover_Stance` (lấy lại trọng tâm).
8. `Knockback_Impact` (bị hất lùi bởi kỹ năng).
9. `Fall_RingOut` (ngã khỏi vạch giới hạn).
10. `Victory_Celebrate` & `Defeat_Kneel`.

## 2. Quy trình đưa vào Unity 6 LTS (Từng bước cho người không chuyên)

1. Mở **Unity Hub** -> Chọn **Add** -> Chọn thư mục `UnityProject/` trong dự án này (chọn phiên bản **Unity 6 LTS** với template **Universal 3D (URP)**).
2. Chép các file `.fbx` nhân vật vào `UnityProject/Assets/Art/Characters/Boy/` và `Girl/`.
3. Click chọn từng file `.fbx` trong cửa sổ Project -> Tab **Rig** (bên phải Inspector) -> Chọn **Animation Type: Humanoid** -> Nhấn **Apply**.
4. Tạo **Animator Controller** trong `Assets/Animations/FighterAnimator.controller`:
   - Tạo tham số `StateIndex` (Integer, giá trị 0..10 khớp `ArenaEnums.CharacterState`), `PushIntensity` (Float), `LeanAngle` (Float).
   - Kéo các clip vào Animator và nối Transition theo `StateIndex`.
5. Kéo Prefab Boy vào vị trí `(-0.75, 0, 0)` quay mặt hướng `+X`; kéo Prefab Girl vào `(0.75, 0, 0)` quay mặt hướng `-X`.
6. Gắn `Rigidbody`, `CapsuleCollider` và `CharacterStateMachine.cs` cho mỗi nhân vật; gắn `PushPhysicsController.cs`, `MatchController.cs`, `TeamPowerManager.cs`, `LiveBridgeClient.cs` lên GameObject `ArenaManager`.
