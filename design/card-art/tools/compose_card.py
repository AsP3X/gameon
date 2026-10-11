"""Compose a card face: the clean plate plus two exactly placed corner emblems.

usage: compose_card.py <plate.png> <plate.bmp> <out.svg> --glyph crown|swords|tail|claws|flag|kraken|whale|sack|rank [--rank N] --ring '#hex'
                       [--ink '#hex'] [--inset 35] [--ringw 14] [--r 82]

The emblem is a circle whose side towards the card corner is pulled out into the corner, so its two
outer edges run along the frame line and its outer corner is concentric with the card's rounded
corner. The bottom-left emblem is the top-right one rotated 180 degrees about the card centre, so
both sit at identical distances from their edges.

The .bmp is the same plate (sips -s format bmp); it is only read to sample background colours.
"""

import argparse
import base64
import struct
from pathlib import Path

W, H = 1040, 1456
CARD_R = W * 0.1  # .card in tavern.css: border-radius is 10% of the width

ap = argparse.ArgumentParser()
ap.add_argument("plate")
ap.add_argument("bmp")
ap.add_argument("out")
ap.add_argument("--glyph", choices=["crown", "swords", "tail", "claws", "flag", "kraken", "whale", "sack", "rank"], required=True)
ap.add_argument("--ring", required=True, help="ring and glyph colour: the plate's frame line colour")
ap.add_argument("--rank", help="the number shown when --glyph rank")
ap.add_argument("--bonus", help="bonus points, e.g. +10: turns the emblem into a gold coin with a points tag")
ap.add_argument("--pill", help="a gold marker at the bottom centre, e.g. TRUMP")
ap.add_argument("--coin-rim", help="outline colour of the gold coin and its tag; default gold, pass a dark colour on a light or yellow card")
ap.add_argument("--ink", help="emblem fill; default: the plate's background, sampled top-right")
ap.add_argument("--inset", type=float, default=35.0, help="ring centreline, from the card edge")
ap.add_argument("--ringw", type=float, default=14.0, help="ring thickness")
ap.add_argument("--r", type=float, default=82.0, help="ring centreline radius of the round part")
a = ap.parse_args()

# --- sample the plate -------------------------------------------------------------------------
d = Path(a.bmp).read_bytes()
off = struct.unpack_from("<I", d, 10)[0]
bw, bh = struct.unpack_from("<ii", d, 18)
bpp = struct.unpack_from("<H", d, 28)[0] // 8
flip, bh = bh > 0, abs(bh)
row = (bw * bpp + 3) & ~3
assert (bw, bh) == (W, H), (bw, bh)


def px(x: int, y: int) -> tuple[int, int, int]:
    yy = bh - 1 - y if flip else y
    i = off + yy * row + x * bpp
    return d[i + 2], d[i + 1], d[i]


def median_hex(x0: int, y0: int, x1: int, y1: int) -> str:
    ps = [px(x, y) for y in range(y0, y1) for x in range(x0, x1)]
    med = [sorted(p[i] for p in ps)[len(ps) // 2] for i in range(3)]
    return "#%02x%02x%02x" % tuple(med)


inset, ring, r = a.inset, a.ringw, a.r
ink = a.ink or median_hex(W - 200, 50, W - 50, 200)
# The margin outside the frame line, next to each emblem's corner.
patch_tr = median_hex(W - 22, 30, W - 6, 110)
patch_bl = median_hex(6, H - 110, 22, H - 30)

# --- geometry (top-right emblem) --------------------------------------------------------------
x1, y0 = W - inset, inset
cx, cy = x1 - r, y0 + r
rc = CARD_R - inset  # concentric with the card corner

shape = (
    f"M{cx} {y0}H{x1 - rc}A{rc} {rc} 0 0 1 {x1} {y0 + rc}V{cy}"
    f"A{r} {r} 0 0 1 {cx} {cy + r}A{r} {r} 0 0 1 {cx - r} {cy}A{r} {r} 0 0 1 {cx} {y0}Z"
)
# The plate's frame has a tight corner; hide the bit of it that would poke out past the rounder emblem.
band = ring / 2 + 3
patch = f"M{x1 - rc} {y0 - band}H{x1 + band}V{y0 + rc}H{x1}A{rc} {rc} 0 0 0 {x1 - rc} {y0}Z"

if a.glyph == "crown":
    s = r * 0.56
    glyph = f"""<g transform="translate({cx} {cy + s * 0.06}) scale({s})" fill="{a.ring}">
      <path d="M-1 -.42L-.5 .12L0 -.66L.5 .12L1 -.42L.8 .46H-.8Z" stroke="{a.ring}" stroke-width=".1" stroke-linejoin="round"/>
      <circle cx="-1" cy="-.5" r=".15"/><circle cx="0" cy="-.76" r=".15"/><circle cx="1" cy="-.5" r=".15"/>
      <rect x="-.8" y=".62" width="1.6" height=".17" rx=".085"/>
    </g>"""
elif a.glyph == "tail":
    # Mermaid tail, solid like the crown: a curved tail rising to a two-lobed fin, in a box 2 units tall.
    s = r * 0.72
    glyph = f"""<g transform="translate({cx - s * 0.12} {cy + s * 0.06}) scale({s})" fill="{a.ring}">
      <path d="M-.55 .85C-.75 .15-.1-.05 .1-.4C-.1-.5-.4-.7-.42-.98C-.2-.8 .05-.72 .22-.62C.4-.75 .65-.85 .9-.8C.75-.55 .55-.35 .32-.3C.25 .15-.05 .4 .05 .85Z"/>
    </g>"""
elif a.glyph == "claws":
    # Tigress: three claw slashes, each a tapered crescent, in a box 2 units tall.
    s = r * 0.64
    slash = "M0-.9Q.74 0 0 .9Q.1 0 0-.9Z"
    glyph = f"""<g transform="translate({cx - s * 0.16} {cy}) scale({s}) rotate(24)" fill="{a.ring}">
      <path d="{slash}" transform="translate(-.56 .06)"/><path d="{slash}"/><path d="{slash}" transform="translate(.56 -.06)"/>
    </g>"""
elif a.glyph == "flag":
    # Escape: a waving flag on a pole, in a box 2 units tall.
    s = r * 0.62
    glyph = f"""<g transform="translate({cx - s * 0.07} {cy}) scale({s})" fill="{a.ring}">
      <rect x="-.66" y="-.95" width=".17" height="1.9" rx=".085"/>
      <path d="M-.49-.84C-.1-1.06 .2-.58 .8-.8V.06C.2 .28-.1-.2-.49 .02Z"/>
    </g>"""
elif a.glyph == "kraken":
    # Kraken: a domed head on four curling tentacles, in a box 2 units tall.
    s = r * 0.66
    glyph = f"""<g transform="translate({cx} {cy + s * 0.04}) scale({s})">
      <g fill="none" stroke="{a.ring}" stroke-width=".2" stroke-linecap="round">
        <path d="M-.38-.05C-.5 .4-.95 .25-.88 .72"/><path d="M-.14 .1C-.16 .5-.46 .55-.34 .9"/>
        <path d="M.38-.05C.5 .4 .95 .25 .88 .72"/><path d="M.14 .1C.16 .5 .46 .55 .34 .9"/>
      </g>
      <path d="M-.55-.3A.55 .58 0 0 1 .55-.3C.55 0 .35 .22 0 .22S-.55 0-.55-.3Z" fill="{a.ring}"/>
      <circle cx="-.2" cy="-.2" r=".1" fill="{ink}"/><circle cx=".2" cy="-.2" r=".1" fill="{ink}"/>
    </g>"""
elif a.glyph == "whale":
    # White Whale: a whole whale seen from the side with a spout, in a box 2 units wide.
    s = r * 0.7
    glyph = f"""<g transform="translate({cx - s * 0.04} {cy + s * 0.12}) scale({s})" fill="{a.ring}">
      <path d="M-.95 .08C-.95-.42-.3-.6 .25-.36C.5-.25 .62-.12 .74-.3C.8-.48 .78-.62 1-.72C.98-.5 1-.36 .96-.2C1.02-.1 1.04 .02 1.02 .14C.84 .04 .72 .1 .56 .24C.1 .58-.95 .56-.95 .08Z"/>
      <circle cx="-.62" cy="-.02" r=".075" fill="{ink}"/>
      <path d="M-.5-.72C-.5-.95-.72-1-.82-.9M-.5-.72C-.5-.95-.28-1-.18-.9" fill="none" stroke="{a.ring}" stroke-width=".13" stroke-linecap="round"/>
    </g>"""
elif a.glyph == "sack":
    # Loot: a tied sack with a coin on it, in a box 2 units tall.
    s = r * 0.62
    glyph = f"""<g transform="translate({cx} {cy}) scale({s})" fill="{a.ring}">
      <path d="M-.22-.5L-.42-.92Q0-.78 .42-.92L.22-.5C.72-.28 .92 .2 .82 .55C.72 .92-.72 .92-.82 .55C-.92 .2-.72-.28-.22-.5Z"/>
      <path d="M-.3-.5H.3" fill="none" stroke="{ink}" stroke-width=".1" stroke-linecap="round"/>
      <circle cx="0" cy=".22" r=".27" fill="none" stroke="{ink}" stroke-width=".11"/>
    </g>"""
elif a.glyph == "rank":
    # Numbered suits: the rank itself, as large as the ring allows.
    two = len(a.rank) > 1
    size = r * (1.12 if two else 1.5)
    glyph = (
        f'<text x="{cx}" y="{cy + size * 0.355}" text-anchor="middle" font-family="Arial Rounded MT Bold, ui-rounded, sans-serif" '
        f'font-weight="bold" font-size="{size}" letter-spacing="{-size * 0.04 if two else 0}" fill="{a.ring}">{a.rank}</text>'
    )
else:
    # Crossed cutlasses, solid like the crown: one sword drawn tip-up in a box 2 units tall, used twice.
    s = r * 0.84
    sword = (
        '<path d="M-.12 .4V-.58Q-.1 -.9 .2 -1Q.21 -.7 .15 -.48V.4Z"/>'
        '<rect x="-.38" y=".38" width=".76" height=".15" rx=".075"/>'
        '<rect x="-.075" y=".5" width=".15" height=".34"/><circle cx="0" cy=".9" r=".12"/>'
    )
    edge = f'stroke="{ink}" stroke-width=".09" stroke-linejoin="round" paint-order="stroke"'
    glyph = f"""<g transform="translate({cx} {cy + s * 0.04}) scale({s})" fill="{a.ring}">
      <g transform="rotate(-42)">{sword}</g>
      <g transform="scale(-1 1) rotate(-42)" {edge}>{sword}</g>
    </g>"""

if a.bonus:
    # The card that scores extra: a solid gold coin with a dark number, and the points on a gold tag
    # hanging from it. The outer edge is the same as on every other card.
    GOLD, GOLD_D, GOLD_INK = "#ffc800", "#e5a400", "#3b2c00"
    font = 'font-family="Arial Rounded MT Bold, ui-rounded, sans-serif" font-weight="bold"'
    tag_w, tag_h, tuck = 132, 66, 14
    ty = cy + r + ring / 2 - tuck
    body = f"""<rect x="{cx - tag_w / 2}" y="{ty}" width="{tag_w}" height="{tag_h}" rx="{tag_h / 2}" fill="{GOLD}" stroke="{a.coin_rim or GOLD_D}" stroke-width="{8 if a.coin_rim else 5}"/>
    <text x="{cx}" y="{ty + tuck + (tag_h - tuck) / 2 + 15}" text-anchor="middle" {font} font-size="45" fill="{GOLD_INK}">{a.bonus}</text>
    <path d="{shape}" fill="{GOLD}" stroke="{a.coin_rim or GOLD}" stroke-width="{ring}" stroke-linejoin="round"/>
    <circle cx="{cx}" cy="{cy}" r="{r - 9}" fill="none" stroke="{GOLD_D}" stroke-width="5"/>
    {glyph.replace(f'fill="{a.ring}"', f'fill="{GOLD_INK}"')}"""
else:
    body = f"""<path d="{shape}" fill="{ink}" stroke="{a.ring}" stroke-width="{ring}" stroke-linejoin="round"/>
    {glyph}"""
half = f"rotate(180 {W / 2} {H / 2})"

marker = ""
if a.pill:
    # A suit-wide marker (the trump suit): one gold pill centred below the title banner, upright.
    pw, ph, py = 46 * len(a.pill) + 70, 70, 1196
    marker = (
        f'<rect x="{W / 2 - pw / 2}" y="{py}" width="{pw}" height="{ph}" rx="{ph / 2}" fill="#ffc800" stroke="#e5a400" stroke-width="5"/>'
        f'<text x="{W / 2}" y="{py + ph / 2 + 17}" text-anchor="middle" font-family="Arial Rounded MT Bold, ui-rounded, sans-serif" '
        f'font-weight="bold" font-size="48" letter-spacing="3" fill="#3b2c00">{a.pill}</text>'
    )

data = base64.b64encode(Path(a.plate).read_bytes()).decode("ascii")
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <image width="{W}" height="{H}" href="data:image/png;base64,{data}" xlink:href="data:image/png;base64,{data}"/>
  <path d="{patch}" fill="{patch_tr}"/>
  <path d="{patch}" fill="{patch_bl}" transform="{half}"/>
  <g id="emblem">
    {body}
  </g>
  <use href="#emblem" xlink:href="#emblem" transform="{half}"/>
  {marker}
</svg>
"""
Path(a.out).write_text(svg, encoding="utf-8")
# Square canvas variant for rasterising with qlmanage, which fills a square thumbnail.
pad = (H - W) / 2
Path(a.out).with_suffix(".square.svg").write_text(
    svg.replace(f'width="{W}" height="{H}" viewBox="0 0 {W} {H}"', f'width="{H}" height="{H}" viewBox="{-pad} 0 {H} {H}"', 1),
    encoding="utf-8",
)
print(a.out, f"ink={ink} patch_tr={patch_tr} patch_bl={patch_bl} inset={inset} ring={ring} r={r}")
