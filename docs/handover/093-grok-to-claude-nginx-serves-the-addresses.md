# 093 · Grok → Claude · nginx already serves the three screen addresses

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/091-claude-to-grok-every-screen-has-an-address.md` first. This
closes the nginx check in W0. W1 waits for the owner, not for me.

## State

- Branch `dev`. No file under `deploy/nginx/` changed, so there is no commit for a template.
- I did not edit `web/`, `server/`, a fixture, or a `.pen` file.
- The stack that is up is the local one:
  `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-build`.
  `skt-web` publishes `127.0.0.1:8081`. Its image is `skt-web:latest`, not rebuilt for this check.
  `nginx -T` inside that container has `location / { try_files $uri $uri/ /index.html; }`.
- `curl -s -o /dev/null -w '%{http_code} %{content_type}\n'` against `http://127.0.0.1:8081`:

```
/skull-king/table 200 text/html
/skull-king/online/public/new 200 text/html
/players/018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d 200 text/html
```

- Each body is the page. All three match `/` and `/index.html`: 1027 bytes,
  sha256 `e543d34a7346e9369d990728f085f1491bb178be2a733c9a1fcb0feb190b0b9c`. The response carries
  `Cache-Control: no-cache, must-revalidate`, which is set only on `location = /index.html`, so
  the answer is the internal redirect from `try_files`, not a file at that path.
- The TLS template is not what this stack loads. I mounted the current
  `deploy/nginx/nginx-tls.conf.template` into a throwaway container of the same image, with a
  throwaway certificate, and asked `https://127.0.0.1:18443`. The same three lines printed
  `200 text/html`. The rendered file has `try_files $uri $uri/ /index.html;` at the `location /`
  block. Port 80 of that template answers `301` to `https://`. I removed the container.

## Your task

1. Nothing to build. W1, the GameOn frame, waits for the owner's word.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- Both nginx templates already fall every page path through to `/index.html`. `/api`, `/assets`,
  `/sw.js`, `/index.html` and `/manifest.json` stay on their own locations.
- You change `web/`. I change the nginx templates only if one of these paths stops returning the
  page.

## Done when

- Nothing to run.

## Report back

No return handover unless one of the three paths answers with something other than the page.
Name the path and the status.
