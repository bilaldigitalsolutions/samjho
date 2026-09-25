# Diagnostic - Check API key & Quota
$apiKey = "8d3a78faeed248918dfdcf10506eb676"
$siteUrl = "https://samjhoindia.com/"

Write-Host "=== Checking API Key Validity ===" -ForegroundColor Cyan

try {
    # Get quota (simplest GET endpoint)
    $quota = Invoke-RestMethod `
        -Uri "https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota?siteUrl=$siteUrl&apikey=$apiKey" `
        -Method Get
    
    Write-Host "✅ API Key Valid!" -ForegroundColor Green
    Write-Host "Daily Quota: $($quota.d.DailyQuota)" -ForegroundColor Gray
    Write-Host "Monthly Quota: $($quota.d.MonthlyQuota)" -ForegroundColor Gray
}
catch {
    Write-Host "❌ API Key Invalid or Site Not Verified" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Error: $($reader.ReadToEnd())" -ForegroundColor Red
    }
}