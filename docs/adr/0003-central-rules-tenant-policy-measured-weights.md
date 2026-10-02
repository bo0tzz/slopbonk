# 3. Central, versioned rules; tenants set policy around them; weights come from measured performance

- Status: proposed
- Date: 2026-10-02

## Context

### Validation

Before designing the scoring, we checked which signals actually separate comment farmers from everyone else, using scratch scripts against live GitHub data on 2026-10-01/02.

Method:

- **Seed**: all non-member commenters on immich-app/immich over the previous 30 days (discussions, issues and pull requests): 636 accounts.
- **Snowball**: repositories that the farmers found in the seed had answered in; a random 450 of the 1,653 people who commented in those repositories' discussions over 14 days.
- **Maintainer labels**: the 70 accounts blocked by the immich-app organisation.
- **History**: up to 300 discussion comments and 300 issue/PR comments per account, 1,176 accounts in total.
- **Labels**: hand-labelled by reading samples from every account in the higher signal bands, plus the maintainer blocks. 43 answer farmers in total.
- "Outward" comments exclude those in repositories the account owns and on threads it started.

Signals, as medians with p25–p75 in brackets. "High-volume humans" are the 39 human accounts labelled from the high signal bands, so their peak values are high by selection. "Everyone else" is the remaining accounts with at least 5 outward comments.

| signal | farmers (43) | high-volume humans (39) | everyone else (611) |
|---|---|---|---|
| peak distinct repositories in any 24h | 11 (4–24) | 4 (4–6) | 2 (1–2) |
| share of comments in answerable (Q&A) categories | 0.77 (0.53–0.97) | 0.10 (0.04–0.17) | 0.03 (0.00–0.11) |
| share of comments in an organisation posted in before, excluding GitHub's Community forum | 0.33 (0.16–0.62) | 0.91 (0.84–0.96) | 0.62 (0.42–0.79) |
| most new repositories in any 30 days | 20 (6–57) | 8 (5–13) | 2 (1–4) |
| days with ≥3 repositories in the last 90 | 2 (1–5) | 1 (0–4) | 0 (0–0) |

Findings:

- **Peak repositories per 24h alone is not enough.** Busy maintainers reach 5–12 a day. What separates them is where they post: maintainers comment on issues and pull requests within their own ecosystem; farmers post one-off answers in Q&A categories everywhere.
- **Returning to an organisation** separates farmers from high-volume humans well, but only once an account has some volume. Farmers return often to GitHub's own Community forum, so it's excluded.
- **New repositories per 30 days** mostly finds the same accounts as the 24h peak today, but catches farmers who space out their posts to stay under a daily threshold.
- **"Dormant, then a burst"** (no comments for 30+ days, then a run) is noise by itself: it describes most occasional users. **"Old account whose commenting history only started recently"** (account over 2 years old, first comment under 120 days ago) is a useful modifier: combined with a peak of 3 or more it hit 9 farmers, 1 agent account and 1 human.
- **Days with bursts** over 90 days is weak.

Rules:

| rule | fires | farmers caught (of 43) | others |
|---|---|---|---|
| peak ≥5 | 59 | 30 (70%) | 19 human maintainers, 10 agent/promotion accounts |
| peak ≥3 and Q&A share ≥0.5 | 36 | 35 (81%) | 1 human |
| … or (new repositories in 30 days ≥10 and returning share <0.5) | 41 | 37 (86%) | 1 human, 1 blocked PR agent account |

- The one human was a maintainer answering in their own organisation's repositories. The "own repository" check only matched the user's personal account; history comments carry `authorAssociation`, so comments where the author is a member of the repository's organisation can be excluded.
- Remaining misses: accounts mixing PR-agent comments and answers that keep returning to the same organisations, and brand-new accounts with one or two comments, where behaviour can't be judged yet.

Caveats:

- Recall is measured against farmers found by looking. Below the thresholds, only accounts with a high Q&A share were searched, so a farmer with both a low peak and a low Q&A share would be missed by the rule and the search alike.
- 43 farmers is enough to choose signals, not to fit weights.
- The labels come from a single reviewer, plus the maintainers' blocks.

### Prior art in scoring

- **SpamAssassin / Rspamd**: many named rules, each with a weight, summed into a score. Rule groups have a maximum score so correlated weak signals can't add up to a verdict. Different actions sit at different thresholds.
- **SmokeDetector / metasmoke** (Stack Exchange): each rule's weight is its measured precision from human true/false-positive feedback; automatic flags only above a threshold measured at about 99.98% precision.
- **ClueBot NG** (Wikipedia): the threshold is set from a target false-positive rate (0.1%), accepting that only about 40% of vandalism gets reverted automatically; the rest goes to human review sorted by score.
- **AI-text detectors** are unreliable and biased: a [Stanford study](https://arxiv.org/html/2304.02819) found a 61% false-positive rate on essays by non-native English writers.

### Who owns the rules

Communities differ, so tenants will want some control. Letting each tenant write rules invites mistakes and makes results incomparable between tenants. Rules defined only centrally are never quite right for everyone.

## Decision

### Signals and rules

- **Signals** are numeric measurements computed from stored data: for example peak distinct repositories in 24 hours, Q&A share, returning share, new repositories in 30 days. Signals stay continuous; thresholds belong to rules. A signal's definition never changes in place: a changed computation is a new version.
- **Rules** combine signals into a contribution to an account's score. Related rules sit in groups with a maximum total contribution.
- Comments are excluded from the signals when they're in a repository the account owns, on a thread it started, or in a repository whose organisation it's a member of.
- The starting ruleset is the one validated above: peak ≥3 with Q&A share ≥0.5, or 10+ new repositories in 30 days with returning share <0.5, with "commenting history only started recently" as a modifier. Weights are set by hand at first.
- The ruleset lives in the code, versioned, with a changelog recording each version's measured performance. Changing it doesn't need a new ADR; changing how rules are owned, measured or applied does.
- Text-based signals (LLM style) are left out for now. If added later, it would be as a capped input for accounts with too little history to judge on behaviour.

### What tenants control

Per tenant:

- the score threshold for each action: entering the review queue (on by default), automatic hiding and automatic blocking (both off by default);
- per rule: enabled or not, and a weight multiplier;
- exempt author associations: by default OWNER, MEMBER, COLLABORATOR and CONTRIBUTOR, plus bots. This covers everyone associated with the organisation, including its teams. Exemptions don't expire; a compromised privileged account needs a human.

There are no exemptions for individual accounts. A dismissed account comes back to the queue if its score later rises well above where it was dismissed, with the earlier dismissal shown.

Tenants can't define new rules or change rule parameters. Any change to their settings shows a backtest first: how the last 30 days of their review queue would have looked with the change.

### Measurement

- **Labels**: block is a positive, dismiss a negative, and a later unblock a strong false positive. An account viewed but left alone is unknown, not negative.
- **GitHub suspensions are not labels**, since accounts get suspended for many unrelated reasons. They're tracked as a reported figure (how many blocked accounts GitHub later suspended), and an unflagged account that gets suspended after commenting in an installed repository is shown to a human for review.
- **Precision per rule** is reported with a confidence interval (Wilson score), so a rule doesn't look perfect on three data points.
- **Audit sampling** puts a small random sample of below-threshold accounts in the review queue, marked as audits, so the miss rate can be estimated without bias.
- **Shadow mode**: a new or changed rule runs and its results are recorded without affecting scores until it has enough labels to judge.
- **Automatic actions** can only be switched on for a threshold whose measured precision clears a high bar, on enough labels.

### Tuning

- Weights are fitted offline once there are a few hundred labels, as a logistic regression on the stored signal values, so the score becomes a calibrated probability. Thresholds are then chosen from the precision-versus-threshold curve against a stated false-positive target.
- A fitted ruleset is backtested and released like any other version. Nothing retrains automatically.

## Considered options

- **Tenants define their own rules** (a rule language or config files). Flexible, but easy to get wrong, results can't be compared between tenants, and labels from differently-configured tenants become hard to pool. Rejected; may be revisited for simple keyword or link rules.
- **Central rules with no tenant control.** Simple, but thresholds and exemptions really do differ between communities. Rejected.
- **An LLM classifier as the main method.** Judges text rather than behaviour, and AI-text detection is unreliable and biased. Rejected as the main method.
- **Weights from each rule's own precision** (SmokeDetector's approach). Easy, but double-counts rules that fire on the same accounts. Acceptable only as a stopgap before there are enough labels to fit weights.
- **Automatic retraining.** Feedback loops, and one careless or malicious tenant's labels would shift everyone's weights. Rejected.
- **Plain pass/fail rules** instead of scores. Simpler to explain, but can't express "several weak signals together" or give a calibrated threshold. Rejected.

## Consequences

- Rule changes ship as code releases, with their measured performance recorded.
- Tenants can tune how aggressive slopbonk is without being able to break detection for themselves or for others.
- Signal values have to be stored per evaluation, so rules can be backtested and weights fitted after the raw comments have been deleted.
- Automatic actions stay unavailable until enough labels have accumulated.
- Recall can only be estimated, via audit samples and later suspensions; it's never measured directly.
- Very low-history accounts remain a blind spot until they post more, or until text signals are added.
