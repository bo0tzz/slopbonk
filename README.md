# slopbonk

Finds GitHub accounts that farm comments across many repositories, and puts them in front of an organisation's maintainers for review. See [`docs/adr/`](docs/adr/) for the design.

## Development

```sh
mise install
pnpm install
cp .env.example .env
docker compose up -d
mise run dev
```

`mise tasks` lists the other tasks. After changing the schema classes in `src/lib/server/db/schema/`, run `mise run db:generate <Name>` to generate a migration; `mise run db:check` fails if the classes have changes that no migration covers.

## Registering the GitHub App

Each instance needs its own GitHub App. [This link](https://github.com/settings/apps/new?name=slopbonk&description=Finds+accounts+that+farm+comments+across+many+repositories+and+puts+them+in+front+of+maintainers+for+review.&public=true&webhook_active=true&events%5B%5D=discussion_comment&events%5B%5D=issue_comment&events%5B%5D=installation_target&metadata=read&discussions=write&issues=write&pull_requests=write&organization_user_blocking=write) opens GitHub's registration form with the name, permissions and webhook events filled in; to register under an organisation, change `/settings/apps/new` in it to `/organizations/<org>/settings/apps/new`. Then fill in, with `<base>` being the instance's public URL:

- **Homepage URL**: `<base>`
- **Callback URL**: `<base>/auth/callback`
- **Webhook URL**: `<base>/api/github/webhook`
- **Webhook secret**: a random string, e.g. from `openssl rand -hex 32`

After creating the app, copy its values into `.env` (see `.env.example`): the app ID, client ID and slug from its settings page, a newly generated client secret, the webhook secret, and a newly generated private key (on one line, with newlines written as `\n`, in double quotes).

The permissions are what the app needs to read comments, hide them and block accounts: metadata (read), discussions, issues and pull requests (read & write), and blocking users (read & write).

## Running

CI publishes the image to `ghcr.io/bo0tzz/slopbonk`: `latest` and `sha-<commit>` from main, and `<version>` for each release. It listens on port 3000 and migrates the database on startup. It needs Postgres and these environment variables:

- `DATABASE_URL`
- `ORIGIN`: the instance's public URL, as registered with the GitHub App
- `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY`
- `OPERATOR_GITHUB_IDS`: comma-separated GitHub user ids of the people who may open the admin panel at `/admin`
- `PUBLIC_CONTACT_EMAIL`: where people can ask about or remove data about their account; shown in the footer

`GET /api/health` answers 200 while the database is reachable.
