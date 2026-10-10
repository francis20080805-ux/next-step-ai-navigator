$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$nextRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nextNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $nextNode) {
  $nextBundledNode = Join-Path $nextRuntime 'node\bin\node.exe'
  if (-not (Test-Path -LiteralPath $nextBundledNode)) { throw '请安装 Node.js 24 或更新版本，再双击启动文件。' }
  $env:PATH = (Split-Path -Parent $nextBundledNode) + ';' + (Join-Path $nextRuntime 'bin\fallback') + ';' + $env:PATH
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  $nextCodexRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
  if (Test-Path -LiteralPath $nextCodexRoot) {
    $nextCodex = Get-ChildItem -LiteralPath $nextCodexRoot -Filter codex.exe -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($nextCodex) { $env:CODEX_BINARY = $nextCodex.FullName }
  }
}
if (-not (Test-Path -LiteralPath 'node_modules\vite')) {
  Write-Host '正在安装免费开源依赖，只需首次安装。'
  if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm install --frozen-lockfile }
  elseif (Get-Command npm -ErrorAction SilentlyContinue) { & npm install --package-lock=false }
  else { throw '缺少依赖安装工具，请安装 Node.js 24（包含 npm），或 pnpm。' }
  if ($LASTEXITCODE -ne 0) { throw '安装没有完成，请检查网络后重试。' }
}
& node node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw '应用检查未通过，请查看上面的提示。' }
& node node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { throw '应用准备没有完成，请查看上面的提示。' }
Write-Host '保持窗口运行；网页设置中输入下方连接码即可连接 Codex。'
& node scripts/start.mjs
