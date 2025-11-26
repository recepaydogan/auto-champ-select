# Rift Server Start Script for Windows
# Run this script to start the Rift server

Write-Host "Starting Rift Server..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env file with:" -ForegroundColor Yellow
    Write-Host "  RIFT_JWT_SECRET=your-secret-key-change-this-in-production" -ForegroundColor Yellow
    Write-Host "  PORT=51001" -ForegroundColor Yellow
    exit 1
}

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
}

# Start the server
Write-Host "Starting server on port 51001..." -ForegroundColor Green
npm start

