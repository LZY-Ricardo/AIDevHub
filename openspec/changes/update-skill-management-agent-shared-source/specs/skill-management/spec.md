## MODIFIED Requirements
### Requirement: Skill Inventory and Filtering
The system SHALL provide both external skill discovery and repository-backed managed skill inventory views with filtering and search across supported client, source, and scope dimensions.

#### Scenario: User filters discovered external skills
- **WHEN** the user applies client, source, scope, or text filters in the discovery view
- **THEN** the application narrows the discovery list based on skill name, description, identifier, and origin derived from external paths

#### Scenario: User filters shared agent skills
- **WHEN** the user selects the `Agent` source filter in the discovery view
- **THEN** the application shows only skills discovered from the user-level `.agents/skills` directory

#### Scenario: Shared agent source does not behave like a runtime client
- **WHEN** the user filters discovery by the `Agent` source
- **THEN** the application treats that selection as a source-level filter rather than a Claude Code or Codex client selection

## ADDED Requirements
### Requirement: Shared Agent Skill Discovery
The system SHALL discover shared read-only skills from the user-level `.agents/skills` directory and expose them in the external skill inventory.

#### Scenario: Shared skill directory contains a valid skill
- **WHEN** a directory under `.agents/skills` contains `SKILL.md`
- **THEN** the application includes that skill in discovery with metadata derived from the skill content and marks its source as shared agent

#### Scenario: Shared skill directory is not a valid skill
- **WHEN** a directory under `.agents/skills` does not contain `SKILL.md`
- **THEN** the application skips that directory during discovery

### Requirement: Shared Agent Skill Identity
The system SHALL assign discovered shared agent skills a stable identifier namespace distinct from Claude Code and Codex discovery identifiers.

#### Scenario: Shared agent skill is listed and later opened
- **WHEN** the application lists and later resolves a discovered shared agent skill
- **THEN** it uses an identifier in the shared-agent namespace, such as `agent_shared:<name>`, rather than reusing a Claude Code or Codex client-prefixed identifier

#### Scenario: Shared agent skill name overlaps with another source
- **WHEN** a shared agent skill and a Claude Code or Codex skill share the same short name
- **THEN** the application preserves separate discovery identities for each source so details and read-only behavior resolve deterministically

### Requirement: Shared Agent Skills Are Read-Only
The system SHALL present shared agent skills as inspectable but non-mutable in the first stage.

#### Scenario: User views a shared agent skill in discovery
- **WHEN** the discovery list renders a skill from `.agents/skills`
- **THEN** the application allows opening its details but does not allow toggle, import, deployment, or creation actions against that entry

#### Scenario: User opens details for a shared agent skill
- **WHEN** the user selects a discovered shared agent skill
- **THEN** the application shows the stored `SKILL.md` content and source metadata without exposing mutation controls
