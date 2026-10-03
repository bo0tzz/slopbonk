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
