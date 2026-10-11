#!/bin/sh
# usage: make_card.sh <plate.png> <workdir> <name> <glyph> <ring colour> [extra compose args]
set -e
B=$(cd "$(dirname "$0")" && pwd)
plate=$1; work=$2; name=$3; glyph=$4; ring=$5; shift 5
mkdir -p "$work"
sips -s format bmp "$plate" --out "$work/plate.bmp" >/dev/null
python3 -I "$B/compose_card.py" "$plate" "$work/plate.bmp" "$work/$name.svg" --glyph "$glyph" --ring "$ring" "$@"
(cd "$work" && qlmanage -t -s 1456 -o . "$name.square.svg" >/dev/null 2>&1)
sips -c 1456 1040 "$work/$name.square.svg.png" --out "$work/$name.png" >/dev/null
# zoomed corner crops: top-right, and bottom-left turned upright for a like-for-like comparison
sips -c 300 300 --cropOffset 0 740 "$work/$name.png" --out "$work/crop_tr.png" >/dev/null
sips -r 180 "$work/$name.png" --out "$work/rot.png" >/dev/null
sips -c 300 300 --cropOffset 0 740 "$work/rot.png" --out "$work/crop_bl.png" >/dev/null
sips -z 600 600 "$work/crop_tr.png" >/dev/null; sips -z 600 600 "$work/crop_bl.png" >/dev/null
echo "built $work/$name.png"
