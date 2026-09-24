from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
SIZE = 1024
BG = '#000000'
PURPLE = '#A67DF3'
RING = '#7652B7'
CREAM = '#F4E9CF'


def mark(purple=PURPLE, ring=RING, star=CREAM):
    image = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.arc((194, 194, 830, 830), 50, 300, fill=purple, width=22)
    draw.ellipse((659, 225, 683, 249), fill=star)
    draw.ellipse((704, 744, 728, 768), fill=purple)
    draw.ellipse((308, 308, 716, 716), outline=ring, width=14)
    points = [(512, 414), (542, 482), (610, 512), (542, 542),
              (512, 610), (482, 542), (414, 512), (482, 482)]
    draw.polygon(points, fill=star)
    draw.ellipse((493, 493, 531, 531), fill=purple)
    return image


def save(image, path, size=None, image_format=None):
    if size:
        image = image.resize((size, size), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format=image_format)


colored = mark()
opaque = Image.new('RGBA', (SIZE, SIZE), BG)
opaque.alpha_composite(colored)
save(opaque.convert('RGB'), ASSETS / 'icon.png')
save(colored, ASSETS / 'android-icon-foreground.png')
save(Image.new('RGBA', (SIZE, SIZE), BG), ASSETS / 'android-icon-background.png')
save(mark('#FFFFFF', '#FFFFFF', '#FFFFFF'), ASSETS / 'android-icon-monochrome.png')
save(colored, ASSETS / 'splash-icon.png')
save(opaque.convert('RGB'), ASSETS / 'favicon.png', 64)

# 144 physical pixels is a 48 dp launcher preview at xxxhdpi density.
save(opaque.convert('RGB'), ROOT / 'artifacts' / 'daimon-brand' / 'daimon-icon-48dp-preview.png', 144)

for density, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    folder = RES / f'mipmap-{density}'
    save(opaque.convert('RGB'), folder / 'ic_launcher.webp', px, 'WEBP')
    mask = Image.new('L', (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    round_icon = opaque.resize((px, px), Image.Resampling.LANCZOS)
    round_icon.putalpha(mask)
    save(round_icon, folder / 'ic_launcher_round.webp', image_format='WEBP')
    canvas = 108 * (px // 48)
    variants = [
        ('background', Image.new('RGBA', (SIZE, SIZE), BG)),
        ('foreground', colored),
        ('monochrome', mark('#FFFFFF', '#FFFFFF', '#FFFFFF')),
    ]
    for name, image in variants:
        save(image, folder / f'ic_launcher_{name}.webp', canvas, 'WEBP')

for density, px in [('mdpi', 288), ('hdpi', 432), ('xhdpi', 576), ('xxhdpi', 864), ('xxxhdpi', 1152)]:
    save(colored, RES / f'drawable-{density}' / 'splashscreen_logo.png', px, 'PNG')
