# @aas-ai-editor/core

## 0.2.3

### Patch Changes

- Improve XML parsing and add AI sidebar
  - Add namespace-aware XML property helpers for better AAS v3 XML support
  - Support additional XML variations (aas:aasenv, identification fields)
  - Add AI Chat Panel sidebar to main application layout

## 0.2.2

### Patch Changes

- 61e0f0e: Fix repository URLs in package.json to point to correct GitHub repo (hadijannat/aas-ai-editor)

## 0.2.1

### Patch Changes

- b810ae2: Add README documentation for npm packages
  - Core package now includes comprehensive API documentation on npmjs.com
  - MCP server README enhanced with Quick Start, Claude Code integration, and troubleshooting

## 0.2.0

### Minor Changes

- 4479836: Add npm and Docker Hub distribution support
  - Add CLI entry point for `npx @aas-ai-editor/mcp-server`
  - Configure packages for public npm publishing
  - Add Docker Hub multi-arch builds (amd64, arm64)
  - Add Claude Desktop integration documentation
  - Fix ESM/CJS compatibility for Node.js
