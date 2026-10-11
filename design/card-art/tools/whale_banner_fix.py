"""Move the White Whale title banner to the series position without touching the artwork.

usage: whale_banner_fix.py <low.bmp> <high.bmp> <out.bmp>

low  = the plate whose banner sits too low (ivory rows 1160-1272); its picture above the banner is clean.
high = the plate whose banner sits too high; its waves below row 1120 are clean.
Result: high as the base, the area under high's banner refilled from low, and low's own banner lifted
to the rows the other cards use (ivory 1043-1163). Plain pixel work on 24-bit BMPs, no image library.
"""
import struct
import sys

low_path, high_path, out_path = sys.argv[1:4]


class Bmp:
    def __init__(self, path):
        self.d = bytearray(open(path, "rb").read())
        self.off = struct.unpack_from("<I", self.d, 10)[0]
        self.w, h = struct.unpack_from("<ii", self.d, 18)
        self.bpp = struct.unpack_from("<H", self.d, 28)[0] // 8
        self.flip, self.h = h > 0, abs(h)
        self.row = (self.w * self.bpp + 3) & ~3

    def idx(self, x, y):
        yy = self.h - 1 - y if self.flip else y
        return self.off + yy * self.row + x * self.bpp

    def get(self, x, y):
        i = self.idx(x, y)
        return self.d[i], self.d[i + 1], self.d[i + 2]

    def put(self, x, y, c):
        i = self.idx(x, y)
        self.d[i], self.d[i + 1], self.d[i + 2] = c


low, out = Bmp(low_path), Bmp(high_path)

# 1. Refill only the pixels high's banner occupies (its outline polygon plus a small margin). On the
#    right they come from low, where the picture is intact. At the far left low already has waves
#    that high does not, so that end takes high's own plain background from the same row instead.
H_TOP, H_MID, H_BOT = 958, 1042, 1122


def high_span(y):
    if y < H_TOP or y > H_BOT:
        return None
    d = abs(y - H_MID) * 50 / 73  # the notch edges run 50 px sideways over 73 rows
    return 153 - d, 887 + d


for y in range(H_TOP, H_BOT + 1):
    a, b = high_span(y)
    bg = out.get(70, y)
    for x in range(int(a), int(b) + 1):
        out.put(x, y, bg if x < 178 else low.get(x, y))

# 2. Lift low's banner. Outer edge of its outline, as a polygon in low's coordinates.
SRC_TOP, SRC_BOT = 1160, 1272  # ivory rows of the banner in low
DST_TOP, DST_BOT = 1043, 1163  # ivory rows of the banner on the other cards
sy = (DST_BOT - DST_TOP) / (SRC_BOT - SRC_TOP)
TOP, MID, BOT = 1151, 1217, 1281


def span(y):
    """x range of the banner at source row y (notched ends)."""
    if y < TOP or y > BOT:
        return None
    if y <= MID:
        t = (y - TOP) / (MID - TOP)
        return 124 + t * (171 - 124), 916 + t * (867 - 916)
    t = (y - MID) / (BOT - MID)
    return 171 + t * (127 - 171), 867 + t * (913 - 867)


y0 = int(DST_TOP + (TOP - SRC_TOP) * sy)
y1 = int(DST_TOP + (BOT - SRC_TOP) * sy) + 1
for yd in range(y0, y1 + 1):
    ys = SRC_TOP + (yd - DST_TOP) / sy
    s = span(ys)
    if not s:
        continue
    ya = int(ys)
    f = ys - ya
    yb = min(ya + 1, low.h - 1)
    for x in range(int(s[0]) + 1, int(s[1]) + 1):
        a, b = low.get(x, ya), low.get(x, yb)
        out.put(x, yd, tuple(round(a[i] * (1 - f) + b[i] * f) for i in range(3)))

open(out_path, "wb").write(out.d)
print(out_path, "banner rows", y0, "-", y1, "scale-y", round(sy, 4))
