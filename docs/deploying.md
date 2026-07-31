# Deploying

The build is a static export with no server, no API routes and no runtime
network calls — [ADR-004](adrs/004-no-in-browser-cfr.md) is what buys that, by
keeping every expensive computation offline at build time.

```
npm run generate      # writes .output/public
```

That directory is the whole site. It hosts anywhere that serves files.

## Cloudflare Pages (free tier is enough)

```
Build command:        npm run generate
Build output:         .output/public
Node version:         20 or later
```

Nothing else to configure. In particular there are **no COOP/COEP headers to
set**, because nothing here needs `SharedArrayBuffer` — that requirement is what
makes in-browser solvers awkward to host, and ADR-004 declined to take it on.

`_headers` and `_redirects` files are not needed; Nuxt's static preset emits
`200.html` and `404.html`, which Pages uses for client-side routing.

## Fly.io

Fly runs containers rather than static files, so it is more machinery than this
project needs — but it is worth writing down when it becomes the right answer.

For the site as it stands, a static container is enough:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run generate

FROM pierrezemb/gostatic
COPY --from=build /app/.output/public /srv/http
```

The reason to reach for Fly rather than Pages is if the project ever grows a
server, and ADR-004 names the one thing that would justify it:

> **Revisit if:** the project acquires a server. Then a solve service becomes
> possible and the ceiling moves.

That is a different product with different hosting economics. It would also
reopen [ADR-006](adrs/006-no-vector-database.md), whose stated revisit condition
is "a server and a shared cross-player corpus" — at which point the
build-time-only split in [ADR-011](adrs/011-ruvector-for-offline-clustering.md)
would be worth reconsidering too. None of that is needed to play the game.

## What ships

The client does three cheap things: look up a policy, evaluate hands, and run
Monte Carlo equity for display. No solving, no model download, no telemetry.

Opponent profiles live in `localStorage` under `poker-ai:profile:v1` and never
leave the browser. There is a "forget everything about me" button, and it does
exactly that.

## What does not ship

`ruvector` is a build-time dependency only, used for offline clustering per
ADR-011. It is not importable from the browser bundle and is not in the runtime
dependency graph — verify with:

```
npm run probe:vector   # insert-then-query harness, per ADR-006's standing rule
```

That probe exists because a vector engine that fails to load can install a stub
which reports success while returning nothing. It is checked by using the index,
never by reading its backend label.
