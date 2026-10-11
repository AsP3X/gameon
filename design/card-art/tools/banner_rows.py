"""usage: banner_rows.py <plate.bmp>...   — vertical extent of the ivory title banner, measured left and right of the lettering"""
import struct, sys
def load(path):
    d = open(path, 'rb').read()
    off = struct.unpack_from('<I', d, 10)[0]
    w, h = struct.unpack_from('<ii', d, 18)
    bpp = struct.unpack_from('<H', d, 28)[0] // 8
    flip = h > 0; h = abs(h)
    row = (w * bpp + 3) & ~3
    def px(x, y):
        yy = h - 1 - y if flip else y
        i = off + yy * row + x * bpp
        return d[i + 2], d[i + 1], d[i]
    return px
def light(c): return c[0] > 235 and c[1] > 225 and c[2] > 195
def longest(seq, base):
    best, s = (0, 0), None
    for i, v in enumerate(list(seq) + [False]):
        if v and s is None: s = i
        if not v and s is not None:
            if i - s > best[1] - best[0]: best = (s, i)
            s = None
    return best[0] + base, best[1] + base - 1
args = sys.argv[1:]
if args and args[0].startswith('#'):  # a dark banner: match this colour instead of ivory
    t = tuple(int(args[0][i:i + 2], 16) for i in (1, 3, 5))
    light = lambda c: all(abs(c[i] - t[i]) <= 40 for i in range(3))
    args = args[1:]
for path in args:
    px = load(path)
    out = []
    for x in (215, 825):
        out.append(longest([light(px(x, y)) for y in range(950, 1380)], 950))
    top = min(o[0] for o in out); bot = max(o[1] for o in out)
    xs = longest([light(px(x, top + 8)) for x in range(1040)], 0)
    print(f'{path.split("/")[-2]:9s} banner top {top}  bottom {bot}  height {bot - top + 1}  | top edge x {xs[0]}-{xs[1]}')
