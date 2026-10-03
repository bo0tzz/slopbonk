# 8. Dashboard on SvelteKit remote functions, with the reviewer's GitHub token as the session

- Status: accepted
- Date: 2026-10-03
- Supersedes: the "Reviewer sessions" section of ADR-0002

## Context

The dashboard is a review queue per organisation and a page per flagged account, with block and dismiss decisions (ADR-0001). It needs a way for pages to read data and send decisions, and a way to know who the reviewer is and which organisations they can review.

- SvelteKit's remote functions (`query`, `form`, `command`) let components call typed server functions directly. In SvelteKit 2.70 they sit behind `kit.experimental.remoteFunctions`, documented as not yet stable; SvelteKit 3.0 keeps them experimental and moved their types to `$app/server`.
- Reviewers sign in through the GitHub App's user authorisation, which yields a user access token valid for 8 hours and a refresh token. With that token, GitHub reports the user's identity and the app installations they can access, which is exactly the reviewer check.
- ADR-0002 settled on a stateless cookie signed with our own secret, holding the reviewer's id and organisations for an hour, and on not keeping the user's token.
- Comment bodies come from accounts suspected of spam.

## Decision

### Communication

- Pages read and write through remote functions, with `kit.experimental.remoteFunctions` enabled: `query` functions for the queue and the account page, and `form` functions for decisions.
- Remote functions only call the `review` component, through `services`; they don't query the database themselves.
- There's no separate JSON API.

### Sessions

- The session is the reviewer's GitHub user access token, kept with its refresh token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. There's no session secret and no session storage of our own.
- On each request the server resolves the token to the reviewer's identity and the installations they can access, asking GitHub and caching the answer per token for a few minutes.
- An expired token is refreshed with the refresh token; if that fails, the reviewer signs in again. Signing out deletes the cookie and revokes the token.
- Reviewers' accounts are stored in `github_users`, since decisions reference them.

### Pages

- `/` lists the organisations the reviewer can review; `/orgs/<organisation login>` is the organisation's review queue; `/orgs/<organisation login>/accounts/<account login>` is the page for one flagged account. The fixed `orgs` and `accounts` segments keep these from colliding with other routes such as `/auth` and `/api`, or with each other.
- Account logins in URLs resolve through the stored login, which is updated whenever the account is seen again. After a rename, links with the old login return 404.
- Comment bodies are shown as plain text, never rendered as Markdown, so suspected spam can't load images or present links inside the dashboard.
- After a decision, the dashboard moves on to the next account in the queue.

## Considered options

- **Our own signed session cookie** (ADR-0002). Our own copy of the reviewer's identity, and a stolen cookie only grants access to slopbonk. But it needs a session secret, membership is only rechecked hourly, and signing out or revoking the app on GitHub doesn't end the session. Superseded.
- **A server-side session store.** Instant revocation and a small cookie, at the cost of a table and its cleanup. Rejected.
- **Server `load` functions and form actions.** Stable and well understood, but more boilerplate and looser typing between page and server than remote functions. Rejected.
- **A JSON API with a client-side app.** Only pays off with other clients, which there aren't. Rejected.
- **Account ids in URLs** (`/orgs/<org>/accounts/12345-login`). Links would survive renames, at the cost of less readable URLs. Rejected.

## Consequences

- The session cookie is a GitHub credential: whoever holds it can act on GitHub as that reviewer, within the app's permissions. `httpOnly` and `Secure` keep it from page scripts and plain-text connections.
- Every request depends on GitHub for identity, softened by the per-token cache. With several replicas, each keeps its own cache.
- Signing out or revoking the app on GitHub ends the session within the cache period.
- Moving to SvelteKit 3 will need changes to remote function code; they're also experimental and could change further.
- Old links to renamed accounts break.
