"""
Health Check Routes
"""

import logging

from fastapi import APIRouter

from ..config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache the validation engine status at startup
_aas_test_engines_status: dict | None = None


def _check_aas_test_engines() -> dict:
    """Check if aas-test-engines is properly loaded and working."""
    global _aas_test_engines_status

    if _aas_test_engines_status is not None:
        return _aas_test_engines_status

    try:
        from aas_test_engines import file as aas_file

        supported = aas_file.supported_versions()
        latest = aas_file.latest_version()

        _aas_test_engines_status = {
            "available": True,
            "supported_versions": supported,
            "latest_version": latest,
        }
    except ImportError as e:
        logger.error(f"aas-test-engines not available: {e}")
        _aas_test_engines_status = {
            "available": False,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"aas-test-engines initialization failed: {e}")
        _aas_test_engines_status = {
            "available": False,
            "error": str(e),
        }

    return _aas_test_engines_status


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": settings.version,
    }


@router.get("/ready")
async def readiness_check() -> dict:
    """
    Readiness check endpoint.

    Verifies that validation engines are properly loaded and operational.
    """
    aas_status = _check_aas_test_engines()

    # Service is ready if aas-test-engines is available
    is_ready = aas_status.get("available", False)

    return {
        "status": "ready" if is_ready else "not_ready",
        "validators": {
            "aas-test-engines": aas_status,
        },
    }
