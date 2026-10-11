#!/bin/sh
# usage: make_suit.sh <plate.png> <suit name> <ring colour> [bonus on the 14, default +10] [only this rank, or ""] [extra compose args for every rank] -- [extra compose args for the 14]
# Composes ranks 1-14 of one numbered suit from a single plate: final/<suit>/<suit>-NN.png, plus small JPEGs for the preview.
set -e
B=$(cd "$(dirname "$0")" && pwd); S=$(dirname "$B")
plate=$1; suit=$2; ring=$3; bonus=${4:-+10}; only=$5
[ $# -ge 5 ] && shift 5 || shift $#
all=""; top=""; seen=0
for a in "$@"; do
  if [ "$a" = "--" ]; then seen=1; elif [ $seen = 0 ]; then all="$all $a"; else top="$top $a"; fi
done
work="$S/out/$suit"; fin="$S/final/$suit"
mkdir -p "$work" "$fin"
sips -s format bmp "$plate" --out "$work/plate.bmp" >/dev/null
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14; do
  [ -n "$only" ] && [ "$only" != "$n" ] && continue
  nn=$(printf '%02d' "$n")
  extra="$all"; [ "$n" = 14 ] && extra="$all --bonus $bonus $top"
  python3 -I "$B/compose_card.py" "$plate" "$work/plate.bmp" "$work/$suit-$nn.svg" --glyph rank --rank "$n" --ring "$ring" $extra >/dev/null
  (cd "$work" && qlmanage -t -s 1456 -o . "$suit-$nn.square.svg" >/dev/null 2>&1)
  sips -c 1456 1040 "$work/$suit-$nn.square.svg.png" --out "$fin/$suit-$nn.png" >/dev/null
  sips -s format jpeg -s formatOptions 86 --resampleWidth 520 "$fin/$suit-$nn.png" --out "$work/$suit-$nn.jpg" >/dev/null
  rm -f "$work/$suit-$nn.svg" "$work/$suit-$nn.square.svg" "$work/$suit-$nn.square.svg.png"
  echo "rank $n done"
done
