# 酒馆战斗 · SillyTavern 扩展 v0.21

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


## v0.16 联调修复

- 修复手机端全屏层未稳定占满动态视口，导致底层 SillyTavern 扩展列表露出的问题。
- 手机端“保存合集 / 关闭”等按钮强制横排文字，并改为两列工具栏；设置页按钮在窄屏下改为整行。
- 数据编辑器嵌入模式隐藏战斗棋盘与时间轴，打开后直接展开编辑器，减少手机端无意义滚动。
- “AI填写”从 `generateQuietPrompt` 改为优先 `generateRaw`：使用当前连接的模型，但使用独立的数据 system prompt，不携带小说聊天上下文去写故事。
- 战斗结束续写仍保留 `generateQuietPrompt`，因为那一步本来就需要当前角色卡、世界书、聊天和小说预设。
- AI 数据填写现在附带完整的现有角色 / 技能 / 装备 / 天赋 / 状态 ID 索引。
- 正常剧情触发协议只发送角色及其已装备技能/装备/天赋，避免未来数据库变大后每次剧情请求都发送几百条无关 ID。


## v0.17：AI 新建 / 修改分离 + 剧情 / 激活世界书参考

数据编辑器的 AI 操作拆成两类：

- `✨ AI新建`：不把当前浏览对象当模板；要求生成新的唯一 ID。
- `🪄 AI修改当前`：当前对象作为修改基底；默认保持原 ID，并尽量保留未要求删除的复杂规则。

AI 面板新增：

- `附加最近剧情与当前角色参考`
- `附加当前激活世界书`
- `补充要求`

世界书不是把所有 Lorebook 全量塞给模型，而是调用 SillyTavern 当前的 World Info 扫描逻辑，
对当前聊天执行 dry-run，只提取当前会被激活的条目内容。

数据生成依旧优先使用 `generateRaw()` 和独立结构化 system prompt：
剧情与世界书只作为参考资料，不会把数据 AI 变回小说续写器。

同时补齐 AI 目标结构：
- 角色：statusResist / immunities
- 技能：aiWeight / coreEffects / rules
- 装备：statusResist / rules
- 天赋：rules
- 场景：blocksMovement / blocksAttack


## v0.18：数据强度基准 + 更严格的剧情交接

AI 数据生成现在按任务类型附加同类强度参考：

- 装备：同槽位属性范围（min/max/中位数）+ 代表装备属性、规则、说明；
- 技能：真气、CD、释放/作用范围、Core Effect、事件规则；
- 角色：已有角色主要属性区间和样例；
- 状态 / 天赋：持续、层数、属性修正和规则摘要。

世界书 / 剧情负责决定“设定层级和风格”，现有战斗数据库负责决定“数值标尺”。

剧情 AI 的交接协议也强化为：
- 第一项不可逆战斗动作之前停止正文；
- 最后输出隐藏 `<BATTLE>` 初始场景；
- BATTLE 包含地图尺寸、双方位置/朝向、障碍、撤离点和目标；
- 点击“进入战斗”后由插件自动解析并导入，无需手工复制。


## v0.19：修复剧情战斗协议未进入真实请求

v0.18 只在扩展初始化 / 设置变化时调用 `setExtensionPrompt()`。
在部分 SillyTavern Chat Completion + 自定义预设组合中，用户实际请求日志里可能完全看不到战斗协议。

v0.19 使用三层保障：

1. 初始化时注册 `setExtensionPrompt`；
2. 每次 `GENERATION_AFTER_COMMANDS`（真实提示词构建前）重新注册；
3. Chat Completion 在 `CHAT_COMPLETION_PROMPT_READY` 和
   `CHAT_COMPLETION_SETTINGS_READY` 检查实际 outgoing message array。
   若最终数组仍缺少协议，则插入一条 system message 作为兜底。

设置页新增“战斗协议状态”，会显示：
- extensionPrompts 是否已经注册；
- 最近一次剧情请求的最终 messages 是否确认包含协议；
- 是否触发过兜底注入。

新增“重新注入战斗协议”按钮。

内部数据 AI (`generateRaw`) 与战斗后小说续写 (`generateQuietPrompt`) 会通过
`internalGenerationDepth` 排除战斗触发协议，避免数据生成或结算续写误触发新的 `<BATTLE>`。


## v0.21：以 v0.19 为基线合入批量生成

本版本明确以 v0.19 为基线，因此完整保留：

- 初始化 `setExtensionPrompt` 注册；
- `GENERATION_AFTER_COMMANDS` 每次剧情生成前重新注册；
- `CHAT_COMPLETION_PROMPT_READY` 检查；
- `CHAT_COMPLETION_SETTINGS_READY` 最终 outgoing messages 检查与 system-message 兜底；
- 协议注入状态显示；
- “重新注入战斗协议”按钮；
- 数据 AI / 战后内部续写不会误注入新的战斗触发协议。

在此基础上合入批量数据功能：

### ✨ AI批量新建
支持：
- 角色 1~5
- 技能 1~10
- 装备 1~10
- 天赋 1~8
- 状态 1~10

流程：AI返回 → 预览 → 勾选 → ID冲突检查 → 批量导入。

### 🧙 AI生成角色整套
一次生成：
- actor × 1
- skills × 若干
- equipment × 若干
- talents × 若干
- statuses × 必要时生成

生成时会附加角色 / 技能 / 装备 / 天赋 / 状态的现有数值与规则参照，
并要求先规划 ID、保证引用闭合。

导入前检查：
- 新 ID 与现有数据库冲突；
- 批次内部重复；
- actor.skills / equipment / talents 是否引用到已有对象或本次新对象。

导入顺序：
状态 → 技能 → 装备 → 天赋 → 角色。
