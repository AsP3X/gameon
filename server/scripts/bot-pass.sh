#!/bin/sh
# Play 1000 games of each bot table and write the tallies.
# Run from anywhere: the script builds the release binary in server/.
set -eu
cd "$(dirname "$0")/.."
exec cargo run --quiet -p skt-bot-pass --release -- "$@"
