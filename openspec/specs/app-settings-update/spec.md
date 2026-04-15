# app-settings-update

## Purpose
Define user-configurable application settings and built-in update behavior.

## Requirements

### Requirement: Settings Persistence
The system SHALL persist application settings in app-local data and reload them on subsequent launches.

#### Scenario: User changes an application setting
- **WHEN** the user updates a setting such as MCP diff check mode
- **THEN** the application saves the preference and uses it on future sessions

### Requirement: Config Diff Presentation Preference
The system SHALL allow the user to choose how MCP external diff checks are presented.

#### Scenario: User prefers summary mode
- **WHEN** the diff check mode is set to `summary_only`
- **THEN** follow-up external diff flows present the summary-oriented view rather than forcing the full diff dialog

### Requirement: Application Update Flow
The system SHALL support checking for, downloading, and applying desktop app updates through the configured updater integration.

#### Scenario: Update is available
- **WHEN** the updater reports a newer application version
- **THEN** the application lets the user inspect progress, download the update, and restart into the installed version
