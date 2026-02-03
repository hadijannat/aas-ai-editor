# Claude Desktop Integration

This guide explains how to integrate the AAS AI Editor MCP server with Claude Desktop for AI-assisted AASX editing.

## Overview

The AAS AI Editor MCP server provides Claude with tools to:
- Load and save AASX files
- Query AAS structures and elements
- Edit submodels, properties, and references
- Validate against IDTA templates
- Auto-fix validation errors

## Prerequisites

- Claude Desktop application installed
- Node.js 20+ (for npm installation) OR Docker

## Configuration

Claude Desktop uses a JSON configuration file to connect to MCP servers.

### Configuration File Location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

## Installation Methods

### Method 1: npm (Recommended)

This method installs the server via npm and runs it on-demand.

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "npx",
      "args": ["@hadijannat/aas-mcp-server"],
      "env": {
        "MCP_PORT": "3001",
        "MCP_ALLOWED_PATHS": "/Users/yourname/Documents/aasx-files"
      }
    }
  }
}
```

**Advantages:**
- Automatic updates with each session
- No Docker required
- Simpler setup

### Method 2: Docker

This method runs the server in an isolated container.

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-p", "3001:3001",
        "-v", "/path/to/aasx-files:/data:ro",
        "-e", "MCP_ALLOWED_PATHS=/data",
        "-e", "NODE_ENV=production",
        "hadijannat/aas-mcp-server"
      ]
    }
  }
}
```

**Advantages:**
- Isolated environment
- Consistent behavior across systems
- Better for production/enterprise use

### Method 3: Global npm Install

For frequent users who want faster startup:

```bash
npm install -g @hadijannat/aas-mcp-server
```

Then configure:

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "aas-mcp-server",
      "env": {
        "MCP_ALLOWED_PATHS": "/Users/yourname/Documents/aasx-files"
      }
    }
  }
}
```

## Environment Variables

Configure these in the `env` section of your config:

| Variable | Description | Required |
|----------|-------------|----------|
| `MCP_PORT` | Server port (default: 3001) | No |
| `MCP_ALLOWED_PATHS` | Directories the server can access | **Yes** |
| `MCP_API_KEY` | API key for additional security | No |
| `NODE_ENV` | Set to `production` for stricter security | No |

### Security: MCP_ALLOWED_PATHS

**Important:** Always set `MCP_ALLOWED_PATHS` to limit which directories Claude can access:

```json
{
  "env": {
    "MCP_ALLOWED_PATHS": "/Users/yourname/Documents/aasx-files,/tmp/aasx-work"
  }
}
```

Multiple paths can be comma-separated. The server will refuse to read or write files outside these directories.

## Complete Configuration Examples

### macOS Example

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "npx",
      "args": ["@hadijannat/aas-mcp-server"],
      "env": {
        "MCP_ALLOWED_PATHS": "/Users/yourname/Documents/AASX,/Users/yourname/Desktop"
      }
    }
  }
}
```

### Windows Example

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "npx",
      "args": ["@hadijannat/aas-mcp-server"],
      "env": {
        "MCP_ALLOWED_PATHS": "C:\\Users\\yourname\\Documents\\AASX,D:\\Projects\\aasx-files"
      }
    }
  }
}
```

### Enterprise/Production Example

```json
{
  "mcpServers": {
    "aas-editor": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-p", "3001:3001",
        "-v", "/data/aasx:/data:ro",
        "-v", "/data/output:/output",
        "-e", "MCP_ALLOWED_PATHS=/data,/output",
        "-e", "MCP_API_KEY=your-secret-key",
        "-e", "NODE_ENV=production",
        "-e", "RATE_LIMIT_MAX=50",
        "hadijannat/aas-mcp-server:latest"
      ]
    }
  }
}
```

## Verifying the Connection

After updating your configuration:

1. Restart Claude Desktop
2. Open a new conversation
3. Ask Claude: "What MCP tools do you have available?"
4. Claude should list the AAS editing tools (document_load, query_list_submodels, etc.)

## Usage Examples

Once connected, you can ask Claude to:

```
"Load the AASX file at ~/Documents/my-asset.aasx"

"List all submodels in this AAS"

"Find all properties with semantic ID 'https://admin-shell.io/idta/...'"

"Add a new property 'SerialNumber' to the Nameplate submodel"

"Validate this AAS against the IDTA Digital Nameplate template"

"Fix the validation errors automatically"
```

## Troubleshooting

### Server Not Starting

Check that:
- Node.js 20+ is installed: `node --version`
- npm can find the package: `npm view @hadijannat/aas-mcp-server`
- Docker is running (if using Docker method)

### Permission Denied Errors

If Claude can't access files:
- Verify `MCP_ALLOWED_PATHS` includes the directory
- Check file permissions on your system
- For Docker, ensure volume mounts are correct

### Tools Not Appearing

- Verify the config file syntax is valid JSON
- Check Claude Desktop logs for connection errors
- Restart Claude Desktop after config changes

## Related Documentation

- [Package README](../../packages/mcp-server/README.md) - Full environment variables and API docs
- [Security Guide](../deployment/SECURITY.md) - Production security configuration
- [MCP Tools Reference](../architecture/MCP_TOOLS.md) - Complete tool documentation
