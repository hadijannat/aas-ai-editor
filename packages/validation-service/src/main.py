"""
FastAPI Application Entry Point

Provides REST API for deep AAS validation.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import health, validate
from .config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan manager."""
    # Startup
    print(f"Starting validation service v{settings.version}")
    yield
    # Shutdown
    print("Shutting down validation service")


app = FastAPI(
    title="AAS Validation Service",
    description="Deep validation for Asset Administration Shell documents",
    version=settings.version,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(health.router, tags=["health"])
app.include_router(validate.router, prefix="/validate", tags=["validation"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
