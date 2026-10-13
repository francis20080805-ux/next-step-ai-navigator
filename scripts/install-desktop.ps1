$ErrorActionPreference = 'Stop'
$shortcutRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$shortcutDesktop = [Environment]::GetFolderPath('DesktopDirectory')
if (-not (Test-Path -LiteralPath $shortcutDesktop -PathType Container)) { throw '没有找到桌面目录。' }
$shortcutLauncher = Join-Path $shortcutRoot 'scripts\start-desktop.ps1'
if (-not (Test-Path -LiteralPath $shortcutLauncher -PathType Leaf)) { throw '缺少本机桌面启动脚本。' }
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $shortcutDesktop '下一步.lnk'
$shortcutOld = Join-Path $shortcutDesktop '下一步.url'
$shortcutArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $shortcutLauncher + '"'
$shortcutPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path -LiteralPath $shortcutPath) {
  $shortcutExisting = $shortcutShell.CreateShortcut($shortcutPath)
  if ($shortcutExisting.TargetPath -ne $shortcutPowerShell -or $shortcutExisting.Arguments -ne $shortcutArguments) { throw '桌面上已有其他同名快捷方式，已保留，请先为它改名。' }
}
if (Test-Path -LiteralPath $shortcutOld) {
  if (-not (Get-Content -LiteralPath $shortcutOld -Raw).Contains('URL=https://next-step-ai-navigator.francis20080805.chatgpt.site/')) { throw '桌面已有其他同名网页快捷方式，已保留。' }
  $shortcutBackup = Join-Path $shortcutRoot '.data\desktop-shortcut-backup'
  $shortcutData = Join-Path $shortcutRoot '.data'
  foreach ($shortcutDirectory in @($shortcutData, $shortcutBackup)) {
    if ((Test-Path -LiteralPath $shortcutDirectory) -and ((Get-Item -LiteralPath $shortcutDirectory).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw '快捷方式备份目录不能是目录链接。' }
  }
  New-Item -ItemType Directory -Path $shortcutBackup -Force | Out-Null
  $shortcutBackupPath = Join-Path $shortcutBackup ('下一步在线版-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff') + '.url')
  Copy-Item -LiteralPath $shortcutOld -Destination $shortcutBackupPath
}
$shortcut = $shortcutShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $shortcutPowerShell
$shortcut.Arguments = $shortcutArguments
$shortcut.WorkingDirectory = $shortcutRoot
$shortcut.Description = '打开下一步本机版：核心功能无需 VPN，个人数据保存在这台电脑'
$shortcut.WindowStyle = 7
$shortcutEdge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (Test-Path -LiteralPath $shortcutEdge) { $shortcut.IconLocation = $shortcutEdge + ',0' }
$shortcut.Save()
$shortcutVerified = $shortcutShell.CreateShortcut($shortcutPath)
if ($shortcutVerified.TargetPath -ne $shortcutPowerShell -or $shortcutVerified.Arguments -ne $shortcutArguments) { throw '快捷方式校验未通过，原在线入口已保留。' }
if (Test-Path -LiteralPath $shortcutOld) { Remove-Item -LiteralPath $shortcutOld }
[pscustomobject]@{ shortcut = $shortcutPath; url = 'http://127.0.0.1:8787/?mode=local#/home'; backup = $shortcutBackupPath; verified = $true } | ConvertTo-Json -Compress
