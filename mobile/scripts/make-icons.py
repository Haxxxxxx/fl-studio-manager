"""Draws the Hivo cell (hexagon + lit LED) as the phone app's icons.

Run from mobile/: python3 scripts/make-icons.py (needs Pillow). Same mark as
the desktop icon in src-tauri/icons, redrawn full-bleed for iOS/Android.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

CHASSIS = (13, 13, 12, 255)
HOT = (255, 90, 31, 255)
SS = 4  # supersampling


def hexagon(size, cx, cy, r):
    return [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(0, 360, 60)]


def cell(size, scale, color, glow=True, bg=None):
    big = size * SS
    img = Image.new("RGBA", (big, big), bg or (0, 0, 0, 0))
    c = big / 2
    r = big * 0.35 * scale
    stroke = big * 0.058 * scale
    if glow:
        g = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([c - r * 0.42, c - r * 0.42, c + r * 0.42, c + r * 0.42], fill=color[:3] + (150,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(big * 0.03 * scale)))
    d = ImageDraw.Draw(img)
    d.polygon(hexagon(big, c, c, r), outline=color, width=int(stroke))
    dot = r * 0.17
    d.ellipse([c - dot, c - dot, c + dot, c + dot], fill=color)
    return img.resize((size, size), Image.LANCZOS)


cell(1024, 1.0, HOT, bg=CHASSIS).convert("RGB").save("assets/icon.png")
cell(1024, 0.75, HOT).save("assets/splash-icon.png")
cell(512, 0.62, HOT).save("assets/android-icon-foreground.png")
Image.new("RGBA", (512, 512), CHASSIS).save("assets/android-icon-background.png")
cell(432, 0.62, (255, 255, 255, 255), glow=False).save("assets/android-icon-monochrome.png")
cell(48, 1.0, HOT, bg=CHASSIS).save("assets/favicon.png")
