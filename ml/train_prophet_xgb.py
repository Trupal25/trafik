"""
train_prophet_xgb.py — Festival / Seasonal Traffic Risk (MODEL 3 of 5)
=====================================================================

Two-layer model: Prophet captures trend + weekly/yearly seasonality on
daily incident counts; XGBoost learns the residuals against calendar
features. Drives the "Festival Traffic Risk" card.

Prophet handles the "seasonal baseline" and XGBoost handles the deviation.
Together they forecast daily incident volume for the next 7 days.

Run:
    python -m ml.train_prophet_xgb
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MODEL_NAME = "prophet_xgb_seasonal"
DISPLAY_NAME = "Prophet + XGBoost — Festival Traffic Risk"

_PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _build_daily_series() -> pd.DataFrame:
    """Aggregate events to daily counts with the Prophet-expected columns."""
    csv_path = _PROJECT_ROOT / "data" / "processed" / "events_clean.csv"
    df = pd.read_csv(csv_path)
    df["ds"] = pd.to_datetime(df["start_datetime"], errors="coerce").dt.tz_convert(None).dt.normalize()
    df = df.dropna(subset=["ds"])
    daily = df.groupby("ds").size().reset_index()
    daily.columns = ["ds", "y"]
    return daily


def train():
    """Fit Prophet on daily counts, then XGBoost on the residuals."""
    logging.getLogger("prophet.plot").setLevel(logging.CRITICAL)
    logging.getLogger("matplotlib.font_manager").setLevel(logging.WARNING)

    from prophet import Prophet
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    from ml.forecast_base import save_artifacts, print_summary, _MODEL_DIR

    daily = _build_daily_series()
    split_idx = int(len(daily) * 0.8)
    train_df, test_df = daily.iloc[:split_idx], daily.iloc[split_idx:]

    # --- Layer 1: Prophet ---
    prophet = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.05,
        interval_width=0.8,
    )
    prophet.fit(train_df)

    # Predict on both train and test to get residuals
    forecast_train = prophet.predict(train_df[["ds"]])
    forecast_test = prophet.predict(test_df[["ds"]])

    residual_train = train_df["y"].values - forecast_train["yhat"].values
    residual_test = test_df["y"].values - forecast_test["yhat"].values

    # --- Layer 2: XGBoost on residuals ---
    def _features(dates: pd.Series) -> pd.DataFrame:
        return pd.DataFrame({
            "day_of_week": dates.dt.dayofweek,
            "month": dates.dt.month,
            "day_of_month": dates.dt.day,
            "is_weekend": (dates.dt.dayofweek >= 5).astype(int),
            "prophet_yhat": prophet.predict(pd.DataFrame({"ds": dates}))["yhat"].values,
        })

    X_train = _features(train_df["ds"]).values
    X_test = _features(test_df["ds"]).values
    feature_names = ["day_of_week", "month", "day_of_month", "is_weekend", "prophet_yhat"]

    xgb_model = xgb.XGBRegressor(
        n_estimators=200, max_depth=4, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1,
    )
    xgb_model.fit(X_train, residual_train)

    # Combine: Prophet + XGBoost residual correction
    y_pred = forecast_test["yhat"].values + xgb_model.predict(X_test)
    y_pred = np.clip(y_pred, 0, None)
    y_test = test_df["y"].values

    mae = float(mean_absolute_error(y_test, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    ss_res = float(np.sum((y_test - y_pred) ** 2))
    ss_tot = float(np.sum((y_test - y_test.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    metrics = {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": round(r2, 3),
        "description": "Daily incident volume (Prophet baseline + XGBoost residual)",
        "test_samples": int(len(y_test)),
    }

    # 7-day forecast
    future = prophet.make_future_dataframe(periods=7)
    prophet_future = prophet.predict(future).tail(7)
    residual_input = _features(prophet_future["ds"]).values
    residual_pred = xgb_model.predict(residual_input)
    final_forecast = np.clip(prophet_future["yhat"].values + residual_pred, 0, None)

    forecast_7d = [
        {
            "date": row["ds"].strftime("%Y-%m-%d"),
            "day": row["ds"].strftime("%a"),
            "predicted_count": round(float(final_forecast[i]), 1),
            "prophet_baseline": round(float(row["yhat"]), 1),
            "xgb_correction": round(float(residual_pred[i]), 1),
        }
        for i, (_, row) in enumerate(prophet_future.iterrows())
    ]

    importance = dict(zip(feature_names, xgb_model.feature_importances_.tolist()))

    save_artifacts(
        model_name=MODEL_NAME,
        model={"prophet": prophet, "xgb": xgb_model},
        metrics=metrics,
        feature_names=feature_names,
        test_index=test_df["ds"],
        y_test=y_test,
        y_pred=y_pred,
        forecast_24h=forecast_7d,  # 7-day forecast stored in same field
        feature_importance=importance,
        extra={"display_name": DISPLAY_NAME, "forecast_type": "7-day daily"},
    )

    print_summary(MODEL_NAME, DISPLAY_NAME, metrics, forecast_7d)
    return (prophet, xgb_model), metrics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    train()
