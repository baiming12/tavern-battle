# 天赋系统草案 v0.7

天赋取代原本的“冲脉”成长线，更适合作为通用世界观的战斗构筑。

## 两类天赋

### 被动型
一直生效，例如：

```json
{
  "type": "passive",
  "effects": [
    {"type":"modify_stat","target":"self","stat":"qiSpeed","mode":"percent","value":8}
  ],
  "duration":{"type":"permanent","turns":0}
}
```

### 触发型
基本结构：

**当 Event 发生 → 检查 Condition → 执行 Effect → 持续 Duration**

```json
{
  "type": "triggered",
  "conditions": [
    {"event":"hp_changed","subject":"self","field":"hpPercent","op":"<=","value":30}
  ],
  "effects": [
    {"type":"modify_stat","target":"self","stat":"attack","mode":"percent","value":20}
  ],
  "duration":{"type":"turns","turns":2},
  "cooldown":3
}
```

后续 Event 引擎可支持 attack_hit、attack_crit、damage_taken、move_step、turn_start、turn_end、defend、rest、kill 等事件。

## 奖励 Roll
- 奖励出现时使用独立 Seed。
- 从符合条件的天赋池按 `weight` 加权抽取。
- 默认抽 3 个且不重复。
- 玩家 3 选 1。
- 后续可以加稀有度保底、流派标签、互斥组、前置天赋。


## v0.8 事件归属与 AOE

事件由实际结算产生：
- `attack_hit`：每一个真正命中的角色目标都会产生事件；
- 技能中心格是否存在角色不影响事件；
- 因此地面中心 AOE 能正常触发命中天赋。

`triggerScope` 用于控制一招打中多目标时的触发次数：
- `once_per_action` 默认推荐；
- `per_target` 适合“每命中一个敌人获得X”；
- `once_per_turn`；
- `per_event`。
