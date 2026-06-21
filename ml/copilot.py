"""
copilot.py — Groq + Llama 3 traffic assistant with tool-calling.

The LLM is scoped to the Bengaluru Traffic Police context and given tools
that query the live analytics layer (dashboard, hotspots, intelligence,
simulation). It grounds every answer in real data — never fabricates.

Tool-calling flow:
  1. user message + system prompt + tool defs → Groq
  2. if Groq returns tool_calls → execute locally → append results → re-send
  3. if Groq returns text or calls render_intelligence_card → return that

Conversation history is held in-memory keyed by conversation_id. Capped to
the last ~24 messages per conversation to bound token usage.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from dotenv import dotenv_values
from groq import Groq, GroqError

logger = logging.getLogger(__name__)

_PROJECT_ROOT = __import__("pathlib").Path(__file__).resolve().parents[1]
_config = dotenv_values(_PROJECT_ROOT / ".env")

_API_KEY: str | None = _config.get("GROQ_API_KEY") or None
_MODEL: str = _config.get("GROQ_MODEL") or "llama-3.3-70b-versatile"

_client: Groq | None = None
_conversations: dict[str, list[dict[str, Any]]] = {}
_MAX_HISTORY = 24
_MAX_TOOL_ROUNDS = 4

SYSTEM_PROMPT = """You are UrbanPulse AI, the traffic intelligence assistant for the Bengaluru Traffic Police. You help operators and officers understand the city's traffic situation by answering questions about active incidents, hotspots, historical patterns, and hypothetical scenarios.

You have tools that query a live database of 8,170+ real Bengaluru traffic incidents. ALWAYS use the tools to ground your answers in real data. Never invent numbers, junction names, or statistics.

Guidelines:
- For simple greetings or clarifications, respond in plain text without tools.
- For questions about the current city state, call get_dashboard_summary or get_hotspots.
- For questions about trends or history, call get_event_intelligence.
- For "what-if" or event-impact questions, call simulate_scenario.
- When answering complex queries about a specific junction, event, or scenario, call render_intelligence_card with structured findings. Operators prefer cards for actionable intelligence.
- Keep plain-text responses to 2-4 sentences. Operators are busy.
- Use real junction names from the tool results. Do not invent junctions.
- If the tools return insufficient data, say so honestly.
- Severity vocabulary: critical, high, medium, low — use these exact lowercase terms.
- The dataset covers Jan-Apr and Nov-Dec 2024. Reference "recent data" rather than "today" unless a tool returns a specific timestamp.

You are speaking to trained traffic control operators. Be direct, specific, and operational. No marketing tone, no hedging, no em dashes."""


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling schema)
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_dashboard_summary",
            "description": "Get the current city-wide traffic dashboard: active incidents, KPIs (risk index, congestion, officers recommended), top zones, and AI feed signals.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hotspots",
            "description": "Get ranked traffic hotspots with incident counts, dominant cause, severity, and AI recommendations. Filter by severity if needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"], "description": "Optional severity filter"},
                    "limit": {"type": "integer", "description": "Max hotspots to return (default 8)", "default": 8},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_event_intelligence",
            "description": "Query historical traffic event analytics: monthly trends, weekday/weekend patterns, zone distribution, cause distribution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cause": {"type": "string", "description": "Filter by event cause (e.g. 'accident', 'vehicle_breakdown', 'public_event')"},
                    "zone": {"type": "string", "description": "Filter by zone code (1-10)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_scenario",
            "description": "Run a what-if simulation for a hypothetical event at a junction. Returns impact score, severity, officers/barricades needed, and deployment timeline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "junction": {"type": "string", "description": "Junction name from the data (e.g. 'SilkBoardJunc', 'MekhriCircle', 'YelhankaCircle')"},
                    "cause": {"type": "string", "description": "Event cause (e.g. 'public_event', 'accident', 'congestion')"},
                    "crowd_size": {"type": "integer", "description": "Expected crowd size, if relevant"},
                    "requires_closure": {"type": "boolean", "description": "Whether road closure is required"},
                },
                "required": ["junction", "cause"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "render_intelligence_card",
            "description": "Render a structured intelligence card for complex responses. Use this (instead of plain text) when answering about a specific junction, event impact, or actionable scenario. The card shows metrics, recommendations, and optional diversion routes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short card title (e.g. 'Silk Board — Diwali Impact')"},
                    "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                    "summary": {"type": "string", "description": "One or two sentence plain-language analysis"},
                    "metrics": {
                        "type": "array",
                        "description": "Key metrics to display in a grid",
                        "items": {
                            "type": "object",
                            "properties": {"label": {"type": "string"}, "value": {"type": "string"}},
                            "required": ["label", "value"],
                        },
                    },
                    "recommendations": {"type": "array", "items": {"type": "string"}, "description": "Actionable recommendations"},
                    "diversions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"from": {"type": "string"}, "via": {"type": "string"}, "to": {"type": "string"}},
                            "required": ["from", "via", "to"],
                        },
                    },
                    "confidence": {"type": "integer", "description": "Model confidence 0-100"},
                },
                "required": ["title", "severity", "summary"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Client + availability
# ---------------------------------------------------------------------------


def is_available() -> bool:
    """True iff a Groq API key is configured."""
    return bool(_API_KEY)


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Tool execution — wraps the analytics layer
# ---------------------------------------------------------------------------


def _exec_tool(name: str, args: dict[str, Any]) -> str:
    """Execute a tool by name and return a JSON string for the LLM."""
    try:
        if name == "get_dashboard_summary":
            return _tool_dashboard()
        if name == "get_hotspots":
            return _tool_hotspots(args)
        if name == "get_event_intelligence":
            return _tool_intelligence(args)
        if name == "simulate_scenario":
            return _tool_simulate(args)
        if name == "render_intelligence_card":
            # Not a data tool — the args themselves are the card. Return an ack.
            return json.dumps({"status": "card_queued", "card": args})
        return json.dumps({"error": f"unknown tool: {name}"})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tool %s failed", name)
        return json.dumps({"error": f"{name} failed: {exc}"})


def _tool_dashboard() -> str:
    from ml.analytics import build_dashboard
    d = build_dashboard()
    # Trim to what the LLM needs — avoid dumping all 24 incidents.
    return json.dumps({
        "data_as_of": d["data_as_of"],
        "kpis": [{"label": k["label"], "value": k["value"], "unit": k.get("unit"), "severity": k.get("severity")} for k in d["kpis"]],
        "active_incidents_count": len(d["active_incidents"]),
        "top_active": [
            {"cause": i["cause"], "junction": i["junction"], "zone": i["zone"], "severity": i["severity"]}
            for i in d["active_incidents"][:8]
        ],
        "risk_index": d["risk_index"],
        "top_zones": d["zones"][:5],
        "ai_feed_count": len(d["ai_feed"]),
        "ai_feed_top": d["ai_feed"][:3],
    }, default=str)


def _tool_hotspots(args: dict[str, Any]) -> str:
    from ml.analytics import build_hotspots_extended
    h = build_hotspots_extended()
    severity = args.get("severity")
    limit = int(args.get("limit", 8))
    items = h["hotspots"]
    if severity:
        items = [x for x in items if x["severity"] == severity]
    return json.dumps({
        "summary": h["summary"],
        "hotspots": [
            {
                "junction": x["junction"],
                "severity": x["severity"],
                "total_incidents": x["total_incidents"],
                "dominant_cause": x["dominant_cause"],
                "last_incident_at": x["last_incident_at"],
                "recommendation": x["recommendation"],
                "lat": x["lat"], "lng": x["lng"],
            }
            for x in items[:limit]
        ],
    }, default=str)


def _tool_intelligence(args: dict[str, Any]) -> str:
    from ml.analytics import build_intelligence
    result = build_intelligence({
        "cause": args.get("cause"),
        "zone": args.get("zone"),
    })
    return json.dumps({
        "total_in_scope": result["total_in_scope"],
        "cause_distribution": result["cause_distribution"][:6],
        "zone_distribution": [{"zone": z["zone"], "total": z["total"]} for z in result["zone_distribution"][:6]],
        "monthly_totals": [
            {"month": m["label"], "total": m["operational"] + m["event"] + m["accident"]}
            for m in result["monthly_trends"]
        ],
    }, default=str)


def _tool_simulate(args: dict[str, Any]) -> str:
    from ml.analytics import build_resource_plan, _events_df, _junction_name, _resolve_zone_code
    junction = args["junction"]
    cause = args["cause"]
    # Look up the junction's real coordinates from the dataset.
    df = _events_df()
    junction_code = None
    for code, name in {0: "unknown"}.items():
        pass
    # Find the junction code by name from the label map.
    import ml.analytics as a
    labels = a._label_map().get("junction", {})
    name_to_code = {v: k for k, v in labels.items()}
    junction_code = name_to_code.get(junction)
    if junction_code is None:
        # Fuzzy: find a named junction containing the query string.
        for name, code in name_to_code.items():
            if junction.lower() in name.lower() or name.lower() in junction.lower():
                junction_code = code
                junction = name
                break
    if junction_code is None:
        return json.dumps({"error": f"Junction '{junction}' not found in the dataset."})

    row = df[df["junction"] == junction_code]
    if row.empty:
        return json.dumps({"error": f"No incident data for junction '{junction}'."})
    lat = float(row["latitude"].mean())
    lng = float(row["longitude"].mean())
    zone_code = int(row["zone_code"].mode().iloc[0]) if not row["zone_code"].mode().empty else 0

    from datetime import datetime
    now = datetime.now()
    plan = build_resource_plan(
        label=f"{cause} at {junction}",
        latitude=lat, longitude=lng,
        hour=args.get("hour", now.hour),
        day_of_week=(now.weekday()),
        month=now.month,
        zone=str(zone_code),
        junction=junction,
        police_station=str(row["police_station"].iloc[0]) if "police_station" in row.columns else "Bengaluru Traffic Police",
        priority="High" if (args.get("crowd_size", 0) or 0) > 5000 or args.get("requires_closure") else "Low",
        requires_road_closure=bool(args.get("requires_closure", False)),
        event_cause=cause,
        crowd_estimate=args.get("crowd_size"),
    )
    return json.dumps({
        "scenario": plan["scenario"],
        "officers_total": plan["officers"]["total"],
        "barricades_total": plan["equipment"]["barricades"]["total"],
        "erts": plan["equipment"]["erts"][0]["count"] if plan["equipment"]["erts"] else 0,
        "diversion_routes": [{"from": r["from"], "via": r["via"], "to": r["to"]} for r in plan["diversion_routes"]],
        "timeline_phases": len(plan["timeline"]),
        "recommendations": plan["scenario"].get("recommendations", []),
        "barricade_locations": [b["label"] for b in plan["equipment"]["barricades"]["locations"][:5]],
    }, default=str)


# ---------------------------------------------------------------------------
# Conversation state
# ---------------------------------------------------------------------------


def _get_history(conversation_id: str | None) -> tuple[str, list[dict[str, Any]]]:
    if not conversation_id:
        conversation_id = str(uuid.uuid4())
    history = _conversations.get(conversation_id, [])
    return conversation_id, history


def _save_history(conversation_id: str, history: list[dict[str, Any]]) -> None:
    # Drop system prompt + oldest messages to bound token usage.
    trimmed = [m for m in history if m.get("role") != "system"][-_MAX_HISTORY:]
    # Always re-prepend the system prompt at call time instead.
    _conversations[conversation_id] = trimmed


def list_conversations() -> list[dict[str, Any]]:
    """Return conversation metadata for the sidebar (id + first user message + time)."""
    out = []
    for cid, msgs in _conversations.items():
        first_user = next((m for m in msgs if m.get("role") == "user"), None)
        title = ""
        if first_user:
            content = first_user.get("content", "")
            if isinstance(content, list):
                content = " ".join(str(p.get("text", "")) for p in content if isinstance(p, dict))
            title = str(content)[:60]
        out.append({"id": cid, "title": title or "New conversation", "message_count": len(msgs)})
    # Most recent first
    out.sort(key=lambda r: r["message_count"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Main entry — run_copilot
# ---------------------------------------------------------------------------


def run_copilot(message: str, conversation_id: str | None = None) -> dict[str, Any]:
    """Send a user message through the Groq tool-calling loop and return the response.

    Returns: {message: {role, content, card?, created_at}, conversation_id, model, usage}
    Raises RuntimeError if the API key is missing or the call fails.
    """
    if not is_available():
        raise RuntimeError("GROQ_API_KEY is not set. Add it to the project-root .env file.")

    conversation_id, history = _get_history(conversation_id)

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": message})

    client = _get_client()
    card: dict[str, Any] | None = None
    content = ""
    usage: dict[str, Any] = {}

    for round_idx in range(_MAX_TOOL_ROUNDS):
        try:
            response = client.chat.completions.create(
                model=_MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.4,
                max_tokens=1024,
            )
        except GroqError as exc:
            raise RuntimeError(f"Groq API error: {exc}") from exc

        choice = response.choices[0]
        msg = choice.message
        usage = {
            "prompt_tokens": getattr(response.usage, "prompt_tokens", 0) if response.usage else 0,
            "completion_tokens": getattr(response.usage, "completion_tokens", 0) if response.usage else 0,
        } if response.usage else {}

        # Append the assistant message (with any tool_calls) to the running list.
        assistant_entry: dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        messages.append(assistant_entry)

        if not msg.tool_calls:
            # Plain text response — done.
            content = msg.content or ""
            break

        # Execute each tool call and append the results.
        for tc in msg.tool_calls:
            fn = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            if fn == "render_intelligence_card":
                # Capture the card for the UI; no further LLM round needed.
                card = args
                content = args.get("summary", "")
                # Still ack the tool so the loop stays well-formed.
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": fn,
                    "content": json.dumps({"status": "rendered"}),
                })
                continue

            result = _exec_tool(fn, args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "name": fn,
                "content": result,
            })
        # Loop continues — Groq will synthesize from the tool results.
    else:
        # Hit the round cap without a terminal message — use whatever we have.
        content = content or "I reached the tool-call limit while investigating. Could you refine the question?"

    # Persist history (without the system prompt, which we re-prepend each call).
    persisted = list(messages[1:])  # drop system
    _save_history(conversation_id, persisted)

    return {
        "message": {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": content,
            "card": card,
            "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        },
        "conversation_id": conversation_id,
        "model": _MODEL,
        "usage": usage,
    }
