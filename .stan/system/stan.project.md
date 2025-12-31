# Project Prompt (stan.project.md)

When updated: 2025-12-31T00:00:00Z

This file is for repo-specific assistant behavior and implementation policies. Durable functional and build requirements live in `.stan/system/stan.requirements.md`.

Project policies:

- Prefer get-dotenv’s services-first architecture:
  - thin CLI/plugin adapters
  - core logic in services behind ports (testable without AWS/FS/process)
- Use `radash` instead of `lodash`.
- Optional AWS X-Ray support must be guarded:
  - do not import or enable X-Ray capture unless `AWS_XRAY_DAEMON_ADDRESS` is set (X-Ray SDK will throw otherwise).

If project requirements change, update `.stan/system/stan.requirements.md` and `.stan/system/stan.todo.md` together.
