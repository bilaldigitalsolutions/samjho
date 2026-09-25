# Bing Webmaster API - Submit URLs for Indexing
# Apni API key yahan daalo
$apiKey = "35d59c23fc7a4bf2a0b019053014c34e"
$siteUrl = "https://samjhoindia.com/"

# Submit karne wale URLs ki list
$urls = @(
    "https://samjhoindia.com/",
    "https://samjhoindia.com/guides/",
    "https://samjhoindia.com/government/",
    "https://samjhoindia.com/documents/",
    "https://samjhoindia.com/business/",
    "https://samjhoindia.com/money/",
    "https://samjhoindia.com/education/",
    "https://samjhoindia.com/calculators/",
    "https://samjhoindia.com/about/",
    "https://samjhoindia.com/contact/"
)

Write-Host "Submitting $($urls.Count) URLs to Bing..." -ForegroundColor Cyan

foreach ($url in $urls) {
    $body = @{
        siteUrl = $siteUrl
        url = $url
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=$apiKey" `
            -Method Post `
            -Body $body `
            -ContentType "application/json"
        
        Write-Host "✅ Submitted: $url" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed: $url - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host "`nDone. Check Bing Webmaster Tools after 24-48 hours." -ForegroundColor Yellow