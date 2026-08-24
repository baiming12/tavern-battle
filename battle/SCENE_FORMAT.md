# 战斗初始场景格式（v0.6）

推荐工作流：

1. **合集**负责长期保存角色图鉴。
2. **scene.json**只负责本场战斗：地图尺寸、角色初始摆位、障碍物、撤离点。
3. `placements[].ref` 指向合集图鉴中的角色 ID。
4. 如需本场临时改数值，用 `placements[].overrides`，不要复制整份角色数据。

## 合集目录

```text
我的合集/
├─ collection.json
├─ scenes.json
├─ 我方图鉴/
│  ├─ hero_a.json
│  └─ hero_b.json
├─ 中立图鉴/
│  └─ npc_a.json
└─ 敌方图鉴/
   ├─ bandit_a.json
   └─ boss_a.json
```

其中只有三个“图鉴文件夹”；场景列表放在合集根目录的 `scenes.json`。

## scene.json 示例

```json
{
  "schema": "tavern-battle-scene",
  "version": 1,
  "id": "bamboo-road-demo",
  "name": "竹林山道",
  "boardSize": 9,
  "placements": [
    {
      "team": "ally",
      "ref": "p1",
      "x": 1,
      "y": 6,
      "facing": "N",
      "overrides": { "gauge": 58 }
    }
  ],
  "obstacles": [
    {
      "id": "rock-1",
      "name": "山石",
      "x": 4,
      "y": 3,
      "maxHp": 520,
      "hp": 520
    }
  ],
  "evacPoints": [
    {
      "id": "exit-southwest",
      "name": "西南撤离点",
      "x": 0,
      "y": 8,
      "allowedTeams": ["ally"]
    }
  ]
}
```

坐标目前为 **0 开始**，即左上角 `(0,0)`。界面显示仍为 1 开始。

## 障碍物

- 有 `name / hp / maxHp / x / y`。
- 阻挡普通移动、轻功落点和 AI 寻路。
- 可以被攻击技能命中。
- HP 归零后销毁，该格恢复通行。

## 撤离点

- 角色站在允许自己阵营使用的撤离点上时，行动栏出现【撤离】。
- 撤离后角色从时间轴和战场中移除，但不会记作“失去战斗能力”。
- 当我方没有仍在场的角色、且至少一人已撤离时，战斗以“撤离成功”结束。


## 攻击遮挡

障碍物默认阻断攻击射线：

```json
{
  "id": "rock-1",
  "name": "山石",
  "x": 4,
  "y": 3,
  "maxHp": 520,
  "hp": 520,
  "blocksAttack": true
}
```

规则：
- 障碍物本身可以被选中攻击；
- 障碍物后面的格子不能隔着它作为技能落点；
- 障碍物销毁后，射线立即恢复；
- 如某种物件只阻挡移动、不阻挡攻击，可设 `"blocksAttack": false`。
