# Ganita

A restaurant operations and financial-health workspace based on the Ganita AI v2
working source. It retains the monorepo's dashboards, outlets and catalog,
sales imports, stock workflows, health scoring, issue management, API services,
worker and partner integration boundaries.

This edition keeps the existing application structure and database/provider
integrations for further development. Some connectors, insight providers and
screens are demonstrations or stubs; the full system has not been replaced by
local mocks.

## Stack

Node.js 22+, pnpm 9.15.4, TypeScript, Next.js/React, Fastify, Prisma/PostgreSQL,
Clerk authentication and a background worker. The optional 3D restaurant scene
uses Three.js and adapted MIT-licensed assets.

## Install and development setup

```sh
corepack enable
pnpm install --frozen-lockfile
```

Configure isolated development services before database commands or startup.
The code expects `DATABASE_URL` and `JWT_SECRET`, with web/API URLs and
Clerk settings when authentication is enabled. Supply configuration privately;
no environment file, usable credentials, production records or database export
is included. Never use a production database for development or tests.

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web application uses port 3000 and the API uses port 4000. The optional
`pnpm dev:local` helper starts local processes and stores logs under `.local/`;
this folder and all environment files are excluded from source archives.

Remote assistant integration, if used, selects `LLM_PROVIDER=remote` and requires
`ASSISTANT_API_URL`, `ASSISTANT_API_KEY`, and `ASSISTANT_MODEL` supplied privately.
No provider credential or hosted endpoint is bundled. Partner connectors need
their own development adapters and configuration.

## Checks

```sh
pnpm db:generate
pnpm test:unit
pnpm typecheck
pnpm build
```

Unit tests use synthetic fixtures and mocked transport. Integration and browser
checks require isolated database and authentication setup; review their scripts
before running them. Original deployment infrastructure and operational audit
notes are excluded from this source edition.

Example records use explicitly fictional identities and reserved `example.com`
email addresses. Seed account passwords must be supplied privately through `DEMO_OWNER_PASSWORD`
and `DEMO_ADMIN_PASSWORD` before seeding; none are stored in the repository.

## License

MIT for the application source. Required third-party attribution is preserved in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.
