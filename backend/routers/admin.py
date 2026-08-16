import asyncio
import logging
import os
import time
import httpx
import psutil
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
import uuid

from database import get_db
from models import User, RoleEnum, Train, Schedule, PriorityEnum, TrainStatusEnum, AuditLog
from auth_utils import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


class ServiceHealth(BaseModel):
    service: str
    status: str
    latency_ms: int
    uptime_seconds: float = 0.0
    uptime: str = "N/A"
    message: str


class InviteRequest(BaseModel):
    name: str
    email: str
    role: str
    section: str

class EditUserRequest(BaseModel):
    role: str
    section: str
    is_active: bool


@router.post("/invite")
async def invite_user(
    req: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Invites a new user. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role."
        )

    try:
        # Check if email already exists
        query = select(User).where(User.email == req.email)
        result = await db.execute(query)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            return {"success": True, "message": "User already invited/exists"}

        new_user = User(
            id=str(uuid.uuid4()),
            name=req.name,
            email=req.email,
            role=RoleEnum(req.role),
            section=req.section,
            is_active=False,  # Treated as INVITED / pending activation
            hashed_password="INVITED"
        )
        db.add(new_user)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    try:
        from utils.email import send_invite_email
        await asyncio.to_thread(
            send_invite_email,
            to_email=req.email,
            to_name=req.name,
            role=req.role,
            section=req.section,
        )
    except Exception as e:
        # User account was already created — don't leak internal error detail
        # (API keys, provider errors) to the caller, just log it server-side.
        # Surface the setup link itself so an admin can still share it
        # manually (e.g. no RESEND_API_KEY configured) — the account is
        # correctly locked pending setup either way, this is just the
        # delivery mechanism falling back from email to "copy and send it
        # yourself" rather than leaving the invite completely stuck.
        logger.error("Invite email failed for %s: %s", req.email, e)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        setup_link = f"{frontend_url}/auth/setup?email={req.email}"
        return {
            "success": True,
            "message": f"Invite email could not be sent — share this setup link with them directly: {setup_link}",
        }

    return {"success": True}


@router.put("/users/{user_id}")
async def edit_user(
    user_id: str,
    req: EditUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Edits an existing user. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role."
        )

    try:
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        target_user = result.scalar_one_or_none()
        
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        target_user.role = RoleEnum(req.role)
        target_user.section = req.section
        target_user.is_active = req.is_active
        
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"success": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes an existing user completely. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role."
        )

    try:
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        target_user = result.scalar_one_or_none()
        
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        # Prevent admin from deleting themselves accidentally
        if target_user.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account.")

        await db.delete(target_user)
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"success": True}


@router.get("/health", response_model=List[ServiceHealth])
async def get_system_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns real telemetry for backend services. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires ADMIN role to view system health telemetry."
        )

    results = []

    # 1. PostgreSQL Check
    try:
        start_time = time.perf_counter()
        await db.execute(text("SELECT 1"))
        latency = int((time.perf_counter() - start_time) * 1000)
        results.append(ServiceHealth(
            service="PostgreSQL Database",
            status="UP",
            latency_ms=latency,
            uptime_seconds=0.0,
            uptime="Connected",
            message="Read/Write Operations Normal"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            service="PostgreSQL Database",
            status="DOWN",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Disconnected",
            message=str(e)[:50]
        ))

    # 2. FastAPI Application Check
    try:
        process = psutil.Process(os.getpid())
        uptime_seconds = time.time() - process.create_time()
        
        # Convert seconds to a nice string like "2d 4h" or "12h 5m"
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        uptime_str = f"{days}d {hours}h" if days > 0 else f"{hours}h {minutes}m"
        
        results.append(ServiceHealth(
            service="FastAPI Backend Core",
            status="UP",
            latency_ms=1,
            uptime_seconds=uptime_seconds,
            uptime=uptime_str,
            message="uvicorn worker operational"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            service="FastAPI Backend Core",
            status="DEGRADED",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Unknown",
            message=str(e)[:50]
        ))

    # 3. OR-Tools Solver Check
    try:
        start_time = time.perf_counter()
        from ortools.sat.python import cp_model
        # Just create an empty model to ensure C++ bindings are loaded and fast
        _ = cp_model.CpModel()
        latency = int((time.perf_counter() - start_time) * 1000)
        results.append(ServiceHealth(
            service="OR-Tools CP-SAT Solver",
            status="UP",
            latency_ms=latency,
            uptime_seconds=0.0,
            uptime="Ready",
            message=f"v{getattr(cp_model, '__version__', '9.x')} Loaded correctly"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            service="OR-Tools CP-SAT Solver",
            status="DOWN",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Missing",
            message="Failed to import engine"
        ))

    # 4. RailRadar Live Tracker Check
    # Reports on the API actually used by GET /api/trains/live/{n} (see
    # utils/railradar.py). Deliberately does NOT call the real live-status
    # endpoint here — that would burn the 50-req/day free-tier quota on every
    # admin page load just to render a health dot. Instead: report whether
    # the key is configured, and do a cheap unauthenticated reachability
    # check against the base host. This previously checked a different,
    # unrelated (and unsubscribed) RapidAPI host, and treated ANY response
    # — including a 429 rate-limit — as "UP"/"Ping OK", which is precisely
    # the kind of status that's misleading rather than reassuring.
    railradar_key = os.getenv("RAILRADAR_API_KEY", "")
    if not railradar_key:
        results.append(ServiceHealth(
            service="RailRadar Live Tracker",
            status="DOWN",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Unconfigured",
            message="RAILRADAR_API_KEY not set — live tracking search will return 'unavailable'"
        ))
    else:
        try:
            start_time = time.perf_counter()
            async with httpx.AsyncClient() as client:
                resp = await client.head("https://api.railradar.in", timeout=3.0)
            latency = int((time.perf_counter() - start_time) * 1000)
            results.append(ServiceHealth(
                service="RailRadar Live Tracker",
                status="UP" if resp.status_code < 500 else "DEGRADED",
                latency_ms=latency,
                uptime_seconds=0.0,
                uptime="External",
                message=f"Key configured, host reachable (HTTP {resp.status_code}). Quota not tested here — 1000 req/month (10/min) free tier."
            ))
        except Exception:
            results.append(ServiceHealth(
                service="RailRadar Live Tracker",
                status="DEGRADED",
                latency_ms=0,
                uptime_seconds=0.0,
                uptime="External",
                message="Connection timeout or DNS failure"
            ))

    return results


class StationSearchResult(BaseModel):
    code: str
    name: str


@router.get("/station-search", response_model=List[StationSearchResult])
async def station_search(q: str, current_user: User = Depends(get_current_user)):
    """
    Real, local, zero-cost station name/code search over our own harvested
    ~950-station index — so an admin can type a city name ("Chennai") instead
    of already knowing the exact real station code before importing a
    corridor. Any authenticated user may search (read-only, no DB access).
    """
    from utils.station_coords import search_stations
    results = search_stations(q)
    return [StationSearchResult(code=r["code"], name=r["name"]) for r in results]


# ─── Real Corridor Import ───────────────────────────────────────────────────
# Lets an admin pull the real trains running any real station-to-station
# corridor from RailRadar and feed them into the DB as a brand-new section —
# so the solver/conflict-detection/live-position pipeline can be demonstrated
# against genuinely fresh real data, not just the pre-seeded NR-42 roster.

RAILRADAR_IMPORT_ERRORS = {
    "not_configured": "Live tracking is not configured on the server (RAILRADAR_API_KEY missing).",
    "rate_limited": "RailRadar quota exceeded for today — try again tomorrow.",
    "not_found": "No trains found between those two station codes — check they're correct real station codes (e.g. MAS, SBC).",
    "network": "Could not reach RailRadar.",
    "bad_response": "RailRadar returned an unrecognized response format.",
}

MAX_IMPORTED_TRAINS = 15
SYNTHETIC_PLATFORM_POOL = 2

# Real Indian Railways train-type strings → our internal priority tiers.
# Checked as substrings against RailRadar's real `train.type` field.
_PRIORITY_TYPE_MAP = [
    (["vande bharat", "rajdhani", "shatabdi", "duronto", "garib rath", "superfast", "sf express", "humsafar", "tejas"], PriorityEnum.EXPRESS),
    (["passenger", "memu", "demu", "local"], PriorityEnum.LOCAL),
    (["freight", "goods"], PriorityEnum.FREIGHT),
]


def _classify_priority(train_type: str) -> PriorityEnum:
    t = (train_type or "").lower()
    for keywords, priority in _PRIORITY_TYPE_MAP:
        if any(kw in t for kw in keywords):
            return priority
    return PriorityEnum.EXPRESS  # honest default — most named IR services are express-tier


def _corridor_time(hhmm: str, day: Optional[int]) -> Optional[datetime]:
    """Real HH:MM (+ optional real day-offset for multi-day journeys) from
    RailRadar, anchored to today's date — same BASE_DATE/t() convention
    seed.py already uses for schedule display."""
    if not hhmm:
        return None
    try:
        hour, minute = (int(p) for p in hhmm.split(":")[:2])
    except (ValueError, AttributeError):
        return None
    base = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    offset_days = max(0, (day or 1) - 1)
    return base + timedelta(days=offset_days, hours=hour, minutes=minute)


async def _upsert_train_and_schedule(
    db: AsyncSession, train_id: str, name: str, priority: PriorityEnum,
    origin: str, destination: str, section: str, platform: int,
    origin_code: str, dest_code: str,
    distance_km: Optional[float], dep_time: Optional[datetime], arr_time: Optional[datetime],
) -> Train:
    """
    Shared upsert used by both the RailRadar corridor importer and the CSV
    importer — same real-data-in, same downstream pipeline out (2-stop
    Schedule the solver/conflict-detection can immediately act on).
    Re-importing an existing train id updates it rather than erroring.
    """
    existing = await db.execute(select(Train).where(Train.id == train_id))
    train_row = existing.scalar_one_or_none()
    if train_row is None:
        train_row = Train(id=train_id)
        db.add(train_row)

    train_row.name = name
    train_row.priority = priority
    train_row.origin = origin
    train_row.destination = destination
    train_row.section = section
    train_row.status = TrainStatusEnum.RUNNING
    train_row.delay = 0
    train_row.speed = 0.0
    train_row.platform = platform

    await db.flush()

    await db.execute(Schedule.__table__.delete().where(Schedule.train_id == train_id))
    db.add(Schedule(
        train_id=train_id, station=origin, station_code=origin_code,
        sequence=1, arrival_time=None, departure_time=dep_time,
        platform=platform, distance_km=0.0,
    ))
    db.add(Schedule(
        train_id=train_id, station=destination, station_code=dest_code,
        sequence=2, arrival_time=arr_time, departure_time=None,
        platform=platform, distance_km=distance_km,
    ))
    return train_row


class ImportCorridorRequest(BaseModel):
    from_code: str
    to_code: str


class ImportedTrain(BaseModel):
    id: str
    name: str
    priority: str
    origin: str
    destination: str
    distance_km: Optional[float] = None
    duration_minutes: Optional[int] = None


class ImportCorridorResponse(BaseModel):
    section: str
    imported: List[ImportedTrain]
    total_found: int
    truncated: bool


@router.post("/import-corridor", response_model=ImportCorridorResponse)
async def import_corridor(
    req: ImportCorridorRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch the real trains running a real station-to-station corridor from
    RailRadar and upsert them as a new section, with real 2-stop schedules
    (origin/destination) so the existing solver/conflict-detection pipeline
    can run against them immediately. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role.",
        )

    from_code = req.from_code.strip().upper()
    to_code = req.to_code.strip().upper()
    if not from_code or not to_code:
        raise HTTPException(status_code=400, detail="Both from_code and to_code are required.")

    # Real Indian Railways station codes are short (RailRadar itself caps
    # them at 10 chars) — catches the case where a station name got typed
    # but never actually selected from the search dropdown (so the free-text
    # name, not its real code, ended up here) with a clear, actionable
    # message, instead of forwarding a confusing upstream validation error.
    for label, code in (("From", from_code), ("To", to_code)):
        if len(code) > 10 or " " in code:
            raise HTTPException(
                status_code=400,
                detail=f"'{code}' doesn't look like a real station code (too long / contains a space) — "
                       f"pick the {label.lower()} station from the search dropdown rather than typing a full name.",
            )

    from utils.railradar import fetch_trains_between
    data = await fetch_trains_between(from_code, to_code)

    if "__error__" in data:
        err = data["__error__"]
        err_status_codes = {"not_configured": 503, "not_found": 404, "rate_limited": 429}
        # Any http_4xx from RailRadar means WE sent a bad request (invalid
        # code format, etc.) — that's a 400 on our own API too, not a 502
        # (which wrongly implies our infrastructure/gateway is broken).
        if err.startswith("http_4"):
            status_code = 400
        else:
            status_code = err_status_codes.get(err, 502)
        raise HTTPException(
            status_code=status_code,
            detail=RAILRADAR_IMPORT_ERRORS.get(err, f"RailRadar rejected this request ({err}) — check the station codes are correct."),
        )

    real_trains = data.get("trains", [])
    if not real_trains:
        raise HTTPException(status_code=404, detail=f"RailRadar returned no trains between {from_code} and {to_code}.")

    total_found = len(real_trains)
    truncated = total_found > MAX_IMPORTED_TRAINS
    real_trains = real_trains[:MAX_IMPORTED_TRAINS]

    section = f"{from_code}-{to_code}"
    from_station = data.get("from", {})
    to_station = data.get("to", {})
    imported: List[ImportedTrain] = []

    for idx, entry in enumerate(real_trains):
        tr = entry.get("train", {})
        train_id = str(tr.get("number", "")).strip()
        if not train_id:
            continue

        priority = _classify_priority(tr.get("type", ""))
        origin_name = entry.get("from", {}).get("city") or from_station.get("name") or from_code
        dest_name = entry.get("to", {}).get("city") or to_station.get("name") or to_code
        distance = entry.get("distance")
        duration = entry.get("duration")
        # RailRadar doesn't publish real platform assignments — synthetic pool,
        # sized at 2 (typical for a smaller Indian Railways station, not a
        # major terminal) so imports honestly surface real capacity
        # contention when trains actually would compete for track, rather
        # than coincidentally spreading across a too-generous platform count.
        platform = (idx % SYNTHETIC_PLATFORM_POOL) + 1

        dep_time = _corridor_time(entry.get("from", {}).get("departure"), entry.get("from", {}).get("day"))
        arr_time = _corridor_time(entry.get("to", {}).get("arrival"), entry.get("to", {}).get("day"))
        train_row = await _upsert_train_and_schedule(
            db, train_id, tr.get("name") or f"Train {train_id}", priority,
            origin_name, dest_name, section, platform, from_code, to_code,
            float(distance) if distance is not None else None, dep_time, arr_time,
        )

        imported.append(ImportedTrain(
            id=train_id, name=train_row.name, priority=priority.value,
            origin=origin_name, destination=dest_name,
            distance_km=distance, duration_minutes=duration,
        ))

    audit = AuditLog(
        user_id=current_user.id,
        action="IMPORT_CORRIDOR",
        entity=f"section:{section}",
        detail=f"Imported {len(imported)} real trains between {from_code} and {to_code} (of {total_found} found).",
    )
    db.add(audit)

    await db.commit()

    return ImportCorridorResponse(
        section=section, imported=imported, total_found=total_found, truncated=truncated,
    )


# ─── CSV Import ──────────────────────────────────────────────────────────────
# Fallback path for when live RailRadar data isn't the point of the demo (or
# isn't available at judging time): upload a locally-gathered dataset and it
# goes through the exact same pipeline as a live corridor import — same
# Train/Schedule upsert, so the solver/conflict-detection/live-map all work
# on it identically. Never claims uploaded data is "live" — it's real data
# the admin supplied, tagged and treated as such.

MAX_CSV_ROWS = 200
REQUIRED_CSV_COLUMNS = {"train_id", "name", "origin", "destination", "section"}
CSV_TEMPLATE = (
    "train_id,name,priority,origin,destination,section,distance_km,departure_time,arrival_time\n"
    "12951,Mumbai Rajdhani Express,EXPRESS,New Delhi,Mumbai Central,NDLS-MMCT,1384,16:25,08:15\n"
    "56302,Chennai-Bengaluru Passenger,LOCAL,Chennai Central,Bengaluru,MAS-SBC,354,06:00,11:30\n"
)


class CsvRowResult(BaseModel):
    row: int
    train_id: Optional[str] = None
    status: str  # "imported" | "skipped"
    reason: Optional[str] = None


class ImportCsvResponse(BaseModel):
    imported_count: int
    skipped_count: int
    results: List[CsvRowResult]


@router.get("/import-csv/template")
async def get_csv_template(current_user: User = Depends(get_current_user)):
    """Returns a starter CSV so an admin knows the exact expected shape."""
    if current_user.role.value != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Requires ADMIN role.")
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(CSV_TEMPLATE, media_type="text/csv")


@router.post("/import-csv", response_model=ImportCsvResponse)
async def import_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a locally-gathered CSV dataset and upsert it through the same
    Train/Schedule pipeline the live corridor importer uses. Requires ADMIN
    role. Bad rows are reported individually, not silently dropped and not
    aborting the whole file.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Requires ADMIN role.")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse file as CSV: {exc}")

    if reader.fieldnames is None or not REQUIRED_CSV_COLUMNS.issubset(set(c.strip() for c in reader.fieldnames)):
        missing = REQUIRED_CSV_COLUMNS - set(c.strip() for c in (reader.fieldnames or []))
        raise HTTPException(
            status_code=400,
            detail=f"CSV is missing required column(s): {', '.join(sorted(missing))}. "
                   f"Download the template from GET /api/admin/import-csv/template for the exact shape.",
        )

    results: List[CsvRowResult] = []
    imported_count = 0
    platform_cursor = 0

    for row_num, row in enumerate(reader, start=2):  # row 1 is the header
        if row_num - 1 > MAX_CSV_ROWS:
            results.append(CsvRowResult(row=row_num, status="skipped", reason=f"Exceeds {MAX_CSV_ROWS}-row cap."))
            continue

        train_id = (row.get("train_id") or "").strip()
        name = (row.get("name") or "").strip()
        origin = (row.get("origin") or "").strip()
        destination = (row.get("destination") or "").strip()
        section = (row.get("section") or "").strip()

        if not (train_id and name and origin and destination and section):
            results.append(CsvRowResult(
                row=row_num, train_id=train_id or None, status="skipped",
                reason="Missing one of the required fields (train_id/name/origin/destination/section).",
            ))
            continue

        raw_priority = (row.get("priority") or "").strip().upper()
        if raw_priority in PriorityEnum.__members__:
            priority = PriorityEnum[raw_priority]
        else:
            # Falls back to the same real-type classifier the corridor
            # importer uses, in case the CSV has a train "type" string
            # instead of a direct priority tier.
            priority = _classify_priority(row.get("type") or raw_priority)

        distance_raw = (row.get("distance_km") or "").strip()
        try:
            distance_km = float(distance_raw) if distance_raw else None
        except ValueError:
            distance_km = None

        dep_time = _corridor_time((row.get("departure_time") or "").strip(), None)
        arr_time = _corridor_time((row.get("arrival_time") or "").strip(), None)

        platform_cursor += 1
        platform = (platform_cursor % SYNTHETIC_PLATFORM_POOL) + 1

        try:
            await _upsert_train_and_schedule(
                db, train_id, name, priority, origin, destination, section, platform,
                origin[:4].upper(), destination[:4].upper(), distance_km, dep_time, arr_time,
            )
        except Exception as exc:
            results.append(CsvRowResult(row=row_num, train_id=train_id, status="skipped", reason=str(exc)[:200]))
            continue

        imported_count += 1
        results.append(CsvRowResult(row=row_num, train_id=train_id, status="imported"))

    audit = AuditLog(
        user_id=current_user.id,
        action="IMPORT_CSV",
        entity=f"file:{file.filename}",
        detail=f"Imported {imported_count} trains from uploaded CSV ({len(results) - imported_count} skipped).",
    )
    db.add(audit)

    await db.commit()

    return ImportCsvResponse(
        imported_count=imported_count,
        skipped_count=len(results) - imported_count,
        results=results,
    )
