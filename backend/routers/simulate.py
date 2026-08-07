"""
routers/simulate.py — Real simulation endpoint backed by the OR-Tools solver.
  POST /api/simulate/run — run optimization solver with real train data from DB
"""

import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime

from database import get_db
from models import Train, SimulationResult, User, AuditLog, Conflict, Decision, TrainStatusEnum, DecisionSourceEnum
from auth_utils import get_current_user, require_section_access
from algorithm.solver import PrecedenceOptimizer

router = APIRouter()


class SimulationRequest(BaseModel):
    train_ids: Optional[List[str]] = None
    disruption_type: str = "FREIGHT_DELAY"
    disruption_location: str = "AGC"
    disruption_duration_minutes: int = 20
    objective: str = "MINIMIZE_DELAY"
    num_platforms: int = 2
    headway_minutes: int = 3


class ApplySimulationRequest(BaseModel):
    simulation_id: int
    notes: Optional[str] = "Applied AI-optimized precedence strategy from simulation."


class ApplySimulationResponse(BaseModel):
    success: bool
    trains_updated: int
    conflicts_resolved: int
    message: str


# ─── Disruption Penalty Calculator ─────────────────────────────────────────────
# ... rest unchanged ...



class SimActionResult(BaseModel):
    train: str
    action: str
    delta: int   # delay delta in minutes (negative = time saved)


class SimulationResponse(BaseModel):
    status: str
    baseline_delay: int
    optimized_delay: int
    delay_delta: int
    throughput_change: float
    conflicts_avoided: int
    actions: List[SimActionResult]
    schedule: Optional[List[dict]] = []  # full schedule for Gantt chart
    simulation_id: Optional[int] = None


# ─── Disruption Penalty Calculator ─────────────────────────────────────────────

DISRUPTION_MULTIPLIERS = {
    "HEAVY_WEATHER":     0.5,   # slows all trains to 50% speed — moderate delay
    "ENGINE_BREAKDOWN":  1.5,   # derails one train hard — high cascading delay
    "SIGNAL_FAILURE":    0.8,   # partial slowdown across section
    "MAINTENANCE":       1.0,   # forced stop for duration at the location
}

def apply_disruption_penalties(solver_trains: list, disruption_type: str,
                                disruption_location: str, duration_minutes: int) -> list:
    """
    Inject realistic delay penalties into each train based on the disruption scenario.
    Trains are affected proportionally by duration and the disruption type multiplier.
    """
    multiplier = DISRUPTION_MULTIPLIERS.get(disruption_type, 1.0)
    base_penalty = int(duration_minutes * multiplier)
    # Ensure minimum meaningful penalty so scenarios differ visibly
    base_penalty = max(base_penalty, 30)

    for t in solver_trains:
        # All trains in the section are affected; scale by priority
        priority_penalty_scale = {"EXPRESS": 0.7, "LOCAL": 1.0, "FREIGHT": 1.2}.get(
            str(t.get("priority", "FREIGHT")).upper(), 1.0
        )
        extra_delay = int(base_penalty * priority_penalty_scale)
        t["delay"] = t.get("delay", 0) + extra_delay

        # Tag which disruption affected this train for the Gantt
        t["disruption_context"] = f"{disruption_type} @ {disruption_location} ({duration_minutes}min)"

    return solver_trains


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/run", response_model=SimulationResponse)
async def run_simulation(
    req: SimulationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run the OR-Tools CP-SAT precedence optimizer on the requested trains.
    Applies disruption penalty to train delays before calling the solver.
    """
    # Fetch trains from DB
    if not req.train_ids:
        result = await db.execute(select(Train).where(Train.section == current_user.section).options(selectinload(Train.schedules)))
    else:
        result = await db.execute(select(Train).where(Train.id.in_(req.train_ids)).options(selectinload(Train.schedules)))

    trains_db = result.scalars().all()

    if not trains_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"None of the requested trains found: {req.train_ids}",
        )

    for tr in trains_db:
        require_section_access(current_user, tr.section)

    # Build solver-compatible train dicts
    solver_trains = []
    for tr in trains_db:
        speed = tr.speed if tr.speed and tr.speed > 0 else 60.0

        if tr.schedules:
            sorted_schedules = sorted(tr.schedules, key=lambda s: s.sequence)
            # Schedule.distance_km is the cumulative km-from-origin marker at
            # each stop, not a per-leg distance — so total distance travelled
            # is the last stop's marker, not a sum across all stops (summing
            # cumulative markers inflates it several-fold).
            distance = max((s.distance_km or 0.0) for s in sorted_schedules)

            first_dep = sorted_schedules[0].departure_time
            if first_dep:
                now_dt = datetime.now(first_dep.tzinfo)
                # Solver works in minutes throughout (durations, headway, horizon) —
                # this must be minutes too, not raw seconds, or every downstream
                # timing comparison is off by a factor of 60.
                scheduled_arrival = int((first_dep - now_dt).total_seconds() / 60)
            else:
                scheduled_arrival = 0
        else:
            distance = 300.0
            # Spread trains across a 6-hour window based on their DB index
            # so solver has meaningful time separation to work with
            train_index = solver_trains.__len__()
            scheduled_arrival = train_index * 25  # 25 min apart

        solver_trains.append({
            "id":                tr.id,
            "name":              tr.name,
            "speed":             speed,
            "distance":          distance,
            "scheduled_arrival": scheduled_arrival,
            "priority":          tr.priority.value,
            "delay":             max(tr.delay or 0, 0),
        })

    # Normalize scheduled_arrival so minimum is 0
    if solver_trains:
        now_offset = min(t["scheduled_arrival"] for t in solver_trains)
        for t in solver_trains:
            t["scheduled_arrival"] = max(0, t["scheduled_arrival"] - now_offset)

    solver_trains = apply_disruption_penalties(
        solver_trains,
        disruption_type=req.disruption_type,
        disruption_location=req.disruption_location,
        duration_minutes=req.disruption_duration_minutes,
    )

    # Inject the disruption penalty (already in minutes — Train.delay and
    # apply_disruption_penalties() both operate in minutes, see models.py) into
    # scheduled_arrival so the solver knows trains are already delayed.
    for t in solver_trains:
        t["scheduled_arrival"] = max(0, t["scheduled_arrival"] + int(t["delay"]))

    # Baseline = what total delay looks like if AI does nothing (in minutes)
    baseline_delay = sum(int(t["delay"]) for t in solver_trains)

    # Run solver
    try:
        optimizer = PrecedenceOptimizer(
            trains=solver_trains,
            track_capacity=1,
            num_platforms=req.num_platforms,
            headway_minutes=req.headway_minutes,
            objective=req.objective,
        )
        solver_result = optimizer.solve()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Solver error: {str(exc)}",
        )

    # Derive optimised metrics from solver output
    schedule = solver_result.get("schedule", [])

    # Enrich schedule entries with train metadata for the Gantt chart
    train_meta = {t["id"]: t for t in solver_trains}
    for entry in schedule:
        meta = train_meta.get(entry["train"], {})
        entry["train_number"] = entry["train"]
        entry["train_name"] = meta.get("name", entry["train"])

    # optimized_delay is already in minutes from solver output
    # baseline_delay is now also in minutes — units match
    optimized_delay = sum(s.get("delay_minutes", 0) for s in schedule)
    delay_delta = optimized_delay - baseline_delay

    conflicts_avoided = sum(1 for s in schedule if s.get("action") in ["HOLD", "REROUTE"])

    baseline_count = len(trains_db)
    delayed_count = sum(1 for s in schedule if s.get("delay_minutes", 0) > 0)
    throughput_change = round(((baseline_count - delayed_count) / baseline_count) * 100, 1) if baseline_count > 0 else 0.0

    actions = []
    for sched in schedule:
        # t["delay"] and sched["delay_minutes"] are both in minutes.
        # scheduled_arrival already has penalty baked in — so solver delay_minutes
        # IS the optimized result relative to the disrupted schedule
        original_delay_mins = int(
            next((t["delay"] for t in solver_trains if t["id"] == sched["train"]), 0)
        )
        delta = sched.get("delay_minutes", 0) - original_delay_mins
        actions.append(SimActionResult(
            train=sched["train"],
            action=sched["action"],
            delta=delta,
        ))

    response_data = SimulationResponse(
        status=solver_result.get("status", "COMPLETED"),
        baseline_delay=baseline_delay,
        optimized_delay=optimized_delay,
        delay_delta=delay_delta,
        throughput_change=throughput_change,
        conflicts_avoided=conflicts_avoided,
        actions=actions,
        schedule=schedule,
    )

    # Persist simulation result
    sim_record = SimulationResult(
        event_type=req.disruption_type,
        location=req.disruption_location,
        duration_min=req.disruption_duration_minutes,
        objective=req.objective,
        baseline_delay=baseline_delay,
        optimized_delay=optimized_delay,
        delay_delta=delay_delta,
        conflicts_avoided=conflicts_avoided,
        result_json=json.dumps(response_data.model_dump()),
        run_by=current_user.id,
    )
    db.add(sim_record)
    await db.commit()
    await db.refresh(sim_record)

    response_data.simulation_id = sim_record.id
    return response_data


@router.post("/apply", response_model=ApplySimulationResponse)
async def apply_simulation_plan(
    req: ApplySimulationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Apply an AI-optimized simulation plan directly to live section trains in PostgreSQL.
    Updates train delay, status, and platform; resolves active section conflicts; logs audit trails.
    """
    # Fetch simulation record
    sim_result = await db.execute(
        select(SimulationResult).where(SimulationResult.id == req.simulation_id)
    )
    sim_rec = sim_result.scalar_one_or_none()

    if not sim_rec or not sim_rec.result_json:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation result #{req.simulation_id} not found."
        )

    try:
        data = json.loads(sim_rec.result_json)
        schedule = data.get("schedule", [])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse simulation result JSON: {exc}"
        )

    trains_updated = 0
    for entry in schedule:
        tr_id = entry.get("train")
        if not tr_id:
            continue

        result = await db.execute(select(Train).where(Train.id == tr_id))
        tr = result.scalar_one_or_none()
        if tr:
            require_section_access(current_user, tr.section)
            tr.delay = int(entry.get("delay_minutes", 0))
            tr.platform = int(entry.get("platform", 1))
            
            action = entry.get("action", "PROCEED")
            if action == "HOLD":
                tr.status = TrainStatusEnum.HALTED
            elif action == "REROUTE":
                tr.status = TrainStatusEnum.DELAYED
            else:
                tr.status = TrainStatusEnum.RUNNING

            trains_updated += 1

    # Resolve active section conflicts
    conf_res = await db.execute(
        select(Conflict).where(Conflict.resolved == False)
    )
    active_conflicts = conf_res.scalars().all()
    conflicts_resolved = 0

    now_dt = datetime.utcnow()
    for conf in active_conflicts:
        conf.resolved = True
        conf.resolved_at = now_dt
        
        # Insert Decision — id must be unique per apply-event, not just per
        # conflict. It was previously f"D-SIM-{conf.id[:6]}", deterministic
        # from the conflict id alone, so applying a strategy for the same
        # conflict more than once ever (a second simulation run, a retry,
        # even on a different day) collided with the earlier row and the
        # whole request 500'd with a UNIQUE constraint violation —
        # reproduced directly: verified via real API call.
        decision = Decision(
            id=f"D-SIM-{conf.id[:6]}-{uuid.uuid4().hex[:6].upper()}",
            conflict_id=conf.id,
            action="ACCEPT_AI_SIMULATION",
            operator_id=current_user.id,
            source=DecisionSourceEnum.AI,
            notes=f"Auto-applied from simulation #{req.simulation_id}. {req.notes or ''}",
        )
        db.add(decision)
        conflicts_resolved += 1

    # Insert Audit Log
    audit = AuditLog(
        user_id=current_user.id,
        action="APPLY_SIMULATION_STRATEGY",
        entity=f"simulation:{req.simulation_id}",
        detail=f"Applied AI strategy to {trains_updated} trains & resolved {conflicts_resolved} conflicts.",
    )
    db.add(audit)

    await db.commit()

    return ApplySimulationResponse(
        success=True,
        trains_updated=trains_updated,
        conflicts_resolved=conflicts_resolved,
        message=f"Successfully applied simulation plan #{req.simulation_id} across {trains_updated} section trains."
    )


