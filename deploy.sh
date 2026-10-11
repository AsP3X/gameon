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
#   ./deploy.sh --setup          change the saved answers, or reset them
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
  REV=$'\033[7m'; REV_OFF=$'\033[27m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; NC=''
  REV=''; REV_OFF=''
fi

# 1 while the setup screen owns the terminal. Restoring twice is harmless.
SETUP_ALT=0
restore_screen() {
  [[ "$SETUP_ALT" == "1" ]] || return 0
  SETUP_ALT=0
  printf '\033[?1049l\033[?25h' 2>/dev/null || true
}

step() { printf '%s→ %s%s\n' "$CYAN" "$*" "$NC"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$*" "$NC"; }
warn() { printf '%sWARNING: %s%s\n' "$YELLOW" "$*" "$NC" >&2; }
die()  { restore_screen; printf '%sERROR: %s%s\n' "$RED" "$*" "$NC" >&2; exit 1; }

CURRENT_STAGE="startup"
on_error() {
  local rc=$? line="$1" cmd="$2" src="${3:-$0}"
  restore_screen
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
    ./deploy.sh --setup          Change the saved answers, then start
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

  ${BOLD}First start${NC} opens a setup screen when .env does not exist yet.
  ${BOLD}./deploy.sh --setup${NC} opens it again. The fields start as they are now.
  Arrows move. Enter changes the selected line. s saves and starts. r puts the
  answers back to the shipped defaults, and s writes them. q quits and writes
  nothing. Reset does not touch the database. While skt-postgres exists, the
  reach mode, the Postgres port and the database user, password and name cannot
  be changed: that would recreate the container and delete what it stores.
  A start without a terminal copies .env.example and does not ask.

  ${BOLD}Environment${NC} (.env, or the defaults in .env.example):
    PROXY_MODE          local | npm
    API_PORT WEB_PORT   host ports when PROXY_MODE=local
    POSTGRES_PORT       host port for Postgres
    SKT_PUBLIC_ORIGIN   site origin, when it is not localhost
    SKT_SECURE_COOKIE   1 when that origin is https
    POSTGRES_PASSWORD   database password
    SKT_TRUSTED_PROXIES extra proxy addresses, comma-separated
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

# A single KEY=value from a file. Empty when the file or the key is absent.
file_value() {
  local file="$1" key="$2" line
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

# A single KEY=value from .env. Empty when the file or the key is absent.
env_value() {
  file_value .env "$1"
}

# The answers the setup screen edits. Anything else in .env is left as it is.
SETUP_MODE="local"
SETUP_WEB="8081"
SETUP_API="8080"
SETUP_PGPORT="5432"
SETUP_ORIGIN=""
SETUP_SECURE=""
SETUP_PASSWORD="skt"
SETUP_PROXIES=""
SETUP_PGUSER="skt"
SETUP_PGDB="skt"
SETUP_PICK=0
# 1 when skt-postgres already exists. Reach mode and the database answers stay.
SETUP_PG_LOCKED=0

load_setup_from() {
  local file="$1"
  SETUP_MODE="$(file_value "$file" PROXY_MODE)"
  SETUP_MODE="${SETUP_MODE:-local}"
  SETUP_WEB="$(file_value "$file" WEB_PORT)"
  SETUP_WEB="${SETUP_WEB:-8081}"
  SETUP_API="$(file_value "$file" API_PORT)"
  SETUP_API="${SETUP_API:-8080}"
  SETUP_PGPORT="$(file_value "$file" POSTGRES_PORT)"
  SETUP_PGPORT="${SETUP_PGPORT:-5432}"
  SETUP_ORIGIN="$(file_value "$file" SKT_PUBLIC_ORIGIN)"
  SETUP_SECURE="$(file_value "$file" SKT_SECURE_COOKIE)"
  SETUP_PASSWORD="$(file_value "$file" POSTGRES_PASSWORD)"
  SETUP_PASSWORD="${SETUP_PASSWORD:-skt}"
  SETUP_PROXIES="$(file_value "$file" SKT_TRUSTED_PROXIES)"
  SETUP_PGUSER="$(file_value "$file" POSTGRES_USER)"
  SETUP_PGUSER="${SETUP_PGUSER:-skt}"
  SETUP_PGDB="$(file_value "$file" POSTGRES_DB)"
  SETUP_PGDB="${SETUP_PGDB:-skt}"
}

setup_blank() {
  [[ -n "$SETUP_ORIGIN" ]] || SETUP_ORIGIN="(this machine)"
  [[ -n "$SETUP_PROXIES" ]] || SETUP_PROXIES="(Docker bridge)"
}

setup_real() {
  # `if`, not `&&`. A failing test under `set -e` would abort a save.
  if [[ "$SETUP_ORIGIN" == "(this machine)" ]]; then
    SETUP_ORIGIN=""
  fi
  if [[ "$SETUP_PROXIES" == "(Docker bridge)" ]]; then
    SETUP_PROXIES=""
  fi
}

valid_port() {
  local port="$1"
  # Leading zeros are rejected. Bash would read 08 as an octal and abort the script.
  [[ "$port" =~ ^[1-9][0-9]*$ ]] || return 1
  (( port >= 1 && port <= 65535 ))
}

valid_origin() {
  local origin="$1"
  [[ -z "$origin" || "$origin" =~ ^https?://[^/[:space:]]+$ ]]
}

valid_password() {
  local password="$1" i=0 char
  # The password is placed in DATABASE_URL and in a .env line. These characters
  # would split the URL or be expanded by a shell that sources the file.
  [[ -n "$password" && ${#password} -le 128 ]] || return 1
  while (( i < ${#password} )); do
    char="${password:i:1}"
    case "$char" in
      ' '|@|:|'/'|'?'|'#'|'$'|'"'|"'"|'`'|\\) return 1 ;;
    esac
    i=$((i + 1))
  done
}

setup_check() {
  setup_real
  case "$SETUP_MODE" in
    local|npm) ;;
    *) printf 'Reach it with "local" or "npm".\n' >&2; return 1 ;;
  esac
  valid_port "$SETUP_WEB" || { printf 'The web port is not a tcp port.\n' >&2; return 1; }
  valid_port "$SETUP_API" || { printf 'The API port is not a tcp port.\n' >&2; return 1; }
  valid_port "$SETUP_PGPORT" || { printf 'The Postgres port is not a tcp port.\n' >&2; return 1; }
  if [[ "$SETUP_WEB" == "$SETUP_API" || "$SETUP_WEB" == "$SETUP_PGPORT" || "$SETUP_API" == "$SETUP_PGPORT" ]]; then
    printf 'The web, API and Postgres ports have to be different.\n' >&2
    return 1
  fi
  valid_origin "$SETUP_ORIGIN" || {
    printf 'The public origin looks like https://tavern.example with no path.\n' >&2
    return 1
  }
  valid_password "$SETUP_PASSWORD" || {
    printf 'The database password cannot contain spaces, quotes or @ : / ? # $ \\ \n' >&2
    return 1
  }
  [[ "$SETUP_SECURE" == "" || "$SETUP_SECURE" == "1" ]] || {
    printf 'The secure cookie is on or off.\n' >&2
    return 1
  }
  setup_blank
}

# Replace every KEY= line, or append one. Duplicate keys collapse to the first.
# A bash loop, because awk -v treats backslashes in the value as escapes.
set_key() {
  local key="$1" value="$2" file="$3" tmp line found=0
  tmp="$(mktemp)"
  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == "${key}="* ]]; then
        if [[ "$found" -eq 0 ]]; then
          printf '%s=%s\n' "$key" "$value"
          found=1
        fi
      else
        printf '%s\n' "$line"
      fi
    done < "$file" > "$tmp"
  fi
  if [[ "$found" -eq 0 ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$file"
}

write_setup() {
  setup_real
  [[ -f .env ]] || cp .env.example .env
  set_key PROXY_MODE "$SETUP_MODE" .env
  set_key WEB_PORT "$SETUP_WEB" .env
  set_key API_PORT "$SETUP_API" .env
  set_key POSTGRES_PORT "$SETUP_PGPORT" .env
  set_key SKT_PUBLIC_ORIGIN "$SETUP_ORIGIN" .env
  set_key SKT_SECURE_COOKIE "$SETUP_SECURE" .env
  set_key POSTGRES_PASSWORD "$SETUP_PASSWORD" .env
  set_key POSTGRES_USER "$SETUP_PGUSER" .env
  set_key POSTGRES_DB "$SETUP_PGDB" .env
  set_key SKT_TRUSTED_PROXIES "$SETUP_PROXIES" .env
  set_key DATABASE_URL "postgres://${SETUP_PGUSER}:${SETUP_PASSWORD}@127.0.0.1:${SETUP_PGPORT}/${SETUP_PGDB}" .env
  setup_blank
}

setup_row() {
  local index="$1" text="$2"
  if (( index == SETUP_PICK )); then
    if [[ -n "$REV" ]]; then
      printf '  %s %s %s\n' "$REV" "$text" "$REV_OFF"
    else
      printf '  > %s\n' "$text"
    fi
  else
    printf '    %s\n' "$text"
  fi
}

setup_draw() {
  local reach cookie proxies origin
  printf '\033[H\033[2J'
  printf '%sSkull King Tavern — setup%s\n\n' "$BOLD" "$NC"
  if [[ "$SETUP_MODE" == "npm" ]]; then
    reach="Nginx Proxy Manager    http://skt-web:80"
  else
    reach="This machine            http://localhost:${SETUP_WEB}"
  fi
  if [[ "$SETUP_SECURE" == "1" ]]; then
    cookie="on"
  else
    cookie="off"
  fi
  origin="$SETUP_ORIGIN"
  proxies="$SETUP_PROXIES"
  printf '  How players reach the tavern\n'
  setup_row 0 "$reach"
  printf '\n  Settings\n'
  setup_row 1 "Web port              ${SETUP_WEB}"
  setup_row 2 "API port              ${SETUP_API}"
  setup_row 3 "Postgres port         ${SETUP_PGPORT}"
  setup_row 4 "Public origin         ${origin}"
  setup_row 5 "Secure cookie         ${cookie}"
  setup_row 6 "Database password     ${SETUP_PASSWORD}"
  setup_row 7 "Trusted proxies       ${proxies}"
  printf '\n'
  if [[ "$SETUP_MODE" == "npm" ]]; then
    printf '  %sPorts are kept for a later local start. The proxy publishes none.%s\n' "$DIM" "$NC"
    printf '  %sPoint Nginx Proxy Manager at skt-web port 80 and turn websockets on.%s\n' "$DIM" "$NC"
  else
    printf '  %sThe page is the only address the browser needs.%s\n' "$DIM" "$NC"
  fi
  if [[ "$SETUP_ORIGIN" == https:* && "$SETUP_SECURE" != "1" ]]; then
    printf '  %sThis origin is https. Turn the secure cookie on.%s\n' "$YELLOW" "$NC"
  fi
  if [[ "$SETUP_PG_LOCKED" == "1" ]]; then
    printf '  %sThe database is already in skt-postgres. Reach mode, its port and its password stay.%s\n' "$DIM" "$NC"
  fi
  printf '\n  %s↑↓ move    enter change    s save and start    r reset answers    q quit%s\n' "$DIM" "$NC"
  printf '  %sOn a text line, enter keeps the shown value. Type - to clear the origin or the proxies.%s\n' "$DIM" "$NC"
}

# Sets SETUP_ACTION from one key. Arrow keys are escape, then [A or [B.
setup_key() {
  local key rest
  IFS= read -rsn1 key || key="q"
  if [[ "$key" == $'\x1b' ]]; then
    rest=""
    # Keep whatever arrived. A timeout must not wipe a sequence that was read.
    IFS= read -rsn2 -t 1 rest || true
    case "$rest" in
      '[A') SETUP_ACTION="up" ;;
      '[B') SETUP_ACTION="down" ;;
      *) SETUP_ACTION="stay" ;;
    esac
    return 0
  fi
  case "$key" in
    k|K) SETUP_ACTION="up" ;;
    j|J) SETUP_ACTION="down" ;;
    ''|$'\r') SETUP_ACTION="enter" ;;
    s|S) SETUP_ACTION="save" ;;
    r|R) SETUP_ACTION="reset" ;;
    q|Q) SETUP_ACTION="quit" ;;
    *) SETUP_ACTION="stay" ;;
  esac
}

# Sets SETUP_ENTERED. An empty enter keeps the value the form is showing.
setup_edit() {
  local current="$1" entered hint="$2"
  printf '\033[?25h'
  printf '\n  %sNew value%s [%s]%s: ' "$BOLD" "$NC" "$current" "$hint"
  IFS= read -r entered || entered=""
  printf '\033[?25l'
  if [[ -n "$entered" ]]; then
    SETUP_ENTERED="$entered"
  else
    SETUP_ENTERED="$current"
  fi
}

setup_reset() {
  local answer
  printf '\033[?25h'
  printf '\n  Reset every answer to the defaults shipped with the repo?\n'
  printf '  The database is not touched. [y/N] '
  IFS= read -r answer || answer=""
  printf '\033[?25l'
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

# skt-postgres has no volume. Recreating it deletes accounts and games.
postgres_container_exists() {
  local names
  names="$(docker ps -a --format '{{.Names}}' 2>/dev/null || true)"
  printf '%s\n' "$names" | grep -qx 'skt-postgres'
}

# Put reach mode and the database answers back when changing them would recreate
# skt-postgres. Returns 1 when it had to put something back.
guard_postgres() {
  local prev_mode prev_port prev_user prev_pass prev_db
  postgres_container_exists || return 0
  if [[ ! -f .env ]]; then
    printf 'skt-postgres already exists, and there is no .env to compare with. Nothing was written.\n' >&2
    return 1
  fi
  prev_mode="$(file_value .env PROXY_MODE)"
  prev_mode="${prev_mode:-local}"
  prev_port="$(file_value .env POSTGRES_PORT)"
  prev_port="${prev_port:-5432}"
  prev_user="$(file_value .env POSTGRES_USER)"
  prev_user="${prev_user:-skt}"
  prev_pass="$(file_value .env POSTGRES_PASSWORD)"
  prev_pass="${prev_pass:-skt}"
  prev_db="$(file_value .env POSTGRES_DB)"
  prev_db="${prev_db:-skt}"
  if [[ "$SETUP_MODE" == "$prev_mode" && "$SETUP_PGPORT" == "$prev_port" \
     && "$SETUP_PGUSER" == "$prev_user" && "$SETUP_PASSWORD" == "$prev_pass" \
     && "$SETUP_PGDB" == "$prev_db" ]]; then
    return 0
  fi
  SETUP_MODE="$prev_mode"
  SETUP_PGPORT="$prev_port"
  SETUP_PGUSER="$prev_user"
  SETUP_PASSWORD="$prev_pass"
  SETUP_PGDB="$prev_db"
  printf 'skt-postgres already exists. Changing how players reach the tavern, the Postgres port, or the database user, password or name would recreate that container and delete the accounts and games in it. Those answers were put back. Nothing was written.\n' >&2
  return 1
}

# "-" clears an optional field. Anything else, including an unchanged value, is kept.
apply_optional() {
  local entered="$1" blank="$2"
  if [[ "$entered" == "-" ]]; then
    printf '%s' "$blank"
  else
    printf '%s' "$entered"
  fi
}

run_setup() {
  [[ -t 0 && -t 1 ]] || die "Setup needs a terminal. Copy .env.example to .env to skip it."
  if [[ -f .env ]]; then
    load_setup_from .env
  else
    load_setup_from .env.example
  fi
  setup_blank
  if postgres_container_exists; then
    SETUP_PG_LOCKED=1
  else
    SETUP_PG_LOCKED=0
  fi
  SETUP_ALT=1
  printf '\033[?1049h\033[H\033[2J\033[?25l'
  while true; do
    setup_draw
    setup_key
    case "$SETUP_ACTION" in
      up) SETUP_PICK=$(( (SETUP_PICK + 7) % 8 )) ;;
      down) SETUP_PICK=$(( (SETUP_PICK + 1) % 8 )) ;;
      enter)
        case "$SETUP_PICK" in
          0)
            if [[ "$SETUP_MODE" == "local" ]]; then SETUP_MODE="npm"; else SETUP_MODE="local"; fi
            ;;
          5)
            if [[ "$SETUP_SECURE" == "1" ]]; then SETUP_SECURE=""; else SETUP_SECURE="1"; fi
            ;;
          1)
            setup_edit "$SETUP_WEB" ""
            SETUP_WEB="$SETUP_ENTERED"
            ;;
          2)
            setup_edit "$SETUP_API" ""
            SETUP_API="$SETUP_ENTERED"
            ;;
          3)
            setup_edit "$SETUP_PGPORT" ""
            SETUP_PGPORT="$SETUP_ENTERED"
            ;;
          4)
            setup_edit "$SETUP_ORIGIN" "  (- clears)"
            SETUP_ORIGIN="$(apply_optional "$SETUP_ENTERED" "(this machine)")"
            ;;
          6)
            setup_edit "$SETUP_PASSWORD" ""
            SETUP_PASSWORD="$SETUP_ENTERED"
            ;;
          7)
            setup_edit "$SETUP_PROXIES" "  (- clears)"
            SETUP_PROXIES="$(apply_optional "$SETUP_ENTERED" "(Docker bridge)")"
            ;;
        esac
        ;;
      save)
        if setup_check && guard_postgres; then
          write_setup
          restore_screen
          ok "Saved .env"
          return 0
        fi
        printf '\n  Press enter to go back.'
        IFS= read -r _ || true
        setup_blank
        ;;
      reset)
        if setup_reset; then
          load_setup_from .env.example
          setup_blank
        fi
        ;;
      quit)
        restore_screen
        printf 'Setup cancelled. Nothing was written.\n'
        exit 0
        ;;
    esac
  done
}

run_setup_first() {
  if [[ -t 0 && -t 1 ]]; then
    run_setup
  else
    cp .env.example .env
    ok "Wrote .env from .env.example"
  fi
}

load_env() {
  # Only a real start creates .env. Status and logs must not, or the first
  # terminal start would miss the setup screen.
  if [[ ! -f .env && ( "$CMD" == "up" || "$CMD" == "rebuild" ) ]]; then
    run_setup_first
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
    --setup|setup)           set_cmd setup ;;
    --up|up)                 set_cmd up ;;
    --)                      shift; PASSTHRU+=("$@"); break ;;
    -*)                      die "unknown option: $1
  Valid: --status --ps --logs --restart --rebuild --down --backup --setup --help" ;;
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
# --setup writes .env from the screen, then continues as a normal start so the
# new ports and the proxy mode are the ones that come up.
if [[ "$CMD" == "setup" ]]; then
  run_setup
  CMD="up"
fi
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
