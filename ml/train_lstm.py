"""
train_lstm.py — Congestion Index Sequence Forecaster (MODEL 5 of 5)
===================================================================

An LSTM (Long Short-Term Memory) neural network that reads the last 168
hours (one week) of incident counts and predicts the next 24 hours. Drives
the "Congestion Index" 7-day trend chart on the Forecasting Center.

The sequence-to-sequence design captures temporal dependencies that
tree-based models miss: multi-hour cascades, overnight rolloff, weekly
rhythm. The data is thin for deep learning (8K events over ~4 months of
continuous hourly data ≈ 2,800 points), so the model is kept small to
avoid overfitting.

Run:
    python -m ml.train_lstm
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MODEL_NAME = "lstm_congestion"
DISPLAY_NAME = "LSTM — Congestion Index Sequence Forecast"

_WINDOW = 168  # 1 week of hourly history → predict next 24h
_HORIZON = 24


def _build_sequences(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Slide a window over the time series, producing (X, y) pairs.

    X shape: (samples, _WINDOW)   — past week
    y shape: (samples, _HORIZON)  — next 24 hours
    """
    X, y = [], []
    for i in range(len(values) - _WINDOW - _HORIZON):
        X.append(values[i : i + _WINDOW])
        y.append(values[i + _WINDOW : i + _WINDOW + _HORIZON])
    return np.array(X), np.array(y)


def train():
    """Train the LSTM and save artifacts."""
    import tensorflow as tf
    from tensorflow.keras import layers, models, callbacks
    from sklearn.preprocessing import MinMaxScaler
    from ml.forecast_base import (
        build_hourly_series,
        evaluate,
        save_artifacts,
        print_summary,
    )

    # Build hourly series and take the values
    series_df = build_hourly_series()
    raw = series_df["incident_count"].values.astype(np.float32)

    # Scale to [0, 1] — LSTMs are sensitive to input scale.
    scaler = MinMaxScaler()
    raw_scaled = scaler.fit_transform(raw.reshape(-1, 1)).flatten()

    X, y = _build_sequences(raw_scaled)
    X = X[..., np.newaxis]  # (samples, window, 1)

    # Chronological split
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    logger.info(
        "LSTM sequences: %d train, %d test (window=%d, horizon=%d)",
        len(X_train), len(X_test), _WINDOW, _HORIZON,
    )

    # Small model to avoid overfitting on ~2000 sequences
    model = models.Sequential([
        layers.Input(shape=(_WINDOW, 1)),
        layers.LSTM(48, return_sequences=True, dropout=0.1),
        layers.LSTM(24, dropout=0.1),
        layers.Dense(_HORIZON),
    ])
    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    early_stop = callbacks.EarlyStopping(
        monitor="val_loss", patience=8, restore_best_weights=True, verbose=0
    )

    history = model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=60,
        batch_size=32,
        callbacks=[early_stop],
        verbose=0,
    )

    # Evaluate: predict each test sequence's 24h, flatten, inverse-scale.
    y_pred_scaled = model.predict(X_test, verbose=0)
    y_test_flat = scaler.inverse_transform(y_test.reshape(-1, 1)).flatten()
    y_pred_flat = scaler.inverse_transform(y_pred_scaled.reshape(-1, 1)).flatten()
    y_pred_flat = np.clip(y_pred_flat, 0, None)

    metrics = evaluate(y_test_flat, y_pred_flat)
    metrics["description"] = "24h-ahead hourly forecast from 168h input window"
    metrics["epochs_trained"] = len(history.history["loss"])
    metrics["final_val_loss"] = round(float(min(history.history["val_loss"])), 4)

    # 24h forecast from the last available window
    last_window = raw_scaled[-_WINDOW:].reshape(1, _WINDOW, 1)
    next_24_scaled = model.predict(last_window, verbose=0).flatten()
    next_24 = scaler.inverse_transform(next_24_scaled.reshape(-1, 1)).flatten()
    next_24 = np.clip(next_24, 0, None)

    from ml.forecast_base import SURGE_THRESHOLD
    forecast_24h = [
        {
            "hour_offset": h + 1,
            "predicted_count": round(float(next_24[h]), 1),
            "surge_probability": round(float(1.0 / (1.0 + np.exp(-1.5 * (next_24[h] - SURGE_THRESHOLD)))), 2),
        }
        for h in range(_HORIZON)
    ]

    save_artifacts(
        model_name=MODEL_NAME,
        model={"keras_model": model, "scaler": scaler, "window": _WINDOW, "horizon": _HORIZON},
        metrics=metrics,
        feature_names=["incident_count_lagged_168h"],
        test_index=pd.RangeIndex(len(y_test_flat)),
        y_test=y_test_flat,
        y_pred=y_pred_flat,
        forecast_24h=forecast_24h,
        extra={"display_name": DISPLAY_NAME, "architecture": "LSTM(48) → LSTM(24) → Dense(24)"},
    )

    print_summary(MODEL_NAME, DISPLAY_NAME, metrics, forecast_24h)
    return model, metrics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    train()
