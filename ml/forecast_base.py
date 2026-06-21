"""
forecast_base.py — Shared data prep + evaluation for all 5 forecast models.

Builds an hourly incident time series from events_clean.csv, engineers temporal
+ lag + rolling features, provides a chronological train/test split, and a
unified evaluation + artifact-save pipeline so every model speaks the same
vocabulary.

All 5 models (XGBoost, LightGBM, Prophet+XGBoost, Hybrid, LSTM) import from
here so the data shape is identical cross-model.
"""

from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_MODEL_DIR = _PROJECT_ROOT / "ml" / "models"
_MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Surge threshold: an hour with >= this many incidents is a "surge".
# Calibrated from the data's 75th percentile (~3 incidents/hour).
SURGE_THRESHOLD = 3


# ---------------------------------------------------------------------------
# Data loading + feature engineering
# ---------------------------------------------------------------------------


def build_hourly_series() -> pd.DataFrame:
    """Load events, aggregate to hourly incident counts, fill gaps with zeros.

    Returns a DataFrame indexed by hour with a single ``incident_count`` column.
    Only the longest continuous segment is kept so lag features stay clean.
    """
    csv_path = _PROJECT_ROOT / "data" / "processed" / "events_clean.csv"
    if not csv_path.is_file():
        raise FileNotFoundError(f"events_clean.csv not found at {csv_path}")

    df = pd.read_csv(csv_path)
    df["start_dt"] = pd.to_datetime(df["start_datetime"], errors="coerce", utc=True)
    df = df.dropna(subset=["start_dt"])

    df["hour_bucket"] = df["start_dt"].dt.floor("h")
    hourly = df.groupby("hour_bucket").size().rename("incident_count")

    # Build a complete hourly index; zero-fill hours with no incidents.
    full_range = pd.date_range(hourly.index.min(), hourly.index.max(), freq="h")
    hourly = hourly.reindex(full_range, fill_value=0)
    hourly.index.name = "hour_bucket"

    # Find the longest continuous segment (no gap > 7 days) so lag features
    # like lag_168h (weekly) are meaningful.
    gap_threshold = pd.Timedelta(days=7)
    breaks = hourly.index.to_series().diff()
    segment_starts = [hourly.index[0]]
    segment_ends: list = []
    for i, b in breaks.items():
        if b > gap_threshold:
            segment_ends.append(i - b)  # end of previous segment
            segment_starts.append(i)
    segment_ends.append(hourly.index[-1])

    longest_idx = int(np.argmax([
        (e - s) for s, e in zip(segment_starts, segment_ends)
    ]))
    seg_start = segment_starts[longest_idx]
    seg_end = segment_ends[longest_idx]
    hourly = hourly.loc[seg_start:seg_end]

    logger.info(
        "Hourly series: %d hours from %s to %s (longest continuous segment)",
        len(hourly), seg_start.date(), seg_end.date(),
    )
    return hourly.to_frame()


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add temporal, lag, and rolling features to the hourly series."""
    out = df.copy()
    idx = out.index

    # Temporal calendar features
    out["hour_of_day"] = idx.hour
    out["day_of_week"] = idx.dayofweek
    out["month"] = idx.month
    out["is_weekend"] = (idx.dayofweek >= 5).astype(int)
    out["is_peak_morning"] = idx.hour.isin([7, 8, 9, 10]).astype(int)
    out["is_peak_evening"] = idx.hour.isin([17, 18, 19, 20, 21]).astype(int)
    out["is_overnight"] = idx.hour.isin([22, 23, 0, 1, 2, 3, 4]).astype(int)

    # Lag features — what happened 1h, 24h (yesterday), 168h (last week) ago
    out["lag_1h"] = out["incident_count"].shift(1)
    out["lag_24h"] = out["incident_count"].shift(24)
    out["lag_168h"] = out["incident_count"].shift(168)

    # Rolling statistics
    out["rolling_3h_mean"] = out["incident_count"].shift(1).rolling(3).mean()
    out["rolling_24h_mean"] = out["incident_count"].shift(1).rolling(24).mean()
    out["rolling_24h_std"] = out["incident_count"].shift(1).rolling(24).std()
    out["rolling_168h_mean"] = out["incident_count"].shift(1).rolling(168).mean()

    # Daily aggregate features (how busy has today been so far)
    out["day_cumulative"] = out.groupby(idx.date)["incident_count"].transform(
        lambda s: s.shift(1).expanding().mean()
    )

    # Drop rows where lag features aren't available yet (start of series).
    out = out.dropna()
    return out


def prepare_train_test(test_frac: float = 0.2):
    """Build features, split chronologically, return numpy arrays + names."""
    series = build_hourly_series()
    featured = add_features(series)

    target_col = "incident_count"
    feature_cols = [c for c in featured.columns if c != target_col]

    split_idx = int(len(featured) * (1 - test_frac))
    train = featured.iloc[:split_idx]
    test = featured.iloc[split_idx:]

    X_train = train[feature_cols].values
    y_train = train[target_col].values
    X_test = test[feature_cols].values
    y_test = test[target_col].values

    logger.info(
        "Train: %d rows (%s to %s) · Test: %d rows (%s to %s)",
        len(train), train.index[0].date(), train.index[-1].date(),
        len(test), test.index[0].date(), test.index[-1].date(),
    )
    return X_train, X_test, y_train, y_test, feature_cols, test.index


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    """Regression metrics + surge-classification metrics."""
    y_pred_clipped = np.clip(y_pred, 0, None)

    mae = float(np.mean(np.abs(y_true - y_pred_clipped)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred_clipped) ** 2)))
    ss_res = float(np.sum((y_true - y_pred_clipped) ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    # Surge classification: did we predict the surge correctly?
    surge_true = (y_true >= SURGE_THRESHOLD).astype(int)
    surge_pred = (y_pred_clipped >= SURGE_THRESHOLD).astype(int)

    tp = int(((surge_true == 1) & (surge_pred == 1)).sum())
    fp = int(((surge_true == 0) & (surge_pred == 1)).sum())
    fn = int(((surge_true == 1) & (surge_pred == 0)).sum())

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy = float((surge_true == surge_pred).mean())

    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "r2": round(r2, 3),
        "surge_threshold": SURGE_THRESHOLD,
        "surge_precision": round(precision, 3),
        "surge_recall": round(recall, 3),
        "surge_f1": round(f1, 3),
        "surge_accuracy": round(accuracy, 3),
        "test_samples": int(len(y_true)),
        "surge_rate": round(float(surge_true.mean()), 3),
    }


# ---------------------------------------------------------------------------
# Artifact saving (shared by all 5 models)
# ---------------------------------------------------------------------------


def save_artifacts(
    model_name: str,
    model: Any,
    metrics: dict[str, Any],
    feature_names: list[str],
    test_index: pd.Index,
    y_test: np.ndarray,
    y_pred: np.ndarray,
    forecast_24h: list[dict[str, Any]] | None = None,
    feature_importance: dict[str, float] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Persist model + metrics + 24h forecast for the /forecast endpoint."""
    # Model pickle
    pkl_path = _MODEL_DIR / f"{model_name}.pkl"
    with open(pkl_path, "wb") as f:
        pickle.dump({"model": model, "feature_names": feature_names}, f)

    # Metrics JSON
    metrics_path = _MODEL_DIR / f"{model_name}_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    # Forecast JSON (what the /forecast endpoint serves)
    forecast_path = _MODEL_DIR / f"{model_name}_forecast.json"
    forecast_payload: dict[str, Any] = {
        "model_name": model_name,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "test_predictions": [
            {
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "actual": float(y_test[i]),
                "predicted": round(float(max(0, y_pred[i])), 2),
            }
            for i, ts in enumerate(test_index)
        ][-72:],  # last 72 hours of test for plotting
        "forecast_24h": forecast_24h or [],
        "feature_importance": feature_importance or {},
        "extra": extra or {},
    }
    with open(forecast_path, "w", encoding="utf-8") as f:
        json.dump(forecast_payload, f, indent=2, default=str)

    logger.info("Saved %s artifacts to %s", model_name, _MODEL_DIR)


def print_summary(model_name: str, display_name: str, metrics: dict, forecast_24h: list) -> None:
    """Print a formatted training summary to stdout."""
    print("\n" + "=" * 64)
    print(f"  {display_name} — Training Complete")
    print("=" * 64)
    print(f"  Model file: ml/models/{model_name}.pkl")
    print(f"  Metrics:    ml/models/{model_name}_metrics.json")
    print(f"  Forecast:   ml/models/{model_name}_forecast.json")
    print("-" * 64)
    print("  Regression Metrics:")
    print(f"    MAE:  {metrics.get('mae', 'N/A')}")
    print(f"    RMSE: {metrics.get('rmse', 'N/A')}")
    print(f"    R²:   {metrics.get('r2', 'N/A')}")
    if "surge_threshold" in metrics:
        print()
        print(f"  Surge Classification (threshold ≥ {metrics['surge_threshold']} incidents):")
        print(f"    Precision: {metrics.get('surge_precision', 0):.3f}")
        print(f"    Recall:    {metrics.get('surge_recall', 0):.3f}")
        print(f"    F1:        {metrics.get('surge_f1', 0):.3f}")
        print(f"    Accuracy:  {metrics.get('surge_accuracy', 0):.3f}")
        print(f"    Base rate: {metrics.get('surge_rate', 0):.1%} of hours are surges")
    if "description" in metrics:
        print(f"\n  Description: {metrics['description']}")
    print()
    if forecast_24h:
        if "hour_offset" in forecast_24h[0]:
            print("  24-Hour Forecast (next day):")
            for h in forecast_24h[:12]:
                bar = "█" * int(h["predicted_count"] * 3)
                print(f"    +{h['hour_offset']:2d}h  {h['predicted_count']:5.1f}  {bar}")
            if len(forecast_24h) > 12:
                print(f"    ... +{forecast_24h[-1]['hour_offset']}h  (see forecast JSON)")
        elif "date" in forecast_24h[0]:
            print("  Daily Forecast:")
            for day in forecast_24h:
                bar = "█" * min(60, int(day["predicted_count"] / 5))
                label = f"{day.get('day', '')} {day['date']}".strip()
                print(f"    {label:<14s} {day['predicted_count']:6.1f}  {bar}")
        else:
            print("  Forecast saved to JSON.")
    print("=" * 64 + "\n")
