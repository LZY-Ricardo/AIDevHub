## Context
Startup config detection currently reads managed config files and recursively snapshots skill directories during initial app load. The detection itself is valuable, but running it on the startup path can stall the desktop shell long enough for the OS to mark the window as unresponsive.

## Goals / Non-Goals
- Goals:
- Make startup detection non-blocking from the user's point of view.
- Preserve the existing detection semantics and follow-up user flows.
- Keep the implementation local to the startup detection path without redesigning the whole config sync system.

- Non-Goals:
- Do not change how diffs are computed or what counts as an external change.
- Do not redesign dashboard loading or unrelated data-fetching flows.
- Do not introduce cloud services, background daemons, or persistent worker processes.

## Decisions
- Decision: startup config detection will run through a background execution path instead of a UI-blocking command path.
- Decision: the UI may render before config detection completes, but any detected updates must still be surfaced once the background work finishes.
- Decision: the spec will describe the behavioral contract, not bind the implementation to a specific threading primitive.

## Risks / Trade-offs
- Delaying detection completion means config update dialogs may appear shortly after the first screen renders instead of before the app feels ready.
- Moving work to a background path requires care so command results, errors, and cancellation do not create stale UI state.

## Migration Plan
1. Identify the startup path that triggers config detection.
2. Move heavy detection work to a non-blocking backend execution path.
3. Update the frontend startup flow so the app remains interactive while detection finishes.
4. Validate that detected updates still appear correctly after completion.

## Open Questions
- Should startup config detection expose an explicit loading state in the UI, or remain silent until updates are found?
