# The page. Vite builds the client; nginx serves it and proxies /api to the server.
# Audio is not compressed: the menu track is an MP3, fetched whole by the page.

FROM node:24-alpine AS builder

WORKDIR /app

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM nginx:1.28-alpine

RUN apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/nginx-http-map.conf /etc/nginx/conf.d/00-http-map.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY deploy/nginx/api-proxy.conf /etc/nginx/api-proxy.conf

# The nginx image substitutes only environment variables that are set.
# skt-api, not the service name api: that short name is shared on proxy-network.
ENV API_UPSTREAM=http://skt-api:8080
ENV OCHO_UPSTREAM=http://ocho:8091
# notice matches the nginx image. Compose sets this from the Logging dialog.
ENV NGINX_LOG_LEVEL=notice

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
