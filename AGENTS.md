<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Repository Guidelines

## Project Structure & Module Organization
The product code lives in `app-v2/`, a Tauri v2 desktop app with a React + TypeScript frontend and a Rust backend. Use `app-v2/src/` for UI pages, shared components, and browser-side helpers; `app-v2/src-tauri/src/` for Tauri entrypoints; and `app-v2/src-tauri/crates/aidevhub-core/` for core Rust logic such as config sync, registry updates, backups, and health checks. Keep long-form specs in `docs/`, design references in `design-system/`, and CI templates in `.github/`.

## Build, Test, and Development Commands
Run all app commands from `app-v2/`.

- `pnpm install`: install frontend dependencies.
- `pnpm dev`: run the Vite frontend only.
- `pnpm build`: type-check and build the frontend bundle.
- `pnpm tauri dev`: start the desktop app locally.
- `pnpm tauri build`: build desktop packages.
- `node --test tests/*.test.mjs`: run the JavaScript integration/unit tests.
- `cargo test -p aidevhub-core`: run Rust core tests from `app-v2/src-tauri/`.

## Coding Style & Naming Conventions
Follow the existing style before changing it. TypeScript uses 2-space indentation, double quotes, trailing commas, and PascalCase for React components such as `ServersPage.tsx` and `TopNavShell.tsx`. Keep utility modules in `src/lib/` with descriptive camelCase names. Rust modules use snake_case filenames such as `config_sync.rs` and `health_check.rs`; format Rust changes with `cargo fmt`.

## Testing Guidelines
Add or update tests for any behavioral change in UI state, config flow, registry sync, backup logic, or Rust core behavior. Place frontend-facing tests in `app-v2/tests/` with `*.test.mjs` names matching the feature, for example `servers-registry-sync.test.mjs`. Keep Rust tests close to the core crate in `app-v2/src-tauri/crates/aidevhub-core/tests/`. Prefer focused assertions over broad snapshot-style checks.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits, usually `type(scope): summary`, for example `feat(mcp-ui): ...`, `fix(updater): ...`, or `docs: ...`. Keep scopes specific to the touched area. PRs should follow `.github/PULL_REQUEST_TEMPLATE.md`: include a short summary, a change list, a local test plan, target OS coverage, and screenshots for UI changes.

## Security & Config Notes
Do not commit real user config, secrets, or local backup data. Changes touching managed files such as `~/.claude.json`, `~/.codex/config.toml`, or updater behavior should document rollback impact and be validated in `pnpm tauri dev` before review.

Code Review Policy
● When a code review scenario is present, invoke the code-reviewer role before commit or before declaring substantial code work complete.
● Treat these as review scenarios by default:
  ○ explicit review requests
  ○ any git commit
  ○ substantial multi-file code changes
  ○ edits to risky paths such as auth, payments, data writes, public APIs, shared state, build config, or shared UI primitives
  ○ changes with unclear or missing tests
● Skip automatic review only for:
  ○ pure explanation with no code changes
  ○ read-only investigation
  ○ trivial non-behavioral edits
  ○ explicit user instruction to skip review
● The code-reviewer role is review-only and should not silently implement fixes during review.
● Review output should prioritize concrete findings with file references and end in one verdict:
  ○ PASS
  ○ FLAG
  ○ BLOCK
● If verdict is BLOCK, do not commit.
● If verdict is FLAG, surface the risk explicitly before commit.
