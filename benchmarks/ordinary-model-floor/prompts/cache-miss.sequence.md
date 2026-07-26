# Cache-miss request sequence

Use the Archify skill in this repository to create a sequence diagram for a dashboard request. A browser calls an API, the API validates the JWT, then reads Redis. Redis returns a cache miss, so the API queries PostgreSQL for profile and metric data, stores the result back in Redis, emits a trace, and returns JSON for the browser to render.

Author a fresh typed JSON diagram specification and validate it with the `showcase` quality profile. Choose your own stable internal IDs and layout. Preserve message direction and distinguish calls, returns, security checks, and asynchronous trace emission; do not copy a checked-in example.
