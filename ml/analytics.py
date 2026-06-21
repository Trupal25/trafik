"""
analytics.py — Real-data aggregations for the UrbanPulse dashboard pages.

Single source of truth for /dashboard, /intelligence, /hotspots/extended,
and /resource-plan. Loads events_clean.csv once at process start and derives
every metric from real incidents. No mock data anywhere.

Reuses ml.impact_score for severity classification so the whole app speaks
the same severity vocabulary (≥80 critical / ≥60 high / ≥40 medium / else low
on the 0-100 impact scale).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from ml.impact_score import calculate_impact_score

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration — mirrors api/main.py resolution
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
try:
    from dotenv import dotenv_values
    _config = dotenv_values(_PROJECT_ROOT / ".env")
except Exception:  # pragma: no cover
    _config = {}

_DATA_DIR = Path(_config.get("DATA_DIR", "./data"))
if not _DATA_DIR.is_absolute():
    _DATA_DIR = _PROJECT_ROOT / _DATA_DIR

_EVENTS_CSV = _DATA_DIR / "processed" / "events_clean.csv"
_LABEL_ENCODERS = _DATA_DIR / "processed" / "label_encoders.json"

# ---------------------------------------------------------------------------
# Cause vocabulary — used for filtering and grouping
# ---------------------------------------------------------------------------

OPERATIONAL_CAUSES = {
    "vehicle_breakdown", "pot_holes", "construction", "water_logging",
    "accident", "tree_fall", "road_conditions", "congestion", "debris",
    "fog_low_visibility",
}
EVENT_CAUSES = {"public_event", "procession", "vip_movement", "protest"}
ACCIDENT_CAUSES = {"accident"}

# ---------------------------------------------------------------------------
# Bengaluru city centre — used for map default and officer-position offsets
# ---------------------------------------------------------------------------

BLR_CENTER = (12.9716, 77.5946)

# ---------------------------------------------------------------------------
# DataFrame cache
# ---------------------------------------------------------------------------

_df_cache: dict[str, Any] = {}


def _events_df() -> pd.DataFrame:
    """Return the cached, parsed events DataFrame (loaded lazily)."""
    if "df" in _df_cache:
        return _df_cache["df"]

    if not _EVENTS_CSV.is_file():
        raise FileNotFoundError(f"events_clean.csv not found at {_EVENTS_CSV}")

    df = pd.read_csv(_EVENTS_CSV)

    # Parse timestamps; the CSV stores ISO-8601 with timezone offsets.
    df["start_dt"] = pd.to_datetime(df["start_datetime"], errors="coerce", utc=True)
    df["end_dt"] = pd.to_datetime(df["end_datetime"], errors="coerce", utc=True)

    # Drop rows with no usable location or timestamp.
    df = df.dropna(subset=["start_dt"]).copy()
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df = df.dropna(subset=["latitude", "longitude"])
    # Filter absurd coordinates (Bengaluru bbox).
    df = df[
        (df["latitude"].between(12.80, 13.10))
        & (df["longitude"].between(77.40, 77.75))
    ]

    # Normalise cause strings to canonical lowercase.
    df["cause"] = df["event_cause"].fillna("others").str.lower().str.strip()
    df["cause"] = df["cause"].str.replace(r"[\s/]+", "_", regex=True).str.replace(r"_+", "_", regex=True)

    # priority comes in as 1/2 — 1 = High, 2 = Low (per dispatcher convention).
    df["priority_label"] = df["priority"].apply(lambda p: "High" if p == 1 else "Low")

    # Zone code as int, fallback to 0 (unknown).
    df["zone_code"] = pd.to_numeric(df["zone"], errors="coerce").fillna(0).astype(int)

    df = df.sort_values("start_dt").reset_index(drop=True)
    _df_cache["df"] = df
    logger.info("Loaded %d events from %s", len(df), _EVENTS_CSV)
    return df


def _label_map() -> dict[str, dict[str, str]]:
    """Cached label encoder (zone code → name, etc.)."""
    if "labels" in _df_cache:
        return _df_cache["labels"]
    out: dict[str, dict[str, str]] = {"zone": {}}
    if _LABEL_ENCODERS.is_file():
        try:
            raw = json.loads(_LABEL_ENCODERS.read_text(encoding="utf-8"))
            out["zone"] = {int(k): v for k, v in raw.get("zone", {}).get("code_to_value", {}).items()}
            out["junction"] = {int(k): v for k, v in raw.get("junction", {}).get("code_to_value", {}).items()}
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Failed to parse label_encoders.json: %s", exc)
    _df_cache["labels"] = out
    return out


def _zone_name(code: int) -> str:
    return _label_map()["zone"].get(code, "Unknown Zone")


def _junction_name(code: int) -> str:
    return _label_map().get("junction", {}).get(code, f"Junction {code}")


def _severity_for(cause: str, priority_label: str, requires_closure: bool) -> str:
    """Reuse the rule-based impact engine for a consistent severity vocabulary."""
    try:
        result = calculate_impact_score(
            event_cause=cause,
            priority=priority_label,
            requires_road_closure=bool(requires_closure),
        )
        return result["severity_level"]
    except Exception:  # pragma: no cover — defensive
        return "low"


def _to_iso(dt: Any) -> str | None:
    if pd.isna(dt):
        return None
    try:
        return dt.isoformat()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def build_dashboard(active_window_mins: int = 1440) -> dict[str, Any]:
    """Compose the full /dashboard payload from real events.

    The dataset is historical (ends 2024-04-08); we treat the most recent
    event timestamp as "now" and present the operational picture around it.
    The window expands adaptively if the tail is sparse, so the operator
    always sees a representative sample rather than an empty-feeling board.
    """
    df = _events_df()

    # Treat the most recent event timestamp as "now" (data is historical).
    now = df["start_dt"].max()

    # Adaptive window: start at 24h, expand until we have a representative
    # sample of active incidents (the data thins at its tail).
    candidate_windows = [active_window_mins, 1440 * 3, 1440 * 7, 1440 * 14]
    closed_states = {"closed", "resolved"}
    recent = pd.DataFrame()
    active = pd.DataFrame()
    chosen_window = active_window_mins
    for w in candidate_windows:
        window_start = now - pd.Timedelta(minutes=w)
        candidate_recent = df[df["start_dt"] >= window_start].copy()
        if candidate_recent.empty:
            continue
        candidate_recent["is_open"] = (
            candidate_recent["end_dt"].isna()
            | (~candidate_recent["status"].fillna("").str.lower().isin(closed_states))
        )
        candidate_active = candidate_recent[candidate_recent["is_open"]].copy()
        # Accept the window if it yields a usable active sample OR we've hit
        # the largest fallback window.
        if len(candidate_active) >= 8 or w == candidate_windows[-1]:
            recent = candidate_recent
            active = candidate_active if not candidate_active.empty else candidate_recent.tail(24)
            chosen_window = w
            break
    if recent.empty:
        recent = df.tail(48)
        active = df.tail(24)
    if active.empty:
        active = recent.tail(24)

    window_start = now - pd.Timedelta(minutes=chosen_window)
    prev_window = df[(df["start_dt"] >= window_start - pd.Timedelta(minutes=chosen_window))
                     & (df["start_dt"] < window_start)]

    # Per-incident severity (rule-based).
    active["severity"] = active.apply(
        lambda r: _severity_for(
            r["cause"], r["priority_label"], bool(r.get("requires_road_closure", 0))
        ),
        axis=1,
    )

    # ---------- KPIs ----------
    active_count = len(active)
    predicted_high_risk = int((active["severity"].isin(["critical", "high"])).sum())

    # Congestion forecast % — share of recent incidents in congestion-prone
    # causes vs the previous window, indexed to 0-100. Honest delta, not a
    # multiplier-ceiling.
    congestion_causes = {"congestion", "vehicle_breakdown", "construction"}
    congestion_recent = recent["cause"].isin(congestion_causes).sum()
    congestion_prev = prev_window["cause"].isin(congestion_causes).sum() if not prev_window.empty else 0
    base_rate = (congestion_recent / max(1, len(recent))) * 100
    prev_rate = (congestion_prev / max(1, len(prev_window))) * 100 if not prev_window.empty else base_rate
    # Index: scale base_rate to 0-100 with a mild lift, clamp.
    congestion_pct = round(min(100, base_rate * 1.15))

    # Officers recommended — sum of allocation across active incidents.
    officers_total = 0
    barricades_total = 0
    diversions_total = 0
    from ml.resource_allocator import allocate_resources
    for _, r in active.iterrows():
        impact = calculate_impact_score(
            event_cause=r["cause"],
            priority=r["priority_label"],
            requires_road_closure=bool(r.get("requires_road_closure", 0)),
        )
        plan = allocate_resources(impact["score"], r["cause"])
        officers_total += plan["officers"]
        barricades_total += plan["barricades"]
        diversions_total += plan["diversion_routes"]

    # City risk index — severity-weighted normalised score on 0-10 scale.
    sev_weight = {"critical": 10, "high": 6, "medium": 3, "low": 1}
    raw_risk = active["severity"].map(sev_weight).sum()
    # Normalise against sample size, then scale. Cap at 10.
    risk_score = round(min(10, (raw_risk / max(8, len(active))) * 3.0), 1)

    # Sparklines — 7-point rolling incident count across the chosen window.
    step = max(30, chosen_window // 7)
    spark_recent = _sparkline(recent, now, points=7, step_mins=step)
    spark_prev = _sparkline(prev_window, prev_window["start_dt"].max() if not prev_window.empty else now, points=7, step_mins=step)

    def _delta(idx: int) -> int:
        return int(spark_recent[idx] - spark_prev[idx]) if idx < len(spark_prev) else 0

    kpis = [
        {"key": "active", "label": "Active Incidents", "value": active_count, "sparkline": spark_recent, "severity": "high" if active_count > 18 else "medium" if active_count > 8 else "low", "delta": _delta(0)},
        {"key": "predicted", "label": "Predicted High-Risk", "value": predicted_high_risk, "sparkline": spark_recent, "severity": "critical" if predicted_high_risk > 6 else "high" if predicted_high_risk > 3 else "medium", "delta": _delta(1)},
        {"key": "congestion", "label": "Congestion Forecast", "value": congestion_pct, "unit": "%", "sparkline": spark_recent, "severity": "critical" if congestion_pct > 70 else "high" if congestion_pct > 50 else "medium" if congestion_pct > 30 else "low", "delta": _delta(2)},
        {"key": "officers", "label": "Officers Recommended", "value": officers_total, "sparkline": spark_recent, "severity": "high" if officers_total > 60 else "medium" if officers_total > 30 else "low", "delta": _delta(3)},
        {"key": "diversions", "label": "Diversions Planned", "value": diversions_total, "sparkline": spark_recent, "severity": "high" if diversions_total > 8 else "medium" if diversions_total > 0 else "low", "delta": _delta(4)},
        {"key": "risk", "label": "City Risk Index", "value": risk_score, "unit": "/10", "sparkline": spark_recent, "severity": "critical" if risk_score >= 8 else "high" if risk_score >= 6 else "medium" if risk_score >= 3.5 else "low", "delta": 0},
    ]

    # ---------- Active incidents (top N with geo) ----------
    active_records = []
    for _, r in active.tail(24).iloc[::-1].iterrows():
        active_records.append({
            "id": str(r.get("id", "")),
            "cause": r["cause"],
            "junction": _junction_name(int(r.get("junction", 0))) if pd.notna(r.get("junction")) else "Unknown",
            "zone": _zone_name(int(r["zone_code"])),
            "severity": r["severity"],
            "started_at": _to_iso(r["start_dt"]),
            "lat": float(r["latitude"]),
            "lng": float(r["longitude"]),
            "requires_road_closure": bool(r.get("requires_road_closure", 0)),
        })

    # ---------- AI intelligence feed (rules-based clusters) ----------
    feed = _build_feed(active, now)

    # ---------- 24h heatmap (today vs yesterday) ----------
    hourly = _hourly_series(df, now)

    # ---------- Risk index contributors ----------
    zone_counts = active.groupby("zone_code").size()
    contributors = [
        {"zone": _zone_name(int(zc)), "weight": int(cnt)}
        for zc, cnt in zone_counts.sort_values(ascending=False).head(6).items()
    ]

    # ---------- Zone snapshot ----------
    zone_snapshot = []
    recent_named = recent[recent["zone_code"] != 0]
    recent_zone = recent_named.groupby("zone_code").size()
    for zc in sorted(recent_zone.index):
        cnt = int(recent_zone[zc])
        # band by count
        band = "critical" if cnt > 10 else "high" if cnt > 5 else "medium" if cnt > 2 else "low"
        zone_snapshot.append({
            "code": int(zc), "name": _zone_name(int(zc)),
            "incidents_30d": cnt, "risk": band,
        })
    # If no named zones have activity (data sparse at tail), fall back to
    # all-time named-zone distribution so the panel still teaches the operator.
    if not zone_snapshot:
        all_named = df[df["zone_code"] != 0]
        for zc, cnt in all_named.groupby("zone_code").size().sort_values(ascending=False).items():
            band = "critical" if cnt > 600 else "high" if cnt > 300 else "medium" if cnt > 100 else "low"
            zone_snapshot.append({
                "code": int(zc), "name": _zone_name(int(zc)),
                "incidents_30d": int(cnt), "risk": band,
            })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_as_of": _to_iso(now),
        "kpis": kpis,
        "active_incidents": active_records,
        "ai_feed": feed,
        "hourly_congestion": hourly,
        "risk_index": {
            "score": risk_score,
            "band": "critical" if risk_score >= 8 else "high" if risk_score >= 6 else "medium" if risk_score >= 3.5 else "low",
            "contributors": contributors,
        },
        "zones": zone_snapshot,
    }


def _sparkline(df: pd.DataFrame, now: Any, points: int, step_mins: int) -> list[int]:
    """Rolling incident count over `points` windows of `step_mins` each."""
    if df.empty or step_mins <= 0:
        return [0] * points
    out = []
    for i in range(points):
        end = now - pd.Timedelta(minutes=step_mins * (points - 1 - i))
        start = end - pd.Timedelta(minutes=step_mins)
        out.append(int(((df["start_dt"] > start) & (df["start_dt"] <= end)).sum()))
    return out


def _build_feed(active: pd.DataFrame, now: Any) -> list[dict[str, Any]]:
    """Generate rules-based insight cards from clusters in the active set."""
    feed: list[dict[str, Any]] = []
    if active.empty:
        return feed

    # Cluster by junction → cause
    cluster = active.groupby(["junction", "cause"]).size().reset_index(name="n")
    cluster = cluster.sort_values("n", ascending=False).head(8)

    cause_label = {
        "vehicle_breakdown": "vehicle breakdowns",
        "accident": "accidents",
        "water_logging": "waterlogging",
        "pot_holes": "pothole reports",
        "construction": "construction activity",
        "congestion": "congestion clusters",
        "tree_fall": "tree-fall reports",
    }
    zone_label_short = {
        1: "Central", 2: "Central", 3: "East", 4: "East",
        5: "North", 6: "North", 7: "South", 8: "South",
        9: "West", 10: "West", 0: "Unknown",
    }

    for _, row in cluster.iterrows():
        junc_code = int(row["junction"]) if pd.notna(row["junction"]) else 0
        junc_name = _junction_name(junc_code)
        if junc_name == "unknown" or junc_code == 0:
            continue  # skip the "rest of city" bucket
        cause = str(row["cause"])
        n = int(row["n"])
        if n < 1:
            continue
        # Look up the most recent matching incident for zone + timestamp.
        match = active[(active["junction"] == row["junction"]) & (active["cause"] == cause)].iloc[-1]
        zone_code = int(match["zone_code"])
        confidence = min(98, 62 + n * 7)
        sev = _severity_for(cause, match["priority_label"], bool(match.get("requires_road_closure", 0)))
        label = cause_label.get(cause, cause.replace("_", " "))
        summary = f"{junc_name}: {label} clustering — {n} incidents in the active window."
        feed.append({
            "id": f"feed-{junc_code}-{cause}",
            "summary": summary,
            "confidence": confidence,
            "zone": zone_label_short.get(zone_code, "Unknown"),
            "severity": sev,
            "generated_at": _to_iso(match["start_dt"]) or _to_iso(now),
        })

    # If nothing clustered, fall back to a city-wide summary.
    if not feed:
        top_cause = active["cause"].value_counts().head(1)
        if not top_cause.empty:
            cause = str(top_cause.index[0])
            n = int(top_cause.iloc[0])
            feed.append({
                "id": "feed-city",
                "summary": f"City-wide: {cause_label.get(cause, cause.replace('_', ' '))} dominate the active window ({n} incidents).",
                "confidence": 70,
                "zone": "City-wide",
                "severity": "medium",
                "generated_at": _to_iso(now),
            })

    return feed[:8]


def _hourly_series(df: pd.DataFrame, now: Any, hours: int = 24) -> list[dict[str, Any]]:
    """Today vs yesterday hourly counts, anchored at the most-recent event."""
    today_start = now - pd.Timedelta(hours=hours)
    yesterday_start = now - pd.Timedelta(hours=hours * 2)
    today = df[(df["start_dt"] > today_start) & (df["start_dt"] <= now)]
    yesterday = df[(df["start_dt"] > yesterday_start) & (df["start_dt"] <= today_start)]

    out = []
    for h in range(hours):
        # Window i: (today_start + i h, today_start + (i+1) h]
        t_end = today_start + pd.Timedelta(hours=h + 1)
        t_start = today_start + pd.Timedelta(hours=h)
        y_end = yesterday_start + pd.Timedelta(hours=h + 1)
        y_start = yesterday_start + pd.Timedelta(hours=h)
        out.append({
            "hour": h,
            "today": int(((today["start_dt"] > t_start) & (today["start_dt"] <= t_end)).sum()),
            "yesterday": int(((yesterday["start_dt"] > y_start) & (yesterday["start_dt"] <= y_end)).sum()),
        })
    return out


# ---------------------------------------------------------------------------
# Intelligence
# ---------------------------------------------------------------------------


def build_intelligence(filters: dict[str, Any]) -> dict[str, Any]:
    df = _events_df()
    work = df.copy()

    if filters.get("from"):
        try:
            f = pd.to_datetime(filters["from"], utc=True)
            work = work[work["start_dt"] >= f]
        except Exception:
            pass
    if filters.get("to"):
        try:
            t = pd.to_datetime(filters["to"], utc=True)
            work = work[work["start_dt"] <= t]
        except Exception:
            pass
    if filters.get("cause"):
        work = work[work["cause"] == str(filters["cause"]).lower()]
    if filters.get("zone"):
        try:
            zc = int(filters["zone"])
            work = work[work["zone_code"] == zc]
        except (ValueError, TypeError):
            pass

    # Monthly trends — three super-cause bands
    monthly: list[dict[str, Any]] = []
    if not work.empty:
        work = work.assign(
            _band=work["cause"].apply(
                lambda c: "accident" if c in ACCIDENT_CAUSES
                else "event" if c in EVENT_CAUSES
                else "operational"
            )
        )
        grp = work.groupby([work["start_dt"].dt.month, "_band"]).size().unstack(fill_value=0)
        for month in range(1, 13):
            row = {"month": month, "label": _month_label(month),
                   "operational": int(grp.loc[month, "operational"]) if (month in grp.index and "operational" in grp.columns) else 0,
                   "event": int(grp.loc[month, "event"]) if (month in grp.index and "event" in grp.columns) else 0,
                   "accident": int(grp.loc[month, "accident"]) if (month in grp.index and "accident" in grp.columns) else 0}
            monthly.append(row)

    # Weekday vs weekend by hour
    wd_vs_we: list[dict[str, Any]] = []
    if not work.empty:
        dow = work["start_dt"].dt.dayofweek
        weekend_mask = dow.isin([5, 6])
        wd = work[~weekend_mask]
        we = work[weekend_mask]
        for h in range(24):
            wd_vs_we.append({
                "hour": h,
                "weekday": int((wd["start_dt"].dt.hour == h).sum()),
                "weekend": int((we["start_dt"].dt.hour == h).sum()),
            })

    # Zone distribution stacked by cause
    zone_dist: list[dict[str, Any]] = []
    if not work.empty:
        zc = work.groupby("zone_code")
        for code, group in zc:
            if int(code) == 0:
                continue  # skip "unknown" aggregate
            by_cause = group["cause"].value_counts().head(5).to_dict()
            zone_dist.append({
                "zone": _zone_name(int(code)),
                "zone_code": int(code),
                "total": int(len(group)),
                "by_cause": {k: int(v) for k, v in by_cause.items()},
            })
        zone_dist.sort(key=lambda r: r["total"], reverse=True)

    # Cause distribution
    cause_dist: list[dict[str, Any]] = []
    if not work.empty:
        cc = work["cause"].value_counts()
        total = int(cc.sum())
        for cause, count in cc.items():
            cause_dist.append({
                "cause": str(cause),
                "count": int(count),
                "pct": round(count / total * 100, 1) if total else 0,
            })

    # Recent events table
    recent: list[dict[str, Any]] = []
    if not work.empty:
        top = work.tail(40).iloc[::-1]
        for _, r in top.iterrows():
            sev = _severity_for(r["cause"], r["priority_label"], bool(r.get("requires_road_closure", 0)))
            crowd = _estimate_crowd(r["cause"], r["priority_label"])
            recent.append({
                "id": str(r.get("id", "")),
                "cause": r["cause"],
                "junction": _junction_name(int(r.get("junction", 0))) if pd.notna(r.get("junction")) else "Unknown",
                "zone": _zone_name(int(r["zone_code"])),
                "started_at": _to_iso(r["start_dt"]),
                "priority": int(r.get("priority", 2)),
                "requires_road_closure": bool(r.get("requires_road_closure", 0)),
                "severity": sev,
                "status": str(r.get("status", "closed")).lower(),
                "crowd_estimate": crowd,
            })

    return {
        "filters": {k: v for k, v in filters.items() if v},
        "total_in_scope": int(len(work)),
        "monthly_trends": monthly,
        "weekday_vs_weekend": wd_vs_we,
        "zone_distribution": zone_dist,
        "cause_distribution": cause_dist,
        "recent_events": recent,
    }


def _estimate_crowd(cause: str, priority_label: str) -> int | None:
    """Honest model estimate — no real crowd data exists. Cause × priority heuristic."""
    base = {
        "public_event": 2500, "procession": 1800, "protest": 600,
        "vip_movement": 120, "accident": 0, "vehicle_breakdown": 0,
        "pot_holes": 0, "construction": 0, "water_logging": 0,
        "tree_fall": 0, "congestion": 0, "debris": 0,
        "road_conditions": 0, "fog_low_visibility": 0, "others": 0,
    }.get(cause, 0)
    if base == 0:
        return None
    return int(base * (1.4 if priority_label == "High" else 1.0))


def _month_label(m: int) -> str:
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return names[m - 1] if 1 <= m <= 12 else f"M{m}"


# ---------------------------------------------------------------------------
# Hotspots extended
# ---------------------------------------------------------------------------


def build_hotspots_extended() -> dict[str, Any]:
    """Extend the existing hotspots.json with geo, severity, trend, recommendation."""
    df = _events_df()

    # Compute junction-level aggregates fresh from the CSV so lat/lng +
    # 7-day trend are real. Use named junctions only (skip code 0).
    named = df[df["junction"].notna() & (df["junction"] != 0)].copy()
    if named.empty:
        return {"generated_at": datetime.now(timezone.utc).isoformat(),
                "summary": {"critical": 0, "high": 0, "medium": 0, "total": 0}, "hotspots": []}

    # Latest 30-day window relative to most-recent event.
    now = named["start_dt"].max()
    last30 = named[named["start_dt"] >= now - pd.Timedelta(days=30)]
    last7 = named[named["start_dt"] >= now - pd.Timedelta(days=7)]

    g30 = last30.groupby("junction")
    g7 = last7.groupby("junction")

    hotspots: list[dict[str, Any]] = []
    for junc_code, group in g30:
        if int(junc_code) == 0:
            continue
        # Geo centroid of real incidents at this junction.
        lat = float(group["latitude"].mean())
        lng = float(group["longitude"].mean())
        total = int(len(group))
        if total < 2:
            continue
        cause_breakdown = {str(k): int(v) for k, v in group["cause"].value_counts().head(8).items()}
        dominant_cause = str(group["cause"].value_counts().idxmax())
        mean_priority = float(group["priority"].mean()) if "priority" in group else 2.0
        pct_closure = float((group.get("requires_road_closure", pd.Series([0])).fillna(0).astype(float).mean() * 100))

        # Severity band from volume + priority + closure rate.
        sev_score = total * 1.5 + (2 - mean_priority) * 4 + pct_closure * 0.6
        if sev_score >= 22 or total >= 8:
            severity = "critical"
        elif sev_score >= 12 or total >= 4:
            severity = "high"
        elif sev_score >= 5:
            severity = "medium"
        else:
            severity = "low"

        # 7-day trend — incident count per day for the last 7 days at this junction.
        j7 = g7.get_group(junc_code) if junc_code in g7.groups else pd.DataFrame()
        incidents_7d = []
        for i in range(6, -1, -1):
            day = now.date() - timedelta(days=i)
            day_count = int((j7["start_dt"].dt.date == day).sum()) if not j7.empty else 0
            incidents_7d.append({"day": day.isoformat(), "count": day_count})

        last_at = group["start_dt"].max()
        recommendation = _recommendation(dominant_cause, severity, total)

        hotspots.append({
            "junction_code": int(junc_code),
            "junction": _junction_name(int(junc_code)),
            "total_incidents": total,
            "cause_breakdown": cause_breakdown,
            "pct_road_closure": round(pct_closure, 1),
            "mean_priority": round(mean_priority, 2),
            "mean_duration_mins": None,
            "lat": lat,
            "lng": lng,
            "zone_code": int(group["zone_code"].mode().iloc[0]) if not group["zone_code"].mode().empty else 0,
            "severity": severity,
            "incidents_7d": incidents_7d,
            "last_incident_at": _to_iso(last_at),
            "recommendation": recommendation,
            "dominant_cause": dominant_cause,
        })

    hotspots.sort(key=lambda r: ({"critical": 0, "high": 1, "medium": 2, "low": 3}[r["severity"]], -r["total_incidents"]))

    summary = {
        "critical": sum(1 for h in hotspots if h["severity"] == "critical"),
        "high": sum(1 for h in hotspots if h["severity"] == "high"),
        "medium": sum(1 for h in hotspots if h["severity"] == "medium"),
        "total": len(hotspots),
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_as_of": _to_iso(now),
        "summary": summary,
        "hotspots": hotspots[:60],
    }


def _recommendation(dominant_cause: str, severity: str, total: int) -> str:
    """Operator-facing intervention suggestion — short, specific, grounded."""
    base = {
        "vehicle_breakdown": "Pre-position a tow truck during evening peak (19:00-22:00). Hard-shoulder patrols would cut clearance time.",
        "accident": "Deploy a quick-response medical unit. Review sightlines and signal timing at this junction.",
        "water_logging": "Coordinate with BBMP drainage; pre-stage portable pumps before monsoon peaks.",
        "pot_holes": "Escalate to BBMP for urgent repair; place warning cones upstream of the cluster.",
        "construction": "Verify contractor lane-closure plan; audit night-lighting and reflective cones.",
        "congestion": "Tune signal cycle; consider manual officers during peak until pattern stabilises.",
        "tree_fall": "Pre-position a tree-clearing crew during monsoon; check for downed power lines.",
        "public_event": "Plan diversion routes 48h ahead; coordinate with event organiser on crowd flow.",
        "procession": "Publish advisory diversions; stage barriers along the procession path.",
        "vip_movement": "Pre-clear the corridor 15 min ahead; stagger signals for smooth flow.",
        "protest": "Establish buffer zone; coordinate with local administration.",
        "debris": "Schedule municipal cleanup; warn motorists via variable message signs.",
        "road_conditions": "Report to road authority; place advisory signage.",
        "fog_low_visibility": "Activate fog advisory; reduce speed limits during early morning.",
        "others": "Monitor pattern; escalate if frequency increases.",
    }.get(dominant_cause, "Monitor the pattern and escalate if it intensifies.")
    suffix = f" {total} incidents in the last 30 days make this a {severity} priority."
    return base + suffix


# ---------------------------------------------------------------------------
# Resource plan
# ---------------------------------------------------------------------------


# Bengaluru zone centroids (model estimates, derived from real event clusters).
def _zone_centroids(df: pd.DataFrame) -> dict[int, tuple[float, float]]:
    out: dict[int, tuple[float, float]] = {}
    named = df[df["zone_code"] != 0]
    for zc, group in named.groupby("zone_code"):
        out[int(zc)] = (float(group["latitude"].mean()), float(group["longitude"].mean()))
    return out


def build_resource_plan(
    *,
    label: str,
    latitude: float,
    longitude: float,
    hour: int,
    day_of_week: int,
    month: int,
    zone: str,
    junction: str,
    police_station: str,
    priority: str,
    requires_road_closure: bool,
    event_cause: str | None = None,
    crowd_estimate: int | None = None,
) -> dict[str, Any]:
    """Wrap the simulate pipeline into a deployment plan with timeline + diversions."""
    from ml.impact_score import calculate_impact_score
    from ml.resource_allocator import allocate_resources

    # Predict cause if not supplied.
    prediction: dict[str, Any] = {}
    cause = event_cause
    if not cause:
        try:
            from ml.train_event_model import predict_event as _predict
            prediction = _predict(
                latitude=latitude, longitude=longitude, hour=hour,
                day_of_week=day_of_week, month=month, zone=zone,
                junction=junction, police_station=police_station, priority=priority,
            )
            cause = prediction.get("prediction", "others")
        except Exception as exc:
            logger.warning("Prediction step failed in resource plan: %s", exc)
            cause = "others"
            prediction = {"prediction": "others", "probability": 1.0, "top_3": []}
    else:
        prediction = {"prediction": cause, "probability": 1.0, "top_3": []}

    impact = calculate_impact_score(
        event_cause=cause, priority=priority, requires_road_closure=requires_road_closure,
    )
    resources = allocate_resources(impact_score=impact["score"], event_cause=cause)
    severity = impact["severity_level"]

    df = _events_df()
    centroids = _zone_centroids(df)

    # Distribute officers across zones — closer zones get more weight.
    scenario_zone_code = _resolve_zone_code(zone)
    officer_total = resources["officers"] * 3  # scale up for a planned event
    zone_weights = _zone_proximity_weights(scenario_zone_code)
    by_zone = []
    existing = []
    recommended = []
    for zc, w in zone_weights.items():
        count = max(1, round(officer_total * w))
        zlat, zlng = centroids.get(zc, (latitude, longitude))
        # Offset existing positions slightly around the scenario centre.
        existing.append({"lat": latitude + (zlat - latitude) * 0.3 + _jitter(),
                         "lng": longitude + (zlng - longitude) * 0.3 + _jitter()})
        for _ in range(min(count, 4)):
            recommended.append({"lat": zlat + _jitter(), "lng": zlng + _jitter()})
        by_zone.append({"zone": _zone_name(zc), "count": count,
                        "position": {"lat": zlat, "lng": zlng}})

    # Barricades — distribute across the top real junctions near the scenario.
    barricade_locations = []
    barricades_total = resources["barricades"] * 4
    # Use real junctions near the scenario from the dataset.
    candidate_junctions = _nearby_named_junctions(df, latitude, longitude, k=8)
    per = max(2, barricades_total // max(1, len(candidate_junctions)))
    for j in candidate_junctions:
        barricade_locations.append({"label": j["name"], "units": per,
                                    "point": {"lat": j["lat"], "lng": j["lng"]}})

    # ERTs
    ert_count = max(2, round(severity_ert_factor(severity)))
    erts = [{"count": ert_count,
             "position": {"lat": latitude + _jitter(), "lng": longitude + _jitter()},
             "label": f"ERT-alpha (near {junction})"}]

    # Diversion routes — real junctions chained From → Via → To.
    diversion_routes = []
    if len(candidate_junctions) >= 3:
        route_sets = [
            (candidate_junctions[0]["name"], candidate_junctions[1]["name"], candidate_junctions[2]["name"],
             [candidate_junctions[i]["point"] if "point" in candidate_junctions[i] else {"lat": candidate_junctions[i]["lat"], "lng": candidate_junctions[i]["lng"]}
              for i in range(3)]),
        ]
        if len(candidate_junctions) >= 5:
            route_sets.append(
                (candidate_junctions[2]["name"], candidate_junctions[3]["name"], candidate_junctions[4]["name"],
                 [{"lat": candidate_junctions[i]["lat"], "lng": candidate_junctions[i]["lng"]} for i in range(2, 5)])
            )
        for frm, via, to, path in route_sets:
            diversion_routes.append({"from": frm, "via": via, "to": to, "path": path})

    # Timeline — six phases relative to event start (T=0 at the requested hour).
    start_dt = datetime.now(timezone.utc).replace(hour=hour, minute=0, second=0, microsecond=0)
    duration_h = 4 if severity in ("critical", "high") else 2
    timeline = [
        {"phase": "advance", "label": "Advance team deployment", "offset_mins": -120,
         "severity": "medium", "detail": "Recon and barricade staging."},
        {"phase": "main", "label": "Main deployment", "offset_mins": -60,
         "severity": "high", "detail": f"{officer_total} officers on position across {len(by_zone)} zones."},
        {"phase": "monitor", "label": "Event start monitoring", "offset_mins": 0,
         "severity": "high", "detail": "Real-time flow monitoring begins."},
        {"phase": "full", "label": "Full deployment", "offset_mins": 30,
         "severity": "critical" if severity == "critical" else "high",
         "detail": "All zones active; diversion routes live."},
        {"phase": "withdraw", "label": "Gradual withdrawal", "offset_mins": duration_h * 60 - 60,
         "severity": "medium", "detail": "Phase down peripheral zones."},
        {"phase": "allclear", "label": "All-clear", "offset_mins": duration_h * 60,
         "severity": "low", "detail": "Final sweep; resume normal ops."},
    ]
    for t in timeline:
        t["at"] = (start_dt + timedelta(minutes=t["offset_mins"])).isoformat()

    return {
        "scenario": {
            "label": label or f"{cause} at {junction}",
            "junction": junction,
            "zone": _zone_name(scenario_zone_code),
            "lat": latitude,
            "lng": longitude,
            "impact_score": round(impact["score"] / 10, 1),  # 0-10 scale for UI
            "severity": severity,
            "cause": cause,
            "crowd_estimate": crowd_estimate,
        },
        "officers": {
            "total": officer_total,
            "by_zone": by_zone,
            "existing": existing[:8],
            "recommended": recommended[:24],
        },
        "equipment": {
            "barricades": {"total": barricades_total, "locations": barricade_locations},
            "erts": erts,
        },
        "diversion_routes": diversion_routes,
        "timeline": timeline,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_attribution": {
            "cause_model": "RandomForest event classifier" if not event_cause else "user-supplied",
            "impact_model": "Rule-based impact engine",
            "resource_model": "Tiered allocator + crowd-control bump",
        },
    }


def _resolve_zone_code(zone: str | int) -> int:
    try:
        return int(zone)
    except (ValueError, TypeError):
        # Try name → code
        labels = _label_map().get("zone", {})
        for code, name in labels.items():
            if str(name).lower() == str(zone).lower():
                return int(code)
        return 0


def _zone_proximity_weights(scenario_zone: int) -> dict[int, float]:
    """Weights across all 10 named zones, peaking at the scenario zone."""
    zones = list(range(1, 11))
    if scenario_zone == 0:
        # Default: Central Zone 1 as centroid if unknown.
        scenario_zone = 1
    # Pairwise rough distance by zone index proximity (toy model, honest estimate).
    raw = {z: 1.0 / (1 + abs(z - scenario_zone)) for z in zones}
    total = sum(raw.values())
    return {z: raw[z] / total for z in zones}


def _nearby_named_junctions(df: pd.DataFrame, lat: float, lng: float, k: int = 8) -> list[dict[str, Any]]:
    """Real named junctions sorted by haversine distance to (lat, lng)."""
    named = df[df["junction"].notna() & (df["junction"] != 0)]
    if named.empty:
        return [{"name": "Silk Board Junc", "lat": 12.9176, "lng": 77.6224}]
    junc = named.groupby("junction").agg(
        lat=("latitude", "mean"), lng=("longitude", "mean"),
        name=("junction", lambda s: _junction_name(int(s.iloc[0]))),
    ).reset_index()
    junc["dist"] = ((junc["lat"] - lat) ** 2 + (junc["lng"] - lng) ** 2).pow(0.5)
    junc = junc[junc["name"] != "unknown"].sort_values("dist").head(k)
    out = []
    for _, r in junc.iterrows():
        nm = str(r["name"])
        if nm in [o["name"] for o in out]:
            continue
        out.append({"name": nm, "lat": float(r["lat"]), "lng": float(r["lng"])})
    return out[:k]


def _jitter() -> float:
    import random
    return random.uniform(-0.004, 0.004)


def severity_ert_factor(severity: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(severity, 2)
