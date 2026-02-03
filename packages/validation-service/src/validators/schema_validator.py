"""
Schema Validator

Fast JSON Schema validation for AAS structures.
"""

import time
from typing import Any

from ..models import ValidationError, ValidationResult


class SchemaValidator:
    """
    Fast schema-only validator.

    Uses JSON Schema validation without running
    the full aas-test-engines test suite.
    """

    def __init__(self) -> None:
        # TODO: Load AAS JSON Schema
        self.schema: dict[str, Any] | None = None

    async def validate(self, environment: dict[str, Any]) -> ValidationResult:
        """
        Validate against AAS JSON Schema.

        Args:
            environment: AAS Environment JSON structure

        Returns:
            ValidationResult
        """
        start_time = time.time()

        errors: list[ValidationError] = []
        warnings: list[ValidationError] = []

        # TODO: Implement actual JSON Schema validation
        # import jsonschema
        # try:
        #     jsonschema.validate(environment, self.schema)
        # except jsonschema.ValidationError as e:
        #     errors.append(...)

        # Stub - basic structure checks
        if not isinstance(environment, dict):
            errors.append(
                ValidationError(
                    path="/",
                    message="Environment must be an object",
                    severity="error",
                    rule="schema.structure",
                )
            )

        # Check array types
        for key in ["assetAdministrationShells", "submodels", "conceptDescriptions"]:
            if key in environment and not isinstance(environment[key], list):
                errors.append(
                    ValidationError(
                        path=f"/{key}",
                        message=f"{key} must be an array",
                        severity="error",
                        rule="schema.structure",
                    )
                )

        duration_ms = (time.time() - start_time) * 1000

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            info=[],
            test_suite="json-schema",
            duration_ms=duration_ms,
        )
