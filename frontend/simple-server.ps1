Param(
    [int]$Port = 8000,
    [string]$Root = (Get-Location).Path,
    [string]$BackendUrl = 'https://move-638e.onrender.com'
)

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
    Write-Output "Listening on $prefix serving from $Root"
} catch {
    Write-Error "Failed to start HttpListener: $_"
    exit 1
}

function Get-ContentType($path) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    switch ($ext) {
        '.html' { 'text/html' }
        '.htm'  { 'text/html' }
        '.js'   { 'application/javascript' }
        '.css'  { 'text/css' }
        '.json' { 'application/json' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.svg'  { 'image/svg+xml' }
        '.mp4'  { 'video/mp4' }
        default { 'application/octet-stream' }
    }
}

while ($true) {
    $context = $listener.GetContext()
    $ctx = $context
    $root = $Root
    $backendUrl = $BackendUrl
    try {
            $request = $ctx.Request
            $response = $ctx.Response
            $urlPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)

            if ($request.HttpMethod -eq 'GET' -and $urlPath.StartsWith('/api/public/')) {
                $upstreamUrl = $backendUrl.TrimEnd('/') + $request.Url.PathAndQuery
                try {
                    $upstream = Invoke-WebRequest -Uri $upstreamUrl -Method Get -TimeoutSec 30 -UseBasicParsing
                    $statusCode = [int]$upstream.StatusCode
                    $contentType = $upstream.Headers['Content-Type']
                    $body = $upstream.Content
                } catch {
                    $upstreamResponse = $_.Exception.Response
                    if ($upstreamResponse) {
                        $statusCode = [int]$upstreamResponse.StatusCode
                        $contentType = $upstreamResponse.ContentType
                        $reader = New-Object System.IO.StreamReader($upstreamResponse.GetResponseStream())
                        $body = $reader.ReadToEnd()
                        $reader.Dispose()
                    } else {
                        $statusCode = 502
                        $contentType = 'application/json; charset=utf-8'
                        $body = '{"success":false,"message":"Backend unavailable"}'
                    }
                }

                $response.StatusCode = $statusCode
                $response.ContentType = $contentType
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($body)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.OutputStream.Close()
                $response.Close()
                continue
            }

            if ($urlPath -eq '/' -or $urlPath -eq '') { $urlPath = '/index.html' }

            $filePath = Join-Path $root ($urlPath.TrimStart('/').Replace('/','\\'))
            if (-not (Test-Path $filePath)) {
                $response.StatusCode = 404
                $body = "404 Not Found"
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($body)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.OutputStream.Close()
                $response.Close()
                continue
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $contentType = Get-ContentType $filePath
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
            $response.Close()
    } catch {
        try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch {}
    }
}
