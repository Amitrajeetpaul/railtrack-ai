"""
utils/railradar.py — client for the RailRadar live train tracking API
(https://railradar.in/docs). Replaces the previous RapidAPI integration,
which was pointed at an unsubscribed host and had exhausted its quota.

Never fabricates data: every failure mode returns a dict with an
`__error__` key instead of raising or inventing position/delay numbers.

The free tier is 50 requests/day, so results (success or error) are cached
in-memory per train number for CACHE_TTL_SECONDS — repeated searches/clicks
for the same train within that window don't cost additional quota.
"""

import logging
import os
import time
from typing import Dict, Tuple

import httpx

logger = logging.getLogger(__name__)

RAILRADAR_BASE_URL = "https://api.railradar.in/v1"
CACHE_TTL_SECONDS = 90

# key = train_number, value = (fetched_at unix timestamp, result dict)
_cache: Dict[str, Tuple[float, dict]] = {}


async def fetch_live_train(train_number: str) -> dict:
    """
    Call GET /trains/{number}/live, using a short-lived cache to conserve
    the free-tier daily quota.
    Returns the response's `data` object on success.
    Returns {"__error__": "<reason>"} on any failure — caller decides how
    to surface that; this function never returns fabricated telemetry.
    """
    now = time.monotonic()
    cached = _cache.get(train_number)
    if cached and (now - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    result = await _fetch_live_train_uncached(train_number)
    _cache[train_number] = (now, result)
    return result


async def _fetch_live_train_uncached(train_number: str) -> dict:
    api_key = os.getenv("RAILRADAR_API_KEY")
    if not api_key:
        return {"__error__": "not_configured"}

    url = f"{RAILRADAR_BASE_URL}/trains/{train_number}/live"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=8.0)
    except Exception as exc:
        logger.warning("RailRadar fetch failed for train %s: %s", train_number, exc)
        return {"__error__": "network"}

    if resp.status_code == 429:
        logger.warning("RailRadar quota exceeded fetching train %s", train_number)
        return {"__error__": "rate_limited"}
    if resp.status_code == 404:
        return {"__error__": "not_found"}
    if resp.status_code != 200:
        logger.warning(
            "RailRadar returned %s for train %s: %s",
            resp.status_code, train_number, resp.text[:300],
        )
        return {"__error__": f"http_{resp.status_code}"}

    body = resp.json()
    if not body.get("success") or not isinstance(body.get("data"), dict):
        logger.warning("Unexpected RailRadar response shape for train %s: %s", train_number, list(body.keys()))
        return {"__error__": "bad_response"}

    return body["data"]
