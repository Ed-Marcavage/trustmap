# Agent tool-call workflow

Use the Archify skill in this repository to create a workflow diagram for an AI agent tool call. A user request reaches a chat surface and planner. A router decides whether human approval is required. Approval permits tool execution against an external provider; denial enters a blocked path that may retry. The final result returns to the user, while tool results and context are recorded for tracing.

Author a fresh typed JSON diagram specification. Target the `showcase` quality profile; the external harness will validate the frozen candidate. Choose your own stable internal IDs and layout. Make the approval decision, denied route, execution route, and external call easy to read.

Write the final candidate to exactly `benchmark-candidate.json` in the repository root. Do not edit any other file. The candidate file, not the prose response, is the attempt 1 artifact. Do not copy a checked-in example. Do not claim that validation passed.
