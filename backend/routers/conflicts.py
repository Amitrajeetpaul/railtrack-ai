"""
routers/conflicts.py — Real DB-backed conflict endpoints for RailTrack AI.
  GET  /api/conflicts/                     — list active (unresolved) conflicts
                                             (DB conflicts + ephemeral real-time detections)
  POST /api/conflicts/{conflict_id}/resolve — resolve a conflict, store decision + audit
                                             (realtime conflicts with id prefix "RT-" are
                                              acknowledged in-memory only — not persisted)
"""

import uuid
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from itertools import combinations
from typing import Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Conflict, Decision, AuditLog, User, Train, Schedule, TrainStatusEnum, DecisionSourceEnum, SeverityEnum
from auth_utils import get_current_user, require_section_access, CROSS_SECTION_VALUES

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ConflictResponse(BaseModel):
    id: str
    train_a_id: str
    train_b_id: str
    location: str
    severity: str
    conflict_type: str
    time_to_conflict: Optional[int]
    recommendation: Optional[str]
    confidence: Optional[int]
    time_saving: Optional[int]
    detected_at: datetime
    resolved: bool
    resolved_at: Optional[datetime]
    source: str = "SEEDED"   # "SEEDED" | "REALTIME" — additive field, frontend ignores safely
    chain_id: Optional[str] = None  # groups conflicts sharing a train into one connected pileup

    class Config:
        from_attributes = True


class ResolveRequest(BaseModel):
    action: str   # "ACCEPT_AI" or "MANUAL_OVERRIDE"
    notes: Optional[str] = None


# ─── Real-time conflict detection ──────────────────────────────────────────────

DEFAULT_DWELL_MINUTES = 10  # fallback occupancy window when a stop only has one of arrival/departure logged (e.g. origin has no arrival, destination has no departure)


def _windows_overlap(w1: Tuple[datetime, datetime], w2: Tuple[datetime, datetime]) -> bool:
    return w1[0] < w2[1] and w2[0] < w1[1]


def _real_platform_window(train: Train, stops: List[Schedule]) -> Optional[Tuple[datetime, datetime]]:
    """
    Real, delay-adjusted [start, end] window this train actually occupies
    its currently-assigned platform — inspired by Flatland's occupancy-window
    model (an agent only "holds" a resource for the timesteps it's genuinely
    there, not for all time). Uses the train's own real Schedule rows and
    real current Train.delay, not just a static "same platform number" match.
    """
    if train.platform is None:
        return None
    matching = [s for s in stops if s.platform == train.platform]
    if not matching:
        return None

    delay_delta = timedelta(minutes=train.delay or 0)
    starts, ends = [], []
    for s in matching:
        arr = (s.arrival_time + delay_delta) if s.arrival_time else None
        dep = (s.departure_time + delay_delta) if s.departure_time else None
        start = arr or (dep - timedelta(minutes=DEFAULT_DWELL_MINUTES) if dep else None)
        end = dep or (arr + timedelta(minutes=DEFAULT_DWELL_MINUTES) if arr else None)
        if start and end:
            starts.append(start)
            ends.append(end)

    if not starts:
        return None
    return (min(starts), max(ends))


def _pair_conflict_type(
    train_a: Train, train_b: Train,
    window_a: Optional[Tuple[datetime, datetime]] = None,
    window_b: Optional[Tuple[datetime, datetime]] = None,
) -> Optional[str]:
    """
    Decide whether two same-section RUNNING trains actually have a plausible
    physical conflict.

    PLATFORM: same platform AND (when we have real schedule data for both)
    their real, delay-adjusted occupancy windows actually overlap — not just
    "both assigned to this platform number, ever." When schedule data is
    missing for either train we fall back to flagging on the platform match
    alone (unknown timing beats silently hiding a real risk).

    CROSSING: opposing directions on the same origin/destination pair.

    Returns a Conflict.conflict_type value, or None if no plausible conflict.
    """
    if train_a.platform is not None and train_a.platform == train_b.platform:
        if window_a is not None and window_b is not None and not _windows_overlap(window_a, window_b):
            return None  # real timing shows they're never actually there together
        return "PLATFORM"
    if train_a.origin == train_b.destination and train_a.destination == train_b.origin:
        return "CROSSING"  # opposing directions on the same origin/destination pair
    return None


async def _detect_realtime_conflicts(db: AsyncSession, section_filter: Optional[str] = None) -> List[ConflictResponse]:
    """
    Scan RUNNING trains and return ephemeral ConflictResponse objects for
    pairs with a plausible physical conflict (see _pair_conflict_type),
    using real delay-adjusted occupancy-window overlap for platform conflicts.

    Grouping key: train.section (the operating zone each train belongs to) —
    narrowed further by platform/route matching within that zone, since the
    Train model has no live GPS position field to work with directly (that's
    a separate real system — RealPositionsMap — not wired into this check;
    building true GPS-proximity conflict detection would need real rail
    track topology data we don't have, not just lat/lng points).

    section_filter: when set (section-scoped CONTROLLER), only scan that
    section — a controller for NR-42 shouldn't see conflicts detected in a
    different section that happens to have been imported elsewhere.

    These conflicts are NOT saved to the database.
    """
    try:
        stmt = select(Train).where(Train.status == TrainStatusEnum.RUNNING)
        if section_filter is not None:
            stmt = stmt.where(Train.section == section_filter)
        result = await db.execute(stmt)
        running_trains = result.scalars().all()
    except Exception as exc:
        logger.warning("Real-time conflict detection: DB query failed — %s", exc)
        return []

    if len(running_trains) < 2:
        return []

    # Batch-fetch every schedule row for these trains once, then compute each
    # train's real platform-occupancy window locally — avoids an N+1 query
    # inside the pairwise loop below.
    schedules_result = await db.execute(
        select(Schedule).where(Schedule.train_id.in_([t.id for t in running_trains]))
    )
    stops_by_train: dict[str, list] = defaultdict(list)
    for s in schedules_result.scalars().all():
        stops_by_train[s.train_id].append(s)

    windows_by_train: dict[str, Optional[Tuple[datetime, datetime]]] = {
        t.id: _real_platform_window(t, stops_by_train.get(t.id, [])) for t in running_trains
    }

    # Group by section (operating zone)
    segment_map: dict[str, list] = defaultdict(list)
    for train in running_trains:
        segment_map[train.section].append(train)

    rt_conflicts: List[ConflictResponse] = []
    now = datetime.utcnow()

    for segment, trains_in_seg in segment_map.items():
        if len(trains_in_seg) < 2:
            continue

        for train_a, train_b in combinations(trains_in_seg, 2):
            window_a = windows_by_train.get(train_a.id)
            window_b = windows_by_train.get(train_b.id)
            conflict_type = _pair_conflict_type(train_a, train_b, window_a, window_b)
            if conflict_type is None:
                continue

            rt_id = f"RT-{train_a.id}-{train_b.id}"

            high_prio = {"EXPRESS"}
            both_express = (
                train_a.priority.value in high_prio and
                train_b.priority.value in high_prio
            )
            severity = "HIGH" if (conflict_type == "PLATFORM" or both_express) else "MEDIUM"

            # Real time-to-conflict: seconds until the earlier of the two
            # real occupancy windows begins, when we actually have both —
            # previously always None even when the data to compute it existed.
            time_to_conflict = None
            timing_note = ""
            if conflict_type == "PLATFORM" and window_a is not None and window_b is not None:
                overlap_start = max(window_a[0], window_b[0])
                delta_seconds = int((overlap_start - now).total_seconds())
                time_to_conflict = max(delta_seconds, 0)
                timing_note = " (real delay-adjusted schedule overlap)"
            elif conflict_type == "PLATFORM":
                timing_note = " (timing unknown — no schedule data for one or both trains)"

            recommendation = (
                f"Reassign {train_b.id} off Platform {train_a.platform} — {train_a.id} already occupies it{timing_note}"
                if conflict_type == "PLATFORM"
                else f"Hold {train_b.id} at next loop until {train_a.id} clears {segment} (opposing direction)"
            )

            rt_conflicts.append(
                ConflictResponse(
                    id=rt_id,
                    train_a_id=train_a.id,
                    train_b_id=train_b.id,
                    location=segment,
                    severity=severity,
                    conflict_type=conflict_type,
                    time_to_conflict=time_to_conflict,
                    recommendation=recommendation,
                    confidence=72,
                    time_saving=5,
                    detected_at=now,
                    resolved=False,
                    resolved_at=None,
                    source="REALTIME",
                )
            )

    return rt_conflicts


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ConflictResponse])
async def get_active_conflicts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return unresolved conflicts ordered by severity then detection time.
    Merges DB (seeded/resolved) conflicts with ephemeral real-time detections.

    Section-scoped for a plain CONTROLLER (whose account is locked to one
    real section) — they only see conflicts involving trains in their own
    section, not every section that's ever been imported. SUPERVISOR/ADMIN
    (CROSS_SECTION_VALUES sentinel) keep seeing everything, unchanged.
    """
    scoped_section = None if current_user.section in CROSS_SECTION_VALUES else current_user.section

    severity_order = {
        SeverityEnum.CRITICAL: 0,
        SeverityEnum.HIGH:     1,
        SeverityEnum.MEDIUM:   2,
        SeverityEnum.LOW:      3,
    }

    # 1. Fetch existing DB conflicts, scoped by the involved trains' real section
    result = await db.execute(
        select(Conflict)
        .where(Conflict.resolved == False)  # noqa: E712
        .order_by(Conflict.detected_at.desc())
    )
    db_conflicts = result.scalars().all()

    if scoped_section is not None and db_conflicts:
        train_ids = {c.train_a_id for c in db_conflicts} | {c.train_b_id for c in db_conflicts}
        trains_result = await db.execute(select(Train).where(Train.id.in_(train_ids)))
        section_by_train = {t.id: t.section for t in trains_result.scalars().all()}
        db_conflicts = [
            c for c in db_conflicts
            if section_by_train.get(c.train_a_id) == scoped_section
            or section_by_train.get(c.train_b_id) == scoped_section
        ]

    db_responses = sorted(
        [
            ConflictResponse(
                id=c.id,
                train_a_id=c.train_a_id,
                train_b_id=c.train_b_id,
                location=c.location,
                severity=c.severity.value,
                conflict_type=c.conflict_type.value,
                time_to_conflict=c.time_to_conflict,
                recommendation=c.recommendation,
                confidence=c.confidence,
                time_saving=c.time_saving,
                detected_at=c.detected_at,
                resolved=c.resolved,
                resolved_at=c.resolved_at,
                source="SEEDED",
            )
            for c in db_conflicts
        ],
        key=lambda c: severity_order.get(
            SeverityEnum(c.severity) if c.severity in SeverityEnum._value2member_map_ else SeverityEnum.LOW,
            99
        ),
    )

    # 2. Detect real-time conflicts from RUNNING trains, same section scoping
    rt_responses = await _detect_realtime_conflicts(db, section_filter=scoped_section)

    # 3. Filter out RT pairs already covered by a DB conflict between the same trains
    existing_pairs = {
        frozenset([c.train_a_id, c.train_b_id]) for c in db_responses
    }
    rt_filtered = [
        rt for rt in rt_responses
        if frozenset([rt.train_a_id, rt.train_b_id]) not in existing_pairs
    ]

    # Real-time conflicts first (they're live), then seeded ones
    all_conflicts = rt_filtered + db_responses

    # Cascading chains: two conflicts that share a train aren't really two
    # independent problems — holding one train to resolve A↔B can still
    # leave it stuck in B↔C. Group connected conflicts (via the train graph
    # they form) into one chain_id, purely from data already fetched above —
    # no extra queries. A conflict with no shared train gets no chain_id.
    _assign_chain_ids(all_conflicts)

    return all_conflicts


def _assign_chain_ids(conflicts: List[ConflictResponse]) -> None:
    """
    Union-find over the train-conflict graph: nodes are train ids, each
    conflict is an edge. Connected components of size > 1 conflict get a
    shared chain_id (mutates the list in place).
    """
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        parent.setdefault(a, a)
        parent.setdefault(b, b)
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for c in conflicts:
        union(c.train_a_id, c.train_b_id)

    component_trains: dict[str, set] = defaultdict(set)
    for c in conflicts:
        root = find(c.train_a_id)
        component_trains[root].add(c.train_a_id)
        component_trains[root].add(c.train_b_id)

    for c in conflicts:
        root = find(c.train_a_id)
        trains_in_component = component_trains[root]
        if len(trains_in_component) > 2:  # more than one conflict's worth of trains — a real chain
            c.chain_id = f"CHAIN-{'-'.join(sorted(trains_in_component))}"


@router.post("/{conflict_id}/resolve", response_model=ConflictResponse)
async def resolve_conflict(
    conflict_id: str,
    body: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Resolve a conflict.
    - For realtime conflicts (id starts with "RT-"): acknowledge in-memory only,
      return a synthetic resolved response without touching the DB.
    - For DB conflicts: set resolved=True, insert Decision + AuditLog.
    """
    # ── Realtime conflict path ───────────────────────────────────────────────
    if conflict_id.startswith("RT-"):
        # Parse train IDs from the RT id: "RT-<train_a>-<train_b>"
        parts = conflict_id.split("-", 2)
        train_a_id = parts[1] if len(parts) > 1 else "UNKNOWN"
        train_b_id = parts[2] if len(parts) > 2 else "UNKNOWN"

        train_a_res = await db.execute(select(Train.section).where(Train.id == train_a_id))
        train_a_section = train_a_res.scalar_one_or_none()
        require_section_access(current_user, train_a_section)

        now = datetime.utcnow()
        # Log the acknowledgement (no DB write for the conflict itself)
        try:
            audit = AuditLog(
                user_id=current_user.id,
                action="ACKNOWLEDGE_RT_CONFLICT",
                entity=f"conflict:{conflict_id}",
                detail=f"Realtime conflict acknowledged by {current_user.name}",
            )
            db.add(audit)
            await db.commit()
        except Exception as exc:
            logger.warning("Could not write RT conflict audit log: %s", exc)

        return ConflictResponse(
            id=conflict_id,
            train_a_id=train_a_id,
            train_b_id=train_b_id,
            location="REALTIME",
            severity="HIGH",
            conflict_type="CROSSING",
            time_to_conflict=None,
            recommendation=None,
            confidence=None,
            time_saving=None,
            detected_at=now,
            resolved=True,
            resolved_at=now,
            source="REALTIME",
        )

    # ── DB conflict path ─────────────────────────────────────────────────────
    result = await db.execute(select(Conflict).where(Conflict.id == conflict_id))
    conflict = result.scalar_one_or_none()

    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Conflict {conflict_id} not found")

    if conflict.resolved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflict is already resolved")

    train_a_res = await db.execute(select(Train.section).where(Train.id == conflict.train_a_id))
    require_section_access(current_user, train_a_res.scalar_one_or_none())

    valid_actions = {"ACCEPT_AI", "MANUAL_OVERRIDE"}
    action_upper = body.get("action", "ACCEPT_AI").upper() if body else "ACCEPT_AI"
    if action_upper not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action. Must be one of: {list(valid_actions)}",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Mark conflict as resolved
    conflict.resolved    = True
    conflict.resolved_at = now

    # Determine source
    source = DecisionSourceEnum.AI if action_upper == "ACCEPT_AI" else DecisionSourceEnum.MANUAL

    # Insert Decision
    notes_val = body.get("notes") if body else None
    decision = Decision(
        id=f"D-{uuid.uuid4().hex[:8].upper()}",
        conflict_id=conflict_id,
        action=action_upper,
        operator_id=current_user.id,
        source=source,
        notes=notes_val,
    )
    db.add(decision)

    # Insert AuditLog
    audit = AuditLog(
        user_id=current_user.id,
        action="RESOLVE_CONFLICT",
        entity=f"conflict:{conflict_id}",
        detail=f"Action={action_upper}, Source={source.value}, Notes={notes_val or 'N/A'}",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(conflict)

    return ConflictResponse(
        id=conflict.id,
        train_a_id=conflict.train_a_id,
        train_b_id=conflict.train_b_id,
        location=conflict.location,
        severity=conflict.severity.value,
        conflict_type=conflict.conflict_type.value,
        time_to_conflict=conflict.time_to_conflict,
        recommendation=conflict.recommendation,
        confidence=conflict.confidence,
        time_saving=conflict.time_saving,
        detected_at=conflict.detected_at,
        resolved=conflict.resolved,
        resolved_at=conflict.resolved_at,
        source="SEEDED",
    )
