# Getting Started

This guide walks you through setting up the AAS AI Editor for local development.

## Prerequisites

- **Node.js**: v20.0.0 or higher
- **pnpm**: v9.0.0 or higher
- **Python**: 3.11 or higher (for validation service)
- **Docker** (optional): For containerized deployment
- **Anthropic API Key**: For Claude AI integration

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/aas-ai-editor.git
cd aas-ai-editor
```

### 2. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all workspace dependencies
pnpm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your Anthropic API key
# ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 4. Start Development Servers

```bash
# Start all services in development mode
pnpm dev

# Or start specific services:
pnpm dev:web        # Web UI only (http://localhost:5173)
pnpm dev:mcp        # MCP Server only (http://localhost:3001)
pnpm dev:validation # Validation service (http://localhost:8000)
```

### 5. Open the Editor

Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

## Using Docker

For a fully containerized setup:

```bash
# Start with docker-compose
pnpm docker:dev

# Access:
# - Web UI: http://localhost:5173
# - MCP Server: http://localhost:3001
# - Validation API: http://localhost:8000
```

## Your First Edit

1. **Open an AASX file**: Drag and drop an AASX file onto the editor, or use File → Open
2. **Navigate the tree**: Click on submodels and elements to view their properties
3. **Edit with AI**: Click "Edit with AI" and describe what you want to change
4. **Review changes**: The AI will propose changes shown in a diff view
5. **Approve or reject**: Accept to apply, or reject to discard

## Project Structure Overview

```
aas-ai-editor/
├── packages/
│   ├── core/              # AASX parsing, patches, validation
│   ├── mcp-server/        # MCP server with Claude integration
│   ├── web-ui/            # Vue 3 editor interface
│   └── validation-service/ # Python deep validation
├── docs/                  # Documentation
├── templates/             # IDTA submodel templates
└── docker/                # Container configs
```

## Next Steps

- Read the [Developer Guide](./DEVELOPER_GUIDE.md) for in-depth development info
- Review the [Architecture](../architecture/ARCHITECTURE.md) documentation
- Check out the [MCP Tools](../architecture/MCP_TOOLS.md) reference

## Troubleshooting

### "pnpm install fails"

Ensure you have Node.js 20+ and pnpm 9+:
```bash
node --version  # Should be v20.x.x or higher
pnpm --version  # Should be v9.x.x or higher
```

### "API key not working"

Verify your `.env` file:
```bash
# Check key is set (without revealing it)
grep ANTHROPIC_API_KEY .env
```

### "Validation service not starting"

Install Python dependencies:
```bash
cd packages/validation-service
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e .
```

### "Port already in use"

Check what's using the port and kill it, or change the port in `.env`:
```bash
lsof -i :3001  # Find process using port 3001
```

## Getting Help

- Open an issue on GitHub
- Check existing issues for similar problems
- Review the architecture docs for understanding the system
