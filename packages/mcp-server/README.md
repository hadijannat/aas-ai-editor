# @aas-ai-editor/mcp-server

[![npm version](https://img.shields.io/npm/v/@aas-ai-editor/mcp-server.svg)](https://www.npmjs.com/package/@aas-ai-editor/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

MCP (Model Context Protocol) server for AI-assisted editing of Asset Administration Shell (AAS) packages. This server enables Claude and other AI assistants to read, validate, and modify AASX files through a standardized protocol.

## What is AAS/AASX?

**Asset Administration Shell (AAS)** is the standardized digital twin format for Industry 4.0. It provides a unified way to describe industrial assets (machines, devices, components) with:

- **Submodels**: Structured data like Nameplate, Documentation, Technical Data
- **Semantic IDs**: References to ECLASS, IDTA templates for interoperability
- **Supplementary files**: PDFs, images, CAD files bundled in the package

**AASX files** are ZIP-based packages containing AAS data (JSON/XML) plus attachments.

Learn more: [Industrial Digital Twin Association (IDTA)](https://industrialdigitaltwin.org/)

## Features

- **23 MCP Tools** for document lifecycle, querying, editing, validation, and AI chat
- **AI-powered assistant** with automatic tool calling (requires Anthropic API key)
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

## Example Conversations

Once connected, you can have natural conversations with Claude about your AASX files:

```
You: Load the file at /path/to/pump-device.aasx

Claude: I've loaded the AASX file. It contains:
- 1 Asset Administration Shell: "PumpAAS"
- 3 Submodels: Nameplate, TechnicalData, Documentation
- 47 total elements

You: What's the manufacturer name?

Claude: Looking at the Nameplate submodel, the ManufacturerName is "Bosch Rexroth AG".

You: Change it to "Siemens AG"

Claude: I'll update the ManufacturerName property. Here's the proposed change:
- Path: /submodels/0/submodelElements/0/value
- Old value: "Bosch Rexroth AG"
- New value: "Siemens AG"

[Change applied]

You: Validate the document

Claude: Running validation... Found 2 issues:
1. Warning: Missing semanticId on Property "CustomField"
2. Error: Invalid date format in "ManufacturingDate"

You: Fix these issues automatically

Claude: I'll generate fixes for these issues:
1. Added semanticId reference to CustomField
2. Corrected date format to ISO 8601

[2 fixes applied]

You: Save the file

Claude: Document saved to /path/to/pump-device.aasx
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
| `ANTHROPIC_API_KEY` | Anthropic API key for AI features | - |
| `MCP_SERVER_PORT` | Server port | `3001` |
| `MCP_SERVER_HOST` | Server host binding | `0.0.0.0` |
| `MCP_API_KEY` | Single API key for client authentication | - |
| `MCP_API_KEYS` | Comma-separated API keys | - |
| `MCP_ALLOWED_PATHS` | Allowed directories for file operations | - |
| `MCP_SESSION_TIMEOUT_MS` | Session timeout in milliseconds | `1800000` |
| `AI_MODEL` | Claude model to use | `claude-sonnet-4-20250514` |
| `AI_MAX_TOKENS` | Maximum response tokens | `4096` |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `http://localhost:5173` |
| `NODE_ENV` | Environment mode | `development` |

### Anthropic API Key

The AI chat feature requires an Anthropic API key. You can provide it in three ways:

1. **Environment variable** (recommended for servers):
   ```bash
   ANTHROPIC_API_KEY=sk-ant-... npx @aas-ai-editor/mcp-server
   ```

2. **Claude Desktop config**:
   ```json
   {
     "mcpServers": {
       "aas-editor": {
         "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
       }
     }
   }
   ```

3. **Request header** (for web clients):
   ```
   X-Anthropic-Api-Key: sk-ant-...
   ```

Get your API key at: https://console.anthropic.com/settings/keys

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

### AI Tools
- `ai_chat` - Claude-powered assistant with automatic tool calling

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

## Web UI

For a visual editing experience, use the companion web application:

```bash
# Clone and run
git clone https://github.com/hadijannat/aas-ai-editor.git
cd aas-ai-editor
pnpm install
pnpm dev
```

Then open http://localhost:5173 for:
- Visual tree editor for AAS documents
- AI chat sidebar for intelligent assistance
- Diff viewer for reviewing changes
- Settings page to configure your API key

## Related Packages

- [`@aas-ai-editor/core`](https://www.npmjs.com/package/@aas-ai-editor/core) - Core AASX parsing and patch operations
- [`@aas-ai-editor/web-ui`](https://www.npmjs.com/package/@aas-ai-editor/web-ui) - Vue 3 web application
- [AAS AI Editor](https://github.com/hadijannat/aas-ai-editor) - Full monorepo with all packages

## License

MIT
