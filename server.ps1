param(
    [int]$port = 8080
)
# Force UTF-8 for external commands and output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host "Failed to start server. Port $port might be in use or missing permissions." -ForegroundColor Red
    exit
}

Write-Host "Simple HTTP Server Started..." -ForegroundColor Green
Write-Host "Address: http://localhost:$port/"
Write-Host "Press Ctrl + C to exit."

# Open browser
Start-Process "http://localhost:$port/index.html"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ($urlPath -eq "") { $urlPath = "index.html" }
        
        if ($urlPath -eq "api/save") {
            if ($request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $content = $reader.ReadToEnd()
                    $reader.Close()
                    
                    if ($content) {
                        $content | Out-File -FilePath (Join-Path (Get-Location) "meigara.csv") -Encoding utf8 -NoNewline
                        Write-Host "200 - Saved meigara.csv" -ForegroundColor Green
                        
                        $response.StatusCode = 200
                        $msg = [System.Text.Encoding]::UTF8.GetBytes("Saved successfully")
                        $response.ContentLength64 = $msg.Length
                        $response.OutputStream.Write($msg, 0, $msg.Length)
                        $response.OutputStream.Close()
                    } else {
                        throw "Empty content"
                    }
                } catch {
                    Write-Host "500 - Save Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                    $response.StatusCode = 500
                    $response.Close()
                }
            } else {
                $response.StatusCode = 405 # Method Not Allowed
                $response.Close()
            }
            continue
        }
        
        # Proxy to Yahoo Finance API
        if ($urlPath -eq "api/yahoo") {
            try {
                $symbol = $request.QueryString["symbol"]
                if (-not $symbol) { $symbol = "7203.T" }
                $range = $request.QueryString["range"]
                if (-not $range) { $range = "2y" }
                $interval = $request.QueryString["interval"]
                if (-not $interval) { $interval = "1d" }
                $yfUrl = "https://query1.finance.yahoo.com/v8/finance/chart/$symbol`?interval=$interval&range=$range"
                $yfResponse = Invoke-WebRequest -Uri $yfUrl -Method Get -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } -UseBasicParsing
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($yfResponse.Content)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $output = $response.OutputStream
                $output.Write($bytes, 0, $bytes.Length)
                $output.Close()
                Write-Host "200 - Proxy API ($symbol, range=$range, interval=$interval)" -ForegroundColor Cyan
            } catch {
                $response.StatusCode = 500
                $response.Close()
                Write-Host "500 - Proxy API Error ($symbol)" -ForegroundColor Red
            }
            continue
        }
        
        # Proxy to Yahoo Finance Spark API (for multiple symbols screening)
        if ($urlPath -eq "api/yahoo-spark") {
            try {
                $symbols = $request.QueryString["symbols"]
                if (-not $symbols) { $symbols = "7203.T" }
                $range = $request.QueryString["range"]
                if (-not $range) { $range = "2y" }
                $interval = $request.QueryString["interval"]
                if (-not $interval) { $interval = "1d" }
                
                $yfUrl = "https://query1.finance.yahoo.com/v7/finance/spark?symbols=$symbols&range=$range&interval=$interval"
                $yfResponse = Invoke-WebRequest -Uri $yfUrl -Method Get -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } -UseBasicParsing
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($yfResponse.Content)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $output = $response.OutputStream
                $output.Write($bytes, 0, $bytes.Length)
                $output.Close()
                Write-Host "200 - Proxy Spark API ($symbols, range=$range, interval=$interval)" -ForegroundColor Cyan
            } catch {
                $response.StatusCode = 500
                $response.Close()
                Write-Host "500 - Proxy Spark API Error ($symbols)" -ForegroundColor Red
            }
            continue
        }
        
        # Proxy for Yahoo Finance quoteSummary (using Python helper for reliability)
        if ($urlPath -eq "api/quoteSummary") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                # Call Python helper
                $json = python get_financials.py $symbol
                $response.ContentType = "application/json"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Proxy quoteSummary (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Proxy quoteSummary Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }
        # Proxy for Yahoo JP Dividend
        if ($urlPath -eq "api/nikkei_dividend") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $json = python yahoo_dividend_scraper.py $symbol
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Yahoo Dividend (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Yahoo Dividend Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Kabutan Business Info (日本語事業概要)
        if ($urlPath -eq "api/kabutan_biz") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $json = python kabutan_scraper.py $symbol
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Kabutan BizInfo (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Kabutan BizInfo Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Kabutan News (日本語ニュース)
        if ($urlPath -eq "api/kabutan_news") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $json = python kabutan_news.py $symbol
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Kabutan News (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Kabutan News Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Yahoo News
        if ($urlPath -eq "api/yahoo_news") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $json = python yahoo_news.py $symbol
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Yahoo News (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Yahoo News Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Nikkei News
        if ($urlPath -eq "api/nikkei_news") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $code = $symbol -replace "\.T", ""
                $json = python nikkei_news.py $code
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Nikkei News (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Nikkei News Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Minkabu News
        if ($urlPath -eq "api/minkabu_news") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $code = $symbol -replace "\.T", ""
                $json = python minkabu_news.py $code
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Minkabu News (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Minkabu News Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Traders Web News
        if ($urlPath -eq "api/traders_web_news") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $code = $symbol -replace "\.T", ""
                $json = python traders_web_news.py $code
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Traders Web News (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Traders Web News Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }
        # Proxy for Nikkei Profile
        if ($urlPath -eq "api/nikkei_profile") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $code = $symbol -replace "\.T", ""
                $json = python nikkei_profile.py $code
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Nikkei Profile (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Nikkei Profile Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy for Kabutan Yutai (株主優待情報)
        if ($urlPath -eq "api/kabutan_yutai") {
            $symbol = $request.QueryString["symbol"]
            if (-not $symbol) {
                $response.StatusCode = 400
                $response.Close()
                continue
            }
            try {
                $json = python kabutan_yutai.py $symbol
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 - Kabutan Yutai (via Python) ($symbol)" -ForegroundColor Cyan
            } catch {
                Write-Host "500 - Kabutan Yutai Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
            }
            $response.Close()
            continue
        }

        # Proxy to download JPX listed stocks Excel file
        if ($urlPath -eq "api/jpx-excel") {
            try {
                # 1. Fetch HTML to find the latest xls link
                $htmlResp = Invoke-WebRequest -Uri "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html" -Method Get -UseBasicParsing
                $html = $htmlResp.Content
                if ($html -match 'href="(/markets/statistics-equities/misc/tvdivq.+?\.xls)"') {
                    $xlsPath = $matches[1]
                    $xlsUrl = "https://www.jpx.co.jp" + $xlsPath
                    
                    # 2. Download XLS binary
                    $xlsResp = Invoke-WebRequest -Uri $xlsUrl -Method Get -UseBasicParsing
                    $xlsBytes = $xlsResp.Content
                    if ($xlsBytes.GetType() -eq [string]) {
                        # Sometimes Content parsed as string depending on PS version, need raw bytes
                        $xlsResp = Invoke-WebRequest -Uri $xlsUrl -Method Get -PassThru
                        # Note: with UseBasicParsing in PS5, Content is byte array if binary
                    }
                    # Getting raw bytes safely in both PS5/PS7:
                    $memoryStream = New-Object System.IO.MemoryStream
                    $stream = $xlsResp.RawContentStream
                    $stream.CopyTo($memoryStream)
                    $bytes = $memoryStream.ToArray()
                    $memoryStream.Close()
                    
                    $response.ContentType = "application/vnd.ms-excel"
                    $response.ContentLength64 = $bytes.Length
                    
                    # add CORS headers just in case
                    $response.AddHeader("Access-Control-Allow-Origin", "*")
                    
                    $output = $response.OutputStream
                    $output.Write($bytes, 0, $bytes.Length)
                    $output.Close()
                    Write-Host "200 - Proxy JPX Excel ($xlsUrl)" -ForegroundColor Cyan
                } else {
                    throw "Failed to find XLS link in JPX page."
                }
            } catch {
                Write-Host "500 - Proxy JPX Excel Error: $($PSItem.Exception.Message)" -ForegroundColor Red
                $response.StatusCode = 500
                $response.Close()
            }
            continue
        }
        
        # Prevent simple path traversal
        $urlPath = $urlPath -replace "\.\./|\\\\\.\\", ""
        $filePath = Join-Path (Get-Location) $urlPath

        if (Test-Path $filePath -PathType Leaf) {
            try {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                
                if ($filePath.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
                elseif ($filePath.EndsWith(".css")) { $response.ContentType = "text/css" }
                elseif ($filePath.EndsWith(".js")) { $response.ContentType = "application/javascript" }
                elseif ($filePath.EndsWith(".json")) { $response.ContentType = "application/json" }
                
                $output = $response.OutputStream
                $output.Write($bytes, 0, $bytes.Length)
                $output.Close()
                Write-Host "200 - $urlPath"
            } catch {
                $response.StatusCode = 500
                $response.Close()
                Write-Host "500 - $urlPath (Read Error)" -ForegroundColor Red
            }
        } else {
            $response.StatusCode = 404
            $response.Close()
            Write-Host "404 - $urlPath (Not Found)" -ForegroundColor Yellow
        }
    }
} finally {
    $listener.Stop()
}
