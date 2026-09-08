# Starts the local MinIO server (S3-compatible storage) for this project.
# Run from anywhere: powershell -ExecutionPolicy Bypass -File infra\minio\start-minio.ps1
# Leave the window open (or run it in a background job) while you demo — closing it stops MinIO.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$env:MINIO_ROOT_USER = "dms-minio"
$env:MINIO_ROOT_PASSWORD = "dms-minio-secret"
# Static single-key auto-encryption so SSE-S3 (AES256) uploads work locally without a full KMS.
# This key is for local dev only — never reuse it anywhere real. In production, AWS S3 provides
# SSE-S3 natively with no key management needed on your side.
$env:MINIO_KMS_SECRET_KEY = "dms-key:JO+t6BLl8MPw2nwiWWC3H+rDcLUgX0DYi9qM6BDHSJU="

if (-not (Test-Path ".\data")) {
    New-Item -ItemType Directory -Path ".\data" | Out-Null
}

Write-Host "Starting MinIO on http://127.0.0.1:9000 (console http://127.0.0.1:9001)..."
& .\minio.exe server .\data --address ":9000" --console-address ":9001"
