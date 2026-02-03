# ADR-001: Monorepo Structure

## Status

Accepted

## Context

We need to organize code for multiple components:
- Core TypeScript library (AASX parsing, patch engine)
- MCP Server (Node.js)
- Web UI (Vue 3 SPA)
- Validation Service (Python)

Options considered:
1. **Polyrepo**: Separate repositories per component
2. **Monorepo with npm workspaces**: Single repo, npm native
3. **Monorepo with pnpm workspaces + Turborepo**: Single repo, optimized

## Decision

Use **pnpm workspaces + Turborepo** monorepo structure.

## Rationale

### Why Monorepo?

1. **Atomic Changes**: Cross-package changes in single commit
2. **Shared Tooling**: ESLint, Prettier, TypeScript configs shared
3. **Simplified Dependencies**: Core library used by MCP server and web-ui
4. **Unified CI/CD**: Single pipeline for all components
5. **Developer Experience**: One clone, one install, one IDE workspace

### Why pnpm?

1. **Disk Efficiency**: Content-addressable storage, symlinks
2. **Strict Dependencies**: No phantom dependencies
3. **Fast**: Parallel installation, efficient caching
4. **Workspace Protocol**: `workspace:*` for local packages

### Why Turborepo?

1. **Intelligent Caching**: Skip unchanged builds
2. **Parallel Execution**: Optimize task graph
3. **Remote Caching**: CI cache sharing (optional)
4. **Pipeline Configuration**: Declarative task dependencies

## Structure

```
aas-ai-editor/
├── packages/
│   ├── core/           # @aas-ai-editor/core
│   ├── mcp-server/     # @aas-ai-editor/mcp-server
│   ├── web-ui/         # @aas-ai-editor/web-ui
│   └── validation-service/  # Python service (outside pnpm)
├── docs/
├── templates/
├── docker/
├── package.json        # Root workspace config
├── pnpm-workspace.yaml
└── turbo.json
```

## Consequences

### Positive

- Single source of truth for all code
- Simplified dependency management
- Faster CI with caching
- Easier refactoring across packages

### Negative

- Larger repository size over time
- Need to learn pnpm/Turborepo specifics
- Python service partially outside workspace system
- Git history contains all components (can't isolate)

### Mitigations

- Use `.gitattributes` for binary handling
- Document pnpm/Turborepo commands clearly
- Python service uses its own pyproject.toml
- Consider sparse checkouts if repo grows large

## References

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Monorepo Explained](https://monorepo.tools/)
