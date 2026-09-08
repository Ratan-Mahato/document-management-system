# One-command startup for the class demo: MinIO, backend, frontend, each in
# its own PowerShell window so you can see logs / restart one piece if needed.
#
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File start-demo.ps1
#
# Prerequisites (one-time, see README.md "Local setup"):
#   - PostgreSQL running locally with a `dms` database (this script does not start Postgres)
#   - backend/.env and frontend/.env.local created from their .env.example files
#   - `npm install` already run in both backend/ and frontend/
#   - `npx prisma migrate dev` already run in backend/

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting MinIO..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\infra\minio'; .\start-minio.ps1"

Start-Sleep -Seconds 3

Write-Host "Starting backend (http://localhost:4000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run dev"

Write-Host "Starting frontend (http://localhost:3000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "All three are launching in separate windows. Give them ~10 seconds, then open http://localhost:3000"
Write-Host "MinIO console (to see uploaded files directly): http://localhost:9001 (dms-minio / dms-minio-secret)"
