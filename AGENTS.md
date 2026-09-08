# Agent Instructions

## Version Control

- Use `but` (GitButler CLI) for version-control operations in this repository.
- Use `but` for all version-control write operations; read-only `git` inspection is allowed.
- Do not access GitHub URLs directly. Use the `gh` CLI for GitHub operations.
- When committing, use English Conventional Commit messages and include a clear description of Why and What.

## Releases

- Update `package.json` to the target version, then run `npm_package_version=<version> node version-bump.mjs` to synchronize `manifest.json` and `versions.json`. Invoke the script directly because the `npm version` lifecycle also runs `git add`, which conflicts with the GitButler write-operation rule.
