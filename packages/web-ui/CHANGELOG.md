# @aas-ai-editor/web-ui

## 0.2.0

### Minor Changes

- Add API key configuration in Settings UI
  - Users can now configure their Anthropic API key directly in the Settings page
  - API key is stored in localStorage and sent via X-Anthropic-Api-Key header
  - MCP server accepts API key from request headers, falling back to environment variable
  - Added .env.example documenting server configuration options

## 0.1.3

### Patch Changes

- Updated dependencies [61e0f0e]
  - @aas-ai-editor/core@0.2.2

## 0.1.2

### Patch Changes

- Updated dependencies [b810ae2]
  - @aas-ai-editor/core@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [4479836]
  - @aas-ai-editor/core@0.2.0
