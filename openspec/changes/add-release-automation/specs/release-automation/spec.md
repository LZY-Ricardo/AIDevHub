## ADDED Requirements

### Requirement: Automated Release Workflow
The system SHALL provide a GitHub Actions workflow that can build and publish a desktop release without requiring manual asset upload steps.

#### Scenario: Maintainer triggers a release
- **WHEN** a maintainer starts the release workflow with a target version
- **THEN** the workflow builds the desktop application, signs the updater artifacts, and prepares the release assets for publication

#### Scenario: Workflow is triggered from a non-main ref
- **WHEN** a maintainer triggers the release workflow from any branch other than `main`
- **THEN** the workflow fails before starting the release process

#### Scenario: Version files do not match the requested version
- **WHEN** the workflow input version differs from tracked release version files
- **THEN** the workflow fails before building release artifacts

#### Scenario: Same-version tag or release already exists
- **WHEN** the workflow detects an existing `app-vX.Y.Z` tag or release
- **THEN** it fails before publishing new assets, requiring manual cleanup or operator review

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
