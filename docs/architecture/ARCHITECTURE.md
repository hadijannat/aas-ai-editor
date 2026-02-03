# AAS AI Editor - Architecture Overview

## System Context

The AAS AI Editor is a browser-based application for editing Asset Administration Shell (AAS) packages with AI assistance. It provides a rich editing experience while ensuring all modifications comply with AAS metamodel constraints and IDTA submodel templates.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User's Browser                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         Vue 3 SPA (web-ui)                        │  │
│  │                                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │   Tree   │  │   Form   │  │   Diff   │  │     Approval     │  │  │
│  │  │Navigator │  │  Editor  │  │  Viewer  │  │      Panel       │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │  │
│  │                              │                                    │  │
│  │                    ┌─────────┴─────────┐                         │  │
│  │                    │    MCP Client     │                         │  │
│  │                    └───────────────────┘                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MCP Streamable HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MCP Server (Node.js)                             │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │   Tools    │  │ Resources  │  │  Prompts   │  │ AI Client  │        │
│  │            │  │            │  │            │  │  (Claude)  │        │
│  │ • Document │  │ • doc://   │  │ • create   │  │            │        │
│  │ • Query    │  │   state    │  │ • edit     │  │ • Cache    │        │
│  │ • Edit     │  │ • template │  │ • validate │  │ • Context  │        │
│  │ • Validate │  │   ://      │  │            │  │ • Retry    │        │
│  │ • Import   │  │            │  │            │  │            │        │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘        │
│                                                                          │
│                    ┌────────────────────────────┐                       │
│                    │       Core Library          │                       │
│                    │   • AASX Parser/Writer     │                       │
│                    │   • Patch Engine           │                       │
│                    │   • Diff Calculator        │                       │
│                    │   • Fast Validation        │                       │
│                    │   • Template Registry      │                       │
│                    └────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP REST
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Validation Service (Python)                           │
│                                                                          │
│                    ┌────────────────────────────┐                       │
│                    │     aas-test-engines       │                       │
│                    │   (Deep Validation)        │                       │
│                    └────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Package Structure

### @aas-ai-editor/core

The core library provides fundamental AAS manipulation capabilities:

- **AASX Parsing**: Read/write AASX packages (OPC-based ZIP with relationships)
- **Patch Engine**: JSON Patch (RFC 6902) operations for all modifications
- **Diff Engine**: AAS-aware diff using semanticId/idShort matching
- **Fast Validation**: TypeScript-based structural validation
- **Template Registry**: IDTA submodel template loading and constraint compilation

### @aas-ai-editor/mcp-server

MCP server implementing the Claude integration:

- **Transport**: Streamable HTTP with session management
- **Tools**: Document, Query, Edit, Validate, Import operations
- **Resources**: Document state, template definitions
- **Prompts**: Reusable prompt templates for common operations
- **AI Client**: Claude API integration with caching and context management

### @aas-ai-editor/web-ui

Vue 3 single-page application:

- **Tree Navigator**: Hierarchical view of AAS structure
- **Form Editor**: Dynamic forms based on element type
- **Diff Viewer**: Side-by-side comparison with semantic highlighting
- **Approval Panel**: Review and approve/reject AI suggestions
- **JSON Inspector**: Raw JSON view with syntax highlighting

### @aas-ai-editor/validation-service

Python FastAPI service wrapping aas-test-engines:

- **Deep Validation**: Full semantic validation
- **Batch Processing**: Validate multiple elements efficiently
- **Error Mapping**: Map validation errors to patch suggestions

## Data Flow

See [DATA_FLOW.md](./DATA_FLOW.md) for detailed data flow diagrams.

## Security Model

See [SECURITY.md](./SECURITY.md) for security considerations.

## Key Design Decisions

All architectural decisions are documented as ADRs in `/docs/adr/`:

- [ADR-001: Monorepo Structure](../adr/001-monorepo.md)
- [ADR-002: MCP Streamable HTTP Transport](../adr/002-mcp-streamable-http.md)
- [ADR-003: AASX Patch Model](../adr/003-aasx-patch-model.md)
- [ADR-004: Validation Loop](../adr/004-validation-loop.md)

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, TypeScript, Vite, Pinia |
| MCP Server | Node.js, TypeScript, Express |
| Validation | Python 3.11+, FastAPI, aas-test-engines |
| AI | Claude API (claude-sonnet-4-20250514) |
| Build | pnpm, Turborepo |
| Testing | Vitest, Playwright, pytest |
| Containers | Docker, docker-compose |
