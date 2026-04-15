# profile-management

## Purpose
Define creation and application of reusable MCP activation sets across supported clients.

## Requirements

### Requirement: Profile CRUD
The system SHALL allow users to create, update, list, and delete profiles that describe desired server activation sets.

#### Scenario: User creates a profile
- **WHEN** the user saves a new profile with a target set of servers
- **THEN** the profile is persisted in application-local data for later reuse

### Requirement: Profile Preview and Apply
The system SHALL provide preview and apply flows for profile application.

#### Scenario: User applies a profile
- **WHEN** the user selects a profile to apply
- **THEN** the application previews the resulting configuration changes before writing them

### Requirement: Exact Activation Convergence
The system SHALL apply profiles using a convergent model where the enabled set exactly matches the profile targets for the selected client.

#### Scenario: Current enabled set differs from profile targets
- **WHEN** a profile is applied
- **THEN** servers included in the profile become enabled and servers outside the profile become disabled for that client
