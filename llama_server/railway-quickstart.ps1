# Railway Quick Start Script for Windows PowerShell
# This script helps you deploy your llama_server to Railway quickly

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Railway Deployment Quick Start" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Railway CLI is installed
Write-Host "Checking for Railway CLI..." -ForegroundColor Yellow
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue

if (-not $railwayInstalled) {
    Write-Host "Railway CLI not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install it using one of these methods:" -ForegroundColor Yellow
    Write-Host "  1. npm install -g @railway/cli" -ForegroundColor White
    Write-Host "  2. scoop install railway" -ForegroundColor White
    Write-Host ""
    Write-Host "After installation, run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Railway CLI found!" -ForegroundColor Green
Write-Host ""

# Login to Railway
Write-Host "Logging into Railway..." -ForegroundColor Yellow
railway login

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Login failed. Please try again." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Logged in successfully!" -ForegroundColor Green
Write-Host ""

# Ask if user wants to create new project or link existing
Write-Host "Do you want to:" -ForegroundColor Yellow
Write-Host "  1. Create a new Railway project" -ForegroundColor White
Write-Host "  2. Link to an existing project" -ForegroundColor White
$choice = Read-Host "Enter choice (1 or 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "Creating new Railway project..." -ForegroundColor Yellow
    railway init
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "Linking to existing project..." -ForegroundColor Yellow
    railway link
} else {
    Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    exit 1
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Project setup failed." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Project setup complete!" -ForegroundColor Green
Write-Host ""

# Ask about environment variables
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Environment Variables Configuration" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You need to set the following environment variables:" -ForegroundColor Yellow
Write-Host "  - PINECONE_API_KEY (Required)" -ForegroundColor White
Write-Host "  - GOOGLE_API_KEY (Required)" -ForegroundColor White
Write-Host "  - GOOGLE_API_KEY_2 (Optional)" -ForegroundColor White
Write-Host "  - GOOGLE_API_KEY_3 (Optional)" -ForegroundColor White
Write-Host "  - PORT=8080 (Required)" -ForegroundColor White
Write-Host ""
Write-Host "Do you want to set them now? (Y/N)" -ForegroundColor Yellow
$setVars = Read-Host

if ($setVars -eq "Y" -or $setVars -eq "y") {
    Write-Host ""
    
    # Set PORT
    Write-Host "Setting PORT=8080..." -ForegroundColor Yellow
    railway variables set PORT=8080
    
    # Pinecone API Key
    Write-Host ""
    $pineconeKey = Read-Host "Enter your PINECONE_API_KEY" -AsSecureString
    $pineconeKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pineconeKey))
    railway variables set PINECONE_API_KEY=$pineconeKeyPlain
    
    # Google API Key
    Write-Host ""
    $googleKey = Read-Host "Enter your GOOGLE_API_KEY" -AsSecureString
    $googleKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($googleKey))
    railway variables set GOOGLE_API_KEY=$googleKeyPlain
    
    # Optional: Additional Google API Keys
    Write-Host ""
    Write-Host "Do you have additional Google API keys for rotation? (Y/N)" -ForegroundColor Yellow
    $hasMore = Read-Host
    
    if ($hasMore -eq "Y" -or $hasMore -eq "y") {
        $googleKey2 = Read-Host "Enter GOOGLE_API_KEY_2 (or press Enter to skip)" -AsSecureString
        $googleKey2Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($googleKey2))
        if ($googleKey2Plain) {
            railway variables set GOOGLE_API_KEY_2=$googleKey2Plain
        }
        
        $googleKey3 = Read-Host "Enter GOOGLE_API_KEY_3 (or press Enter to skip)" -AsSecureString
        $googleKey3Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($googleKey3))
        if ($googleKey3Plain) {
            railway variables set GOOGLE_API_KEY_3=$googleKey3Plain
        }
    }
    
    Write-Host ""
    Write-Host "✓ Environment variables set!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Skipping environment variable setup." -ForegroundColor Yellow
    Write-Host "You can set them later via:" -ForegroundColor Yellow
    Write-Host "  - Railway Dashboard: https://railway.app/dashboard" -ForegroundColor White
    Write-Host "  - CLI: railway variables set KEY=VALUE" -ForegroundColor White
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Ready to Deploy!" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Do you want to deploy now? (Y/N)" -ForegroundColor Yellow
$deploy = Read-Host

if ($deploy -eq "Y" -or $deploy -eq "y") {
    Write-Host ""
    Write-Host "Deploying to Railway..." -ForegroundColor Yellow
    Write-Host "This may take a few minutes..." -ForegroundColor White
    railway up
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Deployment successful!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Check deployment: railway status" -ForegroundColor White
        Write-Host "  2. View logs: railway logs" -ForegroundColor White
        Write-Host "  3. Open dashboard: railway open" -ForegroundColor White
        Write-Host "  4. Test health endpoint: curl https://your-domain.up.railway.app/health" -ForegroundColor White
        Write-Host ""
        Write-Host "Get your public URL from the Railway dashboard!" -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "✗ Deployment failed. Check the errors above." -ForegroundColor Red
        Write-Host "View logs with: railway logs" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Skipping deployment." -ForegroundColor Yellow
    Write-Host "Deploy later with: railway up" -ForegroundColor White
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "For more information, see RAILWAY_DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host ""

