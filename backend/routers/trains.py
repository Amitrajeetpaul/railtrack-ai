"""
routers/trains.py — Real DB-backed train endpoints for RailTrack AI.
  GET   /api/trains/                   — list all trains (filter by ?section=)
  GET   /api/trains/{train_id}          — full train details + schedule
  PATCH /api/trains/{train_id}/status  — update train status + audit log
"""

from datetime import datetime, timezone
import os
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Train, Schedule, AuditLog, User
from auth_utils import get_current_user

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
    status: str = "ok"  # "ok" | "not_running"
    message: Optional[str] = None
    current_station: Optional[str] = None
    current_station_name: Optional[str] = None
    delay_minutes: Optional[int] = None
    terminated: Optional[bool] = None
    last_updated: Optional[str] = None
    next_station: Optional[str] = None
    expected_arrival_ndls: Optional[str] = None


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


@router.get("/live/{train_number}", response_model=LiveTrainResponse)
async def get_live_train_status(
    train_number: str,
    current_user: User = Depends(get_current_user),
):
    """Fetch real live train actuals from IRCTC RapidAPI."""
    rapidapi_key = os.getenv("RAPIDAPI_KEY")
    rapidapi_host = os.getenv("RAPIDAPI_HOST", "irctc1.p.rapidapi.com")
    
    if not rapidapi_key or not rapidapi_host:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="RapidAPI credentials missing from backend environment."
        )

    headers = {
        "x-rapidapi-key": rapidapi_key,
        "x-rapidapi-host": rapidapi_host
    }

    url = f"https://{rapidapi_host}/api/v1/liveTrainStatus?trainNo={train_number}" if "irctc1" in rapidapi_host else f"https://{rapidapi_host}/api/trains/v1/train/status?departure_date=TODAY&isH5=true&client=web&train_number={train_number}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            
            if response.status_code == 429:
                return LiveTrainResponse(
                    train_number=train_number,
                    status="not_running",
                    message="RapidAPI free tier rate limit reached — Section Timetable Active"
                )

            if response.status_code != 200:
                return LiveTrainResponse(
                    train_number=train_number,
                    status="not_running",
                    message=f"API returned status {response.status_code}"
                )

            data = response.json()
            
            # Check irctc1.p.rapidapi.com format
            if "data" in data and isinstance(data["data"], dict):
                d = data["data"]
                if not d.get("success", True) and not d.get("train_name"):
                    return LiveTrainResponse(
                        train_number=train_number,
                        status="not_running",
                        message=data.get("message", "No data available")
                    )

                next_stn = d.get("next_station_name") or d.get("dest_stn_name") or "Transit"
                curr_stn = d.get("current_station_name") or d.get("source_stn_name") or "En Route"
                msg = d.get("new_message") or d.get("title") or "Running"
                delay = int(d.get("delay", d.get("delay_minutes", 0)))

                return LiveTrainResponse(
                    train_number=train_number,
                    status="ok",
                    current_station=d.get("source", ""),
                    current_station_name=curr_stn,
                    delay_minutes=delay,
                    terminated=d.get("at_dstn", False),
                    last_updated=str(d.get("std", "Live")),
                    next_station=next_stn,
                    expected_arrival_ndls=msg
                )

            # Fallback for standard IRCTC format
            body = data.get("body", {})
            if not body or data.get("status") == False:
                return LiveTrainResponse(
                    train_number=train_number,
                    status="not_running",
                    message="Train not currently running or data unavailable today"
                )
            
            return LiveTrainResponse(
                train_number=train_number,
                status="ok",
                current_station=body.get("current_station", ""),
                current_station_name=body.get("current_station_name", "Transit"),
                delay_minutes=int(body.get("delay", 0)),
                terminated=body.get("terminated", False),
                last_updated=str(body.get("server_timestamp", "Live")),
                next_station=body.get("next_station", "En Route"),
                expected_arrival_ndls=None
            )
            
    except httpx.TimeoutException:
        return LiveTrainResponse(
            train_number=train_number,
            status="not_running",
            message="API request timed out — try again"
        )
    except httpx.HTTPStatusError as exc:
        # Catch status errors not handled above
        return LiveTrainResponse(
            train_number=train_number,
            status="not_running",
            message="Train not currently running or data unavailable today"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error connecting to train API: {str(e)}"
        )


@router.get("/info/{train_number}", response_model=TrainResponse)
async def get_live_train_info_and_update(
    train_number: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch static train details (name, route) from basic info endpoint, update local DB."""
    url = f"https://indian-railway-irctc.p.rapidapi.com/api/v1/getTrainDetails?trainNo={train_number}"
    rapidapi_key = os.getenv("RAPIDAPI_KEY")
    rapidapi_host = os.getenv("RAPIDAPI_HOST")

    headers = {
        "x-rapidapi-key": rapidapi_key,
        "x-rapidapi-host": rapidapi_host
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            data_body = data.get("data", {})
            name = data_body.get("trainName", f"Train {train_number}")
            origin = data_body.get("sourceStationName", "Unknown")
            destination = data_body.get("destinationStationName", "Unknown")
            
            # Fetch the DB record
            result = await db.execute(select(Train).where(Train.id == train_number))
            train = result.scalar_one_or_none()
            
            if not train:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Train {train_number} not in DB to update")
                
            # Update DB entry
            train.name = name
            train.origin = origin
            train.destination = destination
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

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Info API Error: {str(e)}"
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
