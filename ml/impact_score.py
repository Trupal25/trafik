"""
impact_score.py — Rule-Based Impact Scoring for Traffic Events
==============================================================

Computes a composite impact score (0–100) for a traffic event based on
its cause, priority, and whether a road closure is required. The score
drives downstream decisions such as resource allocation and alert
prioritisation.

Scoring methodology
-------------------
1. **Base score** — calibrated per ``event_cause`` from historical
   severity analysis.
2. **Road-closure adjustment** — +15 when the event forces a closure.
3. **Priority adjustment** — +10 when dispatchers mark the event as
   *High* priority.
4. **Cap** — the final score is clamped to [0, 100].

The module also maps the score to a human-readable severity level and
estimates the expected delay in minutes (sourced from a pre-computed
JSON file or sensible fall-back defaults).

Usage
-----
>>> from ml.impact_score import calculate_impact_score
>>> result = calculate_impact_score("accident", "High", True)
>>> result["severity_level"]
'critical'
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from dotenv import dotenv_values

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
_config = dotenv_values(_ENV_PATH)

_DATA_DIR = Path(_config.get("DATA_DIR", "./data"))
if not _DATA_DIR.is_absolute():
    _DATA_DIR = Path(__file__).resolve().parents[1] / _DATA_DIR

_AVG_DURATION_PATH = _DATA_DIR / "processed" / "avg_duration_by_cause.json"

# ---------------------------------------------------------------------------
# Calibrated base scores (0–100 scale, pre-closure / pre-priority)
# ---------------------------------------------------------------------------

BASE_SCORES: dict[str, int] = {
    "protest": 85,
    "accident": 75,
    "water_logging": 65,
    "procession": 65,
    "tree_fall": 60,
    "construction": 60,
    "public_event": 55,
    "congestion": 55,
    "vip_movement": 50,
    "pot_holes": 45,
    "road_conditions": 45,
    "vehicle_breakdown": 40,
    "debris": 35,
    "fog_low_visibility": 30,
    "others": 40,
}

# Adjustment constants
_ROAD_CLOSURE_BONUS: int = 15
_HIGH_PRIORITY_BONUS: int = 10
_MAX_SCORE: int = 100

# ---------------------------------------------------------------------------
# Default expected-delay estimates (minutes) — used when the JSON file
# is unavailable or does not contain a given cause.
# ---------------------------------------------------------------------------

_DEFAULT_DELAY_MINS: dict[str, float] = {
    "protest": 120.0,
    "accident": 90.0,
    "water_logging": 75.0,
    "procession": 60.0,
    "tree_fall": 55.0,
    "construction": 50.0,
    "public_event": 45.0,
    "congestion": 40.0,
    "vip_movement": 35.0,
    "pot_holes": 30.0,
    "road_conditions": 30.0,
    "vehicle_breakdown": 25.0,
    "debris": 20.0,
    "fog_low_visibility": 15.0,
    "others": 30.0,
}

# ---------------------------------------------------------------------------
# Severity-level thresholds
# ---------------------------------------------------------------------------

_SEVERITY_THRESHOLDS: list[tuple[int, str]] = [
    (80, "critical"),
    (60, "high"),
    (40, "medium"),
]
_DEFAULT_SEVERITY: str = "low"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _normalise_cause(event_cause: str) -> str:
    """Lowercase and normalise an event-cause string.

    Handles the ``Fog / Low Visibility`` and ``Debris`` variants present
    in the raw data by folding them to their canonical keys.
    """
    cause = event_cause.strip().lower()
    # Map known alternate forms
    cause = cause.replace(" ", "_").replace("/", "_").replace("__", "_")
    # "fog___low_visibility" → "fog_low_visibility"
    cause = cause.replace("fog_low_visibility", "fog_low_visibility")
    # "test_demo" → treat as "others"
    if cause == "test_demo":
        cause = "others"
    return cause


def _load_avg_duration_by_cause() -> dict[str, float]:
    """Attempt to load pre-computed average durations from disk.

    Returns an empty dict (and logs a warning) when the file is missing
    or malformed, so callers can fall back to ``_DEFAULT_DELAY_MINS``.
    """
    if not _AVG_DURATION_PATH.is_file():
        logger.info(
            "avg_duration_by_cause.json not found at %s; "
            "using built-in default delay estimates.",
            _AVG_DURATION_PATH,
        )
        return {}

    try:
        with open(_AVG_DURATION_PATH, "r", encoding="utf-8") as fh:
            data: dict[str, Any] = json.load(fh)
        # Ensure values are floats, filtering out null/None values
        return {str(k).lower(): float(v) for k, v in data.items() if v is not None}
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        logger.warning(
            "Failed to load %s: %s — falling back to defaults.",
            _AVG_DURATION_PATH,
            exc,
        )
        return {}


def _classify_severity(score: int) -> str:
    """Map a numeric impact score to a severity label."""
    for threshold, label in _SEVERITY_THRESHOLDS:
        if score >= threshold:
            return label
    return _DEFAULT_SEVERITY


def _build_description(
    event_cause: str,
    severity_level: str,
    score: int,
    requires_road_closure: bool,
) -> str:
    """Generate a concise, human-readable impact summary."""
    closure_note = " Road closure required." if requires_road_closure else ""
    return (
        f"{severity_level.capitalize()} impact ({score}/100) for "
        f"'{event_cause}' event.{closure_note}"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def calculate_impact_score(
    event_cause: str,
    priority: str,
    requires_road_closure: bool,
    avg_duration_by_cause: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Compute a rule-based impact score for a single traffic event.

    Parameters
    ----------
    event_cause : str
        The cause of the event (e.g. ``"accident"``, ``"pot_holes"``).
        Case-insensitive; alternate spellings in the raw data are
        normalised automatically.
    priority : str
        Dispatcher-assigned priority — ``"High"`` or ``"Low"``.
    requires_road_closure : bool
        Whether the event mandates a road closure.
    avg_duration_by_cause : dict[str, float] | None, optional
        Pre-computed mapping of *cause → average duration in minutes*.
        When ``None`` the function tries to load
        ``DATA_DIR/processed/avg_duration_by_cause.json``; if that is
        unavailable it uses built-in default estimates.

    Returns
    -------
    dict
        ``score``            — ``int`` in [0, 100].
        ``severity_level``   — one of ``"critical"``, ``"high"``,
                               ``"medium"``, ``"low"``.
        ``expected_delay_mins`` — ``float``, estimated delay in minutes.
        ``description``      — human-readable impact summary ``str``.

    Examples
    --------
    >>> calculate_impact_score("accident", "High", True)
    {'score': 100, 'severity_level': 'critical', ...}

    >>> calculate_impact_score("pot_holes", "Low", False)
    {'score': 45, 'severity_level': 'medium', ...}
    """
    cause = _normalise_cause(event_cause)

    # 1. Base score
    base = BASE_SCORES.get(cause, BASE_SCORES["others"])

    # 2. Adjustments
    adjustment = 0
    if requires_road_closure:
        adjustment += _ROAD_CLOSURE_BONUS
    if str(priority).strip().lower() == "high":
        adjustment += _HIGH_PRIORITY_BONUS

    score = min(base + adjustment, _MAX_SCORE)

    # 3. Severity classification
    severity_level = _classify_severity(score)

    # 4. Expected delay
    if avg_duration_by_cause is None:
        avg_duration_by_cause = _load_avg_duration_by_cause()

    expected_delay_mins = avg_duration_by_cause.get(
        cause,
        _DEFAULT_DELAY_MINS.get(cause, _DEFAULT_DELAY_MINS["others"]),
    )

    # 5. Description
    description = _build_description(
        event_cause=cause,
        severity_level=severity_level,
        score=score,
        requires_road_closure=requires_road_closure,
    )

    return {
        "score": score,
        "severity_level": severity_level,
        "expected_delay_mins": expected_delay_mins,
        "description": description,
    }
