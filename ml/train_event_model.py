"""
ASTraM — Event Cause Classifier
================================
Trains a Random Forest model to predict the cause of a traffic event
(e.g. accident, vehicle_breakdown, pot_holes …) from spatial, temporal,
and categorical features extracted from the cleaned event data.

Usage (from the ``astram/`` directory)::

    python -m ml.train_event_model

Outputs (under ``$MODEL_DIR`` — default ``ml/models/``)::

    event_classifier.pkl    — trained RandomForestClassifier (joblib)
    target_encoder.pkl      — LabelEncoder for event_cause target
    feature_names.json      — ordered list of feature column names
    training_metrics.json   — accuracy, weighted_f1, per-class F1
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Walk up to the astram/ project root so .env is found regardless of cwd
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

DATA_DIR: Path = _PROJECT_ROOT / os.getenv("DATA_DIR", "./data")
MODEL_DIR: Path = _PROJECT_ROOT / os.getenv("MODEL_DIR", "./ml/models")

CLEAN_CSV: Path = DATA_DIR / "processed" / "events_clean.csv"
LABEL_ENCODERS_PATH: Path = DATA_DIR / "processed" / "label_encoders.json"

FEATURE_COLS: List[str] = [
    "latitude",
    "longitude",
    "hour",
    "day_of_week",
    "month",
    "zone",
    "junction",
    "police_station",
    "priority",
]

TARGET_COL: str = "event_cause"

RANDOM_STATE: int = 42

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level caches for the prediction function
# ---------------------------------------------------------------------------

_model: Optional[RandomForestClassifier] = None
_target_encoder: Optional[LabelEncoder] = None
_feature_names: Optional[List[str]] = None
_label_encoders: Optional[Dict[str, Dict[str, int]]] = None

# Hard-coded priority mapping (no entry in label_encoders.json)
_PRIORITY_MAP: Dict[str, int] = {
    "unknown": 0,
    "high": 2,
    "low": 1,
}


# ---------------------------------------------------------------------------
# Training helpers
# ---------------------------------------------------------------------------


def load_data() -> pd.DataFrame:
    """Load the cleaned events CSV and validate required columns."""
    log.info("Loading cleaned data from %s", CLEAN_CSV)
    df = pd.read_csv(CLEAN_CSV)
    log.info("Loaded %d rows × %d columns", *df.shape)

    missing = set(FEATURE_COLS + [TARGET_COL]) - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in cleaned CSV: {missing}")

    return df


def prepare_features_target(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series, LabelEncoder]:
    """
    Build the feature matrix ``X`` and encoded target vector ``y``.

    * Drops rows where any feature or target is NaN.
    * Label-encodes the string ``event_cause`` column into integer codes.

    Returns
    -------
    X : pd.DataFrame
        Feature matrix (numeric only).
    y : pd.Series
        Integer-encoded target.
    le : LabelEncoder
        Fitted encoder mapping class-index ↔ cause string.
    """
    subset = df[FEATURE_COLS + [TARGET_COL]].copy()
    n_before = len(subset)
    subset.dropna(inplace=True)
    n_after = len(subset)
    if n_before != n_after:
        log.warning(
            "Dropped %d rows with NaN values (%d → %d)",
            n_before - n_after,
            n_before,
            n_after,
        )

    le = LabelEncoder()
    y = pd.Series(le.fit_transform(subset[TARGET_COL]), index=subset.index)
    X = subset[FEATURE_COLS].reset_index(drop=True)
    y = y.reset_index(drop=True)

    log.info("Features: %s", FEATURE_COLS)
    log.info("Target classes (%d): %s", len(le.classes_), list(le.classes_))

    return X, y, le


def train_model(
    X_train: pd.DataFrame, y_train: pd.Series
) -> RandomForestClassifier:
    """Fit a Random Forest classifier."""
    log.info(
        "Training RandomForestClassifier on %d samples …", len(X_train)
    )
    clf = RandomForestClassifier(
        n_estimators=200,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    log.info("Training complete.")
    return clf


def evaluate_model(
    clf: RandomForestClassifier,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    le: LabelEncoder,
) -> Dict[str, Any]:
    """
    Print a full classification report and return summary metrics.

    Returns
    -------
    metrics : dict
        ``accuracy``, ``weighted_f1``, and ``per_class_f1`` (dict of
        class-name → F1 score).
    """
    y_pred = clf.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    w_f1 = f1_score(y_test, y_pred, average="weighted")

    all_labels = list(range(len(le.classes_)))

    report_str = classification_report(
        y_test, y_pred, labels=all_labels,
        target_names=le.classes_, zero_division=0
    )
    print("\n" + "=" * 72)
    print("CLASSIFICATION REPORT")
    print("=" * 72)
    print(report_str)
    print(f"Overall accuracy : {acc:.4f}")
    print(f"Weighted F1      : {w_f1:.4f}")
    print("=" * 72 + "\n")

    # Per-class F1 via the report dict
    report_dict = classification_report(
        y_test,
        y_pred,
        labels=all_labels,
        target_names=le.classes_,
        output_dict=True,
        zero_division=0,
    )
    per_class = {
        cls: round(report_dict[cls]["f1-score"], 4) for cls in le.classes_
    }

    metrics: Dict[str, Any] = {
        "accuracy": round(acc, 4),
        "weighted_f1": round(w_f1, 4),
        "per_class_f1": per_class,
    }
    return metrics


def save_artifacts(
    clf: RandomForestClassifier,
    le: LabelEncoder,
    metrics: Dict[str, Any],
) -> None:
    """Persist model, encoder, feature names, and metrics to MODEL_DIR."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / "event_classifier.pkl"
    encoder_path = MODEL_DIR / "target_encoder.pkl"
    features_path = MODEL_DIR / "feature_names.json"
    metrics_path = MODEL_DIR / "training_metrics.json"

    # Save model in compressed gzip format (~10x smaller) for Streamlit/Cloud
    with gzip.GzipFile(model_path.with_suffix(".pkl.gz"), "wb", compresslevel=9) as f:
        joblib.dump(clf, f)
    # Also keep uncompressed copy locally for backward compat
    joblib.dump(clf, model_path)
    log.info("Model  → %s (+ .pkl.gz)", model_path)

    joblib.dump(le, encoder_path)
    log.info("Encoder → %s", encoder_path)

    with open(features_path, "w") as f:
        json.dump(FEATURE_COLS, f, indent=2)
    log.info("Features → %s", features_path)

    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    log.info("Metrics → %s", metrics_path)


# ---------------------------------------------------------------------------
# Prediction function (inference-time)
# ---------------------------------------------------------------------------


def _load_artifacts() -> None:
    """Lazy-load model & encoders into module-level caches."""
    global _model, _target_encoder, _feature_names, _label_encoders  # noqa: PLW0603

    if _model is not None:
        return  # already loaded

    log.info("Loading model artifacts from %s …", MODEL_DIR)

    # Prefer compressed .pkl.gz if available (Streamlit / cloud deploys),
    # fall back to uncompressed .pkl for local dev.
    gz_path = MODEL_DIR / "event_classifier.pkl.gz"
    raw_path = MODEL_DIR / "event_classifier.pkl"
    if gz_path.is_file():
        with gzip.GzipFile(gz_path, "rb") as f:
            _model = joblib.load(f)
    elif raw_path.is_file():
        _model = joblib.load(raw_path)
    else:
        raise FileNotFoundError(
            f"Model file not found. Expected {gz_path} or {raw_path}"
        )

    _target_encoder = joblib.load(MODEL_DIR / "target_encoder.pkl")

    with open(MODEL_DIR / "feature_names.json") as f:
        _feature_names = json.load(f)

    with open(LABEL_ENCODERS_PATH) as f:
        raw = json.load(f)
    _label_encoders = {
        field: raw[field]["value_to_code"] for field in raw
    }

    log.info("Artifacts loaded (%d features).", len(_feature_names))


def predict_event(
    latitude: float,
    longitude: float,
    hour: int,
    day_of_week: int,
    month: int,
    zone: str,
    junction: str,
    police_station: str,
    priority: str,
) -> dict:
    """
    Predict the most likely event cause for the given parameters.

    Parameters
    ----------
    latitude, longitude : float
        GPS coordinates.
    hour : int
        Hour of day (0–23).
    day_of_week : int
        Day of week (0=Monday … 6=Sunday).
    month : int
        Month (1–12).
    zone, junction, police_station : str
        Human-readable categorical values; encoded via ``label_encoders.json``.
        Unknown values map to code ``0``.
    priority : str
        ``"high"`` or ``"low"`` (case-insensitive). Unknown maps to ``0``.

    Returns
    -------
    dict
        ``prediction`` (str), ``probability`` (float), and ``top_3``
        (list of ``{"cause": str, "probability": float}``).
    """
    _load_artifacts()
    assert _model is not None
    assert _target_encoder is not None
    assert _feature_names is not None
    assert _label_encoders is not None

    # Encode categorical inputs
    zone_enc = _label_encoders.get("zone", {}).get(zone, 0)
    junction_enc = _label_encoders.get("junction", {}).get(junction, 0)
    ps_enc = _label_encoders.get("police_station", {}).get(police_station, 0)
    priority_enc = _PRIORITY_MAP.get(priority.lower().strip(), 0)

    # Build feature vector (order must match FEATURE_COLS)
    feature_values = [
        latitude,
        longitude,
        hour,
        day_of_week,
        month,
        zone_enc,
        junction_enc,
        ps_enc,
        priority_enc,
    ]
    X_input = pd.DataFrame([feature_values], columns=_feature_names)

    # Predict with probabilities
    proba = _model.predict_proba(X_input)[0]
    top_indices = np.argsort(proba)[::-1]

    top_class_idx = top_indices[0]
    prediction = _target_encoder.inverse_transform([top_class_idx])[0]
    probability = round(float(proba[top_class_idx]), 4)

    top_3 = []
    for idx in top_indices[:3]:
        top_3.append(
            {
                "cause": _target_encoder.inverse_transform([idx])[0],
                "probability": round(float(proba[idx]), 4),
            }
        )

    return {
        "prediction": prediction,
        "probability": probability,
        "top_3": top_3,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """End-to-end: load → split → train → evaluate → save."""
    log.info("=" * 60)
    log.info("ASTraM Event Cause Classifier — Training Pipeline")
    log.info("=" * 60)

    # 1. Load & prepare
    df = load_data()
    X, y, le = prepare_features_target(df)

    # 2. Stratified 80/20 split
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        stratify=y,
        random_state=RANDOM_STATE,
    )
    log.info("Train: %d  |  Test: %d", len(X_train), len(X_test))

    # 3. Train
    clf = train_model(X_train, y_train)

    # 4. Evaluate
    metrics = evaluate_model(clf, X_test, y_test, le)

    # 5. Save
    save_artifacts(clf, le, metrics)

    # 6. Quick smoke-test of predict_event
    log.info("Running smoke-test prediction …")
    sample = predict_event(
        latitude=12.97,
        longitude=77.59,
        hour=10,
        day_of_week=2,
        month=6,
        zone="Central Zone 1",
        junction="SilkBoardJunc",
        police_station="Adugodi",
        priority="High",
    )
    log.info("Smoke-test result: %s", sample)

    log.info("Done ✓")


if __name__ == "__main__":
    main()
