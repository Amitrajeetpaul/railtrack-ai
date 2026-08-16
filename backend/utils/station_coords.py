"""
utils/station_coords.py — real station latitude/longitude lookup.

Station coordinates are a permanent geographic fact, not live data — so
unlike train position, this never needs an API call at request time.
Sourced once from RailRadar's real route data (harvested from actual train
routes, not invented), cached as a static file. Covers ~950 real Indian
Railways stations.
"""
import json
from pathlib import Path
from typing import Optional

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "station_coords.json"
_stations: dict = {}

try:
    with open(_DATA_PATH) as f:
        _stations = json.load(f)
except FileNotFoundError:
    _stations = {}


def get_station_coords(station_code: str) -> Optional[dict]:
    """Returns {"name": ..., "lat": ..., "lng": ...} for a real station code, or None if unknown."""
    if not station_code:
        return None
    return _stations.get(station_code.upper())


def search_stations(query: str, limit: int = 8) -> list:
    """
    Case-insensitive substring search over our own real ~950-station index
    (code or name) — local, zero API cost. Lets an admin type a city/station
    name ("Chennai", "Thiruvananthapuram") instead of needing to already
    know the exact real station code. Not exhaustive (only stations we've
    harvested from real route data so far) — callers should fall back to
    letting the admin type a code directly if a search finds nothing.
    """
    q = (query or "").strip().upper()
    if not q:
        return []
    matches = [
        {"code": code, "name": info.get("name", code)}
        for code, info in _stations.items()
        if q in code or q in info.get("name", "").upper()
    ]
    # Exact/prefix code matches first, then prefix name matches, then the rest
    matches.sort(key=lambda m: (
        m["code"] != q,
        not m["code"].startswith(q),
        not m["name"].upper().startswith(q),
    ))
    return matches[:limit]
