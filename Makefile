# UrbanPulse AI — ML Model Training Makefile
# ===========================================
#
# Usage:
#   make train-all          Train all 5 models sequentially
#   make train-xgboost      Train model 1 only
#   make train-lightgbm     Train model 2 only
#   make train-prophet      Train model 3 only
#   make train-hybrid       Train model 4 only
#   make train-lstm         Train model 5 only
#   make install-ml         Install ML dependencies only
#   make install            Install all dependencies (API + ML)
#   make clean-ml           Remove all trained artifacts
#   make status             Show artifact status
#   make help               Show this help
#
# Models are independent — train any in any order.
# Each model writes to ml/models/<name>/*.pkl and ml/models/<name>/metrics.json

PYTHON   ?= python
ML_DIR   := ml
MODEL_DIR := ml/models
EVENTS   := data/processed/events_clean.csv
MPLCONFIGDIR ?= /tmp/astram-matplotlib
export MPLCONFIGDIR

# ──────────────────────────────────────────────
# Phony targets
# ──────────────────────────────────────────────
.PHONY: help install install-ml clean-ml status \
        train-all train-xgboost train-lightgbm train-prophet train-hybrid train-lstm

help:
	@echo ""
	@echo "  UrbanPulse AI — ML Training"
	@echo "  ==========================="
	@echo ""
	@echo "  make install-ml      Install ML dependencies"
	@echo "  make install         Install everything (API + ML)"
	@echo ""
	@echo "  Individual models:"
	@echo "    make train-xgboost     MODEL 1 — Hourly surge forecaster"
	@echo "    make train-lightgbm    MODEL 2 — Officer demand forecast"
	@echo "    make train-prophet     MODEL 3 — Festival/seasonal risk"
	@echo "    make train-hybrid      MODEL 4 — Hotspot prediction"
	@echo "    make train-lstm        MODEL 5 — Congestion index (needs TF)"
	@echo ""
	@echo "  Batch targets:"
	@echo "    make train-all         Train all 5 sequentially"
	@echo "    make train-tree        Train all tree models (1-4, fast)"
	@echo ""
	@echo "  Utility:"
	@echo "    make clean-ml          Delete trained artifacts"
	@echo "    make status            Show which models have been trained"
	@echo ""

# ──────────────────────────────────────────────
# Dependency installation
# ──────────────────────────────────────────────
install-ml:
	$(PYTHON) -m pip install --upgrade xgboost lightgbm prophet --quiet

install:
	$(PYTHON) -m pip install -r requirements.txt --quiet

# ──────────────────────────────────────────────
# Individual model training targets
# ──────────────────────────────────────────────

# MODEL 1: XGBoost — Traffic Surge Probability
train-xgboost: | $(MODEL_DIR)/xgboost_surge
	@echo "  [DONE] Model 1 — XGBoost surge forecaster trained"

$(MODEL_DIR)/xgboost_surge:
	@echo ""
	@echo "  ── MODEL 1: XGBoost — Traffic Surge Probability ──"
	@echo ""
	@mkdir -p "$(MPLCONFIGDIR)"
	$(PYTHON) -m ml.train_xgboost

# MODEL 2: LightGBM — Officer Demand Forecast
train-lightgbm: | $(MODEL_DIR)/lightgbm_officer
	@echo "  [DONE] Model 2 — LightGBM officer demand trained"

$(MODEL_DIR)/lightgbm_officer:
	@echo ""
	@echo "  ── MODEL 2: LightGBM — Officer Demand Forecast ──"
	@echo ""
	@mkdir -p "$(MPLCONFIGDIR)"
	$(PYTHON) -m ml.train_lightgbm

# MODEL 3: Prophet + XGBoost — Festival/Seasonal Traffic Risk
train-prophet: | $(MODEL_DIR)/prophet_xgb_seasonal
	@echo "  [DONE] Model 3 — Prophet + XGBoost seasonal risk trained"

$(MODEL_DIR)/prophet_xgb_seasonal:
	@echo ""
	@echo "  ── MODEL 3: Prophet + XGBoost — Festival/Seasonal Risk ──"
	@echo ""
	@mkdir -p "$(MPLCONFIGDIR)"
	$(PYTHON) -m ml.train_prophet_xgb

# MODEL 4: Hybrid ML + Rules — Hotspot Prediction
train-hybrid: | $(MODEL_DIR)/hybrid_hotspot
	@echo "  [DONE] Model 4 — Hybrid hotspot prediction trained"

$(MODEL_DIR)/hybrid_hotspot:
	@echo ""
	@echo "  ── MODEL 4: Hybrid ML + Rules — Hotspot Prediction ──"
	@echo ""
	@mkdir -p "$(MPLCONFIGDIR)"
	$(PYTHON) -m ml.train_hybrid

# MODEL 5: LSTM — Congestion Index Sequence Forecast
train-lstm: | $(MODEL_DIR)/lstm_congestion
	@echo "  [DONE] Model 5 — LSTM congestion index trained"

$(MODEL_DIR)/lstm_congestion:
	@echo ""
	@echo "  ── MODEL 5: LSTM — Congestion Index Sequence Forecast ──"
	@echo ""
	@mkdir -p "$(MPLCONFIGDIR)"
	$(PYTHON) -m ml.train_lstm

# ──────────────────────────────────────────────
# Batch targets
# ──────────────────────────────────────────────

# All 5 models sequentially (order: fast tree models first, LSTM last)
train-all: train-xgboost train-lightgbm train-prophet train-hybrid train-lstm
	@echo ""
	@echo "  ══════════════════════════════════════════"
	@echo "  All 5 models trained. Artifacts in ml/models/"
	@echo "  ══════════════════════════════════════════"
	@echo ""
	$(MAKE) status

# Tree models only (1-4, skips LSTM which needs TensorFlow — fast)
train-tree: train-xgboost train-lightgbm train-prophet train-hybrid
	@echo ""
	@echo "  All tree-based models trained. LSTM skipped (run make train-lstm to include it)."

# ──────────────────────────────────────────────
# Utility targets
# ──────────────────────────────────────────────
clean-ml:
	@echo "  Cleaning ml/models/ ..."
	@rm -rf $(MODEL_DIR)/xgboost_surge
	@rm -rf $(MODEL_DIR)/lightgbm_officer
	@rm -rf $(MODEL_DIR)/prophet_xgb_seasonal
	@rm -rf $(MODEL_DIR)/hybrid_hotspot
	@rm -rf $(MODEL_DIR)/lstm_congestion
	@echo "  Done."

status:
	@echo ""
	@echo "  UrbanPulse AI — Model Artifact Status"
	@echo "  ─────────────────────────────────────"
	@for model in xgboost_surge lightgbm_officer prophet_xgb_seasonal hybrid_hotspot lstm_congestion; do \
		if [ -f "$(MODEL_DIR)/$${model}_forecast.json" ]; then \
			echo "  [OK] $$model — trained"; \
		else \
			echo "  [--] $$model — not trained"; \
		fi; \
	done
	@echo ""

# Ensure the model directory exists before training
$(MODEL_DIR):
	@mkdir -p $(MODEL_DIR)
