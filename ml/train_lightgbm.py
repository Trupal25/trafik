"""
train_lightgbm.py — Officer Demand Forecast (MODEL 2 of 5)
==========================================================

Predicts how many traffic officers are needed per hour, derived from
incident volume × per-cause resource allocation. Drives the "Officer
Demand Forecast" card on the Forecasting Center.

Uses LightGBM with the same feature set as the XGBoost surge model.

Run:
    python -m ml.train_lightgbm
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from ml.forecast_base import (
    prepare_train_test,
    evaluate,
    save_artifacts,
    print_summary,
    build_hourly_series,
    add_features,
    SURGE_THRESHOLD,
)
from ml.resource_allocator import allocate_resources
from ml.impact_score import calculate_impact_score

logger = logging.getLogger(__name__)

MODEL_NAME = "lightgbm_officer"
DISPLAY_NAME = "LightGBM — Officer Demand Forecast"


def _officer_demand_per_hour(events_csv: str) -> pd.DataFrame:
    """Compute officer demand (total officers recommended) per hour.

    For each event, run the resource allocator to get officers needed,
    then aggregate by hour.
    """
    df = pd.read_csv(events_csv)
    df["start_dt"] = pd.to_datetime(df["start_datetime"], errors="coerce", utc=True)
    df = df.dropna(subset=["start_dt"])
    df["hour_bucket"] = df["start_dt"].dt.floor("h")
    df["cause"] = df["event_cause"].fillna("others").str.lower()
    df["priority_label"] = df["priority"].apply(lambda p: "High" if p == 1 else "Low")

    # Compute officers per event via the resource allocator
    def _officers(row):
        try:
            impact = calculate_impact_score(
                event_cause=row["cause"],
                priority=row["priority_label"],
                requires_road_closure=bool(row.get("requires_road_closure", 0)),
            )
            plan = allocate_resources(impact["score"], row["cause"])
            return plan["officers"]
        except Exception:
            return 2  # conservative default

    df["officers_needed"] = df.apply(_officers, axis=1)
    hourly = df.groupby("hour_bucket")["officers_needed"].sum()
    return hourly.rename("incident_count")  # reuse the same column name for add_features


def train():
    """Train the LightGBM officer-demand regressor."""
    import lightgbm as lgb

    # Build officer-demand hourly series (overrides the incident-count series)
    csv_path = str(__import__("pathlib").Path(__file__).resolve().parents[1] / "data" / "processed" / "events_clean.csv")
    hourly = _officer_demand_per_hour(csv_path)

    # Convert to DataFrame with the structure add_features expects
    full_range = pd.date_range(hourly.index.min(), hourly.index.max(), freq="h")
    hourly = hourly.reindex(full_range, fill_value=0)
    hourly.index.name = "hour_bucket"
    df = hourly.to_frame()

    # Clip to longest continuous segment (same logic as forecast_base)
    breaks = df.index.to_series().diff()
    segment_starts = [df.index[0]]
    segment_ends: list = []
    gap_threshold = pd.Timedelta(days=7)
    for i, b in breaks.items():
        if b > gap_threshold:
            segment_ends.append(i - b)
            segment_starts.append(i)
    segment_ends.append(df.index[-1])
    longest_idx = int(np.argmax([e - s for s, e in zip(segment_starts, segment_ends)]))
    df = df.loc[segment_starts[longest_idx]:segment_ends[longest_idx]]

    featured = add_features(df)
    target_col = "incident_count"  # actually officer demand
    feature_cols = [c for c in featured.columns if c != target_col]

    split_idx = int(len(featured) * 0.8)
    train = featured.iloc[:split_idx]
    test = featured.iloc[split_idx:]

    X_train, y_train = train[feature_cols], train[target_col].values
    X_test, y_test = test[feature_cols], test[target_col].values

    model = lgb.LGBMRegressor(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        num_leaves=31,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        callbacks=[lgb.early_stopping(30, verbose=False)],
    )

    y_pred = np.clip(model.predict(X_test), 0, None)

    # Override surge threshold for officer demand (higher since officers scale up)
    from ml.forecast_base import evaluate as _eval
    metrics = _eval(y_test, y_pred)
    metrics["surge_threshold"] = 15  # 15+ officers/hour = surge
    metrics["description"] = "Officer demand per hour (incident_count × resource allocation)"

    importance = dict(zip(feature_cols, model.feature_importances_.tolist()))
    importance = dict(sorted(importance.items(), key=lambda x: -x[1]))

    # 24h forecast
    forecast_24h = []
    current = X_test.tail(1).copy()
    name_to_idx = {n: i for i, n in enumerate(feature_cols)}
    for h in range(1, 25):
        pred = float(np.clip(model.predict(current)[0], 0, None))
        forecast_24h.append({
            "hour_offset": h,
            "predicted_count": round(pred, 1),
            "surge_probability": round(1.0 / (1.0 + np.exp(-0.15 * (pred - 15))), 2),
        })
        current = current.copy()
        if "lag_1h" in name_to_idx:
            current.loc[:, "lag_1h"] = pred
        if "hour_of_day" in name_to_idx:
            new_hour = (int(current["hour_of_day"].iloc[0]) + 1) % 24
            current.loc[:, "hour_of_day"] = new_hour

    save_artifacts(
        model_name=MODEL_NAME,
        model=model,
        metrics=metrics,
        feature_names=feature_cols,
        test_index=test.index,
        y_test=y_test,
        y_pred=y_pred,
        forecast_24h=forecast_24h,
        feature_importance=importance,
        extra={"display_name": DISPLAY_NAME},
    )

    print_summary(MODEL_NAME, DISPLAY_NAME, metrics, forecast_24h)
    return model, metrics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    train()
