# @aas-ai-editor/mcp-server

## 0.3.4

### Patch Changes

- fix: improve format detection, rate limiting proxy support, and import paths
  - Add ZIP magic bytes detection for AASX format verification
  - Remove hardcoded xForwardedForHeader:false to respect TRUST_PROXY setting
  - Add TRUST_PROXY environment variable documentation
  - Use dynamic submodel lookup in import_pdf when targetSubmodel is specified

## 0.3.1

### Patch Changes

- Updated dependencies
  - @aas-ai-editor/core@0.2.3

## 0.3.0

### Minor Changes

- Add API key configuration in Settings UI
  - Users can now configure their Anthropic API key directly in the Settings page
  - API key is stored in localStorage and sent via X-Anthropic-Api-Key header
  - MCP server accepts API key from request headers, falling back to environment variable
  - Added .env.example documenting server configuration options

## 0.2.2

### Patch Changes

- 61e0f0e: Fix repository URLs in package.json to point to correct GitHub repo (hadijannat/aas-ai-editor)
- Updated dependencies [61e0f0e]
  - @aas-ai-editor/core@0.2.2

## 0.2.1

### Patch Changes

- b810ae2: Add README documentation for npm packages
  - Core package now includes comprehensive API documentation on npmjs.com
  - MCP server README enhanced with Quick Start, Claude Code integration, and troubleshooting

- Updated dependencies [b810ae2]
  - @aas-ai-editor/core@0.2.1

## 0.2.0

### Minor Changes

- 4479836: Add npm and Docker Hub distribution support
  - Add CLI entry point for `npx @aas-ai-editor/mcp-server`
  - Configure packages for public npm publishing
  - Add Docker Hub multi-arch builds (amd64, arm64)
  - Add Claude Desktop integration documentation
  - Fix ESM/CJS compatibility for Node.js

### Patch Changes

- Updated dependencies [4479836]
  - @aas-ai-editor/core@0.2.0
