# Contributing to Lucid Terminal

## Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd lucid-terminal

# Install dependencies
npm install

# Start development server
npm run dev
```

## Code Style

- **TypeScript**: Use strict typing, no `any` unless necessary
- **Formatting**: 2-space indentation, semicolons required
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Comments**: JSDoc for public APIs, inline for complex logic

## Architecture

### Core Systems
- `electron/core/workflow/` - 5-phase workflow orchestration
- `electron/core/routing/` - Tier-based model routing
- `electron/core/fixnet/` - Fix dictionary and quality grading
- `electron/core/executor/` - Script execution and validation

### Plugin System
- `electron/plugins/luciferAI/` - LuciferAI plugin implementation
- Plugins must implement `IPlugin` interface
- Use event-driven communication with core

## Testing

```bash
# Run type checking
npm run typecheck

# Build production
npm run build
```

## Pull Request Process

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes with clear commit messages
3. Run typecheck: `npm run typecheck`
4. Push and create PR with description
5. Include co-author line: `Co-Authored-By: Oz <oz-agent@warp.dev>`

## Commit Messages

Format: `<type>: <description>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code restructuring
- `test`: Testing additions
- `chore`: Maintenance

Example: `feat: add quality grading to FixNet router`

## Questions?

Open an issue or discussion on GitHub.
