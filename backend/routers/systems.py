"""
routers/systems.py — Indian Railways Enterprise Systems Feed Endpoint for RailTrack AI.
Simulates live API status, latency, and sample data feeds for:
1. COA  (Control Office Application — Movement & Signalling)
2. FOIS (Freight Operations Information System — Rake & Goods Train Manifest)
3. TMS  (Traffic Management System — Timetables & Platform Allocations)
4. IRCTC (Passenger Train Live Telemetry & GPS Tracking)
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime, timezone

from models import User
from auth_utils import get_current_user

router = APIRouter()


class SystemStatus(BaseModel):
    system_code: str
    system_name: str
    status: str            # "OPERATIONAL" | "DEGRADED" | "OFFLINE"
    latency_ms: int
    last_sync: str
    data_protocol: str
    active_records: int
    sample_payload: Dict[str, Any]


class RailwaySystemsResponse(BaseModel):
    timestamp: str
    section: str
    overall_health: str
    systems: List[SystemStatus]


@router.get("/feeds", response_model=RailwaySystemsResponse)
async def get_railway_systems_feeds(
    current_user: User = Depends(get_current_user),
):
    """
    Return status and telemetry sample packets for Indian Railways enterprise systems.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    section = current_user.section or "NR-42"

    systems = [
        SystemStatus(
            system_code="COA",
            system_name="Control Office Application (COA)",
            status="OPERATIONAL",
            latency_ms=24,
            last_sync=now_iso,
            data_protocol="REST / JSON over FOIS-WAN",
            active_records=142,
            sample_payload={
                "section_id": section,
                "signal_aspect": "PROCEED_GREEN",
                "interlocking": "ELECTRONIC_IP_V4",
                "block_section": "AGC-GWL-UP-MAIN",
                "controller_id": current_user.id,
            }
        ),
        SystemStatus(
            system_code="FOIS",
            system_name="Freight Operations Info System (FOIS)",
            status="OPERATIONAL",
            latency_ms=38,
            last_sync=now_iso,
            data_protocol="SOAP / XML Gateway",
            active_records=48,
            sample_payload={
                "rake_id": "BOXN-77401",
                "commodity": "COAL_THERMAL",
                "gross_weight_tonnes": 3840,
                "origin_terminal": "NKJ_MARSHALLING",
                "destination_power_station": "NTPC_DADRI",
                "priority_class": "CLASS_80",
            }
        ),
        SystemStatus(
            system_code="TMS",
            system_name="Traffic Management System (TMS)",
            status="OPERATIONAL",
            latency_ms=19,
            last_sync=now_iso,
            data_protocol="gRPC / Protobuf Stream",
            active_records=320,
            sample_payload={
                "schedule_version": "IR_WTT_2026_V2",
                "platform_matrix": {
                    "AGC": [1, 2, 3, 4, 5],
                    "GWL": [1, 2, 3, 4]
                },
                "headway_standard_sec": 180,
                "auto_block_signalling": True
            }
        ),
        SystemStatus(
            system_code="IRCTC",
            system_name="IRCTC Live GPS Telemetry Feed",
            status="OPERATIONAL",
            latency_ms=52,
            last_sync=now_iso,
            data_protocol="WebSocket Broadcast / WSS",
            active_records=18,
            sample_payload={
                "train_number": "12301",
                "train_name": "HOWRAH RAJDHANI",
                "current_speed_kmh": 110.4,
                "gps_lat": 27.1767,
                "gps_lng": 78.0081,
                "delay_minutes": 0,
            }
        )
    ]

    return RailwaySystemsResponse(
        timestamp=now_iso,
        section=section,
        overall_health="100% OPERATIONAL",
        systems=systems,
    )
