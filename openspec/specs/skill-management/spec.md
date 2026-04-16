# skill-management

## Purpose
Define browsing and local management of Codex skills and Claude commands/skills that are exposed in the app.
## Requirements
### Requirement: Skill Inventory and Filtering
The system SHALL provide both external skill discovery and repository-backed managed skill inventory views with filtering and search across supported client and scope dimensions.

#### Scenario: User filters discovered external skills
- **WHEN** the user applies client, scope, or text filters in the discovery view
- **THEN** the application narrows the discovery list based on skill name, description, or identifier derived from external paths

#### Scenario: User filters managed repository skills
- **WHEN** the user applies text or status filters in the managed repository view
- **THEN** the application narrows the list based on repository metadata and deployment state summaries

### Requirement: Skill Detail Inspection
The system SHALL provide a detail view for managed skills that shows repository metadata, repository contents, and deployment state across all targets.

#### Scenario: User opens a managed skill
- **WHEN** the user selects a managed repository skill
- **THEN** the application shows repository metadata, stored contents, and all known deployments with per-target status

### Requirement: Skill Creation and Toggle Preview
The system SHALL support repository-backed skill creation and deployment removal through preview-before-apply workflows.

#### Scenario: User creates a new managed skill
- **WHEN** the user completes the create skill flow
- **THEN** the application previews the repository files and metadata that will be created before writing them

#### Scenario: User disables a deployed skill target
- **WHEN** the user disables a skill deployment target
- **THEN** the application previews removal of the external deployed copy while preserving the repository copy

### Requirement: Repository Import From External Discovery
The system SHALL allow users to import discovered external skills into the internal repository through preview-before-apply.

#### Scenario: User imports a discovered global skill
- **WHEN** the user selects a discovered external skill and chooses import
- **THEN** the application previews repository folder creation, manifest creation, and index updates before copying content into the internal repository

