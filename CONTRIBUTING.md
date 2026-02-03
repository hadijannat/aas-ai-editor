# Contributing to AASX AI Editor

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Run `pnpm install` to install dependencies
4. Create a feature branch: `git checkout -b feature/your-feature`

## Development Workflow

### Setting Up

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start development servers
pnpm dev
```

### Making Changes

1. Write your code following the style guidelines below
2. Add tests for new functionality
3. Run `pnpm test` to ensure tests pass
4. Run `pnpm lint` to check code style
5. Run `pnpm typecheck` to verify types

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(core): add AASX export functionality`
- `fix(web-ui): resolve tree collapse issue`
- `docs(readme): update installation steps`

## Code Style

### TypeScript

- Use strict mode
- Prefer explicit types over `any`
- Use async/await over callbacks
- Follow ESLint configuration

### Python

- Follow PEP 8
- Use type hints
- Format with Black
- Sort imports with isort

### Vue Components

- Use Composition API with `<script setup>`
- One component per file
- Props and emits should be typed

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Fill out the PR template
4. Request review from maintainers
5. Address review feedback
6. Squash commits before merge

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @aas-editor/core test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Writing Tests

- Place tests in `tests/` directories
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

## Package Structure

When adding new functionality, place code in the appropriate package:

- **core** - AAS parsing, patches, templates, shared utilities
- **mcp-server** - MCP tools, AI integration, session management
- **web-ui** - Vue components, stores, UI services
- **validation-service** - Python validators, API endpoints

## Documentation

- Update relevant docs when changing behavior
- Add JSDoc comments for public APIs
- Include examples in documentation
- Keep ADRs updated for architectural changes

## Questions?

- Check existing issues and discussions
- Open a new issue for bugs or feature requests
- Use discussions for questions

Thank you for contributing!
