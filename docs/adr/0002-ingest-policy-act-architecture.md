# 2. Separate ingest, policy and act components, with policy working only on our database

- Status: accepted
- Date: 2026-10-02

## Context

Detection needs, per account:

- its comment history across all public repositories, fetched when the account first comments in an installed repository and again later, since bursts often continue for hours afterwards;
- state over time: past evaluations, maintainers' decisions, and labels for measuring the rules.

### GitHub platform constraints

- **The public events API does not include discussion comments.** Accounts that commented in Immich Discussions showed nothing in their event feeds.
- **GraphQL has the history**: `user.repositoryDiscussionComments` and `user.issueComments` cover an account's comments across all public repositories, with timestamps, `isAnswer`, repository, category and `authorAssociation`. They page newest-first, 100 comments per call.
- **Listing a repository's discussions is expensive** in GraphQL rate-limit points; bulk collection during validation used up an hourly quota. Comments in installed repositories should arrive by webhook (`discussion_comment` and `issue_comment`, both created and edited) rather than by polling.
- **Rate limits are per installation token.**
- **Moderation**: `PUT /orgs/{org}/blocks/{username}` (GitHub App organisation permission "Blocking users"), `minimizeComment` with a reason such as SPAM, `deleteDiscussionComment`.
- **A deleted or suspended account** returns `null` from GraphQL `user(login:)`.

### When farmers become detectable

During validation, a candidate detection rule was tested: at least 3 distinct repositories within 24 hours with at least half of comments in Q&A categories, or at least 10 new repositories within 30 days with less than half of comments in organisations the account had posted in before. Of 23 farmers who first commented in Immich at least a week before the validation run, it would have fired on the history visible at:

| time after first Immich comment | caught |
|---|---|
| immediately | 16 |
| +1h | 18 |
| +6h | 18 |
| +24h | 19 |
| +3 days | 21 |
| +7 days | 21 |

## Decision

### Three components with one-way data flow

```
                fetch requests
          ┌─────────────────────────┐
          ▼                         │
GitHub ─► ingest ─► database ◄───► policy
                       │
                       ▼
                      act ─► GitHub
```

- **ingest** is the only component that reads from GitHub.
  - It receives webhooks for comments in installed repositories (created and edited), and backfills recent comments when an organisation installs the app.
  - It fetches account histories, and re-fetches them on schedule (see below). The first fetch goes back 12 months, or to the account's first comment if that's sooner; later fetches only retrieve comments newer than the newest one stored.
  - It records when an account starts returning `null` (deleted or suspended).
  - It owns the rate-limit budget and works through a queue of fetch jobs.
  - Public data (accounts, comments, histories) is stored once and shared across tenants. A fetch request for an account whose stored history is fresh enough makes no API call. Otherwise the fetch uses the installation token of the tenant whose request triggered it.
- **policy** only reads and writes the database.
  - It evaluates accounts and maintains each tenant's review queue.
  - When it needs fresher data, it requests a fetch and is run again when the data arrives. It never calls GitHub itself.
  - Every evaluation records the ruleset version and how fresh its input data was.
- **act** is the only component that writes to GitHub.
  - Decisions (block, hide, delete) go into an outbox table; act carries them out with the tenant's installation token, recording status and retrying failures.

These are logical components. Whether they run as separate processes or as workers in one service is an implementation choice; the boundaries are what matter. The same boundaries apply to a self-hosted deployment.

### Re-checks

An account is evaluated when it first comments in an installed repository, and re-evaluated:

- whenever it comments in an installed repository again;
- on a schedule after first appearing: +1h, +24h and +3 days. These are the points in the table above where detection improved; +6h and +7 days added nothing.

### Reviewer sessions

- Reviewers log in with GitHub through the App's user authorisation flow. We use that only to identify them; actions are carried out with the installation token, so the user's token isn't kept.
- The session is a signed, encrypted, stateless cookie holding the GitHub user id and the organisations they may review for. It expires after about an hour, after which organisation and team membership is checked again.

## Considered options

- **A GitHub Action per repository**, like github/ai-moderator or anti-slop. No hosting needed, but each run is stateless and scoped to one repository: no decision history, no dashboard, no re-checks on a timer, no sharing between organisations. Rejected.
- **Policy calling GitHub directly when it needs data.** Simpler at first, but any rule change risks unbounded query fan-out, rate-limit handling ends up spread through the code, and evaluations can't be replayed against stored data. Rejected.
- **Polling installed repositories instead of webhooks.** Expensive for discussions, and slower. Rejected, except for the one-off backfill on installation.
- **The public events API for histories.** Doesn't include discussion comments. Rejected.
- **Stateful sessions** (a sessions table). Would allow instant revocation, which reviewer access doesn't need, at the cost of a table and its cleanup. Rejected.

## Consequences

- Rule changes can be backtested and stored history re-scored, because policy depends only on the database.
- The rate-limit budget is managed in one place. Webhooks make watching installed repositories nearly free. The main cost is the first history fetch per new account, which grows with how active the account was over the past year: one call for most, dozens for prolific maintainers. Re-checks are incremental and cheap.
- Scores are only as fresh as the last fetch. Evaluations record how old their data was, and the dashboard should show it.
- Actions go through the outbox, so a block lands slightly later than a direct API call would, but failures are visible and retried.
- Someone removed from a reviewer team keeps access until their cookie expires, about an hour later.
- A tenant's installation token sometimes pays for fetches whose results other tenants also use.
- Storing public data once and sharing it across tenants means the database holds data about accounts that no single tenant's maintainers have seen. Retention rules have to account for that.
- The re-check schedule is based on only 23 accounts.
