## ADDED Requirements

### Requirement: Redeploy Outdated Deployment
The system SHALL allow a user to redeploy the latest repository version to an outdated deployment through preview-before-apply.

#### Scenario: User redeploys an outdated target
- **WHEN** a deployment is marked as outdated and the user confirms redeploy
- **THEN** the application previews the repository-to-target replacement, refreshes the external target copy with the current repository contents, and returns the deployment to `deployed`

#### Scenario: Redeploy updates deployment tracking metadata
- **WHEN** redeploy completes successfully
- **THEN** the deployment updates its source hash and timestamp to match the current repository version without changing unrelated deployments
