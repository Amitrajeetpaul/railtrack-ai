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
