# Agent tool-call workflow

Use the Archify skill in this repository to create a workflow diagram for an AI agent tool call. A user request reaches a chat surface and planner. A router decides whether human approval is required. Approval permits tool execution against an external provider; denial enters a blocked path that may retry. The final result returns to the user, while tool results and context are recorded for tracing.

Author a fresh typed JSON diagram specification and validate it with the `showcase` quality profile. Choose your own stable internal IDs and layout. Make the approval decision, denied route, execution route, and external call easy to read; do not copy a checked-in example.
