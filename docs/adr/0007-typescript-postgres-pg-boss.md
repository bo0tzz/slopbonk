# 7. TypeScript on Node, Postgres, pg-boss and @immich/ui, in a single container

- Status: accepted
- Date: 2026-10-02

## Context

- The GitHub App needs installation tokens, webhook signature checks, GraphQL with pagination, and rate-limit handling. Octokit provides all of these for Node.
- [`@immich/ui`](https://www.npmjs.com/package/@immich/ui) is a Svelte 5 component library for SvelteKit.
- Self-hosting should need as little as possible.
- ADR-0002's components need a job queue with delayed jobs (scheduled re-checks), deduplication (fetch requests for the same account), retries (the outbox), and recurring jobs (retention). Running a separate queue service or a separate worker deployment for this would add operational weight for no real gain at this scale.
- Besides secrets and connection details, there are operational settings: the re-check schedule, the history horizon and backfill window, retention periods, session lifetime, rate-limit headroom. Rule weights are versioned code (ADR-0003), and tenant settings live in the database (ADR-0004).

## Decision

- **Language and runtime**: TypeScript on Node 26, which becomes the Active LTS line on 2026-10-28.
- **Database**: Postgres, accessed with Kysely, with migrations in the repository.
- **GitHub**: Octokit (`@octokit/app` for the App, webhooks and installation tokens, with GraphQL pagination and throttling plugins).
- **Dashboard**: SvelteKit 2 with the Node adapter, using `@immich/ui` for components. SvelteKit 3 is out, but `@immich/ui` doesn't support it yet.
- **Queue**: [pg-boss](https://github.com/timgit/pg-boss), stored in the same Postgres database, with workers running inside the application process.
- **Deployment**: one container image. The SvelteKit app is the single entry point: it serves the dashboard and the webhook endpoint, and starts the queue workers from its server `init` hook. Ingest, policy and act (ADR-0002) are separate modules and queues within it. pg-boss claims jobs with `SKIP LOCKED`, so several replicas can run side by side.
- **Configuration**:
  - Secrets and connection details (database URL, the App's private key, webhook secret, OAuth client secret, cookie signing key) come from environment variables.
  - Operational settings are named constants in one module. Changing them is a reviewed code change, like a rule change, and every deployment runs with the same values.
- Offline work such as fitting rule weights (ADR-0003) may use other tools, for example Python against an export, since it doesn't run in the service.

## Considered options

- **Go.** A single static binary is attractive for self-hosting, but the GitHub App libraries are thinner, and the dashboard would be in a second language. Rejected.
- **Python.** Closest to the validation scripts and to offline fitting, but a weaker fit for a long-running webhook service with a dashboard. Rejected.
- **graphile-worker** as the queue. Also Postgres-backed and able to run in-process, with lower latency through `LISTEN`/`NOTIFY`, but still pre-1.0. pg-boss covers delayed jobs, deduplication, retries and schedules with a simpler API. Rejected.
- **A Redis-based queue** (BullMQ). Mature, but adds a second stateful service to run and to self-host. Rejected.
- **Separate deployments for workers and web.** Allows scaling them independently, which isn't needed yet; the module boundaries make splitting them later straightforward. Rejected for now.
- **Operational settings from environment variables.** Awkward for structured settings such as schedules and retention periods. Rejected.
- **Operational settings from a config file.** Lets a deployment change them without touching code, but these are initial values to be tuned from data, and retention periods in particular shouldn't differ between deployments. Rejected for now.

## Consequences

- Self-hosting needs one container and a Postgres database.
- The queue's tables live in the application database, so backups and migrations cover them too.
- Queue workers and web requests share a process. A heavy backfill can slow the dashboard, which is acceptable for now and solvable by running separate replicas for workers later.
- The dashboard and the backend share one language, types and database access code.
- Moving to the next Node LTS is a deliberate upgrade, not something a version range picks up implicitly.
- A self-hoster who needs different operational settings has to change the code.
