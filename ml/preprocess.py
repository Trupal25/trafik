"""
ASTraM Intelligence — Data Preprocessing Module
=================================================

Loads the raw traffic-event CSV, cleans and feature-engineers it, then
persists the cleaned data and several precomputed analytics artefacts.

Runnable as::

    python -m ml.preprocess          # from the astram/ directory
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
import os

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Load .env relative to the *project root* (one level above ml/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

DATA_DIR: Path = _PROJECT_ROOT / os.getenv("DATA_DIR", "./data")
RAW_CSV: Path = DATA_DIR / "raw" / "astram_events.csv"
PROCESSED_DIR: Path = DATA_DIR / "processed"

# Core columns that must be non-null for a row to be usable
CORE_FIELDS: list[str] = ["event_cause", "latitude", "longitude"]

# Label-encoded categorical columns → treated as ordered codes
LABEL_ENCODE_COLS: list[str] = ["zone", "junction", "police_station", "direction"]

# event_cause normalisation map (raw → canonical)
CAUSE_RENAME_MAP: dict[str, str] = {
    "Debris": "debris",
    "Fog / Low Visibility": "fog_low_visibility",
}

# Causes to drop entirely
CAUSES_TO_DROP: set[str] = {"test_demo"}

# Priority mapping
PRIORITY_MAP: dict[str, int] = {"High": 2, "Low": 1}
PRIORITY_DEFAULT: int = 0

# Top-N junctions for hotspot analysis
HOTSPOT_TOP_N: int = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_json(obj: Any) -> Any:
    """Make *obj* JSON-serialisable (handles numpy/pandas types)."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if pd.isna(obj):
        return None
    return obj


def _dump_json(data: Any, path: Path) -> None:
    """Write *data* as pretty-printed JSON, converting numpy types."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=_safe_json, ensure_ascii=False)
    print(f"  ✓ Saved {path.relative_to(_PROJECT_ROOT)}")


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------


def load_raw(path: Path = RAW_CSV) -> pd.DataFrame:
    """Load the raw CSV, treating ``NULL`` strings as ``NaN``."""
    if not path.exists():
        raise FileNotFoundError(f"Raw CSV not found: {path}")
    df = pd.read_csv(path, na_values=["NULL", "null", ""])
    print(f"Loaded {len(df):,} rows from {path.name}")
    return df


def clean_core(df: pd.DataFrame) -> pd.DataFrame:
    """Drop duplicates and rows missing core fields."""
    before = len(df)
    df = df.drop_duplicates()
    dupes = before - len(df)

    before2 = len(df)
    df = df.dropna(subset=CORE_FIELDS)
    nulls = before2 - len(df)

    print(f"  Dropped {dupes} duplicates, {nulls} rows with null core fields")
    return df.reset_index(drop=True)


def parse_datetimes(df: pd.DataFrame) -> pd.DataFrame:
    """Parse datetime columns and derive temporal features."""
    df["start_datetime"] = pd.to_datetime(df["start_datetime"], errors="coerce", utc=True)
    df["end_datetime"] = pd.to_datetime(df["end_datetime"], errors="coerce", utc=True)

    # Derived temporal features
    df["hour"] = df["start_datetime"].dt.hour
    df["day_of_week"] = df["start_datetime"].dt.dayofweek  # Mon=0 … Sun=6
    df["month"] = df["start_datetime"].dt.month

    # Duration in minutes (NaN when end_datetime is missing)
    duration = (df["end_datetime"] - df["start_datetime"]).dt.total_seconds() / 60.0
    # Negative durations (data errors) → NaN
    duration = duration.where(duration >= 0, other=np.nan)
    df["duration_mins"] = duration

    valid_dur = df["duration_mins"].notna().sum()
    print(f"  Parsed datetimes → {valid_dur:,} rows with valid duration")
    return df


def normalise_event_cause(df: pd.DataFrame) -> pd.DataFrame:
    """Rename / merge cause labels and drop unwanted causes."""
    df["event_cause"] = df["event_cause"].replace(CAUSE_RENAME_MAP)

    before = len(df)
    df = df[~df["event_cause"].isin(CAUSES_TO_DROP)].reset_index(drop=True)
    dropped = before - len(df)

    print(f"  Normalised event_cause → dropped {dropped} test_demo rows")
    return df


def label_encode_columns(df: pd.DataFrame) -> dict[str, dict[str, dict]]:
    """
    Label-encode categorical columns in-place.

    NULLs / empty strings are mapped to an ``'unknown'`` category encoded
    as **0**.  All other categories are assigned codes starting from 1.

    Returns
    -------
    dict
        ``{col: {"value_to_code": {…}, "code_to_value": {…}}}``
    """
    encoders: dict[str, dict[str, dict]] = {}

    for col in LABEL_ENCODE_COLS:
        # Fill missing → 'unknown'
        df[col] = df[col].fillna("unknown").astype(str).str.strip()
        df.loc[df[col] == "", col] = "unknown"

        # Build sorted unique values, 'unknown' first (code 0)
        uniques = sorted(df[col].unique())
        if "unknown" in uniques:
            uniques.remove("unknown")
        ordered = ["unknown"] + uniques

        value_to_code = {v: i for i, v in enumerate(ordered)}
        code_to_value = {str(i): v for i, v in enumerate(ordered)}

        df[col] = df[col].map(value_to_code).astype(int)

        encoders[col] = {
            "value_to_code": value_to_code,
            "code_to_value": code_to_value,
        }
        print(f"  Label-encoded {col} → {len(ordered)} categories")

    return encoders


def map_priority(df: pd.DataFrame) -> pd.DataFrame:
    """Map priority to integer codes (High→2, Low→1, NULL→0)."""
    df["priority"] = (
        df["priority"]
        .map(PRIORITY_MAP)
        .fillna(PRIORITY_DEFAULT)
        .astype(int)
    )
    print("  Mapped priority → {High:2, Low:1, NULL:0}")
    return df


def map_road_closure(df: pd.DataFrame) -> pd.DataFrame:
    """Map requires_road_closure boolean strings to 0/1 integers."""
    df["requires_road_closure"] = (
        df["requires_road_closure"]
        .astype(str)
        .str.strip()
        .str.upper()
        .map({"TRUE": 1, "FALSE": 0})
        .fillna(0)
        .astype(int)
    )
    print("  Mapped requires_road_closure → {TRUE:1, FALSE:0}")
    return df


# ---------------------------------------------------------------------------
# Analytics artefacts
# ---------------------------------------------------------------------------


def compute_hotspots(df: pd.DataFrame, top_n: int = HOTSPOT_TOP_N) -> list[dict]:
    """
    Top *top_n* junctions by incident count.

    Each entry contains the junction name (decoded later by the caller
    if desired), total incidents, per-cause breakdown, and severity
    metrics (% road-closure, mean priority, mean duration).
    """
    # We need the raw junction names for the JSON — but the df already has
    # integer codes.  We'll work from the original DF that still has labels
    # if available, otherwise use codes.  Since we call this *after*
    # label-encoding we pass in the df that has codes, but we'll decode
    # using the label_encoders mapping later.  For now, operate on codes
    # and decode outside.

    counts = df.groupby("junction").size().nlargest(top_n)
    hotspots: list[dict] = []

    for junc_code, total in counts.items():
        subset = df[df["junction"] == junc_code]

        cause_breakdown = subset["event_cause"].value_counts().to_dict()
        cause_breakdown = {k: int(v) for k, v in cause_breakdown.items()}

        hotspots.append({
            "junction_code": int(junc_code),
            "total_incidents": int(total),
            "cause_breakdown": cause_breakdown,
            "pct_road_closure": round(float(subset["requires_road_closure"].mean()) * 100, 2),
            "mean_priority": round(float(subset["priority"].mean()), 2),
            "mean_duration_mins": round(float(subset["duration_mins"].mean()), 2)
            if subset["duration_mins"].notna().any()
            else None,
        })

    return hotspots


def compute_avg_duration(df: pd.DataFrame) -> dict[str, float | None]:
    """Average *duration_mins* per event_cause."""
    agg = df.groupby("event_cause")["duration_mins"].mean()
    return {
        cause: round(float(val), 2) if pd.notna(val) else None
        for cause, val in agg.items()
    }


def compute_stats(df: pd.DataFrame) -> dict[str, Any]:
    """Summary statistics for the cleaned dataset."""
    return {
        "total_events": int(len(df)),
        "cause_distribution": {
            k: int(v)
            for k, v in df["event_cause"].value_counts().to_dict().items()
        },
        "zone_distribution": {
            str(k): int(v)
            for k, v in df["zone"].value_counts().to_dict().items()
        },
        "events_by_hour": {
            int(k): int(v)
            for k, v in df["hour"].value_counts().sort_index().to_dict().items()
        },
        "events_by_day_of_week": {
            int(k): int(v)
            for k, v in df["day_of_week"]
            .value_counts()
            .sort_index()
            .to_dict()
            .items()
        },
        "events_by_month": {
            int(k): int(v)
            for k, v in df["month"]
            .value_counts()
            .sort_index()
            .to_dict()
            .items()
        },
    }


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run_pipeline() -> pd.DataFrame:
    """Execute the full preprocessing pipeline and persist all outputs."""
    print("=" * 60)
    print("ASTraM Preprocessing Pipeline")
    print("=" * 60)

    # 1. Load
    df = load_raw()

    # 2. Core cleaning
    df = clean_core(df)

    # 3. Datetime parsing & temporal features
    df = parse_datetimes(df)

    # 4. Normalise event_cause
    df = normalise_event_cause(df)

    # 5. Label-encode categoricals
    label_encoders = label_encode_columns(df)

    # 6. Map priority
    df = map_priority(df)

    # 7. Map road closure
    df = map_road_closure(df)

    # ------------------------------------------------------------------
    # Persist cleaned data
    # ------------------------------------------------------------------
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    out_csv = PROCESSED_DIR / "events_clean.csv"
    df.to_csv(out_csv, index=False)
    print(f"\n  ✓ Saved {out_csv.relative_to(_PROJECT_ROOT)}  ({len(df):,} rows)")

    # ------------------------------------------------------------------
    # Precompute & persist analytics artefacts
    # ------------------------------------------------------------------
    print("\nPrecomputing analytics artefacts …")

    # Hotspots — decode junction codes back to names for the JSON
    hotspots = compute_hotspots(df)
    junc_decode = label_encoders["junction"]["code_to_value"]
    for h in hotspots:
        h["junction"] = junc_decode.get(str(h["junction_code"]), "unknown")
    _dump_json(hotspots, PROCESSED_DIR / "hotspots.json")

    # Average duration by cause
    avg_dur = compute_avg_duration(df)
    _dump_json(avg_dur, PROCESSED_DIR / "avg_duration_by_cause.json")

    # Label encoders
    _dump_json(label_encoders, PROCESSED_DIR / "label_encoders.json")

    # Summary stats
    stats = compute_stats(df)
    _dump_json(stats, PROCESSED_DIR / "stats.json")

    # ------------------------------------------------------------------
    # Print summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("CLEANED DATA SUMMARY")
    print("=" * 60)
    print(f"  Total events        : {len(df):,}")
    print(f"  Columns             : {len(df.columns)}")
    print(f"  Event causes        : {df['event_cause'].nunique()}")
    print(f"  Date range          : {df['start_datetime'].min()} → {df['start_datetime'].max()}")
    print(f"  Rows with duration  : {df['duration_mins'].notna().sum():,}")
    print(f"  Median duration     : {df['duration_mins'].median():.1f} min")
    print(f"  Priority breakdown  : {df['priority'].value_counts().to_dict()}")
    print(f"  Road closures       : {df['requires_road_closure'].sum():,}")
    print(f"  Unique junctions    : {df['junction'].nunique()}")
    print(f"  Unique zones        : {df['zone'].nunique()}")
    print("=" * 60)

    return df


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as exc:
        print(f"\n✘ Pipeline failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
