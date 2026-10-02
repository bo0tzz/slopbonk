# 5. A cross-tenant block count that informs reviewers

- Status: accepted
- Date: 2026-10-02

## Context

The same accounts hit many organisations within a day. When one organisation has already reviewed and blocked an account, that's useful to the next organisation's reviewers. All tenants of the hosted service share one database, so the information is already there.

Sharing it carries two risks:

- **Errors spread.** One organisation's false positive could follow a real person around.
- **Abuse.** Someone could install the app on a throwaway organisation and block people they dislike, to mark them elsewhere.

Sharing data about people between organisations also has to stay proportionate: minimal data, for a clear purpose, with people deciding rather than the system acting on someone else's say-so.

## Decision

- **The signal** is the number of other organisations that have blocked the account through slopbonk, where the block hasn't since been undone.
- Reviewers see the count on the queue and on the account page. They don't see which organisations, and no evidence moves between tenants; each tenant sees the same public activity for itself.
- The count may contribute to a tenant's score, so an account blocked elsewhere can enter the review queue. It never triggers automatic hiding or blocking: whether an automatic action applies is decided without it.
- Every tenant of the hosted service contributes to the count and sees it. Self-hosted deployments don't share.
- When an organisation uninstalls, its blocks stop counting once its tenant data is deleted (ADR-0004).
- People who think they've been blocked wrongly can use the same contact address as for other data requests.

## Considered options

- **A shared blocklist that blocks automatically** in every participating organisation. Maximum effect, but turns one tenant's mistake or malice into a cross-organisation block. Rejected.
- **Subscription lists**, in the style of Matrix moderation bots' policy lists, which organisations curate and others subscribe to. Avoids one central point of trust, but makes the social problem of who trusts whom explicit, and each list becomes something to maintain. Rejected.
- **Sharing evidence** (comments, signal values) between tenants. Unnecessary, since each tenant can see the same public activity. Rejected.
- **Showing which organisations blocked an account.** More context, but some installations are small, and "who blocked whom" is more than reviewers need. Rejected.
- **Per-organisation opt-in.** The count is anonymous and only informs a human reviewer, so a switch adds configuration without protecting much. Rejected.
- **Minimum tenant age or activity before blocks count.** Limits throwaway-organisation abuse, but would make the signal useless while adoption is low, which is also when abuse is least likely. Rejected for now.
- **No sharing.** Simplest, but loses much of the value of a hosted service. Rejected.

## Consequences

- Reviewers get an extra, strong hint, without anything acting automatically on another organisation's decision.
- A malicious or careless tenant can inflate an account's count, but at worst that brings the account to other reviewers' attention, and they decide from the evidence.
- Self-hosters get everything except the shared count.
