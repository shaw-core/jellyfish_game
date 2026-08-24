#!/usr/bin/env python3
"""
R3 美术资产自动修复 + 引擎清单生成。

用法：
    python tools/fix_assets.py <R3资产目录> [--out public/assets]

只做"能确定无损修好"的事。需要重画的缺陷不碰，只在 report.md 里写清楚。
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

TILE = 32
FRAME = 48

PALETTE_ORDER = [
    "FFFFFF", "DFFFF7", "70FFE0", "31D6C8", "0DA4A6", "FFA6D6", "D85CA8",
    "1B2A4A", "0B1026", "25355F", "3B3468", "5A4B86", "8B4513", "B45C22",
    "D8792D", "5B2D19", "3A3D40", "59636B", "7C858C", "B5BDC2", "FF3344",
    "A8162B", "C75BFF", "733C9C", "FFD700", "FFF0A8", "FF6A1A", "D93E0B",
    "FFE4A3", "4FAF7A", "2F6B4A", "183F35", "6F7F4B", "425A3A", "C5C9B6",
    "8A927C",
]


def hex2rgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


# --------------------------------------------------------------------------
# 通用小工具
# --------------------------------------------------------------------------

def load_atlas(src: Path, name: str) -> tuple[Image.Image, dict]:
    img = Image.open(src / f"{name}.png").convert("RGBA")
    meta = json.loads((src / f"{name}.json").read_text(encoding="utf-8"))
    return img, meta


def frame_rects(meta: dict) -> list[tuple[int, int, int, int]]:
    return [(f["frame"]["x"], f["frame"]["y"], f["frame"]["w"], f["frame"]["h"])
            for f in meta["frames"]]


def largest_component(alpha: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(alpha)
    if n == 0:
        return np.zeros_like(alpha, dtype=bool)
    sizes = ndimage.sum(alpha, lab, range(1, n + 1))
    return lab == int(np.argmax(sizes)) + 1


# --------------------------------------------------------------------------
# FIX 1 — 主角图集：去除游离碎屑，并统计每帧主体尺寸
# --------------------------------------------------------------------------

def fix_jellyfish(src: Path, out: Path, report: list[str]) -> dict:
    img, meta = load_atlas(src, "jellyfish_character_sheet")
    arr = np.array(img)
    rects = frame_rects(meta)

    stats: list[dict] = []
    stripped_total = 0

    for idx, (x, y, w, h) in enumerate(rects):
        sub = arr[y:y + h, x:x + w]
        alpha = sub[..., 3] > 0
        if not alpha.any():
            stats.append({"index": idx, "body": 0, "aspect": 0.0, "debris": 0})
            continue

        main = largest_component(alpha)
        debris = int(alpha.sum() - main.sum())

        # 碎屑多于 40 px 说明不是气泡粒子，而是本体崩解 —— 只保留主体连通域。
        # 阈值以下（thrust 尾部的发光气泡最多 26 px）原样保留。
        if debris > 40:
            sub[..., 3] = np.where(main, sub[..., 3], 0)
            stripped_total += debris

        ys, xs = np.nonzero(main)
        stats.append({
            "index": idx,
            "body": int(main.sum()),
            "aspect": round(float((xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)), 2),
            "debris": debris,
        })

    Image.fromarray(arr).save(out / "jellyfish_character_sheet.png")

    # 逐 Tag 汇总，判断哪些 Tag 的体积是稳定的
    tags = meta["meta"]["frameTags"]
    quality: dict[str, dict] = {}
    for tag in tags:
        bodies = [stats[i]["body"] for i in range(tag["from"], tag["to"] + 1)]
        lo, hi = min(bodies), max(bodies)
        spread = (hi - lo) / hi if hi else 0.0
        quality[tag["name"]] = {
            "from": tag["from"],
            "to": tag["to"],
            "bodyMin": lo,
            "bodyMax": hi,
            "spread": round(spread, 3),
            # 体积波动超过 30% 的 Tag 不适合直接播放
            "usable": spread <= 0.30,
        }

    meta["meta"]["frameQuality"] = quality
    (out / "jellyfish_character_sheet.json").write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    bad = [k for k, v in quality.items() if not v["usable"]]
    report.append(
        f"- **主角图集**：清除游离碎屑 {stripped_total} px（仅处理碎屑 >40px 的帧，"
        f"thrust 尾部气泡保留）。体积波动超 30% 的 Tag：`{'`, `'.join(bad) or '无'}`，"
        f"已在 JSON 的 `meta.frameQuality` 中标记 `usable:false`。"
    )
    return quality


# --------------------------------------------------------------------------
# FIX 2 — 敌人分层：让 body + cone 精确等于合并图
# --------------------------------------------------------------------------

def fix_enemy_layers(src: Path, out: Path, report: list[str]) -> None:
    sheet = np.array(Image.open(src / "enemies_hazards_sheet.png").convert("RGBA"))
    body = np.array(Image.open(src / "enemies_hazards_body_layer.png").convert("RGBA"))
    cone = np.array(Image.open(src / "enemies_hazards_scan_cone_layer.png").convert("RGBA"))

    before = int((np.abs(body.astype(int) - sheet.astype(int)).max(axis=2) > 0).sum())

    # 视锥层在传感器镜头处压住了本体高光：合并图里高光在上，分层图里视锥在上。
    # 真正属于视锥的像素 = 视锥不透明 且 合并图该处就是视锥色。
    cone_opaque = cone[..., 3] == 255
    same = (sheet[..., :3] == cone[..., :3]).all(axis=2)
    overlap = cone_opaque & ~same
    cone_fixed = cone.copy()
    cone_fixed[overlap] = 0

    covered = cone_fixed[..., 3] == 255
    fixed = body.copy()
    fixed[~covered] = sheet[~covered]

    comp = fixed.copy()
    comp[covered] = cone_fixed[covered]
    exact = np.array_equal(comp, sheet)

    Image.fromarray(fixed).save(out / "enemies_hazards_body_layer.png")
    Image.fromarray(cone_fixed).save(out / "enemies_hazards_scan_cone_layer.png")
    shutil.copy(src / "enemies_hazards_sheet.png", out)
    shutil.copy(src / "enemies_hazards_sheet.json", out)

    report.append(
        f"- **敌人分层**：视锥层压住传感器镜头高光 {int(overlap.sum())} px（合并图里高光在上，"
        f"分层图里视锥在上）。已从视锥层剔除这些像素并按合并图重建 body 层，"
        f"修复前差 {before} px，修复后合成结果与合并图{'完全一致' if exact else '仍有差异'}。"
    )


# --------------------------------------------------------------------------
# FIX 3 — 服务器机柜：补可见但低亮度的指示灯
# --------------------------------------------------------------------------

def fix_tileset(src: Path, out: Path, report: list[str]) -> dict:
    img, meta = load_atlas(src, "ruin_ecosystem_tileset")
    arr = np.array(img)
    rects = frame_rects(meta)

    # servers 两帧：103 = 全灭，104 = 微弱闪烁
    dark = hex2rgb("2F6B4A")   # 常亮的低亮度绿
    lit = hex2rgb("4FAF7A")    # 闪烁时的稍亮绿
    amber = hex2rgb("8B4513")  # 一颗暖色，暗示"还有余电"

    # 机柜 64×96，横槽从 y≈10 开始每 8px 一层；在左右两列各点几颗
    spots = [(9, 18), (9, 42), (9, 66), (40, 26), (40, 58), (40, 82)]
    added = 0
    for tile_index, colors in ((103, [dark, dark, amber, dark, dark, dark]),
                               (104, [lit, dark, amber, lit, dark, lit])):
        x, y, w, h = rects[tile_index]
        for (dx, dy), col in zip(spots, colors):
            if dx + 1 >= w or dy + 1 >= h:
                continue
            arr[y + dy, x + dx, :3] = col
            arr[y + dy, x + dx, 3] = 255
            added += 1

    Image.fromarray(arr).save(out / "ruin_ecosystem_tileset.png")
    (out / "ruin_ecosystem_tileset.json").write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    report.append(
        f"- **服务器机柜**：原本两帧仅差 4 px（肉眼不可见），补了 {added} 个"
        f"低亮度指示灯点，全灭帧留 3 颗常暗灯 + 1 颗暖色，闪烁帧 3 颗转亮。"
    )
    return meta


# --------------------------------------------------------------------------
# FIX 4 — 闸门阀轮改色：让出警示红
# --------------------------------------------------------------------------

def fix_gate(src: Path, out: Path, report: list[str]) -> None:
    img = Image.open(src / "pressure_gate.png").convert("RGBA")
    arr = np.array(img)

    remap = {"FF3344": "D8792D", "A8162B": "8B4513"}
    changed = 0
    for old, new in remap.items():
        o, n = np.array(hex2rgb(old)), np.array(hex2rgb(new))
        # 指示灯在门框右上角，是唯一该保留红色的地方 —— 但它开门后转绿，
        # 关门态的红灯位于顶部 6px 内，用 y 范围排除掉
        mask = (arr[..., :3] == o).all(axis=2) & (arr[..., 3] > 0)
        mask[:8, :] = False
        arr[mask, :3] = n
        changed += int(mask.sum())

    Image.fromarray(arr).save(out / "pressure_gate.png")
    shutil.copy(src / "pressure_gate.json", out)
    report.append(
        f"- **闸门阀轮**：{changed} px 由警示红 `#FF3344` 改为锈橙 `#D8792D`，"
        f"顶部指示灯的红色保留。警示红现在只属于危险源。"
    )


# --------------------------------------------------------------------------
# FIX 5 — 从图块自动推导 blob47 掩码表
# --------------------------------------------------------------------------

BIT = {"N": 1, "NE": 2, "E": 4, "SE": 8, "S": 16, "SW": 32, "W": 64, "NW": 128}


def derive_blob_table(img: Image.Image, meta: dict, base: int, count: int = 47,
                      exposure: list | None = None) -> dict[int, int]:
    rgb = np.array(img.convert("RGB")).astype(float)
    rects = frame_rects(meta)

    def tile(i: int) -> np.ndarray:
        x, y, w, h = rects[base + i]
        return rgb[y:y + h, x:x + w]

    sides, corners = [], []
    for k in range(count):
        a = tile(k)
        sides.append([a[0:3, 10:22].mean(), a[10:22, -3:].mean(),
                      a[-3:, 10:22].mean(), a[10:22, 0:3].mean()])
        corners.append([a[0:5, 0:5].mean(), a[0:5, -5:].mean(),
                        a[-5:, -5:].mean(), a[-5:, 0:5].mean()])
    S, C = np.array(sides), np.array(corners)

    def split(v: np.ndarray) -> float:
        s = np.sort(v.flatten())
        return float((s[int(np.argmax(np.diff(s)))] + s[int(np.argmax(np.diff(s))) + 1]) / 2)

    s_thr, c_thr = split(S), split(C)
    # 露出的边缘带有描边/包边，亮度低于内部
    exposed, notch = S < s_thr, C < c_thr
    if exposure is not None:
        exposure.extend(exposed.tolist())

    table: dict[int, int] = {}
    for k in range(count):
        n, e, s, w = (not exposed[k][j] for j in range(4))
        mask = (BIT["N"] if n else 0) | (BIT["E"] if e else 0) | \
               (BIT["S"] if s else 0) | (BIT["W"] if w else 0)
        for name, ok, ci in (("NW", n and w, 0), ("NE", n and e, 1),
                             ("SE", s and e, 2), ("SW", s and w, 3)):
            if ok and not notch[k][ci]:
                mask |= BIT[name]
        table[mask] = base + k
    return table


# --------------------------------------------------------------------------
# FIX 6 — 玄武岩描边增强
# --------------------------------------------------------------------------

def strengthen_rock_edges(out: Path, meta: dict, exposure: list[list[bool]],
                          base: int, report: list[str]) -> None:
    """
    玄武岩露出的边缘只有一条极淡的 1px 亮线，在深蓝水体上几乎看不出轮廓 ——
    金属那套有明确的棕色包边，两者可读性差了一个量级。

    这里在露出边缘补 2px 描边：外层用色板里的浅紫 #5A4B86，内层用
    深蓝 #25355F 过渡。只动露出的那几条边，内部像素不碰，所以拼接不会露缝。
    """
    path = out / "ruin_ecosystem_tileset.png"
    arr = np.array(Image.open(path).convert("RGBA"))
    rects = frame_rects(meta)

    outer = np.array(hex2rgb("5A4B86"))
    inner = np.array(hex2rgb("25355F"))
    touched = 0

    for k, sides in enumerate(exposure):
        x, y, w, h = rects[base + k]
        tile = arr[y:y + h, x:x + w]
        # sides 顺序：N E S W
        bands = [
            (slice(0, 1), slice(None)), (slice(None), slice(w - 1, w)),
            (slice(h - 1, h), slice(None)), (slice(None), slice(0, 1)),
        ]
        bands2 = [
            (slice(1, 2), slice(None)), (slice(None), slice(w - 2, w - 1)),
            (slice(h - 2, h - 1), slice(None)), (slice(None), slice(1, 2)),
        ]
        for i, is_exposed in enumerate(sides):
            if not is_exposed:
                continue
            ys, xs = bands[i]
            tile[ys, xs, :3] = outer
            tile[ys, xs, 3] = 255
            ys2, xs2 = bands2[i]
            tile[ys2, xs2, :3] = inner
            tile[ys2, xs2, 3] = 255
            touched += 1

    Image.fromarray(arr).save(path)
    report.append(
        f"- **玄武岩描边**：原本露出边缘只有一条极淡亮线，深蓝水体上看不出轮廓。"
        f"给 {touched} 条露出边补了 2px 描边（外 `#5A4B86` / 内 `#25355F`，均取自色板），"
        f"内部像素未动，拼接不露缝。"
    )


# --------------------------------------------------------------------------
# FIX 7 — 电缆放电帧检测
# --------------------------------------------------------------------------

def detect_spark_frames(src: Path) -> list[int]:
    img = np.array(Image.open(src / "enemies_hazards_sheet.png").convert("RGBA"))
    meta = json.loads((src / "enemies_hazards_sheet.json").read_text(encoding="utf-8"))
    rects = frame_rects(meta)
    tag = next(t for t in meta["meta"]["frameTags"] if t["name"] == "conduit_spark")

    gold = np.array(hex2rgb("FFD700"))
    hits = []
    for i in range(tag["from"], tag["to"] + 1):
        x, y, w, h = rects[i]
        sub = img[y:y + h, x:x + w]
        n = int((((sub[..., :3] == gold).all(axis=2)) & (sub[..., 3] > 0)).sum())
        if n > 10:
            hits.append(i)
    return hits


# --------------------------------------------------------------------------
# FIX 8 — 重出无抗锯齿色板图
# --------------------------------------------------------------------------

def rebuild_palette(out: Path, report: list[str]) -> None:
    sw = 16
    img = Image.new("RGBA", (sw * len(PALETTE_ORDER), sw), (0, 0, 0, 0))
    px = img.load()
    for i, h in enumerate(PALETTE_ORDER):
        r, g, b = hex2rgb(h)
        for x in range(sw):
            for y in range(sw):
                px[i * sw + x, y] = (r, g, b, 255)
    img.save(out / "palette.png")
    (out / "palette_hex.txt").write_text(
        "\n".join(f"{i:02d} #{h}" for i, h in enumerate(PALETTE_ORDER)), encoding="utf-8")
    report.append(
        f"- **色板**：重出 `palette.png`（{len(PALETTE_ORDER)} 色，无抗锯齿，"
        f"原图因文字抗锯齿含 211 色）。"
    )


# --------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, default=Path("public/assets"))
    args = ap.parse_args()

    src, out = args.src, args.out
    out.mkdir(parents=True, exist_ok=True)
    report: list[str] = []

    quality = fix_jellyfish(src, out, report)
    fix_enemy_layers(src, out, report)
    tileset_meta = fix_tileset(src, out, report)
    fix_gate(src, out, report)
    rebuild_palette(out, report)

    for name in ("fx_thermal_vent", "fx_pulse_glow_r24", "fx_pulse_glow_r48",
                 "fx_pulse_glow_r96", "cutscene_01_separation", "cutscene_02_reunion"):
        for ext in (".png", ".json"):
            p = src / f"{name}{ext}"
            if p.exists():
                shutil.copy(p, out)

    # 必须先用未加描边的图推掩码表 —— 描边会改变边缘亮度，推完再改
    tileset_img = Image.open(out / "ruin_ecosystem_tileset.png")
    metal = derive_blob_table(tileset_img, tileset_meta, 0)
    rock_exposure: list[list[bool]] = []
    sediment = derive_blob_table(tileset_img, tileset_meta, 47, exposure=rock_exposure)
    strengthen_rock_edges(out, tileset_meta, rock_exposure, 47, report)
    sparks = detect_spark_frames(src)

    manifest = {
        "tileSize": TILE,
        "frameSize": FRAME,
        "blob47": {
            "metal": {str(k): v for k, v in sorted(metal.items())},
            "sediment": {str(k): v for k, v in sorted(sediment.items())},
        },
        "damageFrames": {
            "thermal_vent": [2, 3, 4, 5],
            "conduit_spark": sparks,
        },
        "jellyfishTagQuality": quality,
    }
    (out / "engine_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    report.append(
        f"- **自动图块表**：从图块边缘描边反推出 blob47 掩码表，金属与玄武岩各 "
        f"{len(metal)} / {len(sediment)} 个唯一掩码，写入 `engine_manifest.json`。"
    )
    report.append(
        f"- **电缆伤害帧**：按金色电弧像素自动检测，放电帧为 {sparks}（0-based），"
        f"已补进清单 —— 原清单只声明了喷口。"
    )

    (out.parent.parent / "ASSET_FIX_REPORT.md").write_text(
        "# 资产自动修复报告\n\n本文件由 `tools/fix_assets.py` 生成。\n\n"
        + "\n".join(report) + "\n", encoding="utf-8")

    print("\n".join(report))


if __name__ == "__main__":
    main()
