# backup-rollback

## Purpose
Define safety mechanisms for configuration mutations, including automatic backup creation and rollback.

## Requirements

### Requirement: Automatic Backup Before Managed Writes
The system SHALL create a backup of affected user configuration files before applying a managed write operation.

#### Scenario: User applies a configuration-changing action
- **WHEN** the user confirms an action that writes a managed client configuration file
- **THEN** the application creates a backup before the write is committed

### Requirement: Backup History Visibility
The system SHALL provide a backup history view with enough metadata to understand each backup's origin.

#### Scenario: User reviews backup history
- **WHEN** the user opens backups
- **THEN** the application lists backup entries with operation type, summary text, and affected server identifiers when available

### Requirement: Rollback Preview and Apply
The system SHALL support rollback through preview-before-apply semantics.

#### Scenario: User rolls back a backup
- **WHEN** the user selects a backup for rollback
- **THEN** the application shows the rollback diff preview before restoring the saved configuration state
