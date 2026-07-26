# Web runtime architecture

Use the Archify skill in this repository to create an architecture diagram for a production web application. Browser users enter through a CDN over HTTPS, then traffic reaches a load balancer and an application API. The API verifies identity with an auth provider, reads through a Redis cache, queries a PostgreSQL primary database, and enqueues background work for a worker. Static assets are served from object storage.

Author a fresh typed JSON diagram specification. Target the `showcase` quality profile; the external harness will validate the frozen candidate. Choose your own stable internal IDs and layout. Preserve the system roles and labelled technical relationships.

Write the final candidate to exactly `benchmark-candidate.json` in the repository root. Do not edit any other file. The candidate file, not the prose response, is the attempt 1 artifact. Do not copy a checked-in example. Do not claim that validation passed.
