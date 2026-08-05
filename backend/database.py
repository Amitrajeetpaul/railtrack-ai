"""
database.py â€” SQLAlchemy async engine + session factory for RailTrack AI.
Reads DATABASE_URL from environment (loaded via python-dotenv in main.py).
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

# Load .env from the backend directory
load_dotenv()

DEFAULT_SQLITE_URL = "sqlite+aiosqlite:///./railtrack.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)

is_sqlite = DATABASE_URL.startswith("sqlite")

engine_kwargs = {"echo": False}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_timeout"] = 30
    engine_kwargs["pool_recycle"] = 1800

engine = create_async_engine(DATABASE_URL, **engine_kwargs)

# Session factory â€” used by get_db() dependency
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)

# Declarative base â€” imported by models.py
Base = declarative_base()


async def get_db():
    """
    FastAPI dependency: yields an async database session and ensures it is
    closed after the request, even if an exception occurs.

    Usage:
        db: AsyncSession = Depends(get_db)
    """
    async with AsyncSessionLocal() as session:
        yield session


async def create_all_tables():
    """
    Called once at application startup to create all tables defined in models.py.
    In production, prefer Alembic migrations over this function.
    """
    # Import here to avoid circular imports â€” models must register with Base first
    from models import Base as ModelsBase  # noqa: F401 (side-effect: registers models)
    async with engine.begin() as conn:
        await conn.run_sync(ModelsBase.metadata.create_all)
    print("[DB] All tables are ready âœ“")

