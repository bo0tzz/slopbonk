# 6. Install by link, no Marketplace listing yet; reporting to GitHub stays manual

- Status: accepted
- Date: 2026-10-02

## Context

### Distribution

- A public GitHub App can be installed by any organisation from `https://github.com/apps/<slug>/installations/new`. A Marketplace listing isn't needed for that.
- A listing adds discoverability and some credibility. For a free app it requires a privacy policy, a support contact, a (free) pricing plan, and handling Marketplace plan-change webhooks.
- Listing also means accepting the Marketplace Developer Agreement, which restricts disclosing users' personal data to third parties without consent. It's unclear whether that covers the cross-tenant block count (ADR-0005), since the accounts being counted aren't users of the app.

### Reporting to GitHub

- GitHub has no API for reporting accounts or content. The official REST API description and the GraphQL mutations have nothing for it; reporting is only possible through the web interface and the abuse contact form.
- Automating the form would need a real user's session and would break GitHub's terms.
- The "Report abuse" link on a GitHub profile is `https://github.com/contact/report-abuse?report=<login>+(user)`, which opens the report form with the account already filled in. There's no known way to prefill the description.

## Decision

- slopbonk is a public GitHub App, installed from its installation link. It's not listed on the Marketplace for now.
- Reporting to GitHub is manual. The account page has a "report" action that opens GitHub's report form for the account, using the same link as GitHub's profile pages, and a summary of the evidence (the cross-repository timeline and links to the comments) ready to copy into the form's description.

## Considered options

- **Listing on the Marketplace straight away.** Easier to find, but early users will come through Immich and word of mouth anyway, and the Developer Agreement's data clauses are unclear for the shared count. Deferred.
- **Automating GitHub's report form.** Against GitHub's terms, and it would need a person's session. Rejected.
- **No reporting support at all.** Reporting by hand means collecting the evidence by hand, which the account page already has. Rejected.

## Consequences

- Installing needs the link, which has to be published somewhere (the project's README, Immich's channels).
- Reports to GitHub take a reviewer a few clicks and a paste each, so most blocked accounts will probably never be reported.
- If GitHub ever offers a reporting API or a channel for trusted reporters, this decision gets superseded.
