# PowerShell Script to build BOY vs GIRL - LIVE ARENA Windows Standalone (1080x1920 Portrait)
# Yêu cầu: Đã cài Unity 6 LTS trên Windows (chỉnh sửa $UnityExe nếu cài ở ổ đĩa khác)

param(
    [string]$UnityExe = "C:\Program Files\Unity\Hub\Editor\6000.0.23f1\Editor\Unity.exe",
    [string]$ProjectPath = "$PSScriptRoot\..\UnityProject",
    [string]$OutputExe = "$PSScriptRoot\..\Builds\BoyVsGirlLiveArena.exe"
)

if (-Not (Test-Path $UnityExe)) {
    Write-Error "Không tìm thấy Unity Editor tại: $UnityExe. Vui lòng truyền -UnityExe đường dẫn chính xác."
    exit 1
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutputExe) | Out-Null

Write-Host "Đang biên dịch Windows Standalone Build (1080x1920 Portrait)..."
& $UnityExe -batchmode -nographics -quit `
    -projectPath (Resolve-Path $ProjectPath) `
    -buildWindows64Player (Resolve-Path (Split-Path $OutputExe)).Path + "\BoyVsGirlLiveArena.exe" `
    -logFile "$PSScriptRoot\..\Builds\unity-build.log"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build thành công! File chạy nằm tại: $OutputExe"
} else {
    Write-Error "Build thất bại! Kiểm tra log tại Builds\unity-build.log"
    exit $LASTEXITCODE
}
