# mcp-server-management

## Purpose
Define how the application lists, inspects, creates, edits, enables, disables, and previews managed MCP server configuration.

## Requirements

### Requirement: Unified MCP Server Inventory
The system SHALL present a single MCP server inventory across supported clients while preserving each server's client/source identity.

#### Scenario: User opens the server list
- **WHEN** the user navigates to the MCP server management view
- **THEN** the application lists managed servers from Claude Code and Codex with per-server metadata and enabled state

### Requirement: Server Detail Inspection
The system SHALL provide a detail view for a managed server, including source metadata and controlled secret reveal behavior.

#### Scenario: User opens server details
- **WHEN** the user selects a server from the list
- **THEN** the application shows server fields, source information, notes, and any revealable sensitive values only on explicit request

### Requirement: Preview Before Server Mutation
The system SHALL require a write preview before enabling, disabling, creating, or editing a server.

#### Scenario: User edits an existing server
- **WHEN** the user submits a server edit
- **THEN** the application shows a diff preview before any managed client configuration file is written

### Requirement: Structured and Advanced Server Editing
The system SHALL support both structured server fields and advanced JSON fragment editing where applicable.

#### Scenario: User modifies advanced configuration
- **WHEN** a server requires configuration beyond the structured form
- **THEN** the edit flow allows the user to adjust the advanced JSON fragment and still returns to the same preview-before-apply workflow
