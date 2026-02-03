# AAS AI Editor - Validation Service

Python FastAPI service providing AAS validation using aas-test-engines.

## Features

- Deep validation using aas-test-engines metamodel validation
- AASX file validation via `check_aasx_file()`
- Reference validation for broken references
- Semantic validation for semanticId presence
- REST API for integration with MCP server

## Installation

```bash
cd packages/validation-service
pip install -e ".[dev]"
```

## Running

```bash
uvicorn src.main:app --reload --port 8001
```

## API Endpoints

- `POST /validate/json` - Validate AAS JSON environment
- `POST /validate/aasx` - Validate AASX file
- `GET /health` - Health check
- `GET /ready` - Readiness check with aas-test-engines version

## Development

```bash
# Run tests
pytest

# Run linting
ruff check .

# Run type checking
mypy src
```
