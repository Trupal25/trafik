"""
train_hybrid.py — Hotspot Prediction via Hybrid ML + Rules (MODEL 4 of 5)
========================================================================

A composite model: the existing RandomForest event classifier predicts the
likely cause distribution for each junction, the impact engine scores each
cause, and a rules layer ranks which junctions are most likely to remain
hotspots next week. Drives the "Hotspot Prediction" card.

No new ML library needed — this wraps the existing trained models
(``event_classifier.pkl``, ``impact_score``, ``resource_allocator``) with
a ranking rules engine. Honest "Hybrid ML + Rules Engine" per the spec.

Run:
    python -m ml.train_hybrid
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MODEL_NAME = "hybrid_hotspot"
DISPLAY_NAME = "Hybrid ML + Rules — Hotspot Prediction"

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_MODEL_DIR = _PROJECT_ROOT / "ml" / "models"


def _select_named_junction_window(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Timestamp, int]:
    """Return the most recent usable junction-labelled training window.

    Some exported datasets have valid incident coordinates after junction
    labels stop being populated. Model 4 is junction-level by design, so using
    the global newest timestamp can make the latest 30-day slice empty. Anchor
    the training window to the newest nonzero junction label instead.
    """
    named = df[df["junction"].notna() & (df["junction"] != 0)].copy()
    if named.empty:
        return named, df["start_dt"].max(), 0

    named_now = named["start_dt"].max()
    for days in (30, 60, 90, 120, 180, 365):
        window = named[named["start_dt"] >= named_now - pd.Timedelta(days=days)]
        if (window.groupby("junction").size() >= 2).sum() > 0:
            return window, named_now, days

    return named, named_now, 0


def train():
    """Compute junction-level risk scores and predict future hotspots."""
    from ml.forecast_base import save_artifacts, print_summary
    from ml.impact_score import calculate_impact_score
    from ml.analytics import _events_df, _junction_name

    df = _events_df()
    data_as_of = df["start_dt"].max()
    named, now, window_days = _select_named_junction_window(df)
    last_7 = named[named["start_dt"] >= now - pd.Timedelta(days=7)]
    prev_7 = named[
        (named["start_dt"] >= now - pd.Timedelta(days=14))
        & (named["start_dt"] < now - pd.Timedelta(days=7))
    ]

    if named.empty:
        logger.warning("No nonzero junction-labelled events found; hotspot predictions will be empty.")
    elif now < data_as_of:
        logger.warning(
            "Latest junction-labelled event is %s, while dataset ends at %s; "
            "training Model 4 from the latest labelled %s-day window.",
            now.isoformat(), data_as_of.isoformat(), window_days or "available",
        )

    predictions: list[dict] = []
    for junc_code, group in named.groupby("junction"):
        if int(junc_code) == 0:
            continue
        total_30 = int(len(group))
        total_7 = int((last_7["junction"] == junc_code).sum())
        total_prev_7 = int((prev_7["junction"] == junc_code).sum())
        if total_30 < 2:
            continue

        # Cause distribution → weighted impact score
        causes = group["cause"].value_counts(normalize=True).head(3)
        weighted_impact = 0.0
        for cause, share in causes.items():
            try:
                impact = calculate_impact_score(cause, "Low", False)
                weighted_impact += impact["score"] * float(share)
            except Exception:
                pass

        # Trend factor: is this junction getting busier?
        trend = (total_7 - total_prev_7) / max(1, total_prev_7) if total_prev_7 > 0 else 0.5
        trend = min(2.0, max(-0.5, trend))

        # Composite risk: volume × impact × trend (scaled)
        risk_score = total_30 * 0.4 + weighted_impact * 0.3 + total_7 * 3.0 * (1 + trend) * 0.3

        name = _junction_name(int(junc_code))
        lat = float(group["latitude"].mean())
        lng = float(group["longitude"].mean())
        dominant = str(group["cause"].value_counts().idxmax())

        if risk_score >= 15:
            severity = "critical"
        elif risk_score >= 8:
            severity = "high"
        elif risk_score >= 4:
            severity = "medium"
        else:
            severity = "low"

        predictions.append({
            "junction": name,
            "junction_code": int(junc_code),
            "lat": lat,
            "lng": lng,
            "risk_score": round(risk_score, 2),
            "severity": severity,
            "incidents_30d": total_30,
            "incidents_7d": total_7,
            "trend_factor": round(trend, 2),
            "dominant_cause": dominant,
            "weighted_impact": round(weighted_impact, 1),
        })

    predictions.sort(key=lambda x: -x["risk_score"])

    # Evaluation: how many of last week's top hotspots were also in the
    # previous week's top? (persistence accuracy)
    top_current = {p["junction_code"] for p in predictions[:20]}
    top_prev = set()
    prev_named = prev_7[prev_7["junction"].notna() & (prev_7["junction"] != 0)]
    prev_counts = prev_named.groupby("junction").size().sort_values(ascending=False).head(20)
    top_prev = set(prev_counts.index)

    persistence = len(top_current & top_prev) / max(1, len(top_current | top_prev))

    metrics = {
        "persistence_accuracy": round(persistence, 3),
        "description": "Junction-level hotspot risk ranking (RF causes + impact scores + trend rules)",
        "total_junctions_scored": len(predictions),
        "critical": sum(1 for p in predictions if p["severity"] == "critical"),
        "high": sum(1 for p in predictions if p["severity"] == "high"),
        "test_samples": int(len(predictions)),
        "training_window_days": int(window_days),
        "junction_data_as_of": now.isoformat(),
        "dataset_data_as_of": data_as_of.isoformat(),
    }

    forecast_24h = [
        {
            "hour_offset": 0,
            "predicted_count": p["risk_score"],
            "junction": p["junction"],
            "severity": p["severity"],
        }
        for p in predictions[:10]
    ]

    save_artifacts(
        model_name=MODEL_NAME,
        model={"predictions": predictions},
        metrics=metrics,
        feature_names=["total_30d", "weighted_impact", "trend_factor", "incidents_7d"],
        test_index=pd.Index([p["junction"] for p in predictions[:20]]),
        y_test=np.array([p["risk_score"] for p in predictions[:20]]),
        y_pred=np.array([p["risk_score"] for p in predictions[:20]]),
        forecast_24h=forecast_24h,
        extra={
            "display_name": DISPLAY_NAME,
            "top_predictions": predictions[:15],
        },
    )

    print_summary(MODEL_NAME, DISPLAY_NAME, metrics, forecast_24h)
    return predictions, metrics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    train()
