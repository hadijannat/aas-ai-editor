"""
Validation Routes

Endpoints for validating AAS documents.
"""

from fastapi import APIRouter, HTTPException, UploadFile

from ..models import ValidationRequest, ValidationResult
from ..validators.aas_validator import AasValidator
from ..validators.schema_validator import SchemaValidator

router = APIRouter()


@router.post("/json", response_model=ValidationResult)
async def validate_json(request: ValidationRequest) -> ValidationResult:
    """
    Validate an AAS Environment JSON structure.

    Runs comprehensive validation using aas-test-engines including:
    - Schema validation
    - Metamodel constraints
    - Reference integrity
    - Value type checking
    """
    validator = AasValidator()

    try:
        result = await validator.validate(request.environment, request.options)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/file", response_model=ValidationResult)
async def validate_file(file: UploadFile) -> ValidationResult:
    """
    Validate an uploaded AASX or JSON file.

    Accepts:
    - .aasx files (OPC package)
    - .json files (AAS Environment JSON)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    # Check file extension
    filename_lower = file.filename.lower()
    if not (filename_lower.endswith(".aasx") or filename_lower.endswith(".json")):
        raise HTTPException(
            status_code=400,
            detail="File must be .aasx or .json",
        )

    # Read file content
    content = await file.read()

    validator = AasValidator()

    try:
        if filename_lower.endswith(".aasx"):
            result = await validator.validate_aasx(content)
        else:
            result = await validator.validate_json_bytes(content)

        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/schema", response_model=ValidationResult)
async def validate_schema(request: ValidationRequest) -> ValidationResult:
    """
    Validate only against AAS JSON Schema (fast validation).

    This is a lighter-weight validation that only checks
    schema compliance without running the full test suite.
    """
    validator = SchemaValidator()

    try:
        result = await validator.validate(request.environment)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/rules")
async def list_rules() -> dict[str, list[str]]:
    """
    List available validation rules.

    Returns the rules that can be enabled/disabled
    in validation options.
    """
    return {
        "categories": [
            "schema",
            "metamodel",
            "references",
            "semantics",
            "values",
        ],
        "rules": [
            "schema.structure",
            "schema.required_fields",
            "metamodel.constraints",
            "metamodel.cardinality",
            "references.integrity",
            "references.resolvable",
            "semantics.semantic_id",
            "semantics.value_type",
            "values.range",
            "values.pattern",
        ],
    }
