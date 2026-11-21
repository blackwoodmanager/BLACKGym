#!/usr/bin/env python3
"""Turns the drawn icons in vercel/branding/ into the files the web app serves.

The drawings are 1024 px tiles with a rounded frame painted into them. A phone rounds an icon's
corners itself, so a painted frame shows as a second, slightly different edge. This cuts the frame
off (CROP px on every side), paints over what is left of the painted corners with the tile's own
colour, and writes each icon at 180 px (home screen, browser tab, the picker), 320 px (the loading
screen) and 512 px (manifest, notifications) into vercel/branding/web/. Run it again after changing a drawing:

    python3 vercel/scripts/make-icons.py        (needs Pillow: pip install pillow)

The results are committed, so the build on Vercel needs no image library.
"""
import json, math, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.join(HERE, '..', 'branding')
OUT = os.path.join(BRAND, 'web')
CROP = 40          # px taken off each side of the 1024 px drawing: the painted rim is gone by then
INSET, RADIUS = 6, 220   # where the painted tile starts, and its corner radius, in the drawing

def square(path):
    im = Image.open(path).convert('RGB')
    if im.size != (1024, 1024):
        sys.exit(f'{path}: expected 1024 x 1024, got {im.size}')
    im = im.crop((CROP, CROP, 1024 - CROP, 1024 - CROP))
    n = im.size[0]
    c = INSET + RADIUS - CROP              # the painted corner's centre, measured from a corner of the crop
    px = im.load()
    for sx, sy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        at = lambda x, y: ((n - 1 - x) if sx else x, (n - 1 - y) if sy else y)
        fill = px[at(c // 3 + 14, c // 3 + 14)]      # the tile's colour just inside this corner
        for y in range(c):
            for x in range(c):
                if math.hypot(c - x, c - y) > RADIUS - 12:
                    px[at(x, y)] = fill
    return im

def main():
    brand = json.load(open(os.path.join(BRAND, 'brand.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    for icon in brand['icons']:
        im = square(os.path.join(BRAND, icon['file']))
        for size in (180, 320, 512):
            im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"{icon['id']}-{size}.png"), optimize=True)
        print(icon['id'], '<-', icon['file'])

if __name__ == '__main__':
    main()
