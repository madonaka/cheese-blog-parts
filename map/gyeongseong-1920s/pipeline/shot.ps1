# 도엽 SVG 를 헤드리스 크롬으로 PNG 캡쳐한다 (HANDOFF §4-14).
#   powershell -File shot.ps1 gyeongseong-3-core
# --user-data-dir 는 필수. 없으면 조용히 실패한다.
param([string]$name = "gyeongseong-3-core", [int]$scale = 1)

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "..\out"
$svg = Join-Path $out "$name.svg"
if (-not (Test-Path $svg)) { Write-Error "없다: $svg"; exit 1 }

# SVG 의 width/height 를 읽어 창 크기를 맞춘다
$head = (Get-Content $svg -TotalCount 1 -Encoding UTF8)
$w = [int]([regex]::Match($head, 'width="(\d+)"').Groups[1].Value)
$h = [int]([regex]::Match($head, 'height="(\d+)"').Groups[1].Value)
if ($w -eq 0) { $w = 2200; $h = 1800 }
$w = [int]($w / $scale); $h = [int]($h / $scale)

$png = Join-Path $out "$name.png"
$udd = Join-Path $env:TEMP "chrome-shot-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$uri = ([uri](Resolve-Path $svg)).AbsoluteUri

& $chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --user-data-dir="$udd" --window-size="$w,$h" --screenshot="$png" $uri 2>$null | Out-Null
Remove-Item $udd -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $png) {
  $kb = [int]((Get-Item $png).Length / 1024)
  Write-Output "$png  ${w}x${h}  ${kb} KB"
} else { Write-Error "캡쳐 실패" }
