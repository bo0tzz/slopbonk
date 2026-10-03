# 4. Data model: shared public data, per-tenant decisions, stored signal values, and bounded retention

- Status: accepted; when cases are created superseded by ADR-0009
- Date: 2026-10-02

## Context

- ADR-0002 has ingest storing public GitHub data once for all tenants, policy working only on the database, and act carrying out decisions from an outbox.
- ADR-0003 needs every evaluation's signal values stored, so rules can be backtested and weights fitted, and labels taken from maintainers' decisions.
- Spam accounts delete their comments, and GitHub suspends accounts, after which their data disappears from the API. Evidence that's only linked to can vanish.
- GDPR's storage limitation and data minimisation principles apply, and people can ask for their data to be deleted. Most accounts we fetch are ordinary people who will never be flagged.
- GitHub's Acceptable Use Policies require personal data collected from GitHub to be reasonably secured, and removal requests answered promptly.

## Decision

### Shared public data

- **`github_users`**: identity only, for everyone (commenters and reviewers alike), keyed by GitHub user id, since logins can change. Login, account creation date, basic profile.
- **`tracked_users`**: ingest's state per account: when it was last fetched, how far back its history goes, the next scheduled check, and when it started returning `null`.
- **`comments`**: GitHub node id, author, repository, thread, category and whether it's answerable, whether it's an accepted answer, the author's association with the repository, created and edited times, body, and whether it came from a webhook (a tenant's repository) or a history fetch.
- **`comment_edits`**: earlier versions of edited comments, only for comments in tenants' repositories, so links added after posting are visible.
- **`fetch_jobs`**: ingest's queue.

### Evaluations

An **evaluation** is one run of policy for one account. A **signal value** is a measurement of that account made during the evaluation (for example, peak distinct repositories in 24 hours = 33). A **rule** turns signal values into a contribution to the score; rules are versioned code (ADR-0003), not data.

- **`evaluations`**: account, time, ruleset version, and the age of the data used.
- **`signal_values`**: one row per signal per evaluation, referencing its definition. All values are numeric; yes/no signals are stored as 0 or 1.
- **`signal_definitions`**: keyed by name and version, with a description. Rows are only ever inserted, by migrations, so a stored value can't refer to an unknown or redefined signal.

Rule outcomes aren't stored. Rules are pure functions of signal values, so what fired and how much it contributed is recomputed from the stored values when needed: to show a reviewer the reasons for a score, to measure a rule's precision, or to run a shadow rule.

These are global: signals don't depend on the tenant. Tenant settings (thresholds, multipliers) are applied on top when computing a tenant's score.

### Per-tenant data

- **`installations`**: GitHub installation id, organisation, and its current configuration as one document, validated against a schema in code.
- **`config_changes`**: who changed what and when, old and new values. Configuration isn't otherwise versioned; past settings can be reconstructed from this log when needed.
- **`cases`**: one per tenant and account, created when the account first comments in one of the tenant's repositories. It holds the state (open, blocked or dismissed), the tenant's current score for the account, the score at dismissal, and first and last seen times. The score is stored so the queue can be sorted, and recomputed when the tenant's configuration changes.
- **`decisions`**: case, actor (a GitHub user id), action (block, dismiss, unblock, hide, delete), optional reason, time, and the evaluation the reviewer was looking at.
- **`outbox`**: actions waiting for act, with status, attempts and the last error.

There's no sessions table (ADR-0002).

### Retention

These are initial values.

- **History comments** (fetched from outside tenants' repositories) for accounts with no open or blocked case in any tenant are deleted 30 days after their last evaluation.
- **Evaluations** (with their signal values) for accounts with no case decision are deleted after 90 days. That's long enough for 30-day backtests and shadow-rule measurement.
- **Labelled evaluations**: the evaluation a decision was based on, with its signal values, is kept for 2 years as training data. The raw comment text isn't needed for that and follows the comment rules.
- **Comments in tenants' repositories**, cases and decisions are kept while the installation exists. 30 days after an organisation uninstalls the app, its tenant data is deleted: installation, configuration, change log, cases, decisions and outbox.
- **Accounts with nothing left** referencing them lose their `github_users` and `tracked_users` rows.
- **Deleting a single account's data** on request must be possible, from both the shared and the per-tenant tables. For now requests come in through a published contact email address.

## Considered options

- **An append-only event log** for everything. Perfect auditability and replay, but conflicts with deletion on request and storage limits, and is more machinery than needed. The properties that matter (evidence kept after GitHub loses it, signals kept separately from scores, decisions attributed to their actors) come from ordinary tables. Rejected.
- **Signal values as a JSON document per evaluation.** Flexible, but the main uses are aggregating per signal and exporting feature matrices, which need typed, constrained values. Rejected.
- **Storing rule outcomes per evaluation.** Saves recomputing, but duplicates what the signal values and the versioned rule code already determine. Rejected.
- **Fully versioned tenant configuration.** Every evaluation could point to the exact settings used, but this is rarely needed and the change log can reconstruct it. Rejected.
- **A separate database per tenant.** Stronger isolation, but public data would be duplicated and fetched once per tenant, and the shared signal would need cross-database queries. Rejected.
- **Storing links instead of comment text.** Less data held, but the evidence disappears when spammers delete comments or GitHub suspends accounts. Rejected.
- **Computing tenant scores on read.** Always current, but the queue then can't be sorted cheaply. Rejected.

## Consequences

- Rules can be backtested over the last 90 days, and weights fitted from up to 2 years of labelled evaluations, without keeping most people's comments.
- Most accounts we fetch, which are ordinary people, leave nothing behind within about 90 days.
- A blocked account's evidence stays as long as the block, so reviewers and appeals can still see why it was blocked.
- Training data shrinks if organisations uninstall, since their decisions are deleted.
- Changing a signal's computation means adding a new definition version, and old evaluations keep their original meaning.
- Explaining an old evaluation's score requires its ruleset version to still be runnable, so old ruleset versions stay in the code for as long as evaluations referencing them are retained.
- Retention jobs need to run reliably; a failed cleanup is a data protection problem, not just housekeeping.
