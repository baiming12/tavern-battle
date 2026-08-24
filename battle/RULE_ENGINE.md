# 通用战斗规则引擎 v0.9

所有复杂机制统一表示为：

```text
Source（技能/装备/天赋/状态）
  ↓
Event
  ↓
Condition
  ↓
Effect
  ↓
Duration / Cooldown / TriggerScope
```

## 规则示例：技能命中施加流血

```json
{
  "id": "second_bleed",
  "conditions": [{"event":"attack_hit"}],
  "effects": [{"type":"apply_status","target":"target","statusId":"bleeding","stacks":1}],
  "triggerScope": "per_target"
}
```

## 状态示例：流血

```json
{
  "id":"bleeding",
  "name":"流血",
  "polarity":"debuff",
  "maxStacks":3,
  "stackMode":"add_refresh",
  "duration":{"type":"turns","turns":3},
  "rules":[{
    "conditions":[{"event":"turn_end"}],
    "effects":[{"type":"deal_damage","target":"self","value":28,"perStack":true}]
  }]
}
```

规则引擎按实际战斗事件运行。AOE 点击空地但命中目标时，依旧会产生每个目标各自的 `attack_hit`。


## v0.10 多规则示例

```json
{
  "rules": [{
    "conditions": [{"event":"attack_hit"}],
    "effects": [
      {"type":"apply_status","target":"target","statusId":"bleeding","stacks":1},
      {"type":"gain_gauge","target":"self","value":10},
      {"type":"refund_qi","target":"self","value":5}
    ]
  }]
}
```

状态可以使用 `tags`、`controlTags`、`conflicts`、`applyChance`；角色可使用 `statusResist` 与 `immunities`。


## v0.11 技能主动效果

技能分成两层：

```text
技能释放
├─ coreEffects：本体直接效果
│  ├─ damage
│  ├─ heal
│  ├─ apply_status
│  ├─ push / pull
│  └─ move_self
└─ rules：监听 Event 的额外规则
```

这样 AI 生成一个新技能时，普通机制主要通过数据即可表达。


## v0.12 高级 Effect

新增 `shield / lifesteal / reflect_damage / swap_position / teleport_behind / summon_unit / summon_object`。
Core Effect 目标新增 `random_enemies / random_allies / random_units`。
