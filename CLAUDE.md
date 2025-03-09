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