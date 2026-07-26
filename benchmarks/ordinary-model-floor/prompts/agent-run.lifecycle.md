# Agent-run lifecycle

Use the Archify skill in this repository to create a lifecycle diagram for an agent run. Show the main ordered phases from queued through planning, execution, review, and completion. Execution may pause for human approval or fail recoverably. Review may block while waiting for input. A blocked run may expire, and a waiting approval may be cancelled by the user. Terminal exits must remain distinct from active and waiting states.

Author a fresh typed JSON diagram specification and validate it with the `showcase` quality profile. Choose your own stable internal IDs and layout. Keep active work, interruptions, recovery, and terminal outcomes legible.

Write the final candidate to exactly `benchmark-candidate.json` in the repository root. Do not edit any other file. Run the real Archify CLI against that file with the `showcase` quality profile; you may diagnose and correct your own candidate during this single agent invocation. The candidate file, not the prose response, is the attempt 1 artifact. Do not copy a checked-in example.
