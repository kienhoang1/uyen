import React from 'react';

interface PhaseRow {
  phase: string;
  title: string;
  webStatus: string;
  unityStatus: string;
  deliverablePath: string;
}

const PHASES: PhaseRow[] = [
  {
    phase: 'Phase 1',
    title: 'Architecture & Project Setup',
    webStatus: 'Đang chạy thực tế (Node + WS + SQLite)',
    unityStatus: 'Đã xuất cấu trúc UnityProject/ & Tài liệu',
    deliverablePath: 'Documentation/00_ARCHITECTURE_AND_GAP_ANALYSIS.md',
  },
  {
    phase: 'Phase 2',
    title: 'Character & 3 Arenas',
    webStatus: '3 Đấu trường WebGL + Boy/Girl đa khớp',
    unityStatus: 'Đã xuất Script + Quy trình Blender/Asset',
    deliverablePath: 'Documentation/02_UNITY6_AND_BLENDER_ASSET_GUIDE.md',
  },
  {
    phase: 'Phase 3',
    title: 'Push Physics Controller',
    webStatus: 'Đang chạy vật lý đẩy 30Hz (chống xuyên/văng)',
    unityStatus: 'PushPhysicsController.cs + CharacterStateMachine.cs',
    deliverablePath: 'UnityProject/Assets/Scripts/Physics/PushPhysicsController.cs',
  },
  {
    phase: 'Phase 4',
    title: 'Gameplay & Match System',
    webStatus: '4 giai đoạn + Hiệp phụ 15s + Auto round',
    unityStatus: 'MatchController.cs + ArenaBoundary.cs',
    deliverablePath: 'UnityProject/Assets/Scripts/Match/MatchController.cs',
  },
  {
    phase: 'Phase 5',
    title: 'Gift & Skill System',
    webStatus: 'GiftEngine + 5 Tuyệt chiêu + Cooldown',
    unityStatus: 'GiftEngine.cs + SkillManager.cs',
    deliverablePath: 'UnityProject/Assets/Scripts/Skills/SkillManager.cs',
  },
  {
    phase: 'Phase 6',
    title: 'UI & 14-Page Admin',
    webStatus: 'Portrait 9:16 + Admin 14 trang hoạt động',
    unityStatus: 'LivestreamHUD.cs + PortraitDisplayManager.cs',
    deliverablePath: 'UnityProject/Assets/Scripts/UI/LivestreamHUD.cs',
  },
  {
    phase: 'Phase 7',
    title: 'Live Simulation Mode',
    webStatus: 'Chat / Gift / Streak / Burst / Duplicate Test',
    unityStatus: 'Kết nối ws://localhost:8080/ws hoặc :3000/ws',
    deliverablePath: 'LiveBridge/bridge/tiktokAdapter.ts',
  },
  {
    phase: 'Phase 8',
    title: 'TikTok LIVE Integration',
    webStatus: 'Adapter tách rời (chưa kết nối LIVE thật)',
    unityStatus: 'Cần chạy trên Windows với kênh đang phát LIVE',
    deliverablePath: 'Documentation/03_TIKTOK_LIVE_BRIDGE_GUIDE.md',
  },
  {
    phase: 'Phase 9',
    title: 'SQLite Database & Leaderboard',
    webStatus: '9 bảng SQLite + Transaction + Backup/Recovery',
    unityStatus: 'LiveBridge quản lý SQLite tập trung (không block UI)',
    deliverablePath: 'LiveBridge/db/database.ts',
  },
  {
    phase: 'Phase 10',
    title: 'OBS & Performance Optimization',
    webStatus: 'Object/InstancedMesh Pool + FPS Monitor',
    unityStatus: 'ObjectPooler.cs + PerformanceMonitor.cs',
    deliverablePath: 'Documentation/04_OBS_AND_WINDOWS_RELEASE_CHECKLIST.md',
  },
  {
    phase: 'Phase 11',
    title: 'Stress Test & Stability',
    webStatus: 'Automated Tests (Tests/livebridge.test.ts)',
    unityStatus: 'Unity Test Framework scripts trong Assets/Tests/',
    deliverablePath: 'UnityProject/Assets/Tests/ArenaPhysicsTests.cs',
  },
  {
    phase: 'Phase 12',
    title: 'Windows Standalone Build',
    webStatus: 'Sẵn sàng xuất Script build Windows',
    unityStatus: 'Cần mở Unity 6 Editor trên Windows để Build .exe',
    deliverablePath: 'Tools/build-windows.ps1',
  },
];

export const UnityRoadmapView: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Phân định minh bạch: Môi trường Web Studio vs Unity 6 Windows
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Hệ thống LiveBridge (Node.js + WebSocket + SQLite 9 bảng), Engine vật lý đẩy, Bảng điều khiển Admin 14 trang
          và Đấu trường 3D WebGL đang chạy thực tế ngay trong ứng dụng này. Để xuất ra file{' '}
          <code className="font-mono text-amber-300">.exe</code> cho Windows với mô hình nhân vật 3D Humanoid PBR
          và kết nối OBS Studio, bạn cần mở thư mục <code className="font-mono text-blue-300">UnityProject/</code> trên
          Unity 6 LTS (Windows) theo đúng tài liệu hướng dẫn từng bước trong{' '}
          <code className="font-mono text-emerald-300">Documentation/</code>.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
        <h3 className="text-base font-semibold text-white mb-4">
          Lộ trình 12 Giai đoạn & Trạng thái Nghiệm thu
        </h3>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2.5 pr-4">Giai đoạn</th>
              <th className="py-2.5 pr-4">Hạng mục</th>
              <th className="py-2.5 pr-4">LiveBridge & Web 3D (Chạy ngay)</th>
              <th className="py-2.5 pr-4">Unity 6 Windows (Mã nguồn & Hướng dẫn)</th>
              <th className="py-2.5">Tệp nguồn chính</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {PHASES.map((p) => (
              <tr key={p.phase} className="hover:bg-slate-800/30">
                <td className="py-2.5 pr-4 font-mono font-semibold text-blue-400 whitespace-nowrap">
                  {p.phase}
                </td>
                <td className="py-2.5 pr-4 font-medium text-white">{p.title}</td>
                <td className="py-2.5 pr-4 text-emerald-300">{p.webStatus}</td>
                <td className="py-2.5 pr-4 text-slate-300">{p.unityStatus}</td>
                <td className="py-2.5 font-mono text-slate-400">{p.deliverablePath}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
