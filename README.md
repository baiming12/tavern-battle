# 酒馆战斗 · SillyTavern 扩展 v0.15

这是把独立战斗 Demo v0.14 接入 SillyTavern 的第一版闭环。

## 当前闭环

1. 扩展通过 `setExtensionPrompt` 给正常剧情模型一份很短的战斗触发协议。
2. 当剧情即将开战时，模型必须停在第一项战斗动作之前，并在末尾输出 `<BATTLE>...</BATTLE>`。
3. 扩展在 `MESSAGE_RECEIVED` 阶段读取并保存触发数据；默认从聊天正文移除隐藏块。
4. 对应 AI 消息下方显示“⚔️ 进入战斗”。
5. 点击后以全屏 iframe 打开本地战斗引擎。
6. 小游戏独立决定命中、伤害、移动、失能、撤离和胜负。
7. 战斗结束产生 `<BATTLE_RESULT>`。
8. 默认使用 SillyTavern 当前模型的 `generateQuietPrompt()`，把不可修改事实转成小说叙事。
9. 叙事作为新的 AI 消息追加到原聊天。

## AI 数据填写

独立 Demo 的 `TavernBattleAIProvider` 已桥接到 SillyTavern 当前模型：

- 场景 AI 填写
- 角色 / 敌人 AI 填写
- 技能
- 装备
- 天赋
- 状态

不需要第二套 API Key。

## 数据保存

点击扩展设置中的“打开数据编辑器”。

iframe 中的合集变更会同步到 `extensionSettings.tavern_battle.collection`。
也可以在顶部点击“保存合集”。

## 安装（压缩包测试版）

把整个 `tavern-battle` 扩展目录放到 SillyTavern 可加载的第三方扩展目录中。

开发/全用户安装常见路径：

`SillyTavern/public/scripts/extensions/third-party/tavern-battle/`

目录内应直接存在：

- `manifest.json`
- `index.js`
- `style.css`
- `settings.html`
- `battle/`

然后重启 SillyTavern，并在扩展管理中确认“酒馆战斗”已启用。

## SillyTavern 版本

manifest 当前声明 `minimum_client_version: 1.18.0`。

此版本使用的接口包括：

- `SillyTavern.getContext()`
- `extensionSettings`
- `chatMetadata`
- `saveChat`
- `saveMetadata`
- `setExtensionPrompt`
- `generateQuietPrompt`
- `addOneMessage`
- `renderExtensionTemplateAsync`
- 消息与 APP 事件

## 当前已知边界

- 这是“接入 Beta”，还没有做 GitHub 一键安装仓库。
- 战斗触发协议目前要求 AI 引用当前图鉴已有角色 ID；遇到图鉴外的新敌人，先在编辑器创建/AI填写。
- 自动战斗叙事当前一次生成完整战斗；之前设计的长战斗分阶段叙事还没在接入层启用。
- 群聊中自动追加叙事的发言者策略还需要单独打磨。
