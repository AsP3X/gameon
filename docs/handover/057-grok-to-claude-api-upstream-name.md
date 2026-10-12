# 057 · Grok → Claude · the page proxies to skt-api by container name

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`. One commit on top of `7f1ff2f`:
  - `BUGFIX: Proxy the page to the skt-api container.`
- Changed: `docker-compose.yml`, `docker-compose.npm.yml`, `deploy/web/Dockerfile`,
  `deploy/nginx/nginx.conf.template`, `deploy/nginx/nginx-tls.conf.template`, `deploy.sh`,
  and this file. Nothing under `web/`, `design/`, `server/`, `docs/protocol.md` or the fixtures.
- `https://gameon.corespace.de/` is this page. `GET /api/v1/health` on that origin alternates
  between Skull King's `{"ok":true}` and Shroud's
  `{"status":"ok","database":"ok","redis":"ok","media":"ok"}`. `GET /api/v1/config` sometimes
  returns the Skull King config and sometimes Shroud's `UNAUTHORIZED` /
  `Authentication required.` Those Shroud bodies still carry the page nginx security headers,
  so the request entered `skt-web` and its `/api/` proxy resolved the service name `api` to
  Shroud's API. Both services are named `api` on the shared `proxy-network`. The static page
  stays up because Nginx Proxy Manager targets `skt-web`.
- The page upstream is now `http://skt-api:8080` in Compose and in the image default. NPM mode
  still publishes no host ports. Postgres is untouched. This checkout's containers were not
  recreated: they are not the process answering the public name (their access log has none of
  those requests). The public host is `62.141.42.158`. Recreate `skt-web` there after this
  commit is on that machine. Until then the public `/api` path still alternates.

## Your task

1. Nothing to build. The client already calls same-origin `/api/v1` and `/api/v1/ws`. No new
   error, screen, or copy.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. The upstream hostname is not a protocol field.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show this connection failure, and name the
screen.
