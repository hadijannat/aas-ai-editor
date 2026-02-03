# AASX AI Editor

AI-enhanced, browser-based editor for Asset Administration Shell (AAS) packages.

## Overview

The AASX AI Editor combines traditional AAS editing with Claude AI assistance through the Model Context Protocol (MCP). It provides intelligent suggestions, validation, and template-based editing for Industry 4.0 digital twins.

## Features

- **Visual Tree Editor** - Navigate and edit AAS structures intuitively
- **AI Assistance** - Claude-powered suggestions and auto-corrections
- **IDTA Templates** - Pre-built submodel templates with validation
- **Real-time Validation** - Two-tier validation (fast + deep)
- **Patch-based Editing** - Full undo/redo with approval workflow
- **AASX Support** - Open and save standard AASX packages

## Architecture

```
packages/
  core/           # AASX parsing, patch operations, templates
  mcp-server/     # MCP Streamable HTTP server + Claude integration
  web-ui/         # Vue 3 SPA editor
  validation-service/  # Python FastAPI deep validation
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+
- Docker (optional)

### Development Setup

```bash
# Clone and install
git clone https://github.com/your-org/aas-ai-editor.git
cd aas-ai-editor
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start development servers
pnpm dev
```

Open http://localhost:5173 in your browser.

### Docker Deployment

```bash
# Build images
./scripts/docker-build.sh

# Start services
cd docker
docker compose up -d
```

## Package Overview

### @aas-editor/core

TypeScript library for AAS operations:
- AASX package parsing (OPC/ZIP)
- JSON Patch operations (RFC 6902)
- AAS-aware diff algorithms
- IDTA template registry

### @aas-editor/mcp-server

MCP server with Claude AI integration:
- Streamable HTTP transport
- Document, query, edit, validate tools
- Session management
- Approval workflow for patches

### @aas-editor/web-ui

Vue 3 single-page application:
- Tree navigation component
- Property form editor
- JSON/diff viewers
- Approval panel for AI changes

### validation-service

Python FastAPI service:
- aas-test-engines integration
- Schema validation
- Semantic validation
- AASX file validation

## Development

```bash
# Run all tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Build all packages
pnpm build
```

## Documentation

- [Architecture Overview](docs/architecture/ARCHITECTURE.md)
- [MCP Tools Reference](docs/architecture/MCP_TOOLS.md)
- [Data Flow](docs/architecture/DATA_FLOW.md)
- [Getting Started Guide](docs/guides/GETTING_STARTED.md)
- [Developer Guide](docs/guides/DEVELOPER_GUIDE.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
