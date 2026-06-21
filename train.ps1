# UrbanPulse AI — ML Training Scripts (Windows PowerShell)
# Usage:
#   .\train.ps1 install       Install ML dependencies
#   .\train.ps1 xgboost       Train model 1
#   .\train.ps1 lightgbm      Train model 2
#   .\train.ps1 prophet       Train model 3
#   .\train.ps1 hybrid        Train model 4
#   .\train.ps1 lstm          Train model 5
#   .\train.ps1 all           Train all 5
#   .\train.ps1 tree          Train models 1-4 (fast, no TF)
#   .\train.ps1 status        Show artifact status
#   .\train.ps1 clean         Remove trained artifacts

param([string]$action = "help")

$ErrorActionPreference = "Stop"
$PYTHON = "python"

switch ($action) {
    "install" {
        Write-Host "`n  Installing ML dependencies..." -ForegroundColor Cyan
        & $PYTHON -m pip install --upgrade xgboost lightgbm prophet --quiet
        Write-Host "  Done.`n" -ForegroundColor Green
    }
    "xgboost" {
        Write-Host "`n  -- MODEL 1: XGBoost -- Surge Forecaster --" -ForegroundColor Yellow
        & $PYTHON -m ml.train_xgboost
        Write-Host "`n  [DONE] Model 1 trained" -ForegroundColor Green
    }
    "lightgbm" {
        Write-Host "`n  -- MODEL 2: LightGBM -- Officer Demand --" -ForegroundColor Yellow
        & $PYTHON -m ml.train_lightgbm
        Write-Host "`n  [DONE] Model 2 trained" -ForegroundColor Green
    }
    "prophet" {
        Write-Host "`n  -- MODEL 3: Prophet + XGBoost -- Seasonal --" -ForegroundColor Yellow
        & $PYTHON -m ml.train_prophet_xgb
        Write-Host "`n  [DONE] Model 3 trained" -ForegroundColor Green
    }
    "hybrid" {
        Write-Host "`n  -- MODEL 4: Hybrid -- Hotspot Prediction --" -ForegroundColor Yellow
        & $PYTHON -m ml.train_hybrid
        Write-Host "`n  [DONE] Model 4 trained" -ForegroundColor Green
    }
    "lstm" {
        Write-Host "`n  -- MODEL 5: LSTM -- Congestion Index --" -ForegroundColor Yellow
        & $PYTHON -m ml.train_lstm
        Write-Host "`n  [DONE] Model 5 trained" -ForegroundColor Green
    }
    "all" {
        & .\train.ps1 xgboost
        & .\train.ps1 lightgbm
        & .\train.ps1 prophet
        & .\train.ps1 hybrid
        & .\train.ps1 lstm
        Write-Host "`n  ===== All 5 models trained =====" -ForegroundColor Cyan
        & .\train.ps1 status
    }
    "tree" {
        & .\train.ps1 xgboost
        & .\train.ps1 lightgbm
        & .\train.ps1 prophet
        & .\train.ps1 hybrid
        Write-Host "`n  Tree models done. LSTM skipped (needs TensorFlow)." -ForegroundColor Cyan
    }
    "status" {
        Write-Host "`n  UrbanPulse AI -- Model Status" -ForegroundColor Cyan
        Write-Host "  -----------------------------" -ForegroundColor Cyan
        @("xgboost_surge", "lightgbm_officer", "prophet_xgb_seasonal", "hybrid_hotspot", "lstm_congestion") | ForEach-Object {
            if (Test-Path "ml\models\${_}_forecast.json") { Write-Host "  [OK] $_" -ForegroundColor Green }
            else { Write-Host "  [--] $_ (not trained)" -ForegroundColor DarkGray }
        }
        Write-Host ""
    }
    "clean" {
        Write-Host "  Cleaning ml/models/..." -ForegroundColor Yellow
        @("xgboost_surge", "lightgbm_officer", "prophet_xgb_seasonal", "hybrid_hotspot", "lstm_congestion") | ForEach-Object {
            $dir = "ml\models\$_"
            if (Test-Path $dir) { Remove-Item -Recurse -Force $dir; Write-Host "    Removed $_" }
        }
        Write-Host "  Done.`n" -ForegroundColor Green
    }
    default {
        Write-Host "`n  UrbanPulse AI -- ML Training" -ForegroundColor Cyan
        Write-Host "  ============================" -ForegroundColor Cyan
        Write-Host "  .\train.ps1 install      Install ML dependencies"
        Write-Host "  .\train.ps1 xgboost      MODEL 1 -- Surge forecaster"
        Write-Host "  .\train.ps1 lightgbm     MODEL 2 -- Officer demand"
        Write-Host "  .\train.ps1 prophet      MODEL 3 -- Seasonal risk"
        Write-Host "  .\train.ps1 hybrid       MODEL 4 -- Hotspot prediction"
        Write-Host "  .\train.ps1 lstm         MODEL 5 -- Congestion index"
        Write-Host "  .\train.ps1 all          Train all 5"
        Write-Host "  .\train.ps1 tree         Train 1-4 (fast, no TF)"
        Write-Host "  .\train.ps1 status       Show artifact status"
        Write-Host "  .\train.ps1 clean        Delete artifacts"
        Write-Host ""
    }
}
