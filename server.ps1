$port = 8080
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
        
        # Proxy to Yahoo Finance API
        if ($urlPath -eq "api/yahoo") {
            try {
                $symbol = $request.QueryString["symbol"]
                if (-not $symbol) { $symbol = "7203.T" }
                $yfUrl = "https://query1.finance.yahoo.com/v8/finance/chart/$symbol`?interval=1d&range=2y"
                $yfResponse = Invoke-WebRequest -Uri $yfUrl -Method Get -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } -UseBasicParsing
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($yfResponse.Content)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $output = $response.OutputStream
                $output.Write($bytes, 0, $bytes.Length)
                $output.Close()
                Write-Host "200 - Proxy API ($symbol)" -ForegroundColor Cyan
            } catch {
                $response.StatusCode = 500
                $response.Close()
                Write-Host "500 - Proxy API Error ($symbol)" -ForegroundColor Red
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
