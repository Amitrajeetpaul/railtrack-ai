"""
routers/trains.py — Real DB-backed train endpoints for RailTrack AI.
  GET   /api/trains/                   — list all trains (filter by ?section=)
  GET   /api/trains/{train_id}          — full train details + schedule
  PATCH /api/trains/{train_id}/status  — update train status + audit log
"""

from datetime import datetime, timezone
import logging
import os
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Train, Schedule, AuditLog, User
from auth_utils import get_current_user, require_section_access

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ScheduleStop(BaseModel):
    station: str
    station_code: str
    sequence: int
    arrival_time: Optional[datetime]
    departure_time: Optional[datetime]
    platform: Optional[int]
    distance_km: Optional[float]

    class Config:
        from_attributes = True


class TrainResponse(BaseModel):
    id: str
    name: str
    priority: str
    origin: str
    destination: str
    section: str
    status: str
    delay: int
    speed: float
    platform: Optional[int]

    class Config:
        from_attributes = True


class TrainDetailResponse(TrainResponse):
    schedules: List[ScheduleStop] = []


class StatusUpdateRequest(BaseModel):
    status: str
    reason: Optional[str] = None


class LiveTrainResponse(BaseModel):
    train_number: str
    status: str = "ok"  # "ok" | "not_running" | "unavailable"
    message: Optional[str] = None
    current_station: Optional[str] = None
    current_station_name: Optional[str] = None
    delay_minutes: Optional[int] = None
    terminated: Optional[bool] = None
    last_updated: Optional[str] = None
    next_station: Optional[str] = None
    expected_arrival_ndls: Optional[str] = None
    # Populated from RailRadar's own train metadata when a live fetch
    # succeeds — this is more current than the static local dataset used
    # by /info (e.g. reflects real IR renumbering/renaming), so the
    # frontend should prefer these over /info's values when present.
    train_name: Optional[str] = None
    origin_name: Optional[str] = None
    destination_name: Optional[str] = None
    # Real geographic coordinates of the train's current station — from a
    # static lookup of real station locations, not invented/interpolated.
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[TrainResponse])
async def get_trains(
    section: Optional[str] = Query(None, description="Filter trains by section, e.g. NR-42"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all trains, optionally filtered by section."""
    stmt = select(Train)
    if section:
        stmt = stmt.where(Train.section == section)
    stmt = stmt.order_by(Train.priority, Train.id)

    result = await db.execute(stmt)
    trains = result.scalars().all()

    return [
        TrainResponse(
            id=t.id,
            name=t.name,
            priority=t.priority.value,
            origin=t.origin,
            destination=t.destination,
            section=t.section,
            status=t.status.value,
            delay=t.delay or 0,
            speed=t.speed or 0.0,
            platform=t.platform,
        )
        for t in trains
    ]


import json

IR_TRAINS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "ir_trains.json")
IR_TRAINS = {}

if os.path.exists(IR_TRAINS_FILE):
    try:
        with open(IR_TRAINS_FILE, "r") as f:
            IR_TRAINS = json.load(f)
    except Exception:
        pass

def get_train_meta(train_number: str):
    num_clean = train_number.lstrip('0')
    candidates = [train_number, num_clean, f"0{train_number}", f"0{num_clean}", f"1{num_clean}"]
    for candidate in candidates:
        if candidate in IR_TRAINS:
            t = IR_TRAINS[candidate]
            is_local = any(candidate.startswith(p) for p in ["38", "37", "31", "34", "97", "96", "40", "68", "58"])
            return {
                "name": t.get("name") or f"Express {train_number}",
                "origin": t.get("src_name") or t.get("src_code") or "New Delhi (NDLS)",
                "destination": t.get("dst_name") or t.get("dst_code") or "Bhopal (BPL)",
                "priority": "LOCAL" if is_local else "EXPRESS"
            }

    # Indian Railways Suburban EMU series decoder
    if train_number.startswith("38"):
        return {"name": f"Howrah - Kharagpur Local ({train_number})", "origin": "Howrah Jn (HWH)", "destination": "Kharagpur Jn (KGP)", "priority": "LOCAL"}
    if train_number.startswith("37"):
        return {"name": f"Howrah - Bandel Local ({train_number})", "origin": "Howrah Jn (HWH)", "destination": "Bandel Jn (BDC)", "priority": "LOCAL"}
    if train_number.startswith("31"):
        return {"name": f"Sealdah - Ranaghat Local ({train_number})", "origin": "Sealdah (SDAH)", "destination": "Ranaghat Jn (RHA)", "priority": "LOCAL"}
    if train_number.startswith("34"):
        return {"name": f"Sealdah - Diamond Harbour Local ({train_number})", "origin": "Sealdah (SDAH)", "destination": "Diamond Harbour (DH)", "priority": "LOCAL"}
    if train_number.startswith("97") or train_number.startswith("96"):
        return {"name": f"Mumbai Suburban Local ({train_number})", "origin": "CSMT (Mumbai)", "destination": "Kalyan Jn (KYN)", "priority": "LOCAL"}
    if train_number.startswith("40"):
        return {"name": f"Chennai Suburban Local ({train_number})", "origin": "Chennai Beach (MSB)", "destination": "Tambaram (TBM)", "priority": "LOCAL"}

    return {
        "name": f"Express {train_number}",
        "origin": "New Delhi (NDLS)",
        "destination": "Bhopal (BPL)",
        "priority": "EXPRESS"
    }

RAILRADAR_ERROR_MESSAGES = {
    "not_configured": "Live tracking is not configured on the server (RAILRADAR_API_KEY missing).",
    "rate_limited": "Live tracking quota exceeded for today — showing no data rather than a guess.",
    "not_found": "Train not found or not running today.",
    "network": "Could not reach the live train tracking service.",
    "bad_response": "Live tracking service returned an unrecognized response format.",
}


@router.get("/live/{train_number}", response_model=LiveTrainResponse)
async def get_live_train_status(
    train_number: str,
    current_user: User = Depends(get_current_user),
):
    """
    Fetch real live train status from RailRadar (https://railradar.in).
    On any failure (quota, network, not found, unrecognized response),
    returns status="unavailable"/"not_running" with a clear message —
    never fabricates position/delay data.
    """
    from utils.railradar import fetch_live_train
    from utils.station_coords import get_station_coords

    data = await fetch_live_train(train_number)

    if "__error__" in data:
        err = data["__error__"]
        message = RAILRADAR_ERROR_MESSAGES.get(err, f"Live tracking error ({err}).")
        return LiveTrainResponse(
            train_number=train_number,
            status="not_running" if err == "not_found" else "unavailable",
            message=message,
        )

    current = data.get("currentLocation") or {}
    next_halt = data.get("nextHalt") or {}
    train_meta = data.get("train") or {}
    route_by_seq = {r.get("sequence"): r for r in data.get("route", [])}
    current_name = route_by_seq.get(current.get("sequence"), {}).get("stationName") or current.get("stationCode", "")

    # Real coordinates for the current station. RailRadar's own live response
    # already includes real lat/lng for the train's source/destination in
    # this same call — check those first (zero extra cost) before falling
    # back to the static ~950-station table for intermediate stops.
    current_code = current.get("stationCode", "")
    src, dst = train_meta.get("source") or {}, train_meta.get("destination") or {}
    if src.get("code") == current_code and src.get("lat") is not None:
        coords = {"lat": src["lat"], "lng": src["lng"]}
    elif dst.get("code") == current_code and dst.get("lat") is not None:
        coords = {"lat": dst["lat"], "lng": dst["lng"]}
    else:
        coords = get_station_coords(current_code)

    return LiveTrainResponse(
        train_number=train_number,
        status="ok",
        current_station=current.get("stationCode", ""),
        current_station_name=current_name,
        delay_minutes=int(data.get("delayMinutes") or 0),
        terminated=data.get("status") == "completed",
        last_updated=data.get("lastUpdatedAt"),
        next_station=next_halt.get("stationName", ""),
        expected_arrival_ndls=None,
        train_name=data.get("trainName"),
        origin_name=(train_meta.get("source") or {}).get("name"),
        destination_name=(train_meta.get("destination") or {}).get("name"),
        current_lat=coords["lat"] if coords else None,
        current_lng=coords["lng"] if coords else None,
    )


@router.get("/info/{train_number}", response_model=TrainResponse)
async def get_live_train_info_and_update(
    train_number: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch train details from info API or database, dynamically registering new trains."""
    from models import PriorityEnum, TrainStatusEnum

    result = await db.execute(select(Train).where(Train.id == train_number))
    train = result.scalar_one_or_none()

    # Name/origin/destination come from the static local timetable dataset
    # (backend/data/ir_trains.json). We previously also called
    # indian-railway-irctc.p.rapidapi.com here to "enrich" these fields live,
    # but that host is a different RapidAPI product this account was never
    # subscribed to (always 403) — it silently wasted a round-trip and did
    # nothing. Removed rather than calling an endpoint we can't verify works.
    meta = get_train_meta(train_number)
    name = meta["name"]
    origin = meta["origin"]
    destination = meta["destination"]
    prio_str = meta["priority"]

    try:
        prio_enum = PriorityEnum(prio_str.upper())
    except Exception:
        prio_enum = PriorityEnum.EXPRESS

    if not train:
        # Neutral/unknown defaults — this endpoint only registers train
        # identity/route metadata, it has no live status. Previously defaulted
        # to status=RUNNING, platform=1, speed=75.0 for every searched train,
        # which fabricated dozens of identical "running on platform 1" ghost
        # entries and flooded the real-time conflict detector with noise.
        train = Train(
            id=train_number,
            name=name,
            priority=prio_enum,
            origin=origin,
            destination=destination,
            section=current_user.section or "NR-42",
            status=TrainStatusEnum.SCHEDULED,
            delay=0,
            speed=0.0,
            platform=None,
        )
        db.add(train)
    # If the train already exists (e.g. from seed data), don't overwrite its
    # name/origin/destination — this previously clobbered known-good seeded
    # data with the static dataset's values every time someone searched an
    # existing train number, and the two datasets don't always agree on
    # direction (seed had 12301 as NDLS→HWH; the static file's entry for the
    # same number implied HWH→NDLS), silently corrupting real data.

    await db.commit()
    await db.refresh(train)

    return TrainResponse(
        id=train.id,
        name=train.name,
        priority=train.priority.value,
        origin=train.origin,
        destination=train.destination,
        section=train.section,
        status=train.status.value,
        delay=train.delay or 0,
        speed=train.speed or 75.0,
        platform=train.platform or 1,
    )


@router.get("/{train_id}", response_model=TrainDetailResponse)
async def get_train(
    train_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return full train details including all schedule stops."""
    stmt = (
        select(Train)
        .where(Train.id == train_id)
        .options(selectinload(Train.schedules))
    )
    result = await db.execute(stmt)
    train = result.scalar_one_or_none()

    if train is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Train {train_id} not found")

    stops = sorted(train.schedules, key=lambda s: s.sequence)

    return TrainDetailResponse(
        id=train.id,
        name=train.name,
        priority=train.priority.value,
        origin=train.origin,
        destination=train.destination,
        section=train.section,
        status=train.status.value,
        delay=train.delay or 0,
        speed=train.speed or 0.0,
        platform=train.platform,
        schedules=[
            ScheduleStop(
                station=s.station,
                station_code=s.station_code,
                sequence=s.sequence,
                arrival_time=s.arrival_time,
                departure_time=s.departure_time,
                platform=s.platform,
                distance_km=s.distance_km,
            )
            for s in stops
        ],
    )


@router.patch("/{train_id}/status", response_model=TrainResponse)
async def update_train_status(
    train_id: str,
    body: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a train's status (RUNNING / HALTED / DELAYED / etc.).
    Writes an audit log entry.
    """
    from models import TrainStatusEnum

    result = await db.execute(select(Train).where(Train.id == train_id))
    train = result.scalar_one_or_none()

    if train is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Train {train_id} not found")

    require_section_access(current_user, train.section)

    try:
        new_status = TrainStatusEnum(body.status.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status: {body.status}. Valid values: {[e.value for e in TrainStatusEnum]}",
        )

    old_status = train.status.value
    train.status = new_status

    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_TRAIN_STATUS",
        entity=f"train:{train_id}",
        detail=f"Status changed from {old_status} to {new_status.value}. Reason: {body.reason or 'N/A'}",
    )
    db.add(audit)
    await db.commit()
    await db.refresh(train)

    return TrainResponse(
        id=train.id,
        name=train.name,
        priority=train.priority.value,
        origin=train.origin,
        destination=train.destination,
        section=train.section,
        status=train.status.value,
        delay=train.delay or 0,
        speed=train.speed or 0.0,
        platform=train.platform,
    )
