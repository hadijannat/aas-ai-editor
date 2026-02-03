"""
Validation Endpoint Tests
"""

import pytest
from httpx import AsyncClient, ASGITransport

from src.main import app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client():
    """Create test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.anyio
async def test_health_check(client: AsyncClient):
    """Test health endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.anyio
async def test_validate_valid_environment(client: AsyncClient):
    """Test validation of valid environment."""
    environment = {
        "assetAdministrationShells": [
            {
                "modelType": "AssetAdministrationShell",
                "id": "https://example.com/aas/1",
                "idShort": "TestAAS",
                "assetInformation": {
                    "assetKind": "Instance",
                    "globalAssetId": "https://example.com/asset/1",
                },
            }
        ],
        "submodels": [
            {
                "modelType": "Submodel",
                "id": "https://example.com/submodel/1",
                "idShort": "TestSubmodel",
                "semanticId": {
                    "type": "ExternalReference",
                    "keys": [{"type": "GlobalReference", "value": "https://example.com/semantic"}],
                },
                "submodelElements": [],
            }
        ],
        "conceptDescriptions": [],
    }

    response = await client.post("/validate/json", json={"environment": environment})
    assert response.status_code == 200

    data = response.json()
    assert data["valid"] is True
    assert len(data["errors"]) == 0


@pytest.mark.anyio
async def test_validate_missing_semantic_id(client: AsyncClient):
    """Test validation catches missing semantic ID."""
    environment = {
        "assetAdministrationShells": [],
        "submodels": [
            {
                "modelType": "Submodel",
                "id": "https://example.com/submodel/1",
                "idShort": "NoSemanticId",
                "submodelElements": [],
            }
        ],
    }

    response = await client.post("/validate/json", json={"environment": environment})
    assert response.status_code == 200

    data = response.json()
    # Should have warning about missing semantic ID
    assert any("semanticId" in w["message"] for w in data["warnings"])


@pytest.mark.anyio
async def test_validate_schema_only(client: AsyncClient):
    """Test schema-only validation."""
    environment = {
        "assetAdministrationShells": [],
        "submodels": [],
    }

    response = await client.post("/validate/schema", json={"environment": environment})
    assert response.status_code == 200

    data = response.json()
    assert data["test_suite"] == "json-schema"


@pytest.mark.anyio
async def test_list_rules(client: AsyncClient):
    """Test listing validation rules."""
    response = await client.get("/validate/rules")
    assert response.status_code == 200

    data = response.json()
    assert "categories" in data
    assert "rules" in data
    assert len(data["rules"]) > 0


@pytest.mark.anyio
async def test_ready_endpoint(client: AsyncClient):
    """Test readiness endpoint returns aas-test-engines status."""
    response = await client.get("/ready")
    assert response.status_code == 200

    data = response.json()
    assert "status" in data
    assert "validators" in data
    assert "aas-test-engines" in data["validators"]

    # aas-test-engines should be available
    aas_status = data["validators"]["aas-test-engines"]
    assert aas_status["available"] is True
    assert "supported_versions" in aas_status
    assert "latest_version" in aas_status


@pytest.mark.anyio
async def test_validate_broken_reference(client: AsyncClient):
    """Test validation catches broken submodel references."""
    environment = {
        "assetAdministrationShells": [
            {
                "modelType": "AssetAdministrationShell",
                "id": "https://example.com/aas/1",
                "idShort": "TestAAS",
                "assetInformation": {
                    "assetKind": "Instance",
                    "globalAssetId": "https://example.com/asset/1",
                },
                "submodels": [
                    {
                        "type": "ModelReference",
                        "keys": [
                            {
                                "type": "Submodel",
                                "value": "https://example.com/submodel/NONEXISTENT",
                            }
                        ],
                    }
                ],
            }
        ],
        "submodels": [],  # Empty - the reference is broken
    }

    response = await client.post("/validate/json", json={"environment": environment})
    assert response.status_code == 200

    data = response.json()
    # Should have error about broken reference
    assert any("non-existent" in e["message"].lower() for e in data["errors"])


@pytest.mark.anyio
async def test_validate_reference_element(client: AsyncClient):
    """Test validation of ReferenceElement pointing to unknown target."""
    environment = {
        "assetAdministrationShells": [],
        "submodels": [
            {
                "modelType": "Submodel",
                "id": "https://example.com/submodel/1",
                "idShort": "TestSubmodel",
                "semanticId": {
                    "type": "ExternalReference",
                    "keys": [{"type": "GlobalReference", "value": "https://example.com/semantic"}],
                },
                "submodelElements": [
                    {
                        "modelType": "ReferenceElement",
                        "idShort": "RefToUnknown",
                        "value": {
                            "type": "ModelReference",
                            "keys": [
                                {
                                    "type": "Submodel",
                                    "value": "https://example.com/submodel/UNKNOWN",
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    response = await client.post("/validate/json", json={"environment": environment})
    assert response.status_code == 200

    data = response.json()
    # Should have warning about unknown reference
    assert any("unknown" in w["message"].lower() for w in data["warnings"])
