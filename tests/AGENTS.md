# Tests

`integration/` holds tests that use several packages or real services.
`integration/support/` owns disposable databases, object stores, and test servers.
Unit tests sit beside their source in apps, packages, and tools.

- Use the real PostgreSQL and MinIO services from `compose.test.yaml`.
- Create isolated data for each test. Close servers and remove test data after use.
- Use generated API operations to drive a server. Keep assertions about observable behavior.
- Do not add fixed waits, skip failures, or weaken assertions.
- Use browser tools against the local Docker deployment for interaction and screenshots.
