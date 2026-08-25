# ============================================================
# 生成 App 图标:暖琥珀播放键 + 底部 beat 卡示意(呼应产品本体)
# ============================================================
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
R = 232  # macOS 圆角


def rounded(draw, box, radius, **kw):
    draw.rounded_rectangle(box, radius=radius, **kw)


def main(out_path):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 底板:暖黑渐变(手动逐行插值)
    plate = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(plate)
    top, bottom = (32, 21, 14), (16, 11, 8)
    for y in range(SIZE):
        t = y / SIZE
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        pdraw.line([(0, y), (SIZE, y)], fill=color + (255,))
    mask = Image.new("L", (SIZE, SIZE), 0)
    rounded(ImageDraw.Draw(mask), (0, 0, SIZE, SIZE), R, fill=255)
    img.paste(plate, (0, 0), mask)

    # 顶部内侧高光描边
    rounded(draw, (10, 10, SIZE - 10, SIZE - 10), R - 8, outline=(246, 192, 127, 60), width=6)

    # 琥珀光晕
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((SIZE * 0.18, SIZE * 0.10, SIZE * 0.82, SIZE * 0.66), fill=(246, 192, 127, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.alpha_composite(glow)

    # 播放三角(圆角化:多边形+描边模拟)
    cx, cy, radius = SIZE * 0.5, SIZE * 0.40, SIZE * 0.155
    pts = [
        (cx - radius * 0.72, cy - radius),
        (cx + radius * 1.05, cy),
        (cx - radius * 0.72, cy + radius),
    ]
    tri = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(tri)
    tdraw.polygon(pts, fill=(246, 192, 127, 255))
    tdraw.line(pts + [pts[0], pts[1]], fill=(246, 192, 127, 255), width=56, joint="curve")
    img.alpha_composite(tri)

    # 底部 beat 卡示意:玻璃卡 + kicker 点 + 两行"文字"
    card_top = SIZE * 0.64
    card = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)
    rounded(cdraw, (SIZE * 0.14, card_top, SIZE * 0.86, SIZE * 0.86), 36,
            fill=(84, 52, 31, 200), outline=(255, 236, 205, 90), width=4)
    cdraw.rounded_rectangle((SIZE * 0.14, card_top, SIZE * 0.86, card_top + 10), 5, fill=(246, 192, 127, 230))
    cdraw.ellipse((SIZE * 0.185, card_top + 44, SIZE * 0.225, card_top + 84), fill=(255, 224, 178, 255))
    rounded(cdraw, (SIZE * 0.25, card_top + 48, SIZE * 0.62, card_top + 82), 17, fill=(255, 236, 205, 190))
    rounded(cdraw, (SIZE * 0.185, card_top + 116, SIZE * 0.78, card_top + 150), 17, fill=(255, 236, 205, 110))
    img.alpha_composite(card)

    img.save(out_path)
    print(f"icon → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "app-icon.png")
