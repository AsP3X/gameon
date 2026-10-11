#!/usr/bin/env bash
# One-command deploy for the Skull King Tavern API + web client.
# Docker Compose v2 and bash 3.2 (stock macOS). No Make.
#
#   ./deploy.sh                  start, or rebuild changed images and start
#   ./deploy.sh --status         URLs and the container table
#   ./deploy.sh --ps             container table
#   ./deploy.sh --logs [svc...]  follow logs
#   ./deploy.sh --restart [svc]  restart
#   ./deploy.sh --rebuild        rebuild images, then start
#   ./deploy.sh --down           stop the stack
#   ./deploy.sh --backup         dump Postgres to backups/
#   ./deploy.sh --help

set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")" || {
  echo "ERROR: cannot enter the repository directory." >&2
  exit 1
}
REPO_ROOT="$(pwd)"

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; CYAN=$'\033[0;36m'; NC=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; NC=''
fi

step() { printf '%s→ %s%s\n' "$CYAN" "$*" "$NC"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$*" "$NC"; }
warn() { printf '%sWARNING: %s%s\n' "$YELLOW" "$*" "$NC" >&2; }
die()  { printf '%sERROR: %s%s\n' "$RED" "$*" "$NC" >&2; exit 1; }

CURRENT_STAGE="startup"
on_error() {
  local rc=$? line="$1" cmd="$2" src="${3:-$0}"
  printf '\n%sFailed during: %s%s (exit %s)\n' "$RED$BOLD" "$CURRENT_STAGE" "$NC" "$rc" >&2
  printf '  Command: %s%s%s\n' "$DIM" "$cmd" "$NC" >&2
  printf '  At:      %s%s:%s%s\n' "$DIM" "${src#./}" "$line" "$NC" >&2
  printf '  Inspect:  %s./deploy.sh --ps%s\n' "$DIM" "$NC" >&2
  printf '  Logs:     %s./deploy.sh --logs%s\n' "$DIM" "$NC" >&2
  exit "$rc"
}
trap 'on_error "$LINENO" "$BASH_COMMAND" "${BASH_SOURCE[0]}"' ERR

show_help() {
  cat <<EOF

  ${BOLD}Skull King Tavern — API + web client (Docker)${NC}

  ${BOLD}Usage:${NC}
    ./deploy.sh                  Start, or rebuild what changed and start
    ./deploy.sh --status         Show URLs and container status
    ./deploy.sh --ps             Container table only
    ./deploy.sh --logs [svc...]  Follow logs (all, or named services)
    ./deploy.sh --restart [svc]  Restart all services, or the named ones
    ./deploy.sh --rebuild        Rebuild images, then start
    ./deploy.sh --down           Stop and remove the containers
    ./deploy.sh --backup         Write a Postgres dump to backups/
    ./deploy.sh --help           This help

  ${BOLD}Service names${NC} (for --logs / --restart):
    api  web

  ${BOLD}After deploy${NC} (PROXY_MODE=local):
    Web:  http://localhost:\${WEB_PORT:-8081}
    API:  http://localhost:\${API_PORT:-8080}/api/v1/health

  The page proxies /api, including the socket, so the browser talks to one origin.
  Running games are written to Postgres as they are played and replayed after a restart.
  ./deploy.sh --backup writes a dump. --down removes containers and does not delete that dump.
  Docker stop sends SIGTERM. The API finishes writing open games, then exits.

  ${BOLD}Environment${NC} (.env, or the defaults in .env.example):
    PROXY_MODE          local | npm
    API_PORT WEB_PORT   host ports when PROXY_MODE=local
    SKT_PUBLIC_ORIGIN   site origin, when it is not localhost
    SKT_SECURE_COOKIE   1 when that origin is https
    RUST_LOG            API log level
    NO_COLOR            disable coloured output

  ${BOLD}Nginx Proxy Manager${NC} (PROXY_MODE=npm, no host ports):
    docker network create proxy-network
    Point a proxy host at http://skt-web:80 and set SKT_PUBLIC_ORIGIN.

EOF
}

require_docker() {
  command -v docker >/dev/null 2>&1 ||
    die "Docker is not installed or not on PATH. See https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 ||
    die "Docker Compose v2 is required (the 'docker compose' subcommand, not 'docker-compose')."
  local err detail
  if ! err="$(docker info --format '{{.ServerVersion}}' 2>&1)"; then
    detail="$(printf '%s\n' "$err" | grep -v '^[[:space:]]*$' | tail -1 || true)"
    if grep -qi 'permission denied' <<<"$err"; then
      printf '%sERROR: cannot talk to the Docker daemon (permission denied).%s\n' "$RED" "$NC" >&2
      printf '  Add yourself to the docker group, then log out and back in:\n' >&2
      printf '    %ssudo usermod -aG docker "$USER"%s\n' "$DIM" "$NC" >&2
      exit 1
    fi
    printf '%sERROR: the Docker daemon is not reachable.%s\n' "$RED" "$NC" >&2
    printf '  Start it first — Docker Desktop, or: %ssudo systemctl start docker%s\n' "$DIM" "$NC" >&2
    printf '  Docker said: %s%s%s\n' "$DIM" "$detail" "$NC" >&2
    exit 1
  fi
}

require_files() {
  local missing=() f
  for f in \
    docker-compose.yml \
    docker-compose.local.yml \
    docker-compose.npm.yml \
    .env.example \
    server/Dockerfile \
    deploy/web/Dockerfile \
    deploy/nginx/nginx.conf.template
  do
    [[ -f "$f" ]] || missing+=("$f")
  done
  if (( ${#missing[@]} )); then
    die "incomplete checkout — missing: ${missing[*]}
  Run ./deploy.sh from the repository root (currently: $REPO_ROOT)."
  fi
}

# A single KEY=value from .env. Empty when the file or the key is absent.
# Does not export the rest of the file.
env_value() {
  local key="$1" line
  [[ -f .env ]] || return 0
  line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

load_env() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    ok "Wrote .env from .env.example"
  fi
  PROXY_MODE="$(env_value PROXY_MODE)"
  PROXY_MODE="${PROXY_MODE:-local}"
  API_PORT="$(env_value API_PORT)"
  API_PORT="${API_PORT:-8080}"
  WEB_PORT="$(env_value WEB_PORT)"
  WEB_PORT="${WEB_PORT:-8081}"
  export PROXY_MODE API_PORT WEB_PORT
  case "$PROXY_MODE" in
    local|npm) ;;
    *) die "PROXY_MODE must be local or npm (got '$PROXY_MODE')." ;;
  esac
}

compose() {
  local files=(-f docker-compose.yml)
  if [[ "$PROXY_MODE" == "npm" ]]; then
    files+=(-f docker-compose.npm.yml)
  else
    files+=(-f docker-compose.local.yml)
  fi
  docker compose "${files[@]}" "$@"
}

require_proxy_network() {
  [[ "$PROXY_MODE" == "npm" ]] || return 0
  docker network inspect proxy-network >/dev/null 2>&1 ||
    die "proxy-network does not exist. Create it once: docker network create proxy-network"
}

show_status() {
  local web_url api_url
  echo ""
  if [[ "$PROXY_MODE" == "npm" ]]; then
    web_url="http://skt-web:80"
    api_url="http://skt-api:8080/api/v1"
    echo "  Mode:  npm (no host ports; TLS is the proxy's job)"
  else
    web_url="http://localhost:${WEB_PORT}"
    api_url="http://localhost:${API_PORT}/api/v1"
    echo "  Mode:  local"
  fi
  local origin
  origin="$(env_value SKT_PUBLIC_ORIGIN)"
  if [[ -n "$origin" ]]; then
    echo "  Origin: ${origin}"
  fi
  echo "  Web:   ${web_url}"
  echo "  API:   ${api_url}"
  echo ""
  compose ps
}

CMD=""
PASSTHRU=()
set_cmd() {
  [[ -z "$CMD" || "$CMD" == "$1" ]] ||
    die "only one command at a time (got '$CMD' and '$1'). See ./deploy.sh --help"
  CMD="$1"
}

while (( $# )); do
  case "$1" in
    -h|--help|help)          set_cmd help ;;
    --status|status)         set_cmd status ;;
    --ps|ps)                 set_cmd ps ;;
    --logs|logs)             set_cmd logs ;;
    --restart|restart)       set_cmd restart ;;
    --rebuild|rebuild)       set_cmd rebuild ;;
    --down|down|--stop|stop) set_cmd down ;;
    --backup|backup)         set_cmd backup ;;
    --up|up)                 set_cmd up ;;
    --)                      shift; PASSTHRU+=("$@"); break ;;
    -*)                      die "unknown option: $1
  Valid: --status --ps --logs --restart --rebuild --down --backup --help" ;;
    *)                       PASSTHRU+=("$1") ;;
  esac
  shift
done
CMD="${CMD:-up}"

case "$CMD" in
  logs|restart) ;;
  help) show_help; exit 0 ;;
  *)
    if (( ${#PASSTHRU[@]} )); then
      die "unexpected argument: ${PASSTHRU[*]}
  Only --logs and --restart accept service names. See ./deploy.sh --help"
    fi
    ;;
esac

CURRENT_STAGE="preflight"
require_files
require_docker
load_env

CURRENT_STAGE="$CMD"
case "$CMD" in
  help) show_help; exit 0 ;;
  status) show_status; exit 0 ;;
  ps) compose ps; exit 0 ;;
  logs)
    step "Following logs (Ctrl-C to stop)…"
    trap - ERR
    compose logs -f --tail 200 ${PASSTHRU[@]+"${PASSTHRU[@]}"}
    exit 0
    ;;
  restart)
    step "Restarting ${PASSTHRU[*]:-all services}…"
    compose restart ${PASSTHRU[@]+"${PASSTHRU[@]}"}
    show_status
    exit 0
    ;;
  down)
    step "Stopping the stack…"
    compose down
    ok "Stopped. Running games stay in Postgres and are replayed on the next start."
    exit 0
    ;;
  backup)
    step "Dumping Postgres…"
    mkdir -p backups
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    out="backups/skt-${stamp}.sql"
    compose exec -T postgres pg_dump -U "${POSTGRES_USER:-skt}" "${POSTGRES_DB:-skt}" > "$out"
    ok "Wrote ${out}"
    exit 0
    ;;
esac

echo ""
echo "===================================================="
echo "  ${BOLD}Skull King Tavern — API + web client${NC}"
echo "===================================================="
echo ""

require_proxy_network

STARTED_AT=$SECONDS
CURRENT_STAGE="stack build/start"
if [[ "$CMD" == "rebuild" ]]; then
  step "Rebuilding images…"
  compose build --pull
fi
step "Starting…"
compose up -d --build --remove-orphans

ELAPSED=$(( SECONDS - STARTED_AT ))
echo ""
ok "Deploy finished in $(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s."
show_status
