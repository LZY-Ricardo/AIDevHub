## ADDED Requirements

### Requirement: Non-Blocking Startup Change Detection
The system SHALL keep the application interactive while startup-time external configuration detection is still in progress.

#### Scenario: Startup detection scans large skill directories
- **WHEN** the application starts and external change detection needs to scan large managed skill directories or config files
- **THEN** the main application UI remains responsive while the detection work continues in the background

#### Scenario: Startup detection finishes after initial render
- **WHEN** background startup detection completes and external changes are found
- **THEN** the application surfaces the detected update items with the same review and follow-up behavior as a normal config check
