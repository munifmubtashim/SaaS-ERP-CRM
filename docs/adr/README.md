# Architecture decision records

One page per decision: context, decision, consequences. Copy `0000-template.md`, take the next number.
Agreed plans for ledger, stock, permissions, tenancy and migration work are saved here too (CLAUDE.md lifecycle).

| #                                         | Title                                                                         | Status          |
| ----------------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| [0001](0001-spec-vs-roadmap-conflicts.md) | Differences between the Acceptance Specification and the Roadmap              | Partly accepted |
| [0002](0002-phase-0-tooling-choices.md)   | Phase 0 tooling choices                                                       | Proposed        |
| [0003](0003-repository-layout.md)         | Repository layout replaces roadmap section 8.5; worker and templates deferred | Accepted        |
| [0004](0004-class-based-oop-solid-dry.md) | Class-based OOP, SOLID and DRY across the codebase                            | Accepted        |
| [0005](0005-tenant-transaction-scope.md)  | Every tenant request runs in one database transaction                         | Proposed        |
| [0006](0006-party-module-plan.md)         | Party module plan (customers and suppliers)                                   | Proposed        |
| [0007](0007-active-business.md)           | The active business and branch come from each request                         | Proposed        |
