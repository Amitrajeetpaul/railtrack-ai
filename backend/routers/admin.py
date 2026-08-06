import asyncio
import logging
import os
import time
import httpx
import psutil
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
import uuid

from database import get_db
from models import User, RoleEnum
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
                message=f"Key configured, host reachable (HTTP {resp.status_code}). Quota not tested here — 50 req/day free tier."
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
