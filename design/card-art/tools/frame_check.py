"""usage: frame_check.py <image.bmp> <frame #hex> [tolerance]   — frame insets, corner colours, emblem gaps"""
import struct, sys
d = open(sys.argv[1], 'rb').read()
t = tuple(int(sys.argv[2].lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
tol = int(sys.argv[3]) if len(sys.argv) > 3 else 60
off = struct.unpack_from('<I', d, 10)[0]
w, h = struct.unpack_from('<ii', d, 18)
bpp = struct.unpack_from('<H', d, 28)[0] // 8
flip = h > 0; h = abs(h)
row = (w * bpp + 3) & ~3
def px(x, y):
    yy = h - 1 - y if flip else y
    i = off + yy * row + x * bpp
    return d[i + 2], d[i + 1], d[i]
def hit(c): return all(abs(c[i] - t[i]) <= tol for i in range(3))
def runs(seq):
    out, s = [], None
    for i, v in enumerate(seq):
        if v and s is None: s = i
        if not v and s is not None: out.append((s, i - 1)); s = None
    if s is not None: out.append((s, len(seq) - 1))
    return out
def med(x0, y0, x1, y1):
    ps = [px(x, y) for y in range(y0, y1) for x in range(x0, x1)]
    return '#%02x%02x%02x' % tuple(sorted(p[i] for p in ps)[len(ps) // 2] for i in range(3))
print('top inset   :', {x: runs([hit(px(x, y)) for y in range(60)]) for x in (300, 700, 950)})
print('right inset :', {y: runs([hit(px(w - 1 - i, y)) for i in range(60)]) for y in (90, 180, 300)})
print('left inset  :', {y: runs([hit(px(i, y)) for i in range(60)]) for y in (1100, 1250, 1370)})
print('bottom inset:', {x: runs([hit(px(x, h - 1 - i)) for i in range(60)]) for x in (90, 180, 300)})
print('frame', med(400, 31, 600, 33), 'bg TR', med(840, 50, 990, 200), 'margin TR', med(1018, 30, 1034, 110), 'margin BL', med(6, 1346, 22, 1426))
def ext(get, n):
    v = [i for i in range(n) if hit(get(i))]
    return (min(v), max(v)) if v else (None, None)
a = ext(lambda i: px(w - 1 - i, 117), 220); b = ext(lambda i: px(923, i), 220)
c = ext(lambda i: px(i, h - 1 - 117), 220); e = ext(lambda i: px(w - 1 - 923, h - 1 - i), 220)
print('first frame-coloured pixel from the edge, through the emblem centres: TR right', a[0], 'top', b[0], '| BL left', c[0], 'bottom', e[0])
