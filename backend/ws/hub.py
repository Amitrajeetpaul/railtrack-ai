"""
ws/hub.py — WebSocket telemetry hub for RailTrack AI.
Requires a valid JWT token as query param: ws://host/ws/telemetry?token=xxx

Broadcast strategy:
  - Every BROADCAST_INTERVAL_SECONDS, query DB for trains with status RUNNING.
  - Broadcast simulated telemetry (speed/position/signal) for each — every
    event is tagged "source": "simulated" so the frontend never presents it
    as real IRCTC data.

This previously called RapidAPI on a background loop, but that meant hitting
a rate-limited external API dozens of times an hour just to animate the
dashboard — the RapidAPI subscription was permanently exhausted/misconfigured
and every call failed anyway. Real, accurate live data is available on-demand
via GET /api/trains/live/{train_number} (backed by RailRadar, see
utils/railradar.py), which has a small daily quota appropriate for
user-triggered lookups, not continuous background polling.
"""

import asyncio
import json
import logging
import random
from datetime import datetime
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import verify_token
from database import AsyncSessionLocal
from models import Train, TrainStatusEnum

logger = logging.getLogger(__name__)

router = APIRouter()

BROADCAST_INTERVAL_SECONDS = 15  # how often the simulated loop fires


# ── Connection manager ────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()


# ── Simulated telemetry ─────────────────────────────────────────────────────

def _simulated_telemetry(train_id: str) -> dict:
    """
    Plausible-looking simulated telemetry for the animated dashboard.
    Explicitly tagged "source": "simulated" — never to be confused with a
    real IRCTC/RailRadar feed. Real, accurate live status for a specific
    train is available on-demand via GET /api/trains/live/{train_number}.
    """
    return {
        "type":      "TELEMETRY",
        "train_id":  train_id,
        "timestamp": datetime.utcnow().isoformat(),
        "speed":     round(random.uniform(45, 160), 1),
        "lat":       round(25.0 + random.uniform(-1.0, 3.5), 6),
        "lon":       round(76.0 + random.uniform(-0.5, 3.0), 6),
        "delay":     random.randint(0, 30),
        "signal":    random.choice(["GREEN", "GREEN", "GREEN", "YELLOW", "RED"]),
        "source":    "simulated",
    }


# ── Core broadcast loop ───────────────────────────────────────────────────────

async def _broadcast_live_telemetry():
    """
    Broadcast simulated positions for all RUNNING trains.
    Called every BROADCAST_INTERVAL_SECONDS from send_periodic().
    """
    running_trains: List[str] = []
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Train.id).where(Train.status == TrainStatusEnum.RUNNING)
            )
            running_trains = [row[0] for row in result.all()]
    except Exception as exc:
        logger.warning("DB query for running trains failed: %s", exc)
        return  # Don't broadcast if we can't reach DB

    if not running_trains:
        # Broadcast empty marker so frontend knows we're alive but nothing running
        await manager.broadcast(json.dumps({
            "type":      "TELEMETRY_BATCH",
            "timestamp": datetime.utcnow().isoformat(),
            "trains":    [],
        }))
        return

    for train_id in running_trains:
        await manager.broadcast(json.dumps(_simulated_telemetry(train_id)))


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/telemetry")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=None, description="JWT auth token"),
):
    """
    Simulated telemetry WebSocket (dashboard animation feed).
    - A valid JWT is required to connect; missing/invalid tokens are rejected.
    - Every BROADCAST_INTERVAL_SECONDS, broadcasts simulated positions for all
      RUNNING trains, each tagged "source": "simulated".
    - Also echoes any messages received from the client.
    """
    if not token:
        await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
        return
    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
        return

    # Evict any existing connection from the same client host to prevent duplicates
    client_host = websocket.client.host if websocket.client else None
    if client_host:
        stale = [
            conn for conn in list(manager.active_connections)
            if conn.client and conn.client.host == client_host
        ]
        for old_conn in stale:
            try:
                await old_conn.close(code=1000)
            except Exception:
                pass
            manager.disconnect(old_conn)

    await manager.connect(websocket)

    async def send_periodic():
        """Background task: broadcast simulated telemetry every BROADCAST_INTERVAL_SECONDS."""
        # Brief stabilisation delay before the first broadcast
        await asyncio.sleep(2)
        while True:
            try:
                await _broadcast_live_telemetry()
            except Exception as exc:
                # Never crash the loop — log and continue
                logger.error("Telemetry broadcast error: %s", exc)
            await asyncio.sleep(BROADCAST_INTERVAL_SECONDS)

    task = asyncio.create_task(send_periodic())

    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f'{{"type":"ECHO","data":{data}}}')
    except WebSocketDisconnect:
        task.cancel()
        manager.disconnect(websocket)
    except Exception:
        task.cancel()
        manager.disconnect(websocket)
