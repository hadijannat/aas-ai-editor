"""
AAS Validator

Deep validation using aas-test-engines.
"""

import io
import json
import logging
import time
from typing import Any

from aas_test_engines import file as aas_file

from ..models import ValidationError, ValidationResult

logger = logging.getLogger(__name__)


class AasValidator:
    """
    Validator using aas-test-engines for comprehensive validation.
    """

    def __init__(self) -> None:
        """Initialize validator and verify aas-test-engines is available."""
        # Verify the library is working by checking supported versions
        self._supported_versions = aas_file.supported_versions()
        self._latest_version = aas_file.latest_version()  # type: ignore[no-untyped-call]
        logger.info(
            f"AAS Test Engines initialized. Supported versions: {self._supported_versions}, "
            f"Latest: {self._latest_version}"
        )

    async def validate(
        self,
        environment: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> ValidationResult:
        """
        Validate an AAS Environment structure using aas-test-engines.

        Args:
            environment: AAS Environment JSON structure
            options: Optional validation options (version, strict, etc.)

        Returns:
            ValidationResult with errors, warnings, and info
        """
        start_time = time.time()
        options = options or {}

        errors: list[ValidationError] = []
        warnings: list[ValidationError] = []
        info: list[ValidationError] = []

        try:
            # Get optional version from options, default to latest
            version = options.get("version", self._latest_version)

            # Run aas-test-engines validation
            result = aas_file.check_json_data(environment, version=version)

            # Parse the validation result
            self._parse_aas_test_result(result, errors, warnings, info)

            # Run additional custom validations
            self._validate_structure(environment, errors, warnings)
            self._validate_references(environment, errors, warnings)
            self._validate_semantics(environment, warnings, info)

        except Exception as e:
            logger.exception("Validation failed with exception")
            errors.append(
                ValidationError(
                    path="/",
                    message=f"Validation exception: {e}",
                    severity="error",
                    rule="validation.exception",
                )
            )

        duration_ms = (time.time() - start_time) * 1000

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            info=info,
            test_suite="aas-test-engines",
            duration_ms=duration_ms,
        )

    async def validate_aasx(self, content: bytes) -> ValidationResult:
        """
        Validate an AASX package directly using aas-test-engines.

        Args:
            content: Raw AASX file bytes

        Returns:
            ValidationResult
        """
        start_time = time.time()

        errors: list[ValidationError] = []
        warnings: list[ValidationError] = []
        info: list[ValidationError] = []

        try:
            # Use aas-test-engines to validate the AASX directly
            with io.BytesIO(content) as f:
                result = aas_file.check_aasx_file(f, version=self._latest_version)  # type: ignore[arg-type]

            # Parse the validation result
            self._parse_aas_test_result(result, errors, warnings, info)

        except Exception as e:
            logger.exception("AASX validation failed with exception")
            errors.append(
                ValidationError(
                    path="/",
                    message=f"AASX validation exception: {e}",
                    severity="error",
                    rule="validation.exception",
                )
            )

        duration_ms = (time.time() - start_time) * 1000

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            info=info,
            test_suite="aas-test-engines",
            duration_ms=duration_ms,
        )

    async def validate_json_bytes(self, content: bytes) -> ValidationResult:
        """
        Validate JSON bytes.

        Args:
            content: Raw JSON file bytes

        Returns:
            ValidationResult
        """
        try:
            environment = json.loads(content.decode("utf-8"))
        except json.JSONDecodeError as e:
            return ValidationResult(
                valid=False,
                errors=[
                    ValidationError(
                        path="/",
                        message=f"Invalid JSON: {e}",
                        severity="error",
                        rule="schema.json",
                    )
                ],
                warnings=[],
                info=[],
                test_suite="aas-test-engines",
                duration_ms=0,
            )

        return await self.validate(environment)

    def _validate_structure(
        self,
        environment: dict[str, Any],
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """Validate basic structure."""
        # Check for required top-level keys
        if "assetAdministrationShells" not in environment:
            warnings.append(
                ValidationError(
                    path="/",
                    message="Missing assetAdministrationShells array",
                    severity="warning",
                    rule="schema.structure",
                )
            )

        if "submodels" not in environment:
            warnings.append(
                ValidationError(
                    path="/",
                    message="Missing submodels array",
                    severity="warning",
                    rule="schema.structure",
                )
            )

    def _validate_references(
        self,
        environment: dict[str, Any],
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """
        Validate reference integrity.

        Collects all element IDs and verifies that references point to valid targets.
        """
        # Collect all identifiable element IDs
        valid_ids: set[str] = set()

        # Collect AAS IDs
        for aas in environment.get("assetAdministrationShells", []):
            if "id" in aas:
                valid_ids.add(aas["id"])

        # Collect Submodel IDs
        for sm in environment.get("submodels", []):
            if "id" in sm:
                valid_ids.add(sm["id"])

        # Collect ConceptDescription IDs
        for cd in environment.get("conceptDescriptions", []):
            if "id" in cd:
                valid_ids.add(cd["id"])

        # Now check all references
        self._check_references_in_aas(environment, valid_ids, errors, warnings)
        self._check_references_in_submodels(environment, valid_ids, errors, warnings)

    def _check_references_in_aas(
        self,
        environment: dict[str, Any],
        valid_ids: set[str],
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """Check references within Asset Administration Shells."""
        for i, aas in enumerate(environment.get("assetAdministrationShells", [])):
            # Check submodel references
            for j, sm_ref in enumerate(aas.get("submodels", [])):
                ref_id = self._extract_reference_id(sm_ref)
                if ref_id and ref_id not in valid_ids:
                    errors.append(
                        ValidationError(
                            path=f"/assetAdministrationShells/{i}/submodels/{j}",
                            message=f"Submodel reference points to non-existent element: {ref_id}",
                            severity="error",
                            rule="references.broken",
                        )
                    )

            # Check derivedFrom reference if present
            if "derivedFrom" in aas:
                ref_id = self._extract_reference_id(aas["derivedFrom"])
                if ref_id and ref_id not in valid_ids:
                    warnings.append(
                        ValidationError(
                            path=f"/assetAdministrationShells/{i}/derivedFrom",
                            message=f"derivedFrom reference points to non-existent AAS: {ref_id}",
                            severity="warning",
                            rule="references.external",
                        )
                    )

    def _check_references_in_submodels(
        self,
        environment: dict[str, Any],
        valid_ids: set[str],
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """Check references within Submodels and their elements."""
        for i, sm in enumerate(environment.get("submodels", [])):
            self._check_submodel_elements(
                sm.get("submodelElements", []),
                f"/submodels/{i}/submodelElements",
                valid_ids,
                errors,
                warnings,
            )

    def _check_submodel_elements(
        self,
        elements: list[Any],
        base_path: str,
        valid_ids: set[str],
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """Recursively check references in submodel elements."""
        for i, elem in enumerate(elements):
            elem_path = f"{base_path}/{i}"
            model_type = elem.get("modelType")

            # Check ReferenceElement
            if model_type == "ReferenceElement":
                value = elem.get("value")
                if value:
                    ref_id = self._extract_reference_id(value)
                    if ref_id and ref_id not in valid_ids:
                        # This could be an external reference, so just warn
                        warnings.append(
                            ValidationError(
                                path=elem_path,
                                message=f"ReferenceElement points to unknown element: {ref_id}",
                                severity="warning",
                                rule="references.unknown",
                            )
                        )

            # Check RelationshipElement
            elif model_type == "RelationshipElement":
                first = elem.get("first")
                second = elem.get("second")
                if first:
                    ref_id = self._extract_reference_id(first)
                    if ref_id and ref_id not in valid_ids:
                        warnings.append(
                            ValidationError(
                                path=f"{elem_path}/first",
                                message=f"RelationshipElement.first points to unknown "
                                f"element: {ref_id}",
                                severity="warning",
                                rule="references.unknown",
                            )
                        )
                if second:
                    ref_id = self._extract_reference_id(second)
                    if ref_id and ref_id not in valid_ids:
                        warnings.append(
                            ValidationError(
                                path=f"{elem_path}/second",
                                message=f"RelationshipElement.second points to unknown "
                                f"element: {ref_id}",
                                severity="warning",
                                rule="references.unknown",
                            )
                        )

            # Check Entity
            elif model_type == "Entity":
                global_ref = elem.get("globalAssetId")
                if global_ref:
                    # globalAssetId is typically external, just validate format
                    pass

            # Recurse into SubmodelElementCollection and SubmodelElementList
            if model_type in ("SubmodelElementCollection", "SubmodelElementList"):
                nested_key = "value" if model_type == "SubmodelElementCollection" else "value"
                nested = elem.get(nested_key, [])
                if isinstance(nested, list):
                    self._check_submodel_elements(
                        nested,
                        f"{elem_path}/{nested_key}",
                        valid_ids,
                        errors,
                        warnings,
                    )

    def _extract_reference_id(self, reference: Any) -> str | None:
        """Extract the target ID from a reference structure."""
        if not reference:
            return None

        # Handle Reference object with keys array
        if isinstance(reference, dict):
            keys = reference.get("keys", [])
            if keys and isinstance(keys, list) and len(keys) > 0:
                # The last key typically contains the actual ID
                last_key = keys[-1]
                if isinstance(last_key, dict):
                    return last_key.get("value")

        return None

    def _validate_semantics(
        self,
        environment: dict[str, Any],
        warnings: list[ValidationError],
        info: list[ValidationError],
    ) -> None:
        """Validate semantic aspects."""
        # Check submodels have semantic IDs
        submodels = environment.get("submodels", [])
        for i, sm in enumerate(submodels):
            if "semanticId" not in sm:
                warnings.append(
                    ValidationError(
                        path=f"/submodels/{i}",
                        message="Submodel missing semanticId",
                        severity="warning",
                        rule="semantics.semantic_id",
                    )
                )

    def _parse_aas_test_result(
        self,
        result: Any,
        errors: list[ValidationError],
        warnings: list[ValidationError],
        info: list[ValidationError],
    ) -> None:
        """
        Parse aas-test-engines validation result into our ValidationError format.

        The aas-test-engines result object has:
        - ok(): Returns True if compliant
        - dump(): Returns validation details as a string
        - Internal structure with validation issues
        """
        # Check if validation passed
        if result.ok():
            info.append(
                ValidationError(
                    path="/",
                    message="AAS structure is compliant with metamodel specification",
                    severity="info",
                    rule="aas-test-engines.compliance",
                )
            )
            return

        # Parse validation failures from the result
        # The result object contains issues in its internal structure
        try:
            # Try to access the internal issues structure
            # aas-test-engines stores issues in result._issues or similar
            if hasattr(result, "_issues"):
                self._extract_issues(result._issues, errors, warnings)
            elif hasattr(result, "issues"):
                self._extract_issues(result.issues, errors, warnings)
            else:
                # Fallback: parse the dump output
                dump_output = result.dump()
                if dump_output:
                    errors.append(
                        ValidationError(
                            path="/",
                            message=f"AAS validation failed: {dump_output[:500]}",
                            severity="error",
                            rule="aas-test-engines.validation",
                        )
                    )
        except Exception as e:
            logger.warning(f"Could not parse detailed issues: {e}")
            # Fallback: just note that validation failed
            errors.append(
                ValidationError(
                    path="/",
                    message="AAS validation failed (see aas-test-engines output)",
                    severity="error",
                    rule="aas-test-engines.validation",
                )
            )

    def _extract_issues(
        self,
        issues: Any,
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """Extract issues from aas-test-engines internal structure."""
        if isinstance(issues, dict):
            for path, issue_list in issues.items():
                if isinstance(issue_list, list):
                    for issue in issue_list:
                        self._add_issue(path, issue, errors, warnings)
                else:
                    self._add_issue(path, issue_list, errors, warnings)
        elif isinstance(issues, list):
            for issue in issues:
                self._add_issue("/", issue, errors, warnings)

    def _add_issue(
        self,
        path: str,
        issue: Any,
        errors: list[ValidationError],
        warnings: list[ValidationError],
    ) -> None:
        """Add a single issue to the appropriate list."""
        # Determine severity and message from the issue
        if isinstance(issue, str):
            message = issue
            severity = "error"
            rule = "aas-test-engines"
        elif isinstance(issue, dict):
            message = issue.get("message", str(issue))
            severity = issue.get("severity", "error")
            rule = issue.get("rule", "aas-test-engines")
        else:
            message = str(issue)
            severity = "error"
            rule = "aas-test-engines"

        error = ValidationError(
            path=path if path.startswith("/") else f"/{path}",
            message=message,
            severity=severity,
            rule=rule,
        )

        if severity == "warning":
            warnings.append(error)
        else:
            errors.append(error)
