# Obsidian Automatic Linker Development Guide

## Commands
- Build: `npm run build`
- Development: `npm run dev`
- Test all: `npm run test`
- Watch tests: `npm run test:watch`
- Run single test: `npx vitest run src/path/to/test.ts`
- Run tests by pattern: `npx vitest run -t "test description"`
- TypeScript check: `npm run tsc:watch`

## Code Style Guidelines
- TypeScript with strict null checks and explicit types
- Import style: Direct imports with named exports
- Naming: camelCase for variables/functions, PascalCase for interfaces
- Error handling: Try/catch with console.error for errors
- Component organization: Feature-based folders with __tests__ subdirectories
- Testing: Describe/it blocks with clear test descriptions
- Async/await for asynchronous operations
- Modular architecture following Obsidian plugin patterns

## Architecture: Settings Flow
Settings flow through 3 layers. When adding a new setting, all 3 must be updated:
1. `src/settings/settings-info.ts` — `AutomaticLinkerSettings` type + `DEFAULT_SETTINGS`
2. `src/replace-links/replace-links.ts` — `ReplaceLinksSettings` interface
3. `src/main.ts` — Two call sites that bridge (1) to (2): `modifyLinks()` and the selection command

When adding a field to an interface, always grep for all sites that construct objects of that type to ensure the new field is passed through.