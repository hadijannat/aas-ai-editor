# @aas-ai-editor/mcp-server

[![npm version](https://img.shields.io/npm/v/@aas-ai-editor/mcp-server.svg)](https://www.npmjs.com/package/@aas-ai-editor/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

MCP (Model Context Protocol) server for AI-assisted editing of Asset Administration Shell (AAS) packages. This server enables Claude and other AI assistants to read, validate, and modify AASX files through a standardized protocol.

## Features

- **22 MCP Tools** for document lifecycle, querying, editing, and validation
- **Self-correcting validation** with automatic fix suggestions
- **Patch-based editing** with full undo/redo support
- **IDTA template validation** for industry-standard submodels
- **Session management** with security hardening

## Quick Start

Get up and running in 3 steps:

```bash
# 1. Run the server
npx @aas-ai-editor/mcp-server

# 2. The server starts on http://localhost:3001
#    Health check: curl http://localhost:3001/health

# 3. Connect your AI client (see Claude integration below)
```

## Installation

### npm (Recommended)

```bash
# Run directly with npx
npx @aas-ai-editor/mcp-server

# Or install globally
npm install -g @aas-ai-editor/mcp-server
aas-mcp-server
```

### Docker

```bash
docker pull hadijannat/aas-mcp-server
docker run -p 3001:3001 hadijannat/aas-mcp-server
```

## Claude Code Integration

Add to your Claude Code configuration:

```bash
claude mcp add aas-editor npx @aas-ai-editor/mcp-server
```

Or manually edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "npx",
      "args": ["@aas-ai-editor/mcp-server"]
    }
  }
}
```

## Claude Desktop Integration

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Using npx (Recommended)

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "npx",
      "args": ["@aas-ai-editor/mcp-server"],
      "env": {
        "MCP_PORT": "3001",
        "MCP_ALLOWED_PATHS": "/Users/yourname/aasx-files"
      }
    }
  }
}
```

### Using Docker

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-p", "3001:3001",
        "-v", "/path/to/aasx-files:/data",
        "-e", "MCP_ALLOWED_PATHS=/data",
        "aas-ai-editor/mcp-server"
      ]
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PORT` | Server port | `3001` |
| `MCP_API_KEY` | Single API key for authentication | - |
| `MCP_API_KEYS` | Comma-separated API keys | - |
| `MCP_ALLOWED_PATHS` | Allowed directories for file operations | - |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `http://localhost:5173` |
| `NODE_ENV` | Environment mode | `development` |
| `RATE_LIMIT_MAX` | Max requests per minute | `100` |
| `TRUST_PROXY` | Trust X-Forwarded-For header | `false` |

## Available Tools

### Document Lifecycle
- `document_load` - Load an AASX file
- `document_save` - Save changes to file
- `document_create` - Create new AAS environment
- `document_undo` / `document_redo` - Undo/redo operations

### Query Tools
- `query_list_submodels` - List all submodels
- `query_find_by_semantic_id` - Find elements by semantic ID
- `query_get_by_path` - Get element at JSON pointer path
- `query_list_elements` - List submodel elements
- `query_get_pointer` - Get JSON pointer for element
- `query_diff` - Compare environments

### Edit Tools
- `edit_add` - Add new element
- `edit_update` - Update existing element
- `edit_delete` - Delete element
- `edit_move` / `edit_copy` - Move or copy elements
- `edit_batch` - Batch multiple operations

### Validation Tools
- `validate_fast` - Quick structural validation
- `validate_deep` - Full semantic validation (requires validation service)
- `validate_summary` - Overview of validation status
- `validate_template` - IDTA template compliance check
- `validate_auto_fix` - Generate patches to fix validation errors

## Security

For production deployments, configure authentication:

```bash
# Set API key(s) for client authentication
export MCP_API_KEY="your-secret-key"
# Or multiple keys
export MCP_API_KEYS="key1,key2,key3"

# Restrict file access to specific directories
export MCP_ALLOWED_PATHS="/data/aasx,/uploads"

# Enable production mode
export NODE_ENV=production
```

See [Deployment Security Guide](../../docs/deployment/SECURITY.md) for complete security configuration.

## API Usage

The server exposes MCP over Streamable HTTP:

```bash
# Health check
curl http://localhost:3001/health

# MCP endpoint (requires session management)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Troubleshooting

### Server won't start

```bash
# Check if port is in use
lsof -i :3001

# Use a different port
MCP_PORT=3002 npx @aas-ai-editor/mcp-server
```

### Claude can't connect

1. Verify the server is running: `curl http://localhost:3001/health`
2. Check your config file path and JSON syntax
3. Restart Claude Desktop/Claude Code after config changes

### Permission denied errors

Set `MCP_ALLOWED_PATHS` to include your AASX file directories:

```bash
MCP_ALLOWED_PATHS=/Users/yourname/documents,/tmp npx @aas-ai-editor/mcp-server
```

### Deep validation not working

Deep validation requires the Python validation service. For standalone use, `validate_fast` provides structural validation without additional dependencies.

## Related Packages

- [`@aas-ai-editor/core`](https://www.npmjs.com/package/@aas-ai-editor/core) - Core AASX parsing and patch operations
- [AAS AI Editor](https://github.com/hadijannat/aas-ai-editor) - Full application with web UI

## License

MIT
