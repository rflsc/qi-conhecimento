<#
.SYNOPSIS
  Baixa PDFs para uma pasta local.

.DESCRIPTION
  Modo 1 — lista de URLs (recomendado após busca no Google):
    1. Cole os links em scripts/pdf-urls.txt (um por linha)
    2. .\scripts\download-pdfs.ps1 -UrlsFile scripts\pdf-urls.txt -OutDir .\pdf-downloads\normadedesempenho

  Modo 2 — descoberta no site (varre páginas HTML e coleta links .pdf em /wp-content/uploads/):
    .\scripts\download-pdfs.ps1 -Discover -Site normadedesempenho.com.br -OutDir .\pdf-downloads\normadedesempenho

.EXAMPLE
  .\scripts\download-pdfs.ps1 -UrlsFile scripts\pdf-urls.txt
#>
[CmdletBinding()]
param(
  [string]$UrlsFile = "",
  [string]$OutDir = ".\pdf-downloads",
  [switch]$Discover,
  [string]$Site = "normadedesempenho.com.br",
  [string]$UploadsPath = "/wp-content/uploads",
  [int]$MaxPages = 150,
  [int]$DelayMs = 400
)

$ErrorActionPreference = "Stop"

function Normalize-Url([string]$Href, [string]$Base) {
  if ([string]::IsNullOrWhiteSpace($Href)) { return $null }
  $Href = $Href.Trim()
  if ($Href.StartsWith("#") -or $Href.StartsWith("mailto:") -or $Href.StartsWith("javascript:")) {
    return $null
  }
  try {
    if ($Href.StartsWith("//")) { return "https:$Href" }
    if ($Href.StartsWith("http://") -or $Href.StartsWith("https://")) { return $Href }
    $baseUri = [Uri]$Base
    return [Uri]::new($baseUri, $Href).AbsoluteUri
  } catch {
    return $null
  }
}

function Get-PageLinks([string]$Html, [string]$PageUrl) {
  $links = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $pattern = '(?i)href\s*=\s*["'']([^"'']+)["'']'
  foreach ($m in [regex]::Matches($Html, $pattern)) {
    $abs = Normalize-Url $m.Groups[1].Value $PageUrl
    if ($abs) { [void]$links.Add($abs) }
  }
  return $links
}

function Test-TargetPdf([string]$Url, [string]$HostName, [string]$UploadsPath) {
  if ($Url -notmatch '\.pdf(\?|#|$)') { return $false }
  try {
    $uri = [Uri]$Url
    if ($uri.Host -notlike "*$HostName*") { return $false }
    if ($UploadsPath -and $uri.AbsolutePath -notlike "*$UploadsPath*") { return $false }
    return $true
  } catch {
    return $false
  }
}

function Discover-PdfUrls {
  param(
    [string]$HostName,
    [string]$UploadsPath,
    [int]$MaxPages,
    [int]$DelayMs
  )

  $start = "https://www.$HostName/"
  $queue = [System.Collections.Queue]::new()
  $queue.Enqueue($start)
  $visited = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $pdfs = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

  $client = [System.Net.Http.HttpClient]::new()
  $client.DefaultRequestHeaders.UserAgent.ParseAdd("QiConhecimento-PdfDownloader/1.0")
  $client.Timeout = [TimeSpan]::FromSeconds(30)

  Write-Host "Descobrindo PDFs em $HostName (max $MaxPages paginas)..." -ForegroundColor Cyan

  while ($queue.Count -gt 0 -and $visited.Count -lt $MaxPages) {
    $pageUrl = [string]$queue.Dequeue()
    if ($visited.Contains($pageUrl)) { continue }
    [void]$visited.Add($pageUrl)

    Write-Host "  [$($visited.Count)/$MaxPages] $pageUrl"

    try {
      $html = $client.GetStringAsync($pageUrl).GetAwaiter().GetResult()
    } catch {
      Write-Host "    (ignorado: $($_.Exception.Message))" -ForegroundColor DarkYellow
      Start-Sleep -Milliseconds $DelayMs
      continue
    }

    $links = Get-PageLinks $html $pageUrl
    foreach ($link in $links) {
      if (Test-TargetPdf $link $HostName $UploadsPath) {
        [void]$pdfs.Add($link)
        continue
      }

      try {
        $uri = [Uri]$link
        if ($uri.Host -like "*$HostName*" -and $link -notmatch '\.(pdf|jpg|jpeg|png|gif|zip|rar|css|js)(\?|#|$)') {
          if (-not $visited.Contains($link)) { $queue.Enqueue($link) }
        }
      } catch { }
    }

    Start-Sleep -Milliseconds $DelayMs
  }

  $client.Dispose()
  return @($pdfs) | Sort-Object
}

function Read-UrlList([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "Arquivo nao encontrado: $Path"
  }
  $lines = Get-Content $Path -Encoding UTF8 |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith("#") }
  return $lines | Sort-Object -Unique
}

function Get-SafeFileName([string]$Url) {
  $uri = [Uri]$Url
  $name = [System.IO.Path]::GetFileName($uri.LocalPath)
  if ([string]::IsNullOrWhiteSpace($name)) { $name = "documento.pdf" }
  $name = [regex]::Replace($name, '[<>:"/\\|?*]', '_')
  return $name
}

function Download-Pdf([string]$Url, [string]$OutDir) {
  $fileName = Get-SafeFileName $Url
  $dest = Join-Path $OutDir $fileName

  if (Test-Path $dest) {
    Write-Host "  ja existe: $fileName" -ForegroundColor DarkGray
    return "skipped"
  }

  $attempts = 3
  for ($i = 1; $i -le $attempts; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -OutFile $dest -UseBasicParsing -TimeoutSec 120
      $kb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
      Write-Host "  ok: $fileName ($kb KB)" -ForegroundColor Green
      return "ok"
    } catch {
      if ($i -eq $attempts) {
        Write-Host "  falhou: $fileName — $($_.Exception.Message)" -ForegroundColor Red
        if (Test-Path $dest) { Remove-Item $dest -Force }
        return "failed"
      }
      Start-Sleep -Seconds (2 * $i)
    }
  }
  return "failed"
}

# --- main ---

if (-not $Discover -and [string]::IsNullOrWhiteSpace($UrlsFile)) {
  Write-Host @"

Uso:
  .\scripts\download-pdfs.ps1 -UrlsFile scripts\pdf-urls.txt -OutDir .\pdf-downloads\normadedesempenho
  .\scripts\download-pdfs.ps1 -Discover -Site normadedesempenho.com.br -OutDir .\pdf-downloads\normadedesempenho

Dica: apos a busca no Google, copie os links para scripts\pdf-urls.txt (um por linha).

"@ -ForegroundColor Yellow
  exit 1
}

$pdfUrls = @()
if ($Discover) {
  $pdfUrls = Discover-PdfUrls -HostName $Site -UploadsPath $UploadsPath -MaxPages $MaxPages -DelayMs $DelayMs
} else {
  $pdfUrls = Read-UrlList $UrlsFile
}

$pdfUrls = $pdfUrls | Where-Object { $_ -match '\.pdf(\?|#|$)' } | Sort-Object -Unique

if ($pdfUrls.Count -eq 0) {
  Write-Host "Nenhuma URL de PDF encontrada." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host ""
Write-Host "Baixando $($pdfUrls.Count) PDF(s) para $OutDir" -ForegroundColor Cyan
Write-Host ""

$ok = 0
$skipped = 0
$failed = 0

foreach ($url in $pdfUrls) {
  Write-Host $url
  $result = Download-Pdf $url $OutDir
  switch ($result) {
    "ok" { $ok++ }
    "skipped" { $skipped++ }
    "failed" { $failed++ }
  }
  Start-Sleep -Milliseconds $DelayMs
}

Write-Host ""
Write-Host "Concluido: $ok baixados, $skipped ja existiam, $failed falhas." -ForegroundColor Cyan

if ($Discover) {
  $manifest = Join-Path $OutDir "_urls.txt"
  $pdfUrls | Set-Content -Path $manifest -Encoding UTF8
  Write-Host "Lista salva em $manifest"
}
