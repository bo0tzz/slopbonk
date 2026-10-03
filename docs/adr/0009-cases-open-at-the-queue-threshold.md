# 9. Cases open when an account reaches the queue threshold

- Status: accepted
- Date: 2026-10-03
- Supersedes: when cases are created, in the `cases` entry of ADR-0004

## Context

ADR-0004 creates a case when an account first comments in a tenant's repositories. Most commenters score far below the queue threshold, so nearly every case is an open case that nobody will review.

- The retention rule for history comments keeps them for any account with an open or blocked case. With a case for every commenter, it keeps nearly all history.
- Queue counts and lists have to filter out the low-scoring cases on every query.
- Every evaluation is already stored on its own, with its signal values, whether or not a case exists.

## Decision

- A case is created when an evaluation first scores the account at or above the tenant's queue threshold. Below that, only the evaluation is stored.
- An existing case keeps being updated with each evaluation, whatever the score.
- Re-checks are timed from the account's first comment in the tenant's repositories, not from the case's creation. Each evaluation sends the re-checks that are still ahead, and the queue keeps one of each.
- Open cases below the threshold without decisions are removed.

## Considered options

- **Keep a case for every commenter, and read "open case" as "open and at or above the threshold"** wherever it matters. Every query and retention rule then has to repeat the threshold, and the cases table grows with every commenter. Rejected.

## Consequences

- "Open case" means an account waiting for review, so retention, queue counts and the account list work on cases directly.
- When a tenant lowers its threshold, accounts between the old and new threshold get a case at their next evaluation, not immediately.
- The first-seen time of a case is the account's first comment in the tenant's repositories, as before, since it comes from the comments rather than from the case's creation.
