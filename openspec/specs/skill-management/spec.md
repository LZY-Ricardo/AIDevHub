# skill-management

## Purpose
Define browsing and local management of Codex skills and Claude commands/skills that are exposed in the app.

## Requirements

### Requirement: Skill Inventory and Filtering
The system SHALL provide a skill inventory with filtering and search across supported client and scope dimensions.

#### Scenario: User filters the skill list
- **WHEN** the user applies client, scope, or text filters
- **THEN** the application narrows the list based on skill name, description, or skill identifier

### Requirement: Skill Detail Inspection
The system SHALL provide a detail view for managed skills and commands.

#### Scenario: User opens skill details
- **WHEN** the user selects a skill or command
- **THEN** the application shows metadata sufficient to understand source, scope, and current enablement state

### Requirement: Skill Creation and Toggle Preview
The system SHALL support creating and enabling/disabling managed skills through preview-before-apply workflows.

#### Scenario: User toggles a skill
- **WHEN** the user enables or disables a skill
- **THEN** the application previews the resulting filesystem change before applying it

#### Scenario: User creates a new skill
- **WHEN** the user completes the create skill flow
- **THEN** the application previews the generated file changes before writing them
