#!/usr/bin/env python3
"""
Zone 1 前四拍（教学段）关卡生成器。

设计依据见《Zone1重新设计_教学节奏与剧情线》。核心原则：
**一次只教一件事，并且把关卡剥到只剩要教的那件事。**

    第 1 拍 进水格栅   教「蓄力喷射」  技能闸门 = 逆着进水流的窄口
    第 2 拍 沉淀池     教「生物脉冲」  技能闸门 = 全黑房间，出口只能靠光找到
    第 3 拍 管廊入口   引入「漏电线缆」通道很宽，绕过去毫无压力
    第 4 拍 管廊中段   测试「漏电线缆」两根错相放电，通道收窄

这一段**完全没有机械眼**。玩家在学会看和动之前，不该被要求躲。

图例：
    #  设施衬里(实心)   %  海床岩层(实心)   .  开放水域
    S  出生点   *  检查点   C  漏电线缆   >  区段出口
    1..4  对白触发点（第 N 拍）
    <  逆流区（向左推，玩家必须蓄力喷射才能穿过）
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

W, H = 96, 30
METAL, ROCK, OPEN = '#', '%', '.'

grid = [[ROCK for _ in range(W)] for _ in range(H)]
# 每格属于哪个衬里分区，决定用哪一套图块
zone = [[None for _ in range(W)] for _ in range(H)]

rooms: dict[str, tuple] = {}


def room(name, x0, y0, x1, y1, z):
    rooms[name] = (x0, y0, x1, y1, z)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < W and 0 <= y < H:
                grid[y][x] = OPEN
    # 分区标记向外扩 3 格，衬里才有归属
    for y in range(y0 - 3, y1 + 4):
        for x in range(x0 - 3, x1 + 4):
            if 0 <= x < W and 0 <= y < H and zone[y][x] is None:
                zone[y][x] = z


def wall(x0, y0, x1, y1, ch=METAL):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < W and 0 <= y < H:
                grid[y][x] = ch


# ---------------------------------------------------------------- 第 1 拍
# 进水格栅：一间高竖井，主角从顶部落下。出口是一道窄缝，
# 缝里有向下/向外的进水流 —— 漂是漂不上去的，必须蓄满一次喷射。
room('intake_hall', 4, 4, 22, 22, 'intake')
for x in range(9, 15):          # 顶部破口，主角从这里进来
    for y in range(0, 5):
        grid[y][x] = OPEN
        zone[y][x] = 'intake'

# 窄缝：只有 3 格高，位于右上，必须向上顶着水流冲进去
room('intake_gap', 22, 8, 30, 10, 'intake')

# ---------------------------------------------------------------- 第 2 拍
# 沉淀池：一间大而全黑的房间。出口不在初始视野半径内，
# 只有放一次脉冲才能看见对岸的开口。
room('basin', 30, 6, 52, 22, 'intake')
wall(30, 21, 52, 22, ROCK)      # 池底沉积
room('basin_exit', 52, 10, 56, 13, 'duct')

# ---------------------------------------------------------------- 第 3 拍
# 管廊入口：很宽（5 格高），一根线缆挂在正中，两侧都能轻松绕过。
room('duct_intro', 56, 9, 72, 14, 'duct')

# ---------------------------------------------------------------- 第 4 拍
# 管廊中段：收窄到 3 格高，两根线缆错相放电，要卡时机。
room('duct_test', 72, 10, 90, 12, 'duct')
room('duct_exit', 90, 8, 94, 14, 'hall')   # 通向第 5 拍（观察窗），本段止于此

# ---------------------------------------------------------------- 材质
# 贴着房间的实心格是设施衬里，其余是海床岩层。
# 分区归属已经在 room() 里标好，这里只把有归属的实心格改成金属。
for y in range(H):
    for x in range(W):
        if grid[y][x] == OPEN:
            continue
        if zone[y][x] is not None:
            grid[y][x] = METAL

# 沉淀池底保持岩层：泥沙是从海床来的
wall(30, 21, 52, 22, ROCK)
for y in range(21, 23):
    for x in range(30, 53):
        zone[y][x] = None


SPAWN = (11, 2)
CONDUITS = [(64, 9), (78, 10), (85, 10)]
CHECKPOINTS = [(12, 18), (34, 12), (60, 12), (76, 11)]
# 逆流区：矩形 + 推力方向（dx, dy），单位是加速度
CURRENTS = [
    # 窄缝里向外（向左）推，堵住漂移
    {'rect': (22, 8, 30, 10), 'push': (-165, 0), 'note': '进水流'},
    # 竖井里持续向下的沉降流，让"往上走"本身有代价
    {'rect': (4, 4, 22, 22), 'push': (0, 70), 'note': '沉降流'},
]
TRIGGERS = [
    {'at': (12, 8), 'beat': 1},
    {'at': (33, 12), 'beat': 2},
    {'at': (58, 12), 'beat': 3},
    {'at': (92, 11), 'beat': 4},
]
EXIT = (93, 11)


def flood(passable):
    seen = {SPAWN}
    q = deque([SPAWN])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if 0 <= n[0] < W and 0 <= n[1] < H and grid[n[1]][n[0]] in passable and n not in seen:
                seen.add(n)
                q.append(n)
    return seen


problems = []
reach = flood({OPEN})
total = sum(r.count(OPEN) for r in grid)
if len(reach) != total:
    problems.append(f'有 {total - len(reach)} 格开放区不连通')
if EXIT not in reach:
    problems.append('出口不可达')

for name, pts in (('conduit', CONDUITS), ('checkpoint', CHECKPOINTS),
                  ('spawn', [SPAWN]), ('trigger', [t['at'] for t in TRIGGERS]),
                  ('exit', [EXIT])):
    for x, y in pts:
        if grid[y][x] != OPEN:
            problems.append(f'{name} {(x, y)} 落在非开放格')

# 竖直净空：主角 96px = 3 格。要量的是该格所在的**连续开放段长度**，
# 不是以它为中心的 3 格窗口 —— 房间顶行天然只有 2 格，会误报
def run_len(x, y):
    top = y
    while top > 0 and grid[top - 1][x] == OPEN:
        top -= 1
    bot = y
    while bot < H - 1 and grid[bot + 1][x] == OPEN:
        bot += 1
    return bot - top + 1


for y in range(H):
    for x in range(W):
        if grid[y][x] == OPEN and run_len(x, y) < 3:
            problems.append(f'净空不足 {(x, y)}')

# 技能闸门校验。
#
# 判据不是"一次喷射冲过全程" —— 玩家可以连续喷。真正要保证的是
# **每个喷射周期的净位移**：漂移必须倒退，满蓄必须前进。
THRUST_MIN, THRUST_MAX = 60, 420
DRAG_LIN, DRAG_QUAD = 0.9, 0.0055
GAP_LEN = (30 - 22) * 32
PUSH = 165
CYCLE = 0.8                       # 一次蓄力+喷射的周期


def net_per_thrust(v0):
    v, dist, t, dt = v0, 0.0, 0.0, 1 / 60
    while t < CYCLE:
        drag = DRAG_LIN * v + DRAG_QUAD * abs(v) * v
        v = v - (drag + PUSH) * dt
        dist += v * dt
        t += dt
    return dist


a, b = net_per_thrust(THRUST_MIN), net_per_thrust(THRUST_MAX)
need = GAP_LEN / b if b > 0 else 999
print(f'窄缝 {GAP_LEN}px，进水流推力 {PUSH}')
print(f'  轻点一次净位移 {a:+.0f}px  → {"会被推回去 ✅" if a < 0 else "能蒙混过关 ❌"}')
print(f'  满蓄一次净位移 {b:+.0f}px  → 需要连续 {need:.1f} 次才能穿过')
if a >= 0:
    problems.append('技能闸门失效：不蓄力也能过')
if b <= 0:
    problems.append('技能闸门过严：满蓄也在倒退')
if need > 4:
    problems.append(f'窄缝过长：要喷 {need:.1f} 次，会变成折磨')

print()
print('房间:', ', '.join(f'{k}{v[:4]}' for k, v in rooms.items()))
print('开放格', total, '连通', len(reach))
print('校验:', '通过' if not problems else problems[:6])

for x, y in CONDUITS:
    grid[y][x] = 'C'
for x, y in CHECKPOINTS:
    grid[y][x] = '*'
grid[SPAWN[1]][SPAWN[0]] = 'S'
grid[EXIT[1]][EXIT[0]] = '>'

lines = [''.join(r) for r in grid]
zlines = [''.join((z or '.')[0] for z in row) for row in zone]
Path('/tmp/zone1_tut.txt').write_text('\n'.join(lines), encoding='utf-8')
Path('/tmp/zone1_tut_zone.txt').write_text('\n'.join(zlines), encoding='utf-8')
print()
print('\n'.join(lines))
