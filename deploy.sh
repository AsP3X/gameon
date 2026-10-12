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
#   ./deploy.sh --down           stop the stack. The database stays.
#   ./deploy.sh --reset          delete the database and the saved setup
#   ./deploy.sh --down --volumes same factory reset
#   ./deploy.sh --backup         dump Postgres to backups/
#   ./deploy.sh --data-dir [p]   optional folder. Default storage is the named volume.
#   ./deploy.sh --named-volumes  the named volume skt_pg_data (the default)
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
    ./deploy.sh --down           Stop and remove the containers. The database stays.
    ./deploy.sh --reset          Factory reset: delete the database and the saved setup
    ./deploy.sh --down --volumes Same factory reset. The next start opens setup again.
    ./deploy.sh --backup         Write a Postgres dump to backups/
    ./deploy.sh --data-dir [path] Store Postgres in a folder (default ./data). Optional.
    ./deploy.sh --named-volumes  Store Postgres in the named volume again (the default)
    ./deploy.sh --migrate        Copy the database when changing where it is stored
    ./deploy.sh --setup          Change the saved answers, then start
    ./deploy.sh --help           This help

  ${BOLD}Service names${NC} (for --logs / --restart):
    api  web

  ${BOLD}After deploy${NC} (PROXY_MODE=local):
    Web:  http://localhost:\${WEB_PORT:-8081}
    API:  http://localhost:\${API_PORT:-8080}/api/v1/health

  The page proxies /api, including the socket, so the browser talks to one origin.
  Running games are written to Postgres as they are played and replayed after a restart.
  The database is the named volume skt_pg_data. A data folder is optional: --data-dir ./data
  stores it in that folder instead, and --named-volumes goes back. --down removes containers
  and keeps the database and the saved setup. --reset deletes the database and .env after you
  type reset, so the next ./deploy.sh opens setup again. --backup writes a dump.
  Docker stop sends SIGTERM. The API finishes writing open games, then exits.

  ${BOLD}First start${NC} opens a setup screen when .env does not exist yet.
  ${BOLD}./deploy.sh --reset${NC} removes .env, so the next start opens that screen again.
  ${BOLD}./deploy.sh --setup${NC} opens it again. The fields start as they are now.
  Up and down move. Left and right switch Storage between the named volume and a
  data folder. Enter on This machine or NPM selects how players reach the tavern.
  Enter on a setting changes it. s saves and starts. r puts the answers back to
  the shipped defaults, and s writes them. q quits and writes nothing. The r key
  does not touch the database. Storage is optional: left keeps the named volume
  skt_pg_data, right uses ./data, and enter on that line edits the path.
  While the database is only inside the skt-postgres container, the reach mode, the
  Postgres port and the database user, password and name cannot be changed: that
  would recreate the container and delete what it stores. On the named volume or in
  a data folder, reach mode and host ports can change and the data stays. The user,
  password and database name still stay, because Postgres applies them only when the
  data directory is first created.
  A start without a terminal copies .env.example and does not ask.

  ${BOLD}Environment${NC} (.env, or the defaults in .env.example):
    PROXY_MODE          local | npm
    API_PORT WEB_PORT   host ports when PROXY_MODE=local. NPM does not use them.
    POSTGRES_PORT       host port for Postgres when PROXY_MODE=local. NPM does not use it.
    SKT_PUBLIC_ORIGIN   site origin, when it is not localhost
    SKT_SECURE_COOKIE   1 when that origin is https
    POSTGRES_PASSWORD   database password
    SKT_TRUSTED_PROXIES extra proxy addresses, comma-separated
    SKT_DATA_DIR        optional data folder. Unset means the named volume.
    RUST_LOG            API log level
    NO_COLOR            disable coloured output

  ${BOLD}NPM${NC} (PROXY_MODE=npm, no host ports), the same choice as the setup screen:
    Nginx Proxy Manager talks to the containers on the Docker network, so no
    published host port is required and the setup does not ask for one.
    The stack joins the external proxy-network. ./deploy.sh creates that network
    when it is missing. Point Nginx Proxy Manager at http://skt-web:80, turn
    websockets on, and set SKT_PUBLIC_ORIGIN.

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
    docker-compose.data-dir.yml \
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

# local, or npm. external and proxy are the same choice as npm.
canon_proxy_mode() {
  local mode
  mode="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$mode" in
    ""|local) printf 'local' ;;
    npm|external|proxy) printf 'npm' ;;
    *) printf '%s' "$mode" ;;
  esac
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
SETUP_DATA=""
# Last folder path chosen on the setup screen, so left/right can return to it.
SETUP_DATA_HELD=""
SETUP_PGUSER="skt"
SETUP_PGDB="skt"
SETUP_PICK=0
# 1 when skt-postgres already exists. Reach mode and the database answers stay.
SETUP_PG_LOCKED=0

load_setup_from() {
  local file="$1"
  SETUP_MODE="$(canon_proxy_mode "$(file_value "$file" PROXY_MODE)")"
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
  SETUP_DATA="$(file_value "$file" SKT_DATA_DIR)"
  SETUP_DATA_HELD="$SETUP_DATA"
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
  # NPM reaches skt-web and skt-api by container name. A published host port is
  # not required, and the setup does not ask for one. The stored ports stay in
  # .env for a later local start, where they are checked.
  if [[ "$SETUP_MODE" == "local" ]]; then
    valid_port "$SETUP_WEB" || { printf 'The web port is not a tcp port.\n' >&2; return 1; }
    valid_port "$SETUP_API" || { printf 'The API port is not a tcp port.\n' >&2; return 1; }
    valid_port "$SETUP_PGPORT" || { printf 'The Postgres port is not a tcp port.\n' >&2; return 1; }
    if [[ "$SETUP_WEB" == "$SETUP_API" || "$SETUP_WEB" == "$SETUP_PGPORT" || "$SETUP_API" == "$SETUP_PGPORT" ]]; then
      printf 'The web, API and Postgres ports have to be different.\n' >&2
      return 1
    fi
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
  valid_data_dir "$SETUP_DATA" || {
    printf 'The data folder is optional. Leave it empty for the named volume. A path cannot contain $ " '\'' \\ # or be / itself.\n' >&2
    return 1
  }
  setup_blank
}

# Empty is the named volume. A set path is optional folder storage.
valid_data_dir() {
  local dir="$1"
  [[ -z "$dir" ]] && return 0
  case "$dir" in
    *[\$\"\'\\\#]*|*$'\n'*|/) return 1 ;;
  esac
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

# Drop every KEY= line. Used when the data folder is cleared back to the named volume.
unset_key() {
  local key="$1" file="$2" tmp line
  [[ -f "$file" ]] || return 0
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" == "${key}="* ]] || printf '%s\n' "$line"
  done < "$file" > "$tmp"
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
  if [[ -n "$SETUP_DATA" ]]; then
    set_key SKT_DATA_DIR "$SETUP_DATA" .env
  else
    unset_key SKT_DATA_DIR .env
  fi
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

# A reach line. * marks the mode that will be saved. The cursor is separate.
setup_reach() {
  local index="$1" mode="$2" text="$3" mark=" "
  if [[ "$SETUP_MODE" == "$mode" ]]; then
    mark="*"
  fi
  setup_row "$index" "${mark} ${text}"
}

# Cursor order. Host ports are only for This machine. NPM talks to the
# containers on the Docker network and publishes nothing, so those rows are absent.
setup_fields() {
  printf '%s\n' reach-local reach-npm
  if [[ "$SETUP_MODE" != "npm" ]]; then
    printf '%s\n' web api pg
  fi
  printf '%s\n' origin cookie password proxies data
}

setup_field_count() {
  local n=0
  while IFS= read -r _; do
    n=$((n + 1))
  done < <(setup_fields)
  printf '%s' "$n"
}

setup_field_at() {
  local i=0 line
  while IFS= read -r line; do
    if (( i == SETUP_PICK )); then
      printf '%s' "$line"
      return 0
    fi
    i=$((i + 1))
  done < <(setup_fields)
}

setup_clamp_pick() {
  local n
  n="$(setup_field_count)"
  if (( SETUP_PICK >= n )); then
    SETUP_PICK=$((n - 1))
  fi
}

setup_draw() {
  local cookie proxies origin i=0 field settings=0
  setup_clamp_pick
  printf '\033[H\033[2J'
  printf '%sSkull King Tavern — setup%s\n\n' "$BOLD" "$NC"
  if [[ "$SETUP_SECURE" == "1" ]]; then
    cookie="on"
  else
    cookie="off"
  fi
  origin="$SETUP_ORIGIN"
  proxies="$SETUP_PROXIES"
  printf '  How players reach the tavern\n'
  while IFS= read -r field; do
    case "$field" in
      reach-local|reach-npm) ;;
      *)
        if (( settings == 0 )); then
          printf '\n  Settings\n'
          settings=1
        fi
        ;;
    esac
    case "$field" in
      reach-local) setup_reach "$i" local "This machine            http://localhost:${SETUP_WEB}" ;;
      reach-npm) setup_reach "$i" npm "NPM                     http://skt-web:80" ;;
      web) setup_row "$i" "Web port              ${SETUP_WEB}" ;;
      api) setup_row "$i" "API port              ${SETUP_API}" ;;
      pg) setup_row "$i" "Postgres port         ${SETUP_PGPORT}" ;;
      origin) setup_row "$i" "Public origin         ${origin}" ;;
      cookie) setup_row "$i" "Secure cookie         ${cookie}" ;;
      password) setup_row "$i" "Database password     ${SETUP_PASSWORD}" ;;
      proxies) setup_row "$i" "Trusted proxies       ${proxies}" ;;
      data)
        if [[ -n "$SETUP_DATA" ]]; then
          setup_row "$i" "Storage               < ${SETUP_DATA} >"
        else
          setup_row "$i" "Storage               < named volume >"
        fi
        ;;
    esac
    i=$((i + 1))
  done < <(setup_fields)
  printf '\n'
  if [[ "$SETUP_MODE" == "npm" ]]; then
    printf '  %sNPM talks to skt-web and skt-api on the Docker network. No host port is published.%s\n' "$DIM" "$NC"
    printf '  %sPoint Nginx Proxy Manager at skt-web port 80 and turn websockets on.%s\n' "$DIM" "$NC"
  else
    printf '  %sThe page is the only address the browser needs.%s\n' "$DIM" "$NC"
  fi
  printf '  %sLeft and right switch Storage between the named volume and a data folder.%s\n' "$DIM" "$NC"
  if [[ "$SETUP_ORIGIN" == https:* && "$SETUP_SECURE" != "1" ]]; then
    printf '  %sThis origin is https. Turn the secure cookie on.%s\n' "$YELLOW" "$NC"
  fi
  if [[ "$SETUP_PG_LOCKED" == "1" ]]; then
    printf '  %sThe database already exists. Its user, password and name stay.%s\n' "$DIM" "$NC"
  fi
  printf '\n  %s↑↓ move    ←→ storage    enter select    s save and start    r reset answers    q quit%s\n' "$DIM" "$NC"
  printf '  %sOn Storage, left is the named volume and right is the data folder. Enter edits the path.%s\n' "$DIM" "$NC"
  printf '  %sOn a text line, enter keeps the shown value. Type - to clear the origin or the proxies.%s\n' "$DIM" "$NC"
}

# Sets SETUP_ACTION from one key. Arrow keys are escape, then [A [B [C or [D.
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
      '[C'|'OC') SETUP_ACTION="right" ;;
      '[D'|'OD') SETUP_ACTION="left" ;;
      *) SETUP_ACTION="stay" ;;
    esac
    return 0
  fi
  case "$key" in
    k|K) SETUP_ACTION="up" ;;
    j|J) SETUP_ACTION="down" ;;
    l|L) SETUP_ACTION="right" ;;
    h|H) SETUP_ACTION="left" ;;
    ''|$'\r') SETUP_ACTION="enter" ;;
    s|S) SETUP_ACTION="save" ;;
    r|R) SETUP_ACTION="reset" ;;
    q|Q) SETUP_ACTION="quit" ;;
    *) SETUP_ACTION="stay" ;;
  esac
}

# Left selects the named volume. Right selects a data folder. A path typed
# earlier is kept, so switching back does not replace it with ./data.
setup_storage_switch() {
  local way="$1"
  if [[ "$way" == "left" ]]; then
    if [[ -n "$SETUP_DATA" ]]; then
      SETUP_DATA_HELD="$SETUP_DATA"
    fi
    SETUP_DATA=""
    return 0
  fi
  if [[ -z "$SETUP_DATA" ]]; then
    SETUP_DATA="${SETUP_DATA_HELD:-./data}"
    SETUP_DATA_HELD="$SETUP_DATA"
  fi
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

# skt-postgres keeps accounts and games. A database that lives only inside the container
# is deleted when the container is recreated. A volume or a data folder is not.
postgres_container_exists() {
  local names
  names="$(docker ps -a --format '{{.Names}}' 2>/dev/null || true)"
  printf '%s\n' "$names" | grep -qx 'skt-postgres'
}

# "volume <name>" or "bind <path>". Empty when the container is absent, or when the
# database lives only in the container's own filesystem.
postgres_data_mount() {
  postgres_container_exists || return 0
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}} {{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}' skt-postgres 2>/dev/null || true
}

# Put answers back when writing them would destroy the database or change a password
# Postgres will ignore. Returns 1 when it had to put something back.
guard_postgres() {
  local prev_mode prev_port prev_user prev_pass prev_db mount
  postgres_container_exists || return 0
  if [[ ! -f .env ]]; then
    printf 'skt-postgres already exists, and there is no .env to compare with. Nothing was written.\n' >&2
    return 1
  fi
  prev_mode="$(canon_proxy_mode "$(file_value .env PROXY_MODE)")"
  prev_port="$(file_value .env POSTGRES_PORT)"
  prev_port="${prev_port:-5432}"
  prev_user="$(file_value .env POSTGRES_USER)"
  prev_user="${prev_user:-skt}"
  prev_pass="$(file_value .env POSTGRES_PASSWORD)"
  prev_pass="${prev_pass:-skt}"
  prev_db="$(file_value .env POSTGRES_DB)"
  prev_db="${prev_db:-skt}"
  mount="$(postgres_data_mount)"
  if [[ -n "$mount" ]]; then
    if [[ "$SETUP_PGUSER" == "$prev_user" && "$SETUP_PASSWORD" == "$prev_pass" \
       && "$SETUP_PGDB" == "$prev_db" ]]; then
      return 0
    fi
    SETUP_PGUSER="$prev_user"
    SETUP_PASSWORD="$prev_pass"
    SETUP_PGDB="$prev_db"
    printf 'skt-postgres already has a database. The user, password and database name were put back: Postgres applies them only when that data directory is first created. Nothing was written.\n' >&2
    return 1
  fi
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
  printf 'skt-postgres keeps the database inside the container. Changing how players reach the tavern, the Postgres port, or the database user, password or name would recreate that container and delete the accounts and games in it. Those answers were put back. Nothing was written.\n' >&2
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
      up)
        n="$(setup_field_count)"
        SETUP_PICK=$(( (SETUP_PICK + n - 1) % n ))
        ;;
      down)
        n="$(setup_field_count)"
        SETUP_PICK=$(( (SETUP_PICK + 1) % n ))
        ;;
      left|right)
        setup_storage_switch "$SETUP_ACTION"
        ;;
      enter)
        case "$(setup_field_at)" in
          reach-local) SETUP_MODE="local" ;;
          reach-npm) SETUP_MODE="npm" ;;
          cookie)
            if [[ "$SETUP_SECURE" == "1" ]]; then SETUP_SECURE=""; else SETUP_SECURE="1"; fi
            ;;
          web)
            setup_edit "$SETUP_WEB" ""
            SETUP_WEB="$SETUP_ENTERED"
            ;;
          api)
            setup_edit "$SETUP_API" ""
            SETUP_API="$SETUP_ENTERED"
            ;;
          pg)
            setup_edit "$SETUP_PGPORT" ""
            SETUP_PGPORT="$SETUP_ENTERED"
            ;;
          origin)
            setup_edit "$SETUP_ORIGIN" "  (- clears)"
            SETUP_ORIGIN="$(apply_optional "$SETUP_ENTERED" "(this machine)")"
            ;;
          password)
            setup_edit "$SETUP_PASSWORD" ""
            SETUP_PASSWORD="$SETUP_ENTERED"
            ;;
          proxies)
            setup_edit "$SETUP_PROXIES" "  (- clears)"
            SETUP_PROXIES="$(apply_optional "$SETUP_ENTERED" "(Docker bridge)")"
            ;;
          data)
            if [[ -n "$SETUP_DATA" ]]; then
              setup_edit "$SETUP_DATA" "  (- named volume)"
            else
              setup_edit "(named volume)" "  (path, or -)"
            fi
            if [[ "$SETUP_ENTERED" == "-" || "$SETUP_ENTERED" == "(named volume)" || "$SETUP_ENTERED" == "(named volumes)" ]]; then
              if [[ -n "$SETUP_DATA" ]]; then
                SETUP_DATA_HELD="$SETUP_DATA"
              fi
              SETUP_DATA=""
            else
              SETUP_DATA="$SETUP_ENTERED"
              SETUP_DATA_HELD="$SETUP_DATA"
            fi
            ;;
        esac
        setup_clamp_pick
        ;;
      save)
        if setup_check && guard_postgres && prepare_storage_change "$SETUP_DATA"; then
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
  PROXY_MODE="$(canon_proxy_mode "$(env_value PROXY_MODE)")"
  API_PORT="$(env_value API_PORT)"
  API_PORT="${API_PORT:-8080}"
  WEB_PORT="$(env_value WEB_PORT)"
  WEB_PORT="${WEB_PORT:-8081}"
  export PROXY_MODE API_PORT WEB_PORT
  case "$PROXY_MODE" in
    local|npm) ;;
    *) die "PROXY_MODE must be local or npm (got '$PROXY_MODE')." ;;
  esac
  load_data_dir
}

# Empty stays empty: the named volume skt_pg_data. A relative path is from the
# repository root, not the caller's directory. ~ is the home directory.
resolve_data_dir() {
  local dir="$1"
  [[ -n "$dir" ]] || return 0
  case "$dir" in
    "~") dir="$HOME" ;;
    "~/"*) dir="${HOME}/${dir:2}" ;;
    /*) ;;
    *) dir="${REPO_ROOT}/${dir#./}" ;;
  esac
  while [[ "$dir" == */ && "$dir" != / ]]; do
    dir="${dir%/}"
  done
  printf '%s' "$dir"
}

# Reads SKT_DATA_DIR from .env. Exports the absolute folder, or unsets it.
load_data_dir() {
  SKT_DATA_DIR="$(resolve_data_dir "$(env_value SKT_DATA_DIR)")"
  if [[ -n "$SKT_DATA_DIR" ]]; then
    export SKT_DATA_DIR
  else
    unset SKT_DATA_DIR
  fi
}

PG_VOLUME="skt_pg_data"

desired_data_mount() {
  if [[ -n "${SKT_DATA_DIR:-}" ]]; then
    printf 'bind %s/database' "$SKT_DATA_DIR"
  else
    printf 'volume %s' "$PG_VOLUME"
  fi
}

norm_mount() {
  local spec="$1" kind path
  kind="${spec%% *}"
  path="${spec#* }"
  if [[ "$kind" == "bind" ]]; then
    path="${path#/private}"
    printf 'bind %s' "$path"
  else
    printf '%s' "$spec"
  fi
}

mounts_match() {
  local current
  current="$(postgres_data_mount)"
  [[ -n "$current" ]] || return 1
  [[ "$(norm_mount "$current")" == "$(norm_mount "$(desired_data_mount)")" ]]
}

dir_has_data() {
  [[ -d "$1" ]] || return 1
  [[ -r "$1" && -x "$1" ]] || return 0
  [[ -n "$(ls -A "$1" 2>/dev/null)" ]]
}

desired_has_data() {
  if [[ -n "${SKT_DATA_DIR:-}" ]]; then
    dir_has_data "${SKT_DATA_DIR}/database"
  else
    docker volume inspect "$PG_VOLUME" >/dev/null 2>&1
  fi
}

make_data_dir() {
  [[ -n "${SKT_DATA_DIR:-}" ]] || return 0
  (umask 022 && mkdir -p "${SKT_DATA_DIR}/database") || {
    printf 'Cannot create %s/database.\n' "$SKT_DATA_DIR" >&2
    return 1
  }
}

data_where() {
  local mount
  mount="$(postgres_data_mount)"
  if postgres_container_exists && [[ -z "$mount" ]]; then
    printf 'inside the skt-postgres container'
    return 0
  fi
  if [[ -n "${SKT_DATA_DIR:-}" ]]; then
    printf 'the folder %s/database' "$SKT_DATA_DIR"
  else
    printf 'the Docker volume %s' "$PG_VOLUME"
  fi
}

switch_hint() {
  if [[ -n "${SKT_DATA_DIR:-}" ]]; then
    printf './deploy.sh --data-dir %s' "$SKT_DATA_DIR"
  else
    printf './deploy.sh --named-volumes'
  fi
}

confirm_yes() {
  local answer=""
  if [[ "${ASSUME_YES:-0}" -eq 1 ]]; then
    printf '%s [y/N]: y (--yes)\n' "$1"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    printf '%s\n' "$1" >&2
    printf 'There is no terminal to answer. Run it from one, or add --yes.\n' >&2
    return 1
  fi
  printf '%s [y/N]: ' "$1"
  IFS= read -r answer || true
  case "$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

# 0 when moving to the desired storage will not destroy a database.
# The caller has already pointed SKT_DATA_DIR at the destination.
storage_change_is_safe() {
  local current
  postgres_container_exists || return 0
  current="$(postgres_data_mount)"
  if [[ -z "$current" ]]; then
    if [[ "${MIGRATE:-0}" -eq 1 ]] && ! desired_has_data; then
      return 0
    fi
    if desired_has_data; then
      printf 'The container holds a database, and %s already has one. --migrate never overwrites data. Nothing was changed.\n' "$(desired_data_mount)" >&2
    else
      printf 'skt-postgres keeps the database inside the container. Starting on %s would delete it.\n' "$(desired_data_mount)" >&2
      printf 'Copy it, then start: %s --migrate\n' "$(switch_hint)" >&2
      printf 'Or delete it: ./deploy.sh --reset\n' >&2
      printf 'Nothing was changed.\n' >&2
    fi
    return 1
  fi
  mounts_match && return 0
  if desired_has_data; then
    printf 'The database in %s is left as it is. The next start uses %s, which already has data.\n' "$(norm_mount "$current")" "$(desired_data_mount)"
    return 0
  fi
  if [[ "${MIGRATE:-0}" -eq 1 ]]; then
    return 0
  fi
  printf 'The database is in %s, and %s is empty.\n' "$(norm_mount "$current")" "$(desired_data_mount)" >&2
  printf 'Switching now would start on an empty database. Nothing was changed.\n' >&2
  printf 'Copy it, then start: %s --migrate\n' "$(switch_hint)" >&2
  return 1
}

# $1 is the new SKT_DATA_DIR value as written in .env. Empty means the named volume.
# Does not write .env. Returns 1 when the switch is refused.
prepare_storage_change() {
  local new_raw="$1" old_raw new_resolved old_resolved rc
  old_raw="$(env_value SKT_DATA_DIR)"
  new_resolved="$(resolve_data_dir "$new_raw")"
  old_resolved="$(resolve_data_dir "$old_raw")"
  [[ "$new_resolved" != "$old_resolved" ]] || return 0
  if [[ "$new_resolved" == "/" ]]; then
    printf 'The data folder cannot be / itself.\n' >&2
    return 1
  fi
  if [[ -n "$new_resolved" ]]; then
    SKT_DATA_DIR="$new_resolved"
    export SKT_DATA_DIR
  else
    unset SKT_DATA_DIR
  fi
  rc=0
  storage_change_is_safe || rc=1
  load_data_dir
  return "$rc"
}

migrate_database() {
  local current src
  if desired_has_data; then
    printf 'The destination already has data. --migrate never overwrites it. Nothing was changed.\n' >&2
    return 1
  fi
  confirm_yes "Copy the database to $(desired_data_mount)?" || {
    printf 'Nothing was changed.\n' >&2
    return 1
  }
  make_data_dir || return 1
  current="$(postgres_data_mount)"
  step "Stopping Postgres so the files can be copied…"
  if [[ -z "$current" ]]; then
    docker stop skt-postgres >/dev/null
    if [[ -n "${SKT_DATA_DIR:-}" ]]; then
      docker run --rm --volumes-from skt-postgres -v "${SKT_DATA_DIR}/database:/to" postgres:16-alpine cp -a /var/lib/postgresql/data/. /to/
    else
      docker volume create --label com.docker.compose.project=skt --label com.docker.compose.volume=skt_pg_data "$PG_VOLUME" >/dev/null
      docker run --rm --volumes-from skt-postgres -v "${PG_VOLUME}:/to" postgres:16-alpine cp -a /var/lib/postgresql/data/. /to/
    fi
    echo "Copied. The next start uses the copy. The files inside the old container are removed when it is recreated."
  else
    src="${current#* }"
    compose stop postgres >/dev/null
    if [[ -n "${SKT_DATA_DIR:-}" ]]; then
      docker run --rm -v "${src}:/from:ro" -v "${SKT_DATA_DIR}/database:/to" postgres:16-alpine cp -a /from/. /to/
    else
      docker volume create --label com.docker.compose.project=skt --label com.docker.compose.volume=skt_pg_data "$PG_VOLUME" >/dev/null
      docker run --rm -v "${src}:/from:ro" -v "${PG_VOLUME}:/to" postgres:16-alpine cp -a /from/. /to/
    fi
    echo "Copied. The old copy is left where it was. Remove it once the tavern works from the new place."
  fi
}

# Before a start: refuse a move that would drop the database, or copy it when --migrate was given.
ensure_data_ready() {
  load_data_dir
  if postgres_container_exists && ! mounts_match; then
    if [[ "${MIGRATE:-0}" -eq 1 ]]; then
      migrate_database || return 1
    else
      storage_change_is_safe || return 1
    fi
  fi
  make_data_dir
}

confirm_reset() {
  local answer=""
  echo "This deletes every account, rating and game, and the saved setup."
  echo "  Where: $(data_where)"
  echo "  .env is removed. The next ./deploy.sh opens setup. The stack stays stopped."
  if [[ "${ASSUME_YES:-0}" -eq 1 ]]; then
    echo "Confirmed with --yes."
    return 0
  fi
  if [[ ! -t 0 ]]; then
    echo "A factory reset needs a terminal, or --yes. Nothing was deleted." >&2
    return 1
  fi
  printf 'Type reset to continue: '
  IFS= read -r answer || true
  if [[ "$answer" != "reset" ]]; then
    echo "Nothing was deleted."
    return 1
  fi
}

factory_reset() {
  load_data_dir
  confirm_reset || exit 1
  step "Stopping the stack and deleting the database…"
  # .env still names the active store here. It is removed only after that store is gone.
  compose down --volumes --remove-orphans
  if [[ -n "${SKT_DATA_DIR:-}" && -d "$SKT_DATA_DIR" ]]; then
    docker run --rm -v "${SKT_DATA_DIR}:/data" postgres:16-alpine rm -rf /data/database
  fi
  rm -f .env
  ok "Factory reset done. The database is empty and the saved setup is gone."
  echo "  Run ./deploy.sh to configure it again."
}

safe_down() {
  local where
  if postgres_container_exists && [[ -z "$(postgres_data_mount)" ]]; then
    die "skt-postgres keeps the database inside the container. ./deploy.sh --down would delete it.
  Copy it: ./deploy.sh --migrate
  Or delete it: ./deploy.sh --reset
  Nothing was changed."
  fi
  where="$(data_where)"
  step "Stopping the stack…"
  compose down --remove-orphans
  ok "Stopped. Accounts and games stay in ${where}."
}

apply_storage_cli() {
  local new_raw=""
  if [[ "$STORAGE" == "dir" ]]; then
    new_raw="$DATA_DIR_VALUE"
  fi
  valid_data_dir "$new_raw" ||
    die "the data folder is optional. Leave it unset for the named volume. A path cannot contain \$ \" ' \\ # or be / itself."
  prepare_storage_change "$new_raw" || die "Nothing was changed."
  [[ -f .env ]] || cp .env.example .env
  if [[ -n "$new_raw" ]]; then
    set_key SKT_DATA_DIR "$new_raw" .env
  else
    unset_key SKT_DATA_DIR .env
  fi
  load_data_dir
  ok "Storage: $(data_where) (saved in .env)"
}

compose() {
  local files=(-f docker-compose.yml)
  load_data_dir
  if [[ "$PROXY_MODE" == "npm" ]]; then
    files+=(-f docker-compose.npm.yml)
  else
    files+=(-f docker-compose.local.yml)
  fi
  if [[ -n "${SKT_DATA_DIR:-}" ]]; then
    files+=(-f docker-compose.data-dir.yml)
  fi
  docker compose "${files[@]}" "$@"
}

ensure_proxy_network() {
  [[ "$PROXY_MODE" == "npm" ]] || return 0
  if docker network inspect proxy-network >/dev/null 2>&1; then
    return 0
  fi
  step "Creating Docker network proxy-network (shared with Nginx Proxy Manager)…"
  docker network create proxy-network >/dev/null
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
  load_data_dir
  echo "  Storage: $(data_where)"
  echo "  Web:   ${web_url}"
  echo "  API:   ${api_url}"
  echo ""
  compose ps
}

CMD=""
PASSTHRU=()
DOWN_VOLUMES=0
STORAGE=""
DATA_DIR_VALUE=""
MIGRATE=0
ASSUME_YES=0
set_cmd() {
  [[ -z "$CMD" || "$CMD" == "$1" ]] ||
    die "only one command at a time (got '$CMD' and '$1'). See ./deploy.sh --help"
  CMD="$1"
}
set_storage() {
  [[ -z "$STORAGE" || "$STORAGE" == "$1" ]] ||
    die "--data-dir and --named-volumes can't be used together. See ./deploy.sh --help"
  STORAGE="$1"
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
    --volumes)               DOWN_VOLUMES=1 ;;
    --reset|reset)           set_cmd reset ;;
    --backup|backup)         set_cmd backup ;;
    --setup|setup)           set_cmd setup ;;
    --up|up)                 set_cmd up ;;
    --yes|-y)                ASSUME_YES=1 ;;
    --migrate)               MIGRATE=1 ;;
    --data-dir=*)            set_storage dir; DATA_DIR_VALUE="${1#--data-dir=}" ;;
    --data-dir)
      set_storage dir
      DATA_DIR_VALUE="./data"
      if (( $# > 1 )) && [[ "$2" != -* ]]; then
        DATA_DIR_VALUE="$2"
        shift
      fi
      ;;
    --named-volumes)         set_storage volumes ;;
    --)                      shift; PASSTHRU+=("$@"); break ;;
    -*)                      die "unknown option: $1
  Valid: --status --ps --logs --restart --rebuild --down --volumes --reset --backup
         --data-dir [path] --named-volumes --migrate --yes --setup --help" ;;
    *)                       PASSTHRU+=("$1") ;;
  esac
  shift
done
CMD="${CMD:-up}"

if [[ "$DOWN_VOLUMES" -eq 1 && "$CMD" != "down" && "$CMD" != "reset" ]]; then
  die "--volumes is only valid with --down. Example: ./deploy.sh --down --volumes"
fi
if [[ "$MIGRATE" -eq 1 && "$CMD" != "up" && "$CMD" != "rebuild" && "$CMD" != "setup" ]]; then
  die "--migrate copies the database while changing where it is stored.
  Example: ./deploy.sh --data-dir ./data --migrate"
fi
if [[ -n "$STORAGE" ]]; then
  case "$CMD" in
    up|rebuild|setup) ;;
    *) die "--data-dir and --named-volumes change where the database is stored. They don't go with --${CMD}.
  Example: ./deploy.sh --data-dir ./data" ;;
  esac
  if [[ "$STORAGE" == "dir" && -z "$DATA_DIR_VALUE" ]]; then
    die "--data-dir needs a folder, or nothing for ./data."
  fi
fi

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
if [[ -n "$STORAGE" ]]; then
  CURRENT_STAGE="storage"
  apply_storage_cli
fi

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
  reset) factory_reset; exit 0 ;;
  down)
    if [[ "$DOWN_VOLUMES" -eq 1 ]]; then
      factory_reset
    else
      safe_down
    fi
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

ensure_proxy_network
CURRENT_STAGE="database storage"
# A refusal already explained itself. exit keeps the error trap from adding a second report.
ensure_data_ready || exit 1

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
