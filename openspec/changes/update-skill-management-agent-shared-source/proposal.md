# Change: Add Agent Shared Skill Discovery Source

## Why
The current skill discovery view only scans Claude Code and Codex skill locations. It does not surface shared skills stored under the user-level `.agents/skills` directory, even though those skills may be injected into multiple local agent runtimes by default. This creates an incomplete inventory and makes it harder for users to inspect what is effectively active on their machine.

## What Changes
- Extend external skill discovery to scan the user-level `.agents/skills` directory as an additional read-only source.
- Surface these shared skills in the Skill management discovery list with a dedicated `Agent` source filter option rather than treating them as a third runtime client.
- Mark shared agent skills as read-only in the UI so they can be inspected but not toggled, imported, deployed, created, or otherwise mutated in the first stage.
- Distinguish skill source/origin metadata in discovery records so the UI can differentiate Claude commands, Claude skills, Codex skills, and shared agent skills.
- Assign shared agent skills a dedicated stable identifier namespace such as `agent_shared:<name>` so discovery, detail lookup, and read-only handling do not overload the existing Claude/Codex client identity model.

## Impact
- Affected specs: `skill-management`
- Affected code:
  - `app-v2/src/pages/SkillsPage.tsx`
  - `app-v2/src/lib/types.ts`
  - `app-v2/src/lib/format.ts`
  - `app-v2/src-tauri/src/lib.rs`
  - `app-v2/src-tauri/crates/aidevhub-core/src/model.rs`
  - `app-v2/src-tauri/crates/aidevhub-core/src/ops.rs`
  - relevant tests under `app-v2/tests/`

## Non-Goals
- No support in this change for enabling/disabling `.agents/skills` entries
- No repository import or deployment support for shared agent skills
- No new deployment target type for `.agents/skills`
