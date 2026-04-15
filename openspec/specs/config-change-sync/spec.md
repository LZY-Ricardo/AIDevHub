# config-change-sync

## Purpose
Define detection and handling of external configuration changes and synchronization between the internal registry and managed client files.

## Requirements

### Requirement: External Change Detection
The system SHALL detect external changes to managed configuration files and skill directories using persisted snapshots.

#### Scenario: Application starts after external edits
- **WHEN** managed Claude or Codex configuration content changed outside the app since the last accepted baseline
- **THEN** the application detects the difference and surfaces update items to the user

### Requirement: Change Review and Ignore
The system SHALL allow users to review external configuration changes and ignore them by establishing a new baseline.

#### Scenario: User ignores detected changes
- **WHEN** the user chooses to ignore a detected external change
- **THEN** the current external content becomes the new comparison baseline without rewriting the external file

### Requirement: Accept External MCP Updates Into Registry
The system SHALL support importing accepted external MCP changes into the internal registry.

#### Scenario: User accepts external MCP changes
- **WHEN** the user chooses to accept detected MCP updates
- **THEN** the relevant external configuration slice is merged into the internal registry while preserving the external source file as-is

### Requirement: Registry-to-External Diff and Sync
The system SHALL support comparing the internal MCP registry to external configuration files and syncing registry content outward through preview-before-apply.

#### Scenario: User previews registry sync to external files
- **WHEN** the user requests a registry-to-external sync preview
- **THEN** the application computes the diff and presents it before any external file write occurs
