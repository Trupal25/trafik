"""
train_xgboost.py — Traffic Surge Probability Forecaster (MODEL 1 of 5)
=====================================================================

Predicts hourly incident volume using gradient-boosted trees. The output
drives the "Traffic Surge Probability" card on the Forecasting Center.

Features: temporal (hour/day/month/weekend/peak), lag (1h/24h/168h), and
rolling statistics (3h/24h/168h means + 24h std).

Run:
    python -m ml.train_xgboost
"""

from __future__ import annotations

import logging
import sys

import numpy as np

from ml.forecast_base import (
    SURGE_THRESHOLD,
    prepare_train_test,
    evaluate,
    save_artifacts,
    print_summary,
)

logger = logging.getLogger(__name__)

MODEL_NAME = "xgboost_surge"
DISPLAY_NAME = "XGBoost — Traffic Surge Probability"


def train():
    """Train the XGBoost hourly volume regressor and save artifacts."""
    import xgboost as xgb

    X_train, X_test, y_train, y_test, feature_names, test_index = prepare_train_test(
        test_frac=0.2
    )

    model = xgb.XGBRegressor(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        min_child_weight=3,
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=30,
    )
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred = model.predict(X_test)
    y_pred = np.clip(y_pred, 0, None)
    metrics = evaluate(y_test, y_pred)

    # Feature importance
    importance = dict(zip(feature_names, model.feature_importances_.tolist()))
    importance = dict(sorted(importance.items(), key=lambda x: -x[1]))

    # Build a 24h forecast using the last available row as the seed.
    forecast_24h = _build_24h_forecast(model, X_test, feature_names)

    save_artifacts(
        model_name=MODEL_NAME,
        model=model,
        metrics=metrics,
        feature_names=feature_names,
        test_index=test_index,
        y_test=y_test,
        y_pred=y_pred,
        forecast_24h=forecast_24h,
        feature_importance=importance,
        extra={"display_name": DISPLAY_NAME, "n_estimators": model.best_iteration or 400},
    )

    print_summary(MODEL_NAME, DISPLAY_NAME, metrics, forecast_24h)
    _print_top_features(importance)
    return model, metrics


def _build_24h_forecast(model, X_test, feature_names) -> list[dict]:
    """Recursive 24h-ahead forecast from the last test row.

    Uses the model's own predictions as lag inputs for subsequent hours.
    Returns a list of {hour_offset, predicted_count, surge_probability}.
    """
    import pandas as pd

    # Start from the last known row
    current = X_test[-1].copy().reshape(1, -1)
    predictions: list[dict] = []

    # Indices of lag features in the feature array
    name_to_idx = {n: i for i, n in enumerate(feature_names)}

    for h in range(1, 25):
        pred = float(np.clip(model.predict(current)[0], 0, None))
        prob = _surge_probability(pred)
        peak = h in {17, 18, 19, 20, 21} or (h - 24) in {17, 18, 19, 20, 21}
        predictions.append({
            "hour_offset": h,
            "predicted_count": round(pred, 1),
            "surge_probability": round(prob, 2),
            "is_peak": bool(peak),
        })

        # Roll forward lag features for the next iteration
        current = current.copy()
        # lag_1h → current prediction
        if "lag_1h" in name_to_idx:
            current[0, name_to_idx["lag_1h"]] = pred
        # Advance temporal features by 1 hour
        if "hour_of_day" in name_to_idx:
            new_hour = (int(current[0, name_to_idx["hour_of_day"]]) + 1) % 24
            current[0, name_to_idx["hour_of_day"]] = new_hour
            if "is_peak_morning" in name_to_idx:
                current[0, name_to_idx["is_peak_morning"]] = 1 if new_hour in [7, 8, 9, 10] else 0
            if "is_peak_evening" in name_to_idx:
                current[0, name_to_idx["is_peak_evening"]] = 1 if new_hour in [17, 18, 19, 20, 21] else 0
            if "is_overnight" in name_to_idx:
                current[0, name_to_idx["is_overnight"]] = 1 if new_hour in [22, 23, 0, 1, 2, 3, 4] else 0

    return predictions


def _surge_probability(predicted_count: float) -> float:
    """Convert a predicted count to a surge probability using a soft threshold."""
    # Sigmoid centered at the surge threshold
    k = 1.5  # steepness
    return 1.0 / (1.0 + np.exp(-k * (predicted_count - SURGE_THRESHOLD)))


def _print_top_features(importance: dict) -> None:
    print("  Top Features by Importance:")
    for name, imp in list(importance.items())[:8]:
        bar = "█" * int(imp * 100)
        print(f"    {name:<22s} {imp:.3f}  {bar}")
    print()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    train()
