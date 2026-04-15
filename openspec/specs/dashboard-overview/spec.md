# dashboard-overview

## Purpose
Define the product behavior for the dashboard surface that summarizes application state and recent activity.

## Requirements

### Requirement: Dashboard Summary Metrics
The system SHALL present a dashboard that summarizes MCP server and skill counts using live application data.

#### Scenario: Dashboard loads summary counts
- **WHEN** the dashboard view is opened
- **THEN** the system shows total MCP count, active MCP count, total skill count, and installed user skill count

### Requirement: Recent Activity Feed
The system SHALL display recent activity derived from actual backup and write history rather than static placeholder content.

#### Scenario: Recent activity is available
- **WHEN** recent backup or write operations exist
- **THEN** the dashboard shows activity items with operation type, affected server context, and relative time

### Requirement: Dashboard Quick Actions
The system SHALL provide quick actions for common entry flows from the dashboard.

#### Scenario: User starts a common action
- **WHEN** the user activates a dashboard quick action such as adding an MCP server or installing a skill
- **THEN** the application navigates to the relevant workflow without requiring manual route selection
