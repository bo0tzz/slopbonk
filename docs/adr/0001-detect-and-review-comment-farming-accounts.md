# 1. Detect comment-farming accounts and put them in front of maintainers for review

- Status: proposed
- Date: 2026-10-02

## Context

GitHub accounts post bursts of LLM-written comments across many unrelated repositories. Immich's Q&A Discussions get a steady stream of them: over 30 days to 2026-10-01, 19 of 535 discussion comments on immich-app/immich (3.6%) came from such accounts, all in Q&A categories. The comments are plausible-sounding answers, occasionally correct, rarely followed up. Each one costs maintainers and question-askers time, and spotting them by hand means opening the commenter's profile and piecing together what else they've been doing.

Characteristics, from reading the histories of 1,176 accounts that commented on Immich, or in repositories these accounts targeted, plus the 70 accounts the immich-app org has blocked:

- One-off answers in many unrelated repositories. The median account reached 11 distinct repositories within some 24-hour window, the most extreme 198. One posted 4 answers in 4 repositories within 96 seconds.
- Most accounts are not new. Many are years old, with bios, repositories, followers and real commits, so account age and profile completeness don't catch them. A common shape is an old account whose commenting history only started weeks ago.
- Writing style varies within one account, so judging the text alone is unreliable.
- A tactic seen elsewhere: post a harmless comment, then edit links in later, since edits don't notify anyone ([Tumbleson, 2026](https://connortumbleson.com/2026/03/23/the-odd-new-spam-on-github/)).

The direct motive is GitHub's "Galaxy Brain" achievement for accepted answers. One blocked account said so when challenged, and GitHub disabled achievements in its own Community forum because of this farming. The badge's purpose is inferred to be padding profiles for job seeking, raising the resale value of aged accounts, or adjacent activity farming (crypto airdrops, paid bounty programmes) that pays directly. Whatever the motive, the problem scales with LLM agent tooling and won't fade by itself.

Three kinds of account turned up:

1. **Answer farmers**: one-off answers in Q&A categories across many repositories.
2. **Issue/PR agent and bounty accounts**: automated PR reviews, "can I work on this?" applications, very high volume, rarely in Q&A.
3. **Cross-posted self-promotion**.

The same accounts hit many organisations within a day, so each organisation deals with them separately, after the fact.

The signal that identifies them is behaviour across GitHub (how many unrelated repositories, how fast, in which kinds of categories), not the single comment. Existing tools mostly judge one comment or one pull request at a time, or check account age and profile completeness, which these accounts pass.

## Decision

We build slopbonk: a tool that finds these accounts among the people commenting in an organisation's repositories and puts them in front of the organisation's maintainers, with the evidence needed to decide quickly and a one-click block.

### What it does for maintainers

- **Watches** comments in the organisation's repositories (discussions, issues and pull requests) and looks at each commenter's activity across GitHub.
- **Flags** accounts whose behaviour matches comment farming, and keeps checking accounts for a while after they first appear, since bursts often continue for hours afterwards.
- **A review queue**: one row per flagged account, with its score, the main reasons and when it was last seen.
- **An account page** with the evidence: a timeline of the account's activity across repositories, its comments in this organisation's repositories, and which signals fired and how much each counted.
- **Actions**:
  - **block**: block the account from the organisation, optionally also hiding or deleting its comments there;
  - **dismiss**: not spam, for this organisation;
  - **report**: open GitHub's report form for the account, with a summary of the evidence ready to copy in.

  Not deciding leaves an account in the queue.
- **Reviewer access**: organisation owners, plus teams or users the organisation chooses.
- **Configuration** per organisation: which repositories and discussion categories to watch, who counts as exempt, thresholds, and adjustments to the rules.
- **A shared signal**: "blocked by N other organisations using slopbonk", shown to reviewers.

Review comes first. Automatic hiding or blocking may come later, only above thresholds whose precision has been measured.

The first target is answer farmers. Issue/PR agent accounts and cross-posted promotion are in scope for later rules. Abusive humans and other spam aren't something slopbonk detects, but a maintainer can still use the same block action on them.

### How it's offered

- A **GitHub App** that any organisation can install, **hosted by us** as one multi-tenant service. A tenant is an installation on a particular organisation.
- **Self-hosting is supported**: the same software can be run by anyone, without the shared signal.
- Personal accounts are not supported: an app can only block users at organisation level.

## Considered options

- **Judging each comment with an LLM** (as [github/ai-moderator](https://github.com/github/ai-moderator) does). It misses the cross-repository behaviour that identifies these accounts, and AI-text detection is unreliable and biased against non-native writers. It may be useful later as a minor input, not as the method.
- **Restricting who can interact** (only prior contributors, or onboarding by form). It closes an open Q&A forum to exactly the newcomers it's meant for. Rejected.
- **GitHub's built-in tools only** (manual block, report and interaction limits). That's the current situation: doable, but every account has to be investigated by hand, organisation by organisation.
- **Automatic blocking from the start.** Too risky without measured precision: a false positive blocks a real person. Deferred until precision has been measured.

## Consequences

- Maintainers review accounts instead of hunting for them; time per account drops to reading one evidence page.
- Running it means holding GitHub users' data for many organisations, with the privacy obligations that brings, especially for data shared between organisations.
- Detection quality depends on the rules, which need ongoing measurement and tuning.
- Accounts with very little history (a comment or two) can't be judged on behaviour yet. Some farmers will be missed until they post more.
- Offering it to other organisations means operating a service, with support and abuse-handling responsibilities of its own.
