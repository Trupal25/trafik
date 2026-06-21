"""
ASTraM Intelligence — FastAPI Backend
======================================

Serves the traffic-event prediction pipeline, impact scoring, resource
allocation, and pre-computed analytics via a RESTful JSON API.

Run from the ``astram/`` directory::

    uvicorn api.main:app --reload
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import dotenv_values
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_config = dotenv_values(_PROJECT_ROOT / ".env")

_DATA_DIR = Path(_config.get("DATA_DIR", "./data"))
if not _DATA_DIR.is_absolute():
    _DATA_DIR = _PROJECT_ROOT / _DATA_DIR

_MODEL_DIR = Path(_config.get("MODEL_DIR", "./ml/models"))
if not _MODEL_DIR.is_absolute():
    _MODEL_DIR = _PROJECT_ROOT / _MODEL_DIR

API_HOST: str = _config.get("API_HOST", "0.0.0.0")
API_PORT: int = int(_config.get("API_PORT", "8000"))

logger = logging.getLogger("astram.api")

# ---------------------------------------------------------------------------
# Application state — populated at startup
# ---------------------------------------------------------------------------

_state: dict[str, Any] = {
    "model_loaded": False,
    "model_error": None,
    "hotspots": None,
    "stats": None,
    "label_encoders": None,
}


def _load_json_file(path: Path) -> Any:
    """Load a JSON file, raising HTTPException on failure."""
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _try_load_model() -> None:
    """Attempt to import the event-prediction module and verify model files.

    The model loads lazily on first predict_event() call, so we just
    verify the module is importable and model files exist on disk.
    """
    try:
        from ml import train_event_model  # type: ignore[import-untyped]  # noqa: F401

        model_pkl = _MODEL_DIR / "event_classifier.pkl"
        if not model_pkl.is_file():
            raise FileNotFoundError(f"Model file not found: {model_pkl}")

        _state["model_loaded"] = True
        _state["model_error"] = None
        logger.info("ML model module verified — will load lazily on first prediction.")
    except FileNotFoundError as exc:
        _state["model_loaded"] = False
        _state["model_error"] = (
            f"Model files not found — training may still be in progress. "
            f"Details: {exc}"
        )
        logger.warning("Model not loaded: %s", _state["model_error"])
    except ImportError as exc:
        _state["model_loaded"] = False
        _state["model_error"] = (
            f"Training module not available yet. Details: {exc}"
        )
        logger.warning("Model not loaded: %s", _state["model_error"])
    except Exception as exc:  # noqa: BLE001
        _state["model_loaded"] = False
        _state["model_error"] = f"Unexpected error loading model: {exc}"
        logger.exception("Model loading failed unexpectedly.")


def _require_model() -> None:
    """Raise 503 if the ML model is not loaded."""
    if not _state["model_loaded"]:
        raise HTTPException(
            status_code=503,
            detail=(
                "Event-prediction model is not available. "
                + (_state["model_error"] or "Please try again later.")
            ),
        )


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Load the ML model and static data files at startup."""
    logger.info("ASTraM API starting up …")

    # Load ML model (graceful — may fail)
    _try_load_model()

    # Load static analytics files
    try:
        _state["hotspots"] = _load_json_file(
            _DATA_DIR / "processed" / "hotspots.json"
        )
    except FileNotFoundError:
        logger.warning("hotspots.json not found — /hotspots will return 404.")

    try:
        _state["stats"] = _load_json_file(
            _DATA_DIR / "processed" / "stats.json"
        )
    except FileNotFoundError:
        logger.warning("stats.json not found — /stats will return 404.")

    try:
        _state["label_encoders"] = _load_json_file(
            _DATA_DIR / "processed" / "label_encoders.json"
        )
    except FileNotFoundError:
        logger.warning("label_encoders.json not found — /label-encoders will return 404.")

    yield  # ← Application runs here

    logger.info("ASTraM API shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ASTraM Traffic Intelligence API",
    description=(
        "Backend API for the ASTraM (Advanced Smart Traffic Management) "
        "platform. Provides traffic-event prediction, impact scoring, "
        "resource allocation, and historical analytics."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================================================================
# Pydantic schemas
# ===================================================================


# ---- Request models ------------------------------------------------


class PredictEventRequest(BaseModel):
    """Input features for event-cause prediction."""

    latitude: float = Field(..., description="Latitude of the event location")
    longitude: float = Field(..., description="Longitude of the event location")
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0–23)")
    day_of_week: int = Field(
        ..., ge=0, le=6, description="Day of week (0=Mon … 6=Sun)"
    )
    month: int = Field(..., ge=1, le=12, description="Month (1–12)")
    zone: str = Field(..., description="Traffic zone name")
    junction: str = Field(..., description="Junction name")
    police_station: str = Field(..., description="Nearest police station")
    priority: str = Field(
        ..., description="Dispatcher priority — 'High' or 'Low'"
    )


class ImpactScoreRequest(BaseModel):
    """Input for the impact-scoring engine."""

    event_cause: str = Field(
        ..., description="Cause of the event (e.g. 'accident', 'pot_holes')"
    )
    priority: str = Field(
        ..., description="Dispatcher priority — 'High' or 'Low'"
    )
    requires_road_closure: bool = Field(
        ..., description="Whether the event requires a road closure"
    )


class AllocateResourcesRequest(BaseModel):
    """Input for the resource-allocation engine."""

    impact_score: int = Field(
        ..., ge=0, le=100, description="Impact score (0–100)"
    )
    event_cause: str = Field(
        ..., description="Cause of the event (e.g. 'accident', 'pot_holes')"
    )


class SimulateEventRequest(BaseModel):
    """Full simulation input — chains prediction → impact → resources."""

    latitude: float = Field(..., description="Latitude of the event location")
    longitude: float = Field(..., description="Longitude of the event location")
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0–23)")
    day_of_week: int = Field(
        ..., ge=0, le=6, description="Day of week (0=Mon … 6=Sun)"
    )
    month: int = Field(..., ge=1, le=12, description="Month (1–12)")
    zone: str = Field(..., description="Traffic zone name")
    junction: str = Field(..., description="Junction name")
    police_station: str = Field(..., description="Nearest police station")
    priority: str = Field(
        ..., description="Dispatcher priority — 'High' or 'Low'"
    )
    requires_road_closure: bool = Field(
        False, description="Whether the event requires a road closure"
    )
    event_cause: Optional[str] = Field(
        None,
        description=(
            "Cause of the event. If null/empty, the ML model predicts it."
        ),
    )


class ResourcePlanRequest(BaseModel):
    """Input for the AI deployment planner (resource-plan endpoint)."""

    label: Optional[str] = Field(
        None, description="Human-readable scenario name (e.g. 'Diwali at Silk Board')"
    )
    latitude: float = Field(..., description="Scenario centre latitude")
    longitude: float = Field(..., description="Scenario centre longitude")
    hour: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)
    month: int = Field(..., ge=1, le=12)
    zone: str = Field(..., description="Traffic zone code or name")
    junction: str = Field(..., description="Junction name")
    police_station: str = Field("", description="Nearest police station")
    priority: str = Field("High", description="'High' or 'Low'")
    requires_road_closure: bool = False
    event_cause: Optional[str] = Field(
        None, description="Optional cause; if omitted the ML model predicts it"
    )
    crowd_estimate: Optional[int] = Field(
        None, ge=0, description="Optional crowd-size hint (model estimate)"
    )


class CopilotRequest(BaseModel):
    """Input for the AI Copilot (natural-language traffic Q&A)."""

    conversation_id: Optional[str] = Field(
        None, description="Existing conversation ID. Omit to start a new one."
    )
    message: str = Field(..., min_length=1, description="User's question")


# ---- Response models -----------------------------------------------


class PredictEventResponse(BaseModel):
    """Prediction result from the event-cause classifier."""

    prediction: str
    probability: float
    top_3: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Top-3 predictions with probabilities",
    )


class ImpactScoreResponse(BaseModel):
    """Impact-scoring result."""

    score: int
    severity_level: str
    expected_delay_mins: Optional[float] = None
    description: str


class AllocateResourcesResponse(BaseModel):
    """Resource-allocation plan."""

    officers: int
    barricades: int
    diversion_routes: int
    recommended_actions: list[str]
    estimated_cost: int


class SimulateEventResponse(BaseModel):
    """Combined result from the full simulation pipeline."""

    prediction: dict[str, Any]
    impact: dict[str, Any]
    resources: dict[str, Any]
    timestamp: str


class HealthResponse(BaseModel):
    """Health-check response."""

    status: str
    version: str


# ===================================================================
# Endpoints
# ===================================================================


@app.get("/", include_in_schema=False)
async def root_redirect():
    """Redirect root access to interactive Swagger API documentation."""
    return RedirectResponse(url="/docs")


# ---- 1. POST /predict-event ----------------------------------------


@app.post(
    "/predict-event",
    response_model=PredictEventResponse,
    summary="Predict event cause",
    tags=["Prediction"],
)
async def predict_event(request: PredictEventRequest) -> PredictEventResponse:
    """Predict the most likely event cause given location/time features.

    Returns a 503 if the ML model has not been loaded yet.
    """
    _require_model()

    try:
        from ml.train_event_model import predict_event as _predict  # type: ignore[import-untyped]

        result: dict[str, Any] = _predict(
            latitude=request.latitude,
            longitude=request.longitude,
            hour=request.hour,
            day_of_week=request.day_of_week,
            month=request.month,
            zone=request.zone,
            junction=request.junction,
            police_station=request.police_station,
            priority=request.priority,
        )
        return PredictEventResponse(**result)
    except Exception as exc:
        logger.exception("Prediction failed.")
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {exc}",
        ) from exc


# ---- 2. POST /impact-score -----------------------------------------


@app.post(
    "/impact-score",
    response_model=ImpactScoreResponse,
    summary="Calculate impact score",
    tags=["Impact"],
)
async def impact_score(request: ImpactScoreRequest) -> ImpactScoreResponse:
    """Compute a rule-based impact score for a traffic event."""
    try:
        from ml.impact_score import calculate_impact_score

        result: dict[str, Any] = calculate_impact_score(
            event_cause=request.event_cause,
            priority=request.priority,
            requires_road_closure=request.requires_road_closure,
        )
        return ImpactScoreResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Impact scoring failed.")
        raise HTTPException(
            status_code=500,
            detail=f"Impact scoring failed: {exc}",
        ) from exc


# ---- 3. POST /allocate-resources ------------------------------------


@app.post(
    "/allocate-resources",
    response_model=AllocateResourcesResponse,
    summary="Allocate resources",
    tags=["Resources"],
)
async def allocate_resources(
    request: AllocateResourcesRequest,
) -> AllocateResourcesResponse:
    """Recommend personnel, equipment, and actions for an event."""
    try:
        from ml.resource_allocator import allocate_resources as _allocate

        result: dict[str, Any] = _allocate(
            impact_score=request.impact_score,
            event_cause=request.event_cause,
        )
        return AllocateResourcesResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Resource allocation failed.")
        raise HTTPException(
            status_code=500,
            detail=f"Resource allocation failed: {exc}",
        ) from exc


# ---- 4. POST /simulate-event (demo centerpiece) --------------------


@app.post(
    "/simulate-event",
    response_model=SimulateEventResponse,
    summary="Simulate full event pipeline",
    tags=["Simulation"],
)
async def simulate_event(
    request: SimulateEventRequest,
) -> SimulateEventResponse:
    """Chain prediction → impact scoring → resource allocation.

    If ``event_cause`` is null or empty the ML model predicts it first.
    """
    from ml.impact_score import calculate_impact_score
    from ml.resource_allocator import allocate_resources as _allocate

    # --- Step 1: Determine event cause ---
    prediction_result: dict[str, Any] = {}
    event_cause = request.event_cause

    if not event_cause or event_cause.strip() == "":
        # Need the ML model to predict the cause
        _require_model()
        try:
            from ml.train_event_model import predict_event as _predict  # type: ignore[import-untyped]

            prediction_result = _predict(
                latitude=request.latitude,
                longitude=request.longitude,
                hour=request.hour,
                day_of_week=request.day_of_week,
                month=request.month,
                zone=request.zone,
                junction=request.junction,
                police_station=request.police_station,
                priority=request.priority,
            )
            event_cause = prediction_result.get("prediction", "others")
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Prediction step failed in simulation.")
            raise HTTPException(
                status_code=500,
                detail=f"Prediction step failed: {exc}",
            ) from exc
    else:
        prediction_result = {
            "prediction": event_cause,
            "probability": 1.0,
            "top_3": [],
            "note": "Event cause was provided by the user.",
        }

    # --- Step 2: Impact scoring ---
    try:
        impact_result: dict[str, Any] = calculate_impact_score(
            event_cause=event_cause,
            priority=request.priority,
            requires_road_closure=request.requires_road_closure,
        )
    except Exception as exc:
        logger.exception("Impact scoring step failed in simulation.")
        raise HTTPException(
            status_code=500,
            detail=f"Impact scoring step failed: {exc}",
        ) from exc

    # --- Step 3: Resource allocation ---
    try:
        resources_result: dict[str, Any] = _allocate(
            impact_score=impact_result["score"],
            event_cause=event_cause,
        )
    except Exception as exc:
        logger.exception("Resource allocation step failed in simulation.")
        raise HTTPException(
            status_code=500,
            detail=f"Resource allocation step failed: {exc}",
        ) from exc

    return SimulateEventResponse(
        prediction=prediction_result,
        impact=impact_result,
        resources=resources_result,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ---- 5. GET /hotspots -----------------------------------------------


@app.get(
    "/hotspots",
    summary="Get incident hotspots",
    tags=["Analytics"],
)
async def get_hotspots() -> list[dict[str, Any]]:
    """Return pre-computed junction-level incident hotspots."""
    if _state["hotspots"] is None:
        raise HTTPException(
            status_code=404,
            detail="Hotspot data not available. Run preprocessing first.",
        )
    return _state["hotspots"]


# ---- 6. GET /stats --------------------------------------------------


@app.get(
    "/stats",
    summary="Get dataset statistics",
    tags=["Analytics"],
)
async def get_stats() -> dict[str, Any]:
    """Return pre-computed summary statistics for the event dataset."""
    if _state["stats"] is None:
        raise HTTPException(
            status_code=404,
            detail="Stats data not available. Run preprocessing first.",
        )
    return _state["stats"]


@app.get(
    "/label-encoders",
    summary="Get label encoders",
    tags=["Analytics"],
)
async def get_label_encoders() -> dict[str, Any]:
    """Return pre-computed label encoder mappings."""
    if _state["label_encoders"] is None:
        raise HTTPException(
            status_code=404,
            detail="Label encoders not available. Run preprocessing first.",
        )
    return _state["label_encoders"]


# ---- 8. GET /dashboard ---------------------------------------------


@app.get(
    "/dashboard",
    summary="Command Center dashboard aggregate",
    tags=["Dashboard"],
)
async def get_dashboard() -> dict[str, Any]:
    """Real-time-style dashboard aggregate.

    Derived from events_clean.csv anchored at the most recent event timestamp
    (the dataset is historical; this presents the latest operational picture).
    """
    try:
        from ml.analytics import build_dashboard
        return build_dashboard()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Dashboard data unavailable. {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Dashboard build failed.")
        raise HTTPException(
            status_code=500, detail=f"Dashboard build failed: {exc}"
        ) from exc


# ---- 9. GET /intelligence ------------------------------------------


@app.get(
    "/intelligence",
    summary="Historical analytics with filters",
    tags=["Analytics"],
)
async def get_intelligence(
    request: Request,
    cause: Optional[str] = None,
    zone: Optional[str] = None,
) -> dict[str, Any]:
    """Filtered historical analytics: monthly trends, weekday/weekend,
    zone distribution, cause distribution, recent events table.

    Accepts ``cause``, ``zone``, ``from`` (ISO date), ``to`` (ISO date) as
    query parameters. Filters apply without reloading.
    """
    try:
        from ml.analytics import build_intelligence
        qp = request.query_params
        filters = {
            "cause": cause,
            "zone": zone,
            "from": qp.get("from"),
            "to": qp.get("to"),
        }
        return build_intelligence(filters)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404, detail=f"Intelligence data unavailable. {exc}"
        ) from exc
    except Exception as exc:
        logger.exception("Intelligence build failed.")
        raise HTTPException(
            status_code=500, detail=f"Intelligence build failed: {exc}"
        ) from exc


# ---- 10. GET /hotspots/extended ------------------------------------


@app.get(
    "/hotspots/extended",
    summary="Hotspots with geo + severity + trend",
    tags=["Hotspots"],
)
async def get_hotspots_extended() -> dict[str, Any]:
    """Extended hotspot view: real lat/lng per junction, severity band,
    7-day incident trend, and AI recommendation per hotspot."""
    try:
        from ml.analytics import build_hotspots_extended
        return build_hotspots_extended()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404, detail=f"Hotspot data unavailable. {exc}"
        ) from exc
    except Exception as exc:
        logger.exception("Hotspots extended build failed.")
        raise HTTPException(
            status_code=500, detail=f"Hotspots build failed: {exc}"
        ) from exc


# ---- 11. POST /resource-plan ---------------------------------------


@app.post(
    "/resource-plan",
    summary="AI-generated deployment plan for a scenario",
    tags=["Resources"],
)
async def resource_plan(request: ResourcePlanRequest) -> dict[str, Any]:
    """Build a deployment plan (officers, barricades, ERTs, diversion routes,
    phased timeline) for a chosen scenario.

    Chains the existing prediction → impact → resource pipeline and wraps it
    into a zone-level deployment plan derived from real junction data.
    """
    try:
        from ml.analytics import build_resource_plan
        return build_resource_plan(
            label=request.label,
            latitude=request.latitude,
            longitude=request.longitude,
            hour=request.hour,
            day_of_week=request.day_of_week,
            month=request.month,
            zone=request.zone,
            junction=request.junction,
            police_station=request.police_station,
            priority=request.priority,
            requires_road_closure=request.requires_road_closure,
            event_cause=request.event_cause,
            crowd_estimate=request.crowd_estimate,
        )
    except Exception as exc:
        logger.exception("Resource plan build failed.")
        raise HTTPException(
            status_code=500, detail=f"Resource plan failed: {exc}"
        ) from exc


# ---- 12. POST /copilot ---------------------------------------------


@app.post(
    "/copilot",
    summary="AI Copilot — natural-language traffic Q&A (Groq + Llama 3)",
    tags=["Copilot"],
)
async def copilot(request: CopilotRequest) -> dict[str, Any]:
    """Conversational AI assistant grounded in the live traffic dataset via
    tool-calling. Returns plain text for simple queries or a structured
    intelligence card for complex scenario questions.

    Requires ``GROQ_API_KEY`` in the project-root ``.env``. Returns 503
    with a clear message if the key is missing.
    """
    try:
        from ml.copilot import run_copilot, is_available

        if not is_available():
            raise HTTPException(
                status_code=503,
                detail=(
                    "GROQ_API_KEY is not set on the backend. Add it to the "
                    "project-root .env file (see .env.example). Free keys at "
                    "https://console.groq.com/keys."
                ),
            )
        result = run_copilot(request.message, request.conversation_id)
        return result
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Copilot failed.")
        raise HTTPException(
            status_code=500, detail=f"Copilot failed: {exc}"
        ) from exc


# ---- 13. GET /copilot/conversations --------------------------------


@app.get(
    "/copilot/conversations",
    summary="List recent Copilot conversations (for the sidebar)",
    tags=["Copilot"],
)
async def copilot_conversations() -> list[dict[str, Any]]:
    """Return metadata for recent in-memory conversations."""
    from ml.copilot import list_conversations
    return list_conversations()


# ---- 7. GET /health -------------------------------------------------


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    tags=["System"],
)
async def health_check() -> HealthResponse:
    """Return API health status."""
    return HealthResponse(status="healthy", version="1.0.0")


# ===================================================================
# Standalone entry-point
# ===================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )
