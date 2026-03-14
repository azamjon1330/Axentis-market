# Deploy Analytics Panel Improvements to VPS
# Changes: Blue color for expenses card, period selector enhancement, chart descriptions

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🚀 DEPLOY ANALYTICS IMPROVEMENTS TO VPS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$VPS_HOST = "109.123.253.238"
$VPS_USER = "root"
$VPS_PASSWORD = "Supreme001"
$PROJECT_PATH = "/root/Axentis-market"

# Check git status
Write-Host "✅ Verifying local changes are pushed..." -ForegroundColor Green
$gitStatus = git status --porcelain
$latestCommit = git log -1 --pretty=format:"%h - %s"
Write-Host "   Latest commit: $latestCommit" -ForegroundColor Gray

if ($gitStatus) {
    Write-Host "⚠️  Warning: You have uncommitted changes!" -ForegroundColor Yellow
    Write-Host "$gitStatus" -ForegroundColor Gray
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  📋 MANUAL DEPLOYMENT INSTRUCTIONS" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

Write-Host "1️⃣  Connect to VPS:" -ForegroundColor Yellow
Write-Host "    ssh root@$VPS_HOST" -ForegroundColor White
Write-Host "    Password: $VPS_PASSWORD" -ForegroundColor DarkGray
Write-Host ""

Write-Host "2️⃣  Pull latest changes:" -ForegroundColor Yellow
Write-Host "    cd $PROJECT_PATH" -ForegroundColor White
Write-Host "    git pull origin main" -ForegroundColor White
Write-Host ""

Write-Host "3️⃣  Rebuild frontend (no cache):" -ForegroundColor Yellow
Write-Host "    docker-compose build frontend --no-cache" -ForegroundColor White
Write-Host ""

Write-Host "4️⃣  Recreate containers:" -ForegroundColor Yellow
Write-Host "    docker-compose up -d --force-recreate frontend" -ForegroundColor White
Write-Host ""

Write-Host "5️⃣  Verify deployment:" -ForegroundColor Yellow
Write-Host "    docker ps" -ForegroundColor White
Write-Host "    docker logs axentis-market-frontend-1 --tail 20" -ForegroundColor White
Write-Host ""

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  📝 CHANGES IN THIS DEPLOYMENT" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ✓ Changed 'Sarflangan' card from orange to blue" -ForegroundColor Green
Write-Host "  ✓ Enhanced period selector visibility with label" -ForegroundColor Green
Write-Host "  ✓ Added descriptions to charts:" -ForegroundColor Green
Write-Host "    - Purchases dynamics: 'Changes in sum over time'" -ForegroundColor Gray
Write-Host "    - Top 5 products: 'Most purchased products'" -ForegroundColor Gray
Write-Host "  ✓ Fixed CompanyPanel JSX syntax error" -ForegroundColor Green
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

# Copy commands to clipboard if possible
$commands = @"
cd $PROJECT_PATH
git pull origin main
docker-compose build frontend --no-cache
docker-compose up -d --force-recreate frontend
docker ps
"@

try {
    $commands | Set-Clipboard
    Write-Host "✅ Commands copied to clipboard! Paste them after SSH connection." -ForegroundColor Green
} catch {
    Write-Host "💡 Tip: Copy the commands above to run them on VPS" -ForegroundColor Yellow
}

Write-Host ""
