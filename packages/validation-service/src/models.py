"""
Shared Models

Pydantic models used across the validation service.
"""

from typing import Any

from pydantic import BaseModel


class ValidationRequest(BaseModel):
    """Request body for JSON validation."""

    environment: dict[str, Any]
    options: dict[str, Any] | None = None


class ValidationError(BaseModel):
    """A single validation error."""

    path: str
    message: str
    severity: str  # error, warning, info
    rule: str | None = None


class ValidationResult(BaseModel):
    """Validation result."""

    valid: bool
    errors: list[ValidationError]
    warnings: list[ValidationError]
    info: list[ValidationError]
    test_suite: str
    duration_ms: float
