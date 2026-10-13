param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$desktopRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$desktopBase = 'http://127.0.0.1:8787'
$desktopUrl = $desktopBase + '/?mode=local#/home'
$desktopMutex = New-Object System.Threading.Mutex($false, 'Local\NextStepDesktop8787')
$desktopLockHeld = $false
$desktopHttp = $null

function Get-DesktopHealth {
  try {
    $desktopResponse = $desktopHttp.GetAsync($desktopBase + '/api/health').GetAwaiter().GetResult()
    try {
      if (-not $desktopResponse.IsSuccessStatusCode) { return $null }
      return ($desktopResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
    } finally { $desktopResponse.Dispose() }
  } catch { return $null }
}

function Test-DesktopPort {
  $desktopTcp = New-Object System.Net.Sockets.TcpClient
  try {
    $desktopConnect = $desktopTcp.ConnectAsync('127.0.0.1', 8787)
    if (-not $desktopConnect.Wait(1000)) { return $false }
    return $desktopTcp.Connected
  } catch { return $false }
  finally { $desktopTcp.Dispose() }
}

function Get-DesktopNode {
  $desktopCandidates = @()
  $desktopCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($desktopCommand) { $desktopCandidates += $desktopCommand.Source }
  $desktopCandidates += (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
  foreach ($desktopCandidate in $desktopCandidates) {
    if (Test-Path -LiteralPath $desktopCandidate -PathType Leaf) {
      $desktopVersion = & $desktopCandidate --version
      if ($LASTEXITCODE -eq 0 -and $desktopVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 24) { return $desktopCandidate }
    }
  }
  throw '未找到 Node.js 24 或更新版本。请修复本机运行环境后重试；桌面启动不会联网安装。'
}

try {
  try { $desktopLockHeld = $desktopMutex.WaitOne([TimeSpan]::FromSeconds(25)) }
  catch [System.Threading.AbandonedMutexException] { $desktopLockHeld = $true }
  if (-not $desktopLockHeld) { throw '应用仍在启动，请稍后再双击桌面图标。' }
  Add-Type -AssemblyName System.Net.Http
  $desktopHandler = New-Object System.Net.Http.HttpClientHandler
  $desktopHandler.UseProxy = $false
  $desktopHttp = New-Object System.Net.Http.HttpClient($desktopHandler)
  $desktopHttp.Timeout = [TimeSpan]::FromSeconds(2)
  $desktopHttp.MaxResponseContentBufferSize = 4096
  $desktopHttp.DefaultRequestHeaders.Add('Origin', $desktopBase)
  $desktopHealth = Get-DesktopHealth
  $desktopReused = $false
  $desktopProcessId = $null
  if ($desktopHealth -and $desktopHealth.app -eq 'next-step-ai-navigator' -and $desktopHealth.ready -is [bool] -and $desktopHealth.ready) {
    $desktopReused = $true
  } else {
    if (Test-DesktopPort) {
      if ($desktopHealth -and $desktopHealth.app -eq 'next-step-ai-navigator') { throw '本机服务正在运行，但页面尚未准备好。请关闭旧服务后重新启动。' }
      throw '本机端口 8787 已被其他程序或旧版本占用。请先关闭占用程序；不会自动结束其他进程。'
    }
    foreach ($desktopRequired in @('dist\index.html', 'dist\catalog-snapshot.json', 'node_modules\yaml\package.json', 'server\index.ts')) {
      if (-not (Test-Path -LiteralPath (Join-Path $desktopRoot $desktopRequired) -PathType Leaf)) {
        throw ('应用运行文件缺失：' + $desktopRequired + '。请修复本机安装或重新构建；桌面启动不会联网下载。')
      }
    }
    $desktopNode = Get-DesktopNode
    if (-not (Get-Command codex -ErrorAction SilentlyContinue) -and -not $env:CODEX_BINARY) {
      $desktopCodexRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
      if (Test-Path -LiteralPath $desktopCodexRoot) {
        $desktopCodex = Get-ChildItem -LiteralPath $desktopCodexRoot -Filter codex.exe -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($desktopCodex) { $env:CODEX_BINARY = $desktopCodex.FullName }
      }
    }
    # Core pages use loopback only. Existing proxy settings may still help optional source checks.
    if (-not $env:HTTPS_PROXY) {
      $desktopProxy = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
      if ($desktopProxy.ProxyEnable -and $desktopProxy.ProxyServer) {
        $desktopProxyAddress = [string]$desktopProxy.ProxyServer
        if ($desktopProxyAddress -match '(?:^|;)https=([^;]+)') { $desktopProxyAddress = $Matches[1] }
        elseif ($desktopProxyAddress -match '(?:^|;)http=([^;]+)') { $desktopProxyAddress = $Matches[1] }
        if ($desktopProxyAddress -notmatch '[=;]') {
          if ($desktopProxyAddress -notmatch '^https?://') { $desktopProxyAddress = 'http://' + $desktopProxyAddress }
          $env:HTTPS_PROXY = $desktopProxyAddress
        }
      }
    }
    if ($env:HTTPS_PROXY) { $env:NODE_USE_ENV_PROXY = '1' }
    $env:NO_PROXY = 'localhost,127.0.0.1,::1'
    $desktopData = Join-Path $desktopRoot '.data'
    if (Test-Path -LiteralPath $desktopData) {
      if ((Get-Item -LiteralPath $desktopData).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw '本机数据目录不能是目录链接，请修复后重试。' }
    } else { New-Item -ItemType Directory -Path $desktopData | Out-Null }
    $desktopProcess = Start-Process -FilePath $desktopNode -ArgumentList @('--env-file-if-exists=.env', '--experimental-strip-types', 'server/index.ts', '--serve', '--local-desktop') -WorkingDirectory $desktopRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $desktopData 'desktop-service.out.log') -RedirectStandardError (Join-Path $desktopData 'desktop-service.err.log') -PassThru
    $desktopProcessId = $desktopProcess.Id
    $desktopDeadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 250
      $desktopHealth = Get-DesktopHealth
      if ($desktopHealth -and $desktopHealth.app -eq 'next-step-ai-navigator' -and $desktopHealth.ready -is [bool] -and $desktopHealth.ready) { break }
      $desktopProcess.Refresh()
      if ($desktopProcess.HasExited) { throw '本机服务未能启动。请查看应用目录 .data\desktop-service.err.log。' }
    } while ([DateTime]::UtcNow -lt $desktopDeadline)
    if (-not ($desktopHealth -and $desktopHealth.app -eq 'next-step-ai-navigator' -and $desktopHealth.ready -is [bool] -and $desktopHealth.ready)) { throw '本机页面启动超时，请稍后再双击；运行日志保存在应用目录 .data 中。' }
  }
  if (-not $NoBrowser) { Start-Process -FilePath $desktopUrl }
  [pscustomobject]@{ url = $desktopUrl; reused = $desktopReused; processId = $desktopProcessId; ready = $true } | ConvertTo-Json -Compress
} catch {
  $desktopError = $_.Exception.Message
  if (-not $NoBrowser) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($desktopError, '下一步：启动提示', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
  }
  Write-Error $desktopError -ErrorAction Continue
  exit 1
} finally {
  if ($desktopHttp) { $desktopHttp.Dispose() }
  if ($desktopLockHeld) { $desktopMutex.ReleaseMutex() }
  $desktopMutex.Dispose()
}
