## ADDED Requirements

### Requirement: Automated Release Workflow
The system SHALL provide a GitHub Actions workflow that can build and publish a desktop release without requiring manual asset upload steps.

#### Scenario: Maintainer triggers a release
- **WHEN** a maintainer starts the release workflow with a target version
- **THEN** the workflow builds the desktop application, signs the updater artifacts, and prepares the release assets for publication

### Requirement: Updater Metadata Generation
The system SHALL generate and publish a `latest.json` file that matches the configured updater endpoint contract.

#### Scenario: Workflow publishes a release
- **WHEN** the release workflow completes successfully
- **THEN** the workflow uploads a `latest.json` asset whose version, URL, and signature match the generated updater-compatible bundle

### Requirement: Release Asset Completeness Checks
The system SHALL fail the automated release workflow if required release artifacts are missing.

#### Scenario: Updater artifact generation is incomplete
- **WHEN** the workflow cannot find a required installer, signature, updater zip, or `latest.json`
- **THEN** the workflow stops before publishing the release and reports the missing artifact
