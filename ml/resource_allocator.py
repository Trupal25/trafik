"""
resource_allocator.py — Impact-Driven Resource Allocation
=========================================================

Given an impact score (0–100) and an event cause, this module
recommends a concrete deployment plan: number of officers,
barricades, diversion routes, a list of recommended actions, and a
rough cost estimate.

Allocation tiers
----------------
+-----------+----------+------------+------------------+
| Score     | Officers | Barricades | Diversion Routes |
+-----------+----------+------------+------------------+
| ≥ 80      | 12       | 8          | 3                |
| 60 – 79   | 8        | 5          | 2                |
| 40 – 59   | 4        | 2          | 1                |
| < 40      | 2        | 1          | 0                |
+-----------+----------+------------+------------------+

Crowd-control causes (``protest``, ``procession``, ``public_event``,
``vip_movement``) receive an additional **+4 officers** and
**+3 barricades**.

Cost formula
------------
``officers × 500 + barricades × 200 + diversion_routes × 1000``
(in INR, rough operational estimate).

Usage
-----
>>> from ml.resource_allocator import allocate_resources
>>> plan = allocate_resources(impact_score=85, event_cause="protest")
>>> plan["officers"]
16
"""

from __future__ import annotations

import logging
from typing import Any

from dotenv import dotenv_values  # noqa: F401 — imported for config parity

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tier definitions  (min_score, officers, barricades, diversion_routes)
# ---------------------------------------------------------------------------

_TIERS: list[tuple[int, int, int, int]] = [
    (80, 12, 8, 3),
    (60, 8, 5, 2),
    (40, 4, 2, 1),
    (0, 2, 1, 0),  # catch-all for scores < 40
]

# ---------------------------------------------------------------------------
# Crowd-control bump
# ---------------------------------------------------------------------------

_CROWD_CONTROL_CAUSES: frozenset[str] = frozenset(
    {"protest", "procession", "public_event", "vip_movement"}
)
_CROWD_OFFICER_BUMP: int = 4
_CROWD_BARRICADE_BUMP: int = 3

# ---------------------------------------------------------------------------
# Cost coefficients (INR, rough operational estimate)
# ---------------------------------------------------------------------------

_COST_PER_OFFICER: int = 500
_COST_PER_BARRICADE: int = 200
_COST_PER_DIVERSION: int = 1000

# ---------------------------------------------------------------------------
# Severity helpers (mirror impact_score thresholds for action generation)
# ---------------------------------------------------------------------------

_SEVERITY_THRESHOLDS: list[tuple[int, str]] = [
    (80, "critical"),
    (60, "high"),
    (40, "medium"),
]
_DEFAULT_SEVERITY: str = "low"


def _classify_severity(score: int) -> str:
    """Map a numeric impact score to a severity label."""
    for threshold, label in _SEVERITY_THRESHOLDS:
        if score >= threshold:
            return label
    return _DEFAULT_SEVERITY


# ---------------------------------------------------------------------------
# Recommended-action catalogue
# ---------------------------------------------------------------------------

# Actions triggered by severity level
_SEVERITY_ACTIONS: dict[str, list[str]] = {
    "critical": [
        "Activate emergency response protocol",
        "Notify senior traffic control officers",
        "Issue public alert via SMS/app notifications",
        "Deploy CCTV monitoring at the site",
    ],
    "high": [
        "Dispatch field officers to manage traffic flow",
        "Set up temporary signage and barricades",
        "Coordinate with nearest police station",
    ],
    "medium": [
        "Monitor situation remotely via CCTV",
        "Keep a standby patrol unit informed",
    ],
    "low": [
        "Log event for record-keeping",
        "Schedule routine follow-up inspection",
    ],
}

# Extra actions triggered by specific event causes
_CAUSE_ACTIONS: dict[str, list[str]] = {
    "accident": [
        "Dispatch ambulance and medical team",
        "Request tow-truck for vehicle removal",
        "Preserve scene for investigation if fatalities reported",
    ],
    "protest": [
        "Coordinate with local administration for crowd management",
        "Establish buffer zone around protest area",
        "Ensure ambulance on standby",
    ],
    "procession": [
        "Pre-plan diversion routes along procession path",
        "Coordinate with event organisers for estimated duration",
    ],
    "public_event": [
        "Coordinate with event organisers for crowd estimates",
        "Arrange parking management at nearby lots",
    ],
    "vip_movement": [
        "Establish green corridor along the route",
        "Coordinate with security detail for timing",
    ],
    "water_logging": [
        "Alert BBMP / municipal drainage team",
        "Deploy water pumps if depth exceeds 30 cm",
        "Warn motorists of flooding via variable message signs",
    ],
    "tree_fall": [
        "Request BBMP tree-clearing crew",
        "Check for downed power lines before clearing",
    ],
    "construction": [
        "Verify contractor permits and lane-closure plan",
        "Ensure reflective cones and night-lighting are in place",
    ],
    "congestion": [
        "Adjust signal timing at nearby junctions",
        "Deploy officers for manual traffic management",
    ],
    "pot_holes": [
        "Report to BBMP for urgent pothole repair",
        "Place warning cones around hazard",
    ],
    "vehicle_breakdown": [
        "Dispatch tow-truck for vehicle removal",
        "Direct traffic around stalled vehicle",
    ],
    "debris": [
        "Request municipal cleanup crew",
        "Place warning signs upstream of debris",
    ],
    "road_conditions": [
        "Report to road maintenance authority",
        "Place advisory signage for motorists",
    ],
    "fog_low_visibility": [
        "Activate fog lights and advisory signage",
        "Reduce speed limits on affected corridor",
    ],
}


def _normalise_cause(event_cause: str) -> str:
    """Lowercase and normalise an event-cause string.

    Keeps parity with ``impact_score._normalise_cause``.
    """
    cause = event_cause.strip().lower()
    cause = cause.replace(" ", "_").replace("/", "_").replace("__", "_")
    cause = cause.replace("fog_low_visibility", "fog_low_visibility")
    if cause == "test_demo":
        cause = "others"
    return cause


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def allocate_resources(impact_score: int, event_cause: str) -> dict[str, Any]:
    """Recommend personnel, equipment, actions, and cost for an event.

    Parameters
    ----------
    impact_score : int
        Composite impact score in [0, 100], typically produced by
        :func:`ml.impact_score.calculate_impact_score`.
    event_cause : str
        The cause of the traffic event (e.g. ``"accident"``).
        Case-insensitive; alternate spellings are normalised.

    Returns
    -------
    dict
        ``officers``            — ``int``, number of traffic officers.
        ``barricades``          — ``int``, number of barricade units.
        ``diversion_routes``    — ``int``, number of diversion routes
                                  to activate.
        ``recommended_actions`` — ``list[str]``, prioritised action
                                  items.
        ``estimated_cost``      — ``int``, rough deployment cost in INR.

    Raises
    ------
    ValueError
        If *impact_score* is outside the [0, 100] range.

    Examples
    --------
    >>> allocate_resources(85, "protest")
    {'officers': 16, 'barricades': 11, 'diversion_routes': 3, ...}

    >>> allocate_resources(30, "pot_holes")
    {'officers': 2, 'barricades': 1, 'diversion_routes': 0, ...}
    """
    if not (0 <= impact_score <= 100):
        raise ValueError(
            f"impact_score must be in [0, 100], got {impact_score}"
        )

    cause = _normalise_cause(event_cause)
    severity = _classify_severity(impact_score)

    # ---- 1. Base tier allocation ----
    officers = barricades = diversion_routes = 0
    for min_score, off, bar, div in _TIERS:
        if impact_score >= min_score:
            officers, barricades, diversion_routes = off, bar, div
            break

    # ---- 2. Crowd-control bump ----
    if cause in _CROWD_CONTROL_CAUSES:
        officers += _CROWD_OFFICER_BUMP
        barricades += _CROWD_BARRICADE_BUMP

    # ---- 3. Recommended actions ----
    actions: list[str] = list(_SEVERITY_ACTIONS.get(severity, []))
    cause_specific = _CAUSE_ACTIONS.get(cause, [])
    for action in cause_specific:
        if action not in actions:
            actions.append(action)

    # ---- 4. Cost estimate ----
    estimated_cost = (
        officers * _COST_PER_OFFICER
        + barricades * _COST_PER_BARRICADE
        + diversion_routes * _COST_PER_DIVERSION
    )

    return {
        "officers": officers,
        "barricades": barricades,
        "diversion_routes": diversion_routes,
        "recommended_actions": actions,
        "estimated_cost": estimated_cost,
    }
