#!/usr/bin/env python3
"""
程序化环境资产生成器。

这些是"和场景绑死"的资产 —— 散落的机械零件、倒地的机器人、破损接头的
电火花、机械门、沿顶敷设的线缆。手绘也能画，但程序生成的好处是它能从
关卡几何里长出来：线缆按管廊走向自动接段，断口按塌陷形状自动收边。

全部锁在 36 色统一色板内，二值 Alpha，禁止抗锯齿。

用法：
    python tools/gen_env_assets.py [--out public/assets]
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from PIL import Image

# ---------------------------------------------------------------- 色板

P = {
    'white': (255, 255, 255), 'bone': (223, 255, 247),
    'biolum': (112, 255, 224), 'biolum_dim': (49, 214, 200), 'teal_deep': (13, 164, 166),
    'abyss': (11, 16, 38), 'deep': (27, 42, 74), 'slate': (37, 53, 95),
    'violet': (59, 52, 104), 'violet_lt': (90, 75, 134),
    'rust': (139, 69, 19), 'rust_lt': (180, 92, 34), 'rust_br': (216, 121, 45),
    'rust_dk': (91, 45, 25),
    'steel_dk': (58, 61, 64), 'steel': (89, 99, 107), 'steel_lt': (124, 133, 140),
    'steel_hi': (181, 189, 194),
    'alert': (255, 51, 68), 'alert_dk': (168, 22, 43),
    'purple': (199, 91, 255),
    'gold': (255, 215, 0), 'gold_lt': (255, 240, 168), 'amber': (255, 228, 163),
    'moss': (79, 175, 122), 'moss_dk': (47, 107, 74), 'moss_deep': (24, 63, 53),
    'olive': (111, 127, 75), 'olive_dk': (66, 90, 58),
}


class Canvas:
    """一张带调色板约束的小画布"""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.px = self.img.load()

    def set(self, x: int, y: int, c: str) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = (*P[c], 255)

    def rect(self, x0: int, y0: int, x1: int, y1: int, c: str) -> None:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def frame(self, x0: int, y0: int, x1: int, y1: int, c: str) -> None:
        for x in range(x0, x1 + 1):
            self.set(x, y0, c)
            self.set(x, y1, c)
        for y in range(y0, y1 + 1):
            self.set(x0, y, c)
            self.set(x1, y, c)

    def line(self, x0: int, y0: int, x1: int, y1: int, c: str) -> None:
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    def disc(self, cx: int, cy: int, r: float, c: str) -> None:
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.set(x, y, c)

    def speckle(self, x0: int, y0: int, x1: int, y1: int, c: str, p: float, rng: random.Random) -> None:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.px[x, y][3] and rng.random() < p:
                    self.set(x, y, c)


def sheet(frames: list[Canvas], cols: int | None = None) -> Image.Image:
    """把若干帧横向拼成一张图集"""
    cols = cols or len(frames)
    rows = (len(frames) + cols - 1) // cols
    fw, fh = frames[0].w, frames[0].h
    out = Image.new('RGBA', (fw * cols, fh * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f.img, ((i % cols) * fw, (i // cols) * fh), f.img)
    return out


# ---------------------------------------------------------------- 散落零件

def make_debris(rng: random.Random) -> list[Canvas]:
    """
    六种散落的机械零件，32×32。
    都画成"躺在地上"的姿态：底边接触地面，上方有高光，下方压暗。
    刻意不把"埋进沉积物"画进贴图 —— 地面高度由关卡决定，
    埋多深应该是摆放时的事，画死了就只能配一种地形。
    """
    out = []

    # 1 齿轮，半埋进沉积物
    c = Canvas(32, 32)
    c.disc(16, 21, 9, 'steel_dk')
    c.disc(16, 21, 7, 'steel')
    c.disc(16, 21, 3, 'abyss')
    for a in range(8):
        import math
        ang = a * math.pi / 4
        x = int(16 + math.cos(ang) * 10)
        y = int(21 + math.sin(ang) * 10)
        c.rect(x - 1, y - 1, x + 1, y + 1, 'steel_dk')
    c.speckle(6, 12, 26, 26, 'rust', 0.12, rng)
    out.append(c)

    # 2 断裂的管段
    c = Canvas(32, 32)
    c.rect(3, 16, 28, 23, 'rust_lt')
    c.rect(3, 16, 28, 17, 'rust_br')
    c.rect(3, 22, 28, 23, 'rust_dk')
    c.rect(3, 16, 5, 23, 'steel_dk')
    c.rect(26, 16, 28, 23, 'steel_dk')
    c.rect(13, 16, 16, 23, 'abyss')     # 断口
    c.speckle(6, 17, 25, 22, 'moss_dk', 0.10, rng)
    out.append(c)

    # 3 弯折的支架
    c = Canvas(32, 32)
    c.line(4, 24, 18, 12, 'steel')
    c.line(5, 25, 19, 13, 'steel_dk')
    c.line(18, 12, 27, 19, 'steel')
    c.line(18, 13, 27, 20, 'steel_dk')
    c.disc(18, 12, 2, 'steel_lt')
    out.append(c)

    # 4 碎裂的面板
    c = Canvas(32, 32)
    c.rect(4, 14, 27, 26, 'steel_dk')
    c.rect(5, 15, 26, 25, 'steel')
    c.line(9, 14, 14, 26, 'abyss')
    c.line(19, 14, 16, 26, 'abyss')
    for x in (7, 13, 22, 26):
        c.set(x, 16, 'steel_hi')
    c.speckle(5, 15, 26, 25, 'rust', 0.08, rng)
    out.append(c)

    # 5 线圈残骸
    c = Canvas(32, 32)
    c.rect(8, 15, 23, 25, 'rust_dk')
    for y in range(16, 25, 2):
        c.rect(9, y, 22, y, 'rust_br')
    c.rect(6, 13, 25, 14, 'steel_dk')
    out.append(c)

    # 6 小螺栓堆
    c = Canvas(32, 32)
    for (x, y) in ((10, 24), (15, 22), (20, 25), (13, 26), (18, 20), (23, 23)):
        c.disc(x, y, 2, 'steel_dk')
        c.set(x, y - 1, 'steel_lt')
    c.speckle(8, 18, 25, 26, 'rust', 0.15, rng)
    out.append(c)

    return out


# ---------------------------------------------------------------- 倒地机器人

def make_fallen_robot(rng: random.Random) -> list[Canvas]:
    """
    倒在地上的巡逻机械眼，64×48，4 帧。
    和 Zone 1 里活着的那种是同一型号 —— 玩家应该能认出来，
    这样后面遇到还在巡逻的单位时才会想「原来它们本来会动」。
    镜头残余电力，偶尔闪一下红光。
    """
    frames = []
    for i in range(4):
        c = Canvas(64, 48)
        # 外壳侧躺，被压扁成椭圆
        for y in range(18, 40):
            for x in range(14, 50):
                dx = (x - 32) / 18.0
                dy = (y - 30) / 11.0
                if dx * dx + dy * dy <= 1.0:
                    c.set(x, y, 'rust_dk')
        for y in range(20, 37):
            for x in range(16, 48):
                dx = (x - 32) / 16.0
                dy = (y - 29) / 9.0
                if dx * dx + dy * dy <= 1.0:
                    c.set(x, y, 'rust')
        # 裂开的机械瓣
        c.line(24, 20, 28, 38, 'abyss')
        c.line(40, 21, 36, 38, 'abyss')
        c.rect(41, 22, 47, 24, 'rust_lt')
        # 传感器镜头，朝右侧倒着
        c.disc(45, 30, 4, 'steel_dk')
        lit = i == 1
        c.disc(45, 30, 2, 'alert' if lit else 'alert_dk')
        if lit:
            c.set(44, 29, 'white')
        # 断掉的推进口与散落的碎片
        c.rect(12, 32, 17, 35, 'steel_dk')
        c.set(9, 36, 'steel')
        c.set(7, 38, 'steel_dk')
        # 藤壶与苔藓：它躺了很久了
        c.speckle(18, 20, 46, 36, 'moss_dk', 0.08, rng)
        c.speckle(18, 20, 46, 36, 'steel_hi', 0.03, rng)
        frames.append(c)
    return frames


# ---------------------------------------------------------------- 电火花接头

def make_spark_junction(rng: random.Random) -> list[Canvas]:
    """
    破损接头，32×32，6 帧。前 3 帧暗，后 3 帧放电。
    这个是给"忽明忽暗的电火花"用的 —— 火花必须长在一个坏掉的
    接线盒上，而不是凭空在水里闪。
    """
    frames = []
    for i in range(6):
        c = Canvas(32, 32)
        # 接线盒
        c.rect(10, 12, 22, 24, 'steel_dk')
        c.rect(11, 13, 21, 23, 'steel')
        c.frame(11, 13, 21, 23, 'steel_dk')
        c.rect(13, 15, 19, 17, 'abyss')      # 烧穿的破口
        # 引出的两根断线
        c.line(10, 18, 3, 22, 'abyss')
        c.line(22, 18, 29, 24, 'abyss')
        c.speckle(10, 12, 22, 24, 'rust', 0.14, rng)

        if i >= 3:
            n = (i - 2) * 2
            for _ in range(n):
                x = rng.randint(13, 19)
                y = rng.randint(14, 18)
                c.set(x, y, 'gold')
                c.set(x + rng.choice((-1, 1)), y + rng.choice((-1, 1)), 'gold_lt')
            c.disc(16, 16, 2 if i == 4 else 1, 'gold_lt')
            if i == 4:
                c.disc(16, 16, 1, 'white')
        frames.append(c)
    return frames


# ---------------------------------------------------------------- 机械门

def make_mech_door(rng: random.Random) -> list[Canvas]:
    """
    机械门，96×128，6 帧：关闭 / 扫描 ×2 / 开启 ×3。
    门比闸门更"正式" —— 这是设施的正门，不是管道上的阀。
    中央有一道竖直的读取槽，扫描时蓝光从上往下扫过。
    """
    frames = []
    for i in range(6):
        c = Canvas(96, 128)
        # 门框
        c.rect(4, 6, 91, 121, 'steel_dk')
        c.rect(8, 10, 87, 117, 'rust_dk')
        c.frame(8, 10, 87, 117, 'steel')
        # 铆钉
        for y in range(14, 116, 12):
            c.set(11, y, 'steel_hi')
            c.set(84, y, 'steel_hi')
        # 两扇门板
        open_px = 0 if i < 3 else (i - 2) * 12
        for side in (0, 1):
            if side == 0:
                x0, x1 = 10, 47 - open_px
            else:
                x0, x1 = 48 + open_px, 85
            if x1 <= x0:
                continue
            c.rect(x0, 12, x1, 115, 'steel')
            c.rect(x0, 12, x1, 13, 'steel_lt')
            c.rect(x0, 114, x1, 115, 'steel_dk')
            for y in range(20, 112, 16):
                c.rect(x0 + 2, y, x1 - 2, y + 1, 'steel_dk')
            c.speckle(x0, 12, x1, 115, 'rust', 0.07, rng)
        # 中缝的读取槽
        if i < 3:
            c.rect(46, 30, 49, 98, 'abyss')
            c.rect(47, 30, 48, 98, 'slate')
        # 扫描光：一条横向亮带，第二帧扫到下方
        if i in (1, 2):
            y = 44 if i == 1 else 82
            c.rect(12, y - 1, 83, y + 1, 'biolum')
            c.rect(12, y - 3, 83, y - 2, 'biolum_dim')
            c.rect(12, y + 2, 83, y + 3, 'biolum_dim')
            c.rect(46, 30, 49, 98, 'biolum_dim')
        # 开启后露出的内部黑暗
        if i >= 3:
            c.rect(48 - open_px + 0, 12, 47 + open_px, 115, 'abyss')
        frames.append(c)
    return frames


# ---------------------------------------------------------------- 沿顶线缆

def make_ceiling_cable() -> list[Canvas]:
    """
    沿顶敷设的供电干线，32×32，4 种接法：
    直段 / 左端头 / 右端头 / 断头垂下。
    这样关卡里可以按管廊长度自动接段，而不是丢几张孤立贴图。
    """
    out = []

    def bracket(c: Canvas, x: int) -> None:
        c.rect(x - 1, 0, x + 1, 3, 'steel_dk')
        c.set(x, 4, 'steel')

    # 直段
    c = Canvas(32, 32)
    c.rect(0, 5, 31, 7, 'abyss')
    c.rect(0, 5, 31, 5, 'slate')
    bracket(c, 8)
    bracket(c, 24)
    out.append(c)

    # 左端头
    c = Canvas(32, 32)
    c.rect(6, 5, 31, 7, 'abyss')
    c.rect(6, 5, 31, 5, 'slate')
    c.rect(4, 3, 9, 9, 'steel_dk')
    c.rect(5, 4, 8, 8, 'steel')
    bracket(c, 22)
    out.append(c)

    # 右端头
    c = Canvas(32, 32)
    c.rect(0, 5, 25, 7, 'abyss')
    c.rect(0, 5, 25, 5, 'slate')
    c.rect(22, 3, 27, 9, 'steel_dk')
    c.rect(23, 4, 26, 8, 'steel')
    bracket(c, 9)
    out.append(c)

    # 断头垂下：干线被扯断，断口在这里
    c = Canvas(32, 32)
    c.rect(0, 5, 14, 7, 'abyss')
    c.rect(0, 5, 14, 5, 'slate')
    bracket(c, 6)
    c.line(14, 7, 17, 14, 'abyss')
    c.line(17, 14, 15, 22, 'abyss')
    c.line(15, 22, 18, 29, 'abyss')
    c.set(18, 30, 'steel_dk')
    out.append(c)

    return out


# ---------------------------------------------------------------- 输出

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=Path('public/assets'))
    args = ap.parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    rng = random.Random(20260824)

    jobs = [
        ('env_debris_sheet', make_debris(rng), 6, {'variants': 6}),
        ('env_fallen_robot_sheet', make_fallen_robot(rng), 4,
         {'tags': {'idle': [0, 3]}, 'fps': 3}),
        ('env_spark_junction_sheet', make_spark_junction(rng), 6,
         {'tags': {'flicker': [0, 5]}, 'fps': 9, 'damage_frames': [3, 4, 5]}),
        ('env_mech_door_sheet', make_mech_door(rng), 6,
         {'tags': {'closed': [0, 0], 'scan': [1, 2], 'open': [3, 5]}, 'fps': 5}),
        ('env_ceiling_cable_sheet', make_ceiling_cable(), 4,
         {'parts': ['run', 'cap_left', 'cap_right', 'torn']}),
    ]

    manifest: dict[str, dict] = {}
    palette = {tuple(v) for v in P.values()}

    for name, frames, cols, meta in jobs:
        img = sheet(frames, cols)
        img.save(out / f'{name}.png')

        # 自检：色板合规 + 二值 Alpha
        bad = set()
        alphas = set()
        for cnt, px in img.getcolors(1 << 20):
            alphas.add(px[3])
            if px[3] and tuple(px[:3]) not in palette:
                bad.add(px[:3])
        assert not bad, f'{name} 超出色板: {bad}'
        assert alphas <= {0, 255}, f'{name} Alpha 非二值: {alphas}'

        manifest[name] = {
            'file': f'{name}.png',
            'frame_size': [frames[0].w, frames[0].h],
            'frames': len(frames),
            'cols': cols,
            **meta,
        }
        print(f'{name:28s} {img.size}  {len(frames)} 帧  色板 OK  Alpha 二值')

    (out / 'env_manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n写入 {out / "env_manifest.json"}')


if __name__ == '__main__':
    main()
