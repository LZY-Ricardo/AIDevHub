# skill-repository-deployment Specification

## Purpose
TBD - created by archiving change add-skill-repository-deployment. Update Purpose after archive.
## Requirements
### Requirement: Internal Skill Repository
The system SHALL maintain an internal repository of managed skills where each skill is stored as a complete folder independent of external deployment targets.

#### Scenario: Repository stores a managed skill
- **WHEN** a skill is created internally or imported from an external location
- **THEN** the application stores a complete copy of that skill in the internal repository with stable metadata and content hashing

### Requirement: Multi-Target Skill Deployment
The system SHALL support deploying one repository skill to multiple Claude Code and Codex global or project-level targets at the same time.

#### Scenario: User deploys one skill to multiple targets
- **WHEN** the user deploys the same repository skill to more than one valid target
- **THEN** the application creates independent deployment records and copies the repository contents to each requested target

### Requirement: Deployment Removal Preserves Repository Content
The system SHALL allow users to remove an external deployment without deleting the repository copy of the skill.

#### Scenario: User undeploys a target
- **WHEN** the user removes a deployment from a target
- **THEN** the application removes the external target copy, marks the deployment as disabled, and keeps the repository content intact

### Requirement: Deployment Drift Detection
The system SHALL detect when a deployed external copy is missing, manually changed, or behind the repository version.

#### Scenario: External deployment was manually edited
- **WHEN** the application checks a deployment and the target content differs from the repository version recorded at deployment time
- **THEN** the deployment is marked as drifted and surfaced for user review

#### Scenario: Repository version advanced after deployment
- **WHEN** the repository content changes after a deployment was created and the target still matches the older repository hash
- **THEN** the deployment is marked as outdated rather than drifted

### Requirement: Sync-Back From Drifted Deployment
The system SHALL allow a user to sync a drifted external deployment back into the repository through preview-before-apply.

#### Scenario: User syncs back a drifted deployment
- **WHEN** the user confirms sync-back from a drifted deployment
- **THEN** the application previews the repository changes, updates the repository content, increments repository version metadata, and marks sibling deployments outdated

### Requirement: Redeploy Outdated Deployment
The system SHALL allow a user to redeploy the latest repository version to an outdated deployment through preview-before-apply.

#### Scenario: User redeploys an outdated target
- **WHEN** a deployment is marked as outdated and the user confirms redeploy
- **THEN** the application previews the repository-to-target replacement, refreshes the external target copy with the current repository contents, and returns the deployment to `deployed`

#### Scenario: Redeploy updates deployment tracking metadata
- **WHEN** redeploy completes successfully
- **THEN** the deployment updates its source hash and timestamp to match the current repository version without changing unrelated deployments

