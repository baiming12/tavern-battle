
const MODULE_NAME='tavern_battle';
const EXTENSION_FOLDER='third-party/tavern-battle';
const PROMPT_ID='tavern_battle_protocol';
const META_KEY='tavern_battle';
const TRIGGER_RE=/<BATTLE(?:_TRIGGER)?>[\s\S]*?<\/BATTLE(?:_TRIGGER)?>/i;

const DEFAULT_SETTINGS=Object.freeze({
  enabled:true,
  injectProtocol:true,
  autoNarrate:true,
  stripTrigger:true,
  collection:null
});

let initialized=false;
let overlay=null;
let overlayFrame=null;
let overlayMode=null;
let activeTriggerKey=null;
let frameReady=false;
let pendingFrameSetup=null;

// v0.19 protocol injection diagnostics / guards
let internalGenerationDepth=0;
let protocolGenerationAllowed=true;
const protocolDiagnostic={
  registered:false,
  registeredLength:0,
  lastGenerationType:null,
  promptReadySeen:false,
  finalMessagesSeen:false,
  finalRequestConfirmed:false,
  fallbackUsed:false,
  fallbackStage:null,
  lastCheckedAt:0
};

function ctx(){
  return SillyTavern.getContext();
}

function toast(type,message,title='酒馆战斗'){
  const fn=globalThis.toastr?.[type];
  if(fn) fn(message,title);
  else console[type==='error'?'error':'log'](`[${title}] ${message}`);
}

function settings(){
  const c=ctx();
  if(!c.extensionSettings[MODULE_NAME]){
    c.extensionSettings[MODULE_NAME]=structuredClone(DEFAULT_SETTINGS);
  }
  const s=c.extensionSettings[MODULE_NAME];
  for(const [k,v] of Object.entries(DEFAULT_SETTINGS)){
    if(!Object.hasOwn(s,k)) s[k]=structuredClone(v);
  }
  return s;
}

function metadata(){
  const c=ctx();
  c.chatMetadata[META_KEY] ??= {version:1,triggers:{}};
  c.chatMetadata[META_KEY].triggers ??= {};
  return c.chatMetadata[META_KEY];
}

function itemName(bucket,id){
  return bucket?.[id]?.name||id;
}

function actorLoadoutText(collection){
  const lines=[];
  for(const [label,key] of [['我方','allies'],['中立','neutrals'],['敌方','enemies']]){
    const items=Object.values(collection?.[key]||{});
    lines.push(`${label}图鉴：`);
    if(!items.length){ lines.push('- （空）'); continue; }
    for(const a of items){
      const skills=(a.skills||[]).map(id=>`${itemName(collection?.skills,id)}(${id})`).join('、')||'无';
      const equips=(a.equipment||[]).map(id=>`${itemName(collection?.equipment,id)}(${id})`).join('、')||'无';
      const talents=(a.talents||[]).map(id=>`${itemName(collection?.talents,id)}(${id})`).join('、')||'无';
      lines.push(`- ${a.name||a.id} [${a.id}]｜技能=${skills}｜装备=${equips}｜天赋=${talents}`);
    }
  }
  return lines.join('\n');
}

function simpleIndex(title,bucket){
  const items=Object.values(bucket||{});
  if(!items.length) return `${title}：（空）`;
  return `${title}：\n${items.map(x=>`- ${x.name||x.id} = ${x.id}`).join('\n')}`;
}

function fullDataCatalog(collection){
  if(!collection) return '当前没有可用合集索引。';
  return [
    actorLoadoutText(collection),
    simpleIndex('技能ID',collection.skills),
    simpleIndex('装备ID',collection.equipment),
    simpleIndex('天赋ID',collection.talents),
    simpleIndex('状态ID',collection.statuses),
  ].join('\n\n');
}

function currentCollectionForAI(){
  try{
    const live=overlayFrame?.contentWindow?.BattleDemoAPI?.getCollection?.();
    if(live) return live;
  }catch{}
  return settings().collection;
}

function fmtNumber(v){
  const n=Number(v||0);
  return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}

function nonZeroModifiers(modifiers={}){
  const entries=Object.entries(modifiers||{}).filter(([,v])=>Number(v)!==0);
  return entries.length
    ? entries.map(([k,v])=>`${k}${Number(v)>=0?'+':''}${fmtNumber(v)}`).join('，')
    : '无属性修正';
}

function compactEffect(effect={}){
  const target=effect.target?`→${effect.target}`:'';
  if(effect.type==='damage') return `伤害${fmtNumber(effect.multiplier||1)}x${target}`;
  if(effect.type==='heal') return `治疗${fmtNumber(effect.value)}${effect.mode==='percent'?'%':''}${target}`;
  if(effect.type==='apply_status') return `施加${effect.statusId||'?'}×${effect.stacks||1}${target}`;
  if(effect.type==='push') return `击退${effect.distance||1}格${target}`;
  if(effect.type==='pull') return `拉拽${effect.distance||1}格${target}`;
  if(effect.type==='move_self') return `自身位移${effect.distance||1}格`;
  if(effect.type==='shield') return `护盾${fmtNumber(effect.value)}${effect.mode==='percent'?'%':''}${target}`;
  if(effect.type==='lifesteal') return `吸血${fmtNumber(effect.value)}%`;
  if(effect.type==='reflect_damage') return `反伤${fmtNumber(effect.value)}%`;
  if(effect.type==='gain_gauge') return `集气${Number(effect.value)>=0?'+':''}${fmtNumber(effect.value)}${target}`;
  if(effect.type==='refund_qi') return `真气${Number(effect.value)>=0?'+':''}${fmtNumber(effect.value)}${target}`;
  if(effect.type==='modify_stat') return `${effect.stat||'?'}${effect.mode==='percent'?`${fmtNumber(effect.value)}%`:`${Number(effect.value)>=0?'+':''}${fmtNumber(effect.value)}`}${target}`;
  if(effect.type==='dispel') return `驱散${effect.polarity||'any'}×${effect.count||1}${target}`;
  if(effect.type==='summon_unit') return `召唤${effect.templateRef||'?'}${target}`;
  if(effect.type==='summon_object') return `生成地面物「${effect.objectName||'?'}」`;
  return effect.type||'未知效果';
}

function compactRule(rule={}){
  const events=(rule.conditions||[]).filter(c=>c.event).map(c=>c.event).join('+')||'事件?';
  const extra=(rule.conditions||[]).filter(c=>c.field).map(c=>`${c.field}${c.op||'=='}${String(c.value)}`).join('&');
  const effects=(rule.effects||[]).map(compactEffect).join(' + ')||'无效果';
  return `${events}${extra?`[${extra}]`:''} => ${effects}${rule.cooldown?`（内CD${rule.cooldown}）`:''}`;
}

function equipmentReferenceContext(collection){
  const items=Object.values(collection?.equipment||{});
  if(!items.length) return '[装备强度基准]\n（当前合集没有已有装备可参考。）';

  const stats=['attack','defense','maxHp','maxQi','qiSpeed','move','crit','dodge','accuracy','statusResist'];
  const slots=['weapon','armor','accessory','other'];
  const lines=['[装备强度基准]'];

  for(const slot of slots){
    const group=items.filter(x=>(x.slot||'other')===slot);
    if(!group.length) continue;
    lines.push(`\n${slot}：${group.length}件`);

    const ranges=[];
    for(const stat of stats){
      const vals=group.map(x=>Number(x.modifiers?.[stat]||0)).filter(v=>Number.isFinite(v));
      if(!vals.length || vals.every(v=>v===0)) continue;
      const sorted=[...vals].sort((a,b)=>a-b);
      const med=sorted[Math.floor((sorted.length-1)/2)];
      ranges.push(`${stat} ${fmtNumber(sorted[0])}~${fmtNumber(sorted[sorted.length-1])}（中位${fmtNumber(med)}）`);
    }
    if(ranges.length) lines.push(`  属性范围：${ranges.join('；')}`);

    const examples=group.slice(0,12);
    for(const e of examples){
      const rules=(e.rules||[]).map(compactRule).join('；')||'无规则';
      lines.push(`  - ${e.name||e.id} [${e.id}]｜${nonZeroModifiers(e.modifiers)}｜规则：${rules}${e.description?`｜${e.description}`:''}`);
    }
    if(group.length>examples.length) lines.push(`  - ……另有 ${group.length-examples.length} 件未展开`);
  }

  lines.push('\n生成新装备时应以以上同槽位范围和实例为标尺；除非补充要求明确是珍稀/神器级，否则不要显著突破现有同类上限。');
  return lines.join('\n');
}

function skillReferenceContext(collection){
  const items=Object.values(collection?.skills||{});
  if(!items.length) return '[技能强度基准]\n（当前合集没有已有技能可参考。）';

  const lines=['[技能强度基准]'];
  for(const s of items.slice(0,24)){
    const core=(s.coreEffects||[]).map(compactEffect).join(' + ')||'无本体Effect';
    const rules=(s.rules||[]).map(compactRule).join('；')||'无事件规则';
    const cast=s.castMask?`${s.castMask.shape||'?'}/${s.castMask.radius??0}`:'?';
    const area=s.effectMask?`${s.effectMask.shape||'?'}/${s.effectMask.radius??0}`:'?';
    lines.push(`- ${s.name||s.id} [${s.id}]｜${s.kind||'attack'}｜真气${s.qiCost||0}｜CD${s.cooldown||0}｜释放${cast}｜作用${area}｜${core}｜规则：${rules}`);
  }
  if(items.length>24) lines.push(`- ……另有 ${items.length-24} 个技能未展开`);
  lines.push('生成新技能时参考现有真气消耗、CD、范围和倍率/Effect组合，不要在没有理由时全面碾压现有技能。');
  return lines.join('\n');
}

function actorReferenceContext(collection){
  const groups=[
    ['我方',Object.values(collection?.allies||{})],
    ['中立',Object.values(collection?.neutrals||{})],
    ['敌方',Object.values(collection?.enemies||{})]
  ];
  const stats=['maxHp','maxQi','attack','defense','qiSpeed','move','crit','dodge','accuracy','statusResist'];
  const lines=['[角色数值基准]'];

  for(const [label,items] of groups){
    if(!items.length) continue;
    lines.push(`\n${label}：${items.length}个模板`);
    const ranges=[];
    for(const stat of stats){
      const vals=items.map(x=>Number(x[stat]||0)).filter(v=>Number.isFinite(v));
      if(!vals.length) continue;
      ranges.push(`${stat} ${fmtNumber(Math.min(...vals))}~${fmtNumber(Math.max(...vals))}`);
    }
    lines.push(`  区间：${ranges.join('；')}`);
    for(const a of items.slice(0,8)){
      lines.push(`  - ${a.name||a.id} [${a.id}]｜HP${a.maxHp||0} Qi${a.maxQi||0} 攻${a.attack||0} 防${a.defense||0} 集气${a.qiSpeed||0} 移${a.move||0}｜技能${(a.skills||[]).join(',')||'无'}｜装备${(a.equipment||[]).join(',')||'无'}`);
    }
  }
  return lines.join('\n');
}

function statusReferenceContext(collection){
  const items=Object.values(collection?.statuses||{});
  if(!items.length) return '[状态参考]\n（空）';
  return `[状态参考]\n${items.slice(0,30).map(s=>{
    const mods=(s.modifiers||[]).map(m=>`${m.stat}:${m.mode}:${m.value}`).join(',')||'无属性修正';
    const rules=(s.rules||[]).map(compactRule).join('；')||'无规则';
    return `- ${s.name||s.id} [${s.id}]｜${s.polarity}｜层数${s.maxStacks||1}｜持续${s.duration?.type||'?'}:${s.duration?.turns??0}｜${mods}｜${rules}`;
  }).join('\n')}`;
}

function talentReferenceContext(collection){
  const items=Object.values(collection?.talents||{});
  if(!items.length) return '[天赋参考]\n（空）';
  return `[天赋参考]\n${items.slice(0,30).map(t=>{
    const rules=(t.rules||[]).map(compactRule).join('；')||'无规则';
    const effects=(t.effects||[]).map(compactEffect).join(' + ')||'无直接效果';
    return `- ${t.name||t.id} [${t.id}]｜${t.rarity||'common'}｜${t.type||'passive'}｜${effects}｜规则：${rules}`;
  }).join('\n')}`;
}

function taskReferenceContext(kind,collection){
  if(kind==='equipment') return equipmentReferenceContext(collection);
  if(kind==='skill') return [skillReferenceContext(collection),statusReferenceContext(collection)].join('\n\n');
  if(kind==='actor') return [actorReferenceContext(collection),equipmentReferenceContext(collection),skillReferenceContext(collection)].join('\n\n');
  if(kind==='actor_bundle') return [
    actorReferenceContext(collection),
    skillReferenceContext(collection),
    equipmentReferenceContext(collection),
    talentReferenceContext(collection),
    statusReferenceContext(collection)
  ].join('\n\n');
  if(kind==='status') return statusReferenceContext(collection);
  if(kind==='talent') return [talentReferenceContext(collection),statusReferenceContext(collection)].join('\n\n');
  if(kind==='scene'||kind==='battle_trigger') return actorLoadoutText(collection);
  return '';
}

function dataAiContext(kind){
  const collection=currentCollectionForAI();
  const catalog=fullDataCatalog(collection);
  const references=taskReferenceContext(kind,collection);

  return `[酒馆战斗数据上下文]
当前任务类型：${kind}

${catalog}

${references}

引用与强度规则：
- 角色的 skills / equipment / talents 必须优先引用上面已经存在的 ID。
- 技能或规则引用状态时，statusId 必须优先引用上面已有状态 ID。
- 不要把中文名称当 ID。
- 不要杜撰一个不存在的引用 ID；若确实需要新依赖，只生成当前被要求的对象，并在 description 中说明缺少的依赖，不要私自连带创建一整套新对象。
- 新数据的数值强度必须参考同类已有数据；世界书/剧情决定“风格和层级”，现有数据库决定“数值标尺”。`;
}

function protocolText(){
  const s=settings();
  const collection=s.collection;
  const catalog=collection
    ? actorLoadoutText(collection)
    : '当前插件还未保存自定义合集；如需战斗，优先使用已知角色ID。';

  return `[酒馆战斗协议：剧情 → 小游戏交接]
此协议只规定“什么时候停止正文并把战斗交给小游戏”，不改变你原本的文风、人物塑造和小说预设。

【必须交接的时刻】
当剧情已经明确进入一场需要实际结算的战斗，并且“下一项不可逆的战斗动作”即将发生时，立刻停止正常正文。
不可逆战斗动作包括但不限于：真正挥剑/开枪/施法攻击、冲锋接敌、主动战斗位移、第一次命中/闪避/受伤判定。

正文最后允许写到：
- 拔剑、摆开架势、杀意升起；
- 双方对峙、包围完成；
- 某人即将出手；
- 战场环境和相对位置已经明确。

正文绝对不能跨过：
- 第一次攻击已经挥出并产生结果；
- 谁先命中/闪避；
- 任何伤害数值或明确伤势结果；
- 战斗中的移动结果；
- 技能实际是否成功；
- 失去战斗能力、死亡、撤离或最终胜负。

【交接格式】
在停止正文后，整条回复的最后必须附加且只附加一个 <BATTLE> 数据块。
<BATTLE> 是给程序读取的初始场景，不是小说正文。
若本次没有真正进入战斗，不得输出 <BATTLE>。

当前可引用角色及其现有配置：
${catalog}

<BATTLE>
合集=${collection?.name||'默认合集'}
场景=用简短中文描述当前战场，例如“雨夜客栈后院”
尺寸=9
我方=角色ID@列,行,朝向
中立=
敌方=角色ID@列,行,朝向; 角色ID#可选实例名@列,行,朝向
障碍=障碍名@列,行,血量
撤离=列,行,ally
目标=eliminate-or-evacuate
</BATTLE>

【初始场景填写规则】
- 坐标从1开始；朝向只用 N/E/S/W。
- 根据刚刚正文已经描述的空间关系安排双方初始位置，不要随机乱放。
- 单位不能与单位或障碍重叠。
- 同一种敌人模板重复出现时使用 #实例名。
- 只引用当前图鉴中存在的角色ID；其已有技能、装备、天赋由图鉴模板自动载入，不要在 <BATTLE> 中重复填写。
- “障碍”只填写会真实影响战斗走位/攻击线的物体；没有则留空。
- 只有剧情中存在合理撤退路线时才填写“撤离”；没有则留空。
- 场景尺寸默认9；只有空间明显更小/更大时才调整。
- <BATTLE> 必须是整条回复最后的内容，之后不要再写任何小说正文。
- 战斗开始后，小游戏决定事实；战斗结束后会把不可修改的事实重新交给你续写。

【关键原则】
你负责把故事写到“剑将出鞘”；小游戏负责决定“这一剑之后发生什么”。`;
}

function isStoryGenerationType(type){
  const t=String(type||'normal').toLowerCase();
  if(['quiet','impersonate','command','extension','raw','background'].includes(t)) return false;
  return true;
}

function protocolMarker(){
  return '酒馆战斗协议：剧情 → 小游戏交接';
}

function updateProtocolStatusUi(){
  const el=document.querySelector('#tb_protocol_status');
  if(!el) return;

  const c=ctx();
  const entry=c.extensionPrompts?.[PROMPT_ID];
  const registered=!!entry?.value;
  const bits=[
    registered
      ? `已注册 ${String(entry.value).length} 字符（position=${entry.position}, depth=${entry.depth}, role=${entry.role}）`
      : '未注册'
  ];

  if(protocolDiagnostic.finalRequestConfirmed){
    bits.push('最近剧情请求：✅ 最终请求已确认包含协议');
  }else if(protocolDiagnostic.finalMessagesSeen){
    bits.push('最近剧情请求：⚠️ 最终消息已检查但未确认');
  }else{
    bits.push('最近剧情请求：尚未检查');
  }

  if(protocolDiagnostic.fallbackUsed){
    bits.push(`兜底注入：已启用（${protocolDiagnostic.fallbackStage||'unknown'}）`);
  }

  el.textContent=`战斗协议：${bits.join('｜')}`;
}

async function refreshProtocolPrompt(){
  const c=ctx();
  const s=settings();
  if(typeof c.setExtensionPrompt!=='function'){
    protocolDiagnostic.registered=false;
    updateProtocolStatusUi();
    return;
  }

  if(!s.enabled || !s.injectProtocol){
    await c.setExtensionPrompt(PROMPT_ID,'',-1,0,false,0);
    protocolDiagnostic.registered=false;
    protocolDiagnostic.registeredLength=0;
    updateProtocolStatusUi();
    return;
  }

  const text=protocolText();
  const filter=()=>internalGenerationDepth===0 && protocolGenerationAllowed;
  await c.setExtensionPrompt(PROMPT_ID,text,1,0,false,0,filter);

  const entry=c.extensionPrompts?.[PROMPT_ID];
  protocolDiagnostic.registered=!!entry?.value;
  protocolDiagnostic.registeredLength=String(entry?.value||'').length;
  protocolDiagnostic.lastCheckedAt=Date.now();

  const preview=document.querySelector('#tb_protocol_preview');
  if(preview) preview.textContent=text;
  updateProtocolStatusUi();
}

function messageContentText(message){
  if(!message) return '';
  const content=message.content;
  if(typeof content==='string') return content;
  if(Array.isArray(content)){
    return content.map(part=>{
      if(typeof part==='string') return part;
      if(part && typeof part==='object'){
        return part.text||part.content||'';
      }
      return '';
    }).join('\n');
  }
  return String(content||'');
}

function promptArrayHasProtocol(messages){
  return Array.isArray(messages) && messages.some(m=>messageContentText(m).includes(protocolMarker()));
}

function insertProtocolSystemMessage(messages,stage){
  if(!Array.isArray(messages)) return false;
  if(promptArrayHasProtocol(messages)) return false;
  if(!settings().enabled || !settings().injectProtocol) return false;
  if(internalGenerationDepth>0 || !protocolGenerationAllowed) return false;

  const systemMessage={
    role:'system',
    content:protocolText()
  };

  let lastUser=-1;
  for(let i=messages.length-1;i>=0;i--){
    if(messages[i]?.role==='user'){
      lastUser=i;
      break;
    }
  }
  if(lastUser>=0) messages.splice(lastUser,0,systemMessage);
  else messages.push(systemMessage);

  protocolDiagnostic.fallbackUsed=true;
  protocolDiagnostic.fallbackStage=stage;
  console.warn(`[TavernBattle] Protocol was absent at ${stage}; inserted fallback system message.`);
  return true;
}

async function handleGenerationAfterCommands(type,options,dryRun){
  protocolDiagnostic.lastGenerationType=type;
  protocolGenerationAllowed=!dryRun && isStoryGenerationType(type) && internalGenerationDepth===0;

  if(protocolGenerationAllowed){
    // Re-register immediately before ST builds the actual story prompt.
    await refreshProtocolPrompt();
  }
}

function handleChatCompletionPromptReady(eventData){
  if(!protocolGenerationAllowed || internalGenerationDepth>0) return;
  if(eventData?.dryRun) return;

  protocolDiagnostic.promptReadySeen=true;
  const chat=eventData?.chat;
  if(!promptArrayHasProtocol(chat)){
    insertProtocolSystemMessage(chat,'CHAT_COMPLETION_PROMPT_READY');
  }
  updateProtocolStatusUi();
}

function handleChatCompletionSettingsReady(generateData){
  if(!protocolGenerationAllowed || internalGenerationDepth>0) return;

  protocolDiagnostic.finalMessagesSeen=true;
  const messages=generateData?.messages;

  if(!promptArrayHasProtocol(messages)){
    insertProtocolSystemMessage(messages,'CHAT_COMPLETION_SETTINGS_READY');
  }

  protocolDiagnostic.finalRequestConfirmed=promptArrayHasProtocol(messages);
  protocolDiagnostic.lastCheckedAt=Date.now();
  updateProtocolStatusUi();

  if(protocolDiagnostic.finalRequestConfirmed){
    console.log('[TavernBattle] ✅ Final Chat Completion request contains battle protocol.');
  }else{
    console.error('[TavernBattle] ❌ Final Chat Completion request is missing battle protocol.');
  }
}

function handleGenerationFinished(){
  protocolGenerationAllowed=true;
}



function collectionSummary(){
  const c=settings().collection;
  if(!c) return '当前使用小游戏内置默认合集；打开编辑器并保存后，会持久化到酒馆设置。';
  const count=k=>Object.keys(c[k]||{}).length;
  return `${c.name||'未命名合集'}｜我方 ${count('allies')} · 中立 ${count('neutrals')} · 敌方 ${count('enemies')} · 技能 ${count('skills')} · 装备 ${count('equipment')} · 天赋 ${count('talents')} · 状态 ${count('statuses')}`;
}

function updateSettingsUi(){
  const s=settings();
  const ids={
    tb_enabled:s.enabled,
    tb_inject_protocol:s.injectProtocol,
    tb_auto_narrate:s.autoNarrate,
    tb_strip_trigger:s.stripTrigger
  };
  for(const [id,value] of Object.entries(ids)){
    const el=document.querySelector(`#${id}`);
    if(el) el.checked=!!value;
  }
  const status=document.querySelector('#tb_collection_status');
  if(status) status.textContent=collectionSummary();
  const preview=document.querySelector('#tb_protocol_preview');
  if(preview) preview.textContent=protocolText();
  updateProtocolStatusUi();
}

function hashText(text){
  let h=2166136261>>>0;
  for(let i=0;i<text.length;i++){
    h^=text.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(16);
}

function triggerKey(messageId,trigger){
  return `${messageId}:${hashText(trigger)}`;
}

function extractTrigger(text){
  return String(text||'').match(TRIGGER_RE)?.[0]||null;
}

async function captureTriggers({all=false}={}){
  if(!settings().enabled) return false;
  const c=ctx();
  const chat=c.chat||[];
  const ids=all?[...chat.keys()]:chat.length?[chat.length-1]:[];
  const meta=metadata();
  let changed=false;
  let stripped=false;

  for(const i of ids){
    const msg=chat[i];
    if(!msg || msg.is_user || msg.is_system) continue;
    const trigger=extractTrigger(msg.mes);
    if(!trigger) continue;

    const key=triggerKey(i,trigger);
    if(!meta.triggers[key]){
      meta.triggers[key]={
        key,messageId:i,trigger,
        status:'pending',
        createdAt:Date.now(),
        result:null,
        narrative:null
      };
      changed=true;
    }

    if(settings().stripTrigger){
      msg.mes=String(msg.mes||'').replace(trigger,'').trimEnd();
      stripped=true;
      changed=true;
    }
  }

  if(changed){
    await c.saveMetadata?.();
    if(stripped) await c.saveChat?.();
  }
  return stripped;
}

function findTriggerByMessageId(messageId){
  const entries=Object.values(metadata().triggers||{})
    .filter(x=>Number(x.messageId)===Number(messageId))
    .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  return entries[0]||null;
}

function decorateChat(){
  if(!settings().enabled) return;
  for(const item of Object.values(metadata().triggers||{})){
    const mes=document.querySelector(`.mes[mesid="${item.messageId}"]`);
    const text=mes?.querySelector('.mes_text');
    if(!text) continue;
    text.querySelectorAll('.tb-inline-card').forEach(x=>x.remove());

    const card=document.createElement('div');
    card.className='tb-inline-card';
    card.dataset.triggerKey=item.key;

    const completed=['completed','narrated'].includes(item.status);
    card.innerHTML=`
      <span class="tb-card-text">
        <b>${completed?'⚔️ 战斗已结算':'⚔️ 战斗即将开始'}</b>
        <small>${completed?(item.outcomeLabel||'小游戏已经确定战斗事实'):'点击进入本地战斗小游戏；AI不会决定战斗结果。'}</small>
      </span>
      <button class="menu_button ${completed?'tb-view-result':'tb-enter-battle'}" data-trigger-key="${item.key}">
        ${completed?'查看战斗':'进入战斗'}
      </button>`;
    text.appendChild(card);
  }
}

function ensureOverlay(){
  if(overlay) return overlay;

  overlay=document.createElement('div');
  overlay.id='tb_overlay';
  overlay.hidden=true;
  overlay.innerHTML=`
    <header id="tb_overlay_header">
      <span class="tb-overlay-title">
        <b id="tb_overlay_title">酒馆战斗</b>
        <small id="tb_overlay_subtitle">本地小游戏决定事实</small>
      </span>
      <span class="tb-overlay-actions">
        <button id="tb_overlay_save" class="menu_button">保存合集</button>
        <button id="tb_overlay_close" class="menu_button">关闭</button>
      </span>
    </header>
    <iframe id="tb_overlay_frame" title="酒馆战斗"></iframe>
    <footer id="tb_overlay_footer">
      <span id="tb_overlay_status"></span>
      <button id="tb_generate_narrative" class="menu_button" hidden>生成战斗叙事</button>
    </footer>`;
  document.body.appendChild(overlay);

  overlayFrame=overlay.querySelector('#tb_overlay_frame');
  overlay.querySelector('#tb_overlay_close').addEventListener('click',closeOverlay);
  overlay.querySelector('#tb_overlay_save').addEventListener('click',async()=>{
    await saveCollectionFromFrame();
    toast('success','合集已保存到 SillyTavern 扩展设置');
  });
  overlay.querySelector('#tb_generate_narrative').addEventListener('click',async()=>{
    const item=metadata().triggers?.[activeTriggerKey];
    if(item?.result) await narrateBattle(item);
  });
  return overlay;
}

async function saveCollection(collection){
  if(!collection) return;
  settings().collection=structuredClone(collection);
  ctx().saveSettingsDebounced?.();
  updateSettingsUi();
  await refreshProtocolPrompt();
}

async function saveCollectionFromFrame(){
  try{
    const api=overlayFrame?.contentWindow?.BattleDemoAPI;
    if(api?.getCollection) await saveCollection(api.getCollection());
  }catch(err){
    console.warn('[TavernBattle] save frame collection failed',err);
  }
}

function recentStoryContext(limit=8){
  const c=ctx();
  const messages=(c.chat||[])
    .filter(m=>m && !m.is_system)
    .slice(-Math.max(1,Number(limit||8)));

  if(!messages.length) return '（当前聊天还没有可参考的最近剧情。）';

  return messages.map(m=>{
    const role=m.is_user?'用户':(m.name||c.name2||'AI');
    return `【${role}】\n${String(m.mes||'').trim()}`;
  }).join('\n\n');
}

function currentCharacterReference(){
  const c=ctx();
  if(c.groupId) return '（当前为群聊；角色卡参考由最近剧情和世界书承担。）';
  const ch=c.characters?.[c.characterId];
  const data=ch?.data||ch||{};
  const parts=[
    data.name||ch?.name ? `名称：${data.name||ch?.name}` : '',
    data.description ? `角色描述：${data.description}` : '',
    data.personality ? `性格：${data.personality}` : '',
    data.scenario ? `场景设定：${data.scenario}` : ''
  ].filter(Boolean);
  return parts.join('\n') || '（当前角色卡没有可用文本字段。）';
}

function worldInfoScanData(){
  const c=ctx();
  const ch=c.groupId?null:c.characters?.[c.characterId];
  const data=ch?.data||ch||{};
  const depthPrompt=data?.extensions?.depth_prompt?.prompt||data?.depth_prompt?.prompt||'';
  return {
    trigger:'normal',
    personaDescription:c.powerUserSettings?.persona_description||'',
    characterDescription:data.description||'',
    characterPersonality:data.personality||'',
    characterDepthPrompt:depthPrompt,
    scenario:data.scenario||'',
    creatorNotes:data.creator_notes||data.creatorcomment||''
  };
}

function flattenWorldInfoPrompt(result){
  if(!result) return '';
  const chunks=[];
  const add=value=>{
    if(value===null||value===undefined)return;
    if(typeof value==='string'){
      const t=value.trim();
      if(t)chunks.push(t);
      return;
    }
    if(Array.isArray(value)){
      value.forEach(add);
      return;
    }
    if(typeof value==='object'){
      if(typeof value.content==='string')add(value.content);
      if(Array.isArray(value.entries))add(value.entries);
      return;
    }
  };

  add(result.worldInfoBefore);
  add(result.worldInfoAfter);
  add(result.worldInfoExamples);
  add(result.worldInfoDepth);
  add(result.anBefore);
  add(result.anAfter);
  for(const values of Object.values(result.outletEntries||{})) add(values);

  const seen=new Set();
  return chunks.filter(x=>{
    const key=x.trim();
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
  }).join('\n\n');
}

async function activeWorldInfoContext(){
  const c=ctx();
  if(typeof c.getWorldInfoPrompt!=='function'){
    return '（当前 SillyTavern 版本未暴露 getWorldInfoPrompt，无法读取激活世界书。）';
  }

  const scanChat=(c.chat||[])
    .filter(m=>m && !m.is_system)
    .map(m=>String(m.mes||''))
    .reverse();

  const result=await c.getWorldInfoPrompt(
    scanChat,
    Number(c.maxContext||8192),
    true,
    worldInfoScanData()
  );

  const text=flattenWorldInfoPrompt(result);
  return text || '（按照当前聊天扫描，没有世界书条目被激活。）';
}

async function dataAIReferenceContext({includeStory=true,includeWorldInfo=true}={}){
  const chunks=[];

  if(includeStory){
    chunks.push(`[最近剧情参考]\n${recentStoryContext(8)}`);
    chunks.push(`[当前角色参考]\n${currentCharacterReference()}`);
  }

  if(includeWorldInfo){
    chunks.push(`[当前激活世界书]\n${await activeWorldInfoContext()}`);
  }

  return chunks.length
    ? chunks.join('\n\n')
    : '[剧情 / 世界书参考]\n（本次未附加剧情或世界书。）';
}

function schemaFromExample(value){
  if(Array.isArray(value)){
    return {type:'array',items:value.length?schemaFromExample(value[0]):{}};
  }
  if(value && typeof value==='object'){
    const properties={};
    const required=[];
    for(const [k,v] of Object.entries(value)){
      properties[k]=schemaFromExample(v);
      required.push(k);
    }
    return {type:'object',properties,required,additionalProperties:true};
  }
  if(typeof value==='string') return {type:'string'};
  if(typeof value==='number') return {type:'number'};
  if(typeof value==='boolean') return {type:'boolean'};
  return {};
}

async function aiProviderGenerate({
  kind,
  operation='modify',
  prompt,
  schema,
  current=null,
  hints=null,
  includeStory=true,
  includeWorldInfo=true,
  extraRequirements='',
  plainText=false
}){
  const c=ctx();
  const actionLabel=operation==='batch_create'?'批量新建':operation==='bundle_create'?'生成整套':operation==='create'?'新建':'修改';
  const loader=c.loader?.show?.({
    blocking:false,
    message:`战斗数据 AI ${actionLabel}：${kind}`,
    toastMode:'static'
  });

  internalGenerationDepth++;
  const systemPrompt=`你是“酒馆战斗”的结构化数据编辑器，不是小说作者，也不是角色扮演者。
你的唯一任务是依据提供的参考资料、现有战斗数据库和用户要求，创建或修改一个可以被程序直接读取的数据对象。

强制规则：
- 不续写故事，不描写战斗过程，不与用户聊天。
- 当前小说预设、角色口吻和文风只可作为设定背景，不得影响输出格式。
- 世界书和最近剧情只用于判断世界观、人物身份、装备层级、技能风格与合理强度。
- 不为了推动某个剧情结果故意加强或削弱数值。
- 优先复用已有技能 / 装备 / 天赋 / 状态 ID。
- 不把中文显示名称当作 ID。
- CREATE 模式必须创建全新对象与唯一 ID，不复制当前对象。
- BATCH_CREATE 模式中每个条目都必须拥有唯一 ID，并按要求数量返回。
- BUNDLE_CREATE 模式必须先规划整套新 ID，并保证角色、技能、装备、天赋、状态之间的引用闭合。
- MODIFY 模式默认保持原 id，不丢失未要求删除的复杂规则。
- 若要求 JSON，只输出合法 JSON，不要 Markdown 代码块，不要解释。`;

  try{
    const referenceContext=await dataAIReferenceContext({includeStory,includeWorldInfo});
    const databaseContext=dataAiContext(kind);

    const operationContext=operation==='modify'
      ? `[操作语义]\nMODIFY：当前对象是修改基底。默认保持 id=${current?.id||'（未知）'}。`
      : operation==='batch_create'
        ? `[操作语义]\nBATCH_CREATE：一次生成多个全新 ${kind}；每个 ID 都必须唯一，并与现有数据库不同。`
        : operation==='bundle_create'
          ? `[操作语义]\nBUNDLE_CREATE：生成一整套互相引用闭合的角色战斗数据；所有新 ID 必须唯一。`
          : `[操作语义]\nCREATE：生成一个全新的 ${kind}；ID 必须与现有数据库不同。`;

    const extra=String(extraRequirements||'').trim();
    const rawPrompt=[
      databaseContext,
      referenceContext,
      operationContext,
      hints&&Object.keys(hints).length?`[固定约束]\n${JSON.stringify(hints,null,2)}`:'',
      extra?`[用户补充要求]\n${extra}`:'',
      `[本次数据任务]\n${prompt}`
    ].filter(Boolean).join('\n\n');

    let raw;
    const jsonSchema=!plainText && schema&&typeof schema==='object'?{
      name:`TavernBattle_${String(kind||'data').replace(/\W/g,'_')}_${operation}`,
      strict:false,
      value:{
        $schema:'http://json-schema.org/draft-04/schema#',
        ...schemaFromExample(schema)
      }
    }:null;

    if(typeof c.generateRaw==='function'){
      try{
        raw=await c.generateRaw({
          prompt:rawPrompt,
          systemPrompt,
          instructOverride:false,
          trimNames:false,
          responseLength:4096,
          jsonSchema
        });
      }catch(err){
        console.warn('[TavernBattle] generateRaw structured request failed, retrying without schema',err);
        raw=await c.generateRaw({
          prompt:`${rawPrompt}\n\n${plainText?'只输出要求的纯文本。':'只输出合法 JSON。'}`,
          systemPrompt,
          instructOverride:false,
          trimNames:false,
          responseLength:4096
        });
      }
    }else{
      console.warn('[TavernBattle] generateRaw unavailable; falling back to generateQuietPrompt');
      raw=await c.generateQuietPrompt({
        quietPrompt:`${systemPrompt}\n\n${rawPrompt}\n\n${plainText?'只输出要求的纯文本。':'只输出合法 JSON。'}`,
        jsonSchema
      });
    }

    const text=String(raw||'').trim()
      .replace(/^```(?:json)?\s*/i,'')
      .replace(/\s*```$/,'');

    if(plainText)return text;
    try{return JSON.parse(text);}
    catch{
      throw new Error(`模型没有返回合法 JSON。原始输出：${text.slice(0,300)}`);
    }
  }finally{
    internalGenerationDepth=Math.max(0,internalGenerationDepth-1);
    protocolGenerationAllowed=true;
    await loader?.hide?.();
  }
}

async function setupFrame(mode,triggerItem=null){
  const win=overlayFrame.contentWindow;
  const api=win.BattleDemoAPI;
  if(!api) throw new Error('战斗 iframe API 未就绪');

  win.TavernBattleAIProvider={generate:aiProviderGenerate};

  const saved=settings().collection;
  if(saved) api.replaceCollection(saved);

  if(mode==='editor'){
    api.setPaused?.(true);
    const root=win.document.querySelector('#editorRoot');
    if(root?.hidden) win.document.querySelector('#toggleEditorBtn')?.click();
  }else if(triggerItem){
    const scene=api.parseTrigger(triggerItem.trigger);
    api.updateScene(scene,true);
    api.setPaused?.(false);
  }

  frameReady=true;
  updateOverlayStatus(mode==='editor'?'编辑器已连接酒馆当前模型。':'战斗已载入。');
}

function updateOverlayStatus(text,active=false){
  const status=overlay?.querySelector('#tb_overlay_status');
  const footer=overlay?.querySelector('#tb_overlay_footer');
  if(status) status.textContent=text||'';
  if(footer) footer.classList.toggle('active',!!text||active);
}

async function openOverlay({mode='battle',triggerItem=null}={}){
  ensureOverlay();
  overlayMode=mode;
  activeTriggerKey=triggerItem?.key||null;
  frameReady=false;

  overlay.querySelector('#tb_overlay_title').textContent=mode==='editor'?'酒馆战斗 · 数据编辑器':'酒馆战斗';
  overlay.querySelector('#tb_overlay_subtitle').textContent=mode==='editor'?'修改后点击“保存合集”':'小游戏决定事实，AI只负责之后的叙事';
  overlay.querySelector('#tb_generate_narrative').hidden=true;
  updateOverlayStatus('正在载入……',true);

  overlay.hidden=false;
  document.body.classList.add('tb-overlay-open');

  const url=`/scripts/extensions/${EXTENSION_FOLDER}/battle/index.html?mode=${encodeURIComponent(mode)}&v=0.21`;
  overlayFrame.src=url;

  pendingFrameSetup={mode,triggerItem};
}

async function closeOverlay(){
  await saveCollectionFromFrame();
  if(overlay){
    overlay.hidden=true;
    overlayFrame.src='about:blank';
  }
  document.body.classList.remove('tb-overlay-open');
  overlayMode=null;
  activeTriggerKey=null;
  frameReady=false;
  pendingFrameSetup=null;
}

async function addNarrativeMessage(text,item){
  const c=ctx();
  const mesText=String(text||'').trim();
  if(!mesText) throw new Error('模型没有返回战斗叙事');

  const mes={
    name:c.name2||'Narrator',
    mes:mesText,
    is_user:false,
    is_system:false,
    send_date:Date.now(),
    swipes:[mesText],
    swipe_id:0,
    extra:{
      type:'tavern_battle_narrative',
      swipeable:false,
      battle_trigger_key:item.key
    }
  };

  c.chat.push(mes);
  if(typeof c.addOneMessage==='function') c.addOneMessage(mes,{scroll:true});
  await c.saveChat?.();
}

function narrativePrompt(item){
  return `下面是一个本地战斗小游戏已经结算完成的不可修改事实。
请在当前聊天、角色卡、世界书和此前剧情的基础上，直接续写这场战斗及其紧接着的剧情。

要求：
- 从此前回复停止的位置自然接上。
- 把小游戏日志转换成流畅的小说叙事，不要写成战报。
- 命中/未命中、伤害、技能使用、移动、失能、撤离、胜负与最终状态都不可修改。
- 可以补充合理的动作衔接、环境变化、对白、心理、感官与战斗节奏。
- 不得提及 Seed、格子、数值系统、战斗包、小游戏、日志等幕后机制。
- 不得再次输出 <BATTLE> 或 <BATTLE_TRIGGER>。
- 战斗结束后自然过渡到一小段后续剧情，不要替用户角色做超出既有意图的重大决定。

${item.result}`;
}

async function narrateBattle(item){
  if(!item?.result) return;
  const c=ctx();
  const loader=c.loader?.show?.({
    blocking:false,
    message:'正在根据战斗事实续写剧情……',
    title:'酒馆战斗',
    toastMode:'static'
  });
  updateOverlayStatus('正在让当前酒馆模型把战斗事实写回剧情……',true);

  internalGenerationDepth++;
  try{
    const text=await c.generateQuietPrompt({quietPrompt:narrativePrompt(item)});
    await addNarrativeMessage(text,item);
    item.status='narrated';
    item.narrative=String(text||'');
    await c.saveMetadata?.();
    decorateChat();
    updateOverlayStatus('战斗叙事已经写回聊天。',true);
    overlay?.querySelector('#tb_generate_narrative')?.setAttribute('hidden','');
    toast('success','战斗叙事已经续写到聊天中');
  }catch(err){
    console.error('[TavernBattle] narrative failed',err);
    toast('error',`续写失败：${err.message||err}`);
    updateOverlayStatus('自动续写失败，可以点击“生成战斗叙事”重试。',true);
    if(overlay) overlay.querySelector('#tb_generate_narrative').hidden=false;
  }finally{
    internalGenerationDepth=Math.max(0,internalGenerationDepth-1);
    protocolGenerationAllowed=true;
    await loader?.hide?.();
  }
}

function outcomeLabel(outcome){
  return outcome==='victory'?'我方胜利':outcome==='evacuated'?'我方撤离':outcome==='defeat'?'我方败北':'战斗结束';
}

async function handleBattleFinished(payload){
  if(!activeTriggerKey) return;
  const item=metadata().triggers?.[activeTriggerKey];
  if(!item) return;

  item.status='completed';
  item.result=payload.packet;
  item.narrativeLog=payload.narrativeLog;
  item.outcome=payload.outcome;
  item.outcomeLabel=outcomeLabel(payload.outcome);
  item.finishedAt=Date.now();

  if(payload.collection) await saveCollection(payload.collection);
  await ctx().saveMetadata?.();
  decorateChat();

  updateOverlayStatus(`${item.outcomeLabel}。战斗事实已经锁定。`,true);
  const narrateBtn=overlay?.querySelector('#tb_generate_narrative');
  if(narrateBtn) narrateBtn.hidden=settings().autoNarrate;

  if(settings().autoNarrate) await narrateBattle(item);
}

function showStoredResult(item){
  ensureOverlay();
  overlay.hidden=false;
  document.body.classList.add('tb-overlay-open');
  overlay.querySelector('#tb_overlay_title').textContent='酒馆战斗 · 已结算';
  overlay.querySelector('#tb_overlay_subtitle').textContent=item.outcomeLabel||'不可修改战斗事实';
  overlayFrame.src='about:blank';
  updateOverlayStatus(item.status==='narrated'?'已经生成过战斗叙事。':'战斗已结束，可以生成叙事。',true);
  const btn=overlay.querySelector('#tb_generate_narrative');
  btn.hidden=item.status==='narrated';
  activeTriggerKey=item.key;

  // Put result in a lightweight document rather than restarting battle.
  const doc=overlayFrame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><meta charset="utf-8"><style>
    body{background:#101418;color:#e8edf2;font-family:system-ui;margin:0;padding:18px}
    pre{white-space:pre-wrap;line-height:1.55;background:#171c22;border:1px solid #34404b;border-radius:10px;padding:14px}
    h2{margin-top:0}
  </style><h2>${item.outcomeLabel||'战斗结果'}</h2><pre></pre>`);
  doc.close();
  doc.querySelector('pre').textContent=item.result||'没有保存战斗包。';
}

async function handleMessageReceived(){
  try{
    await captureTriggers({all:false});
  }catch(err){
    console.error('[TavernBattle] capture trigger failed',err);
  }
}

async function handleAppReady(){
  let stripped=false;
  try{
    stripped=await captureTriggers({all:true});
  }catch(err){
    console.error('[TavernBattle] initial scan failed',err);
  }

  if(stripped && typeof ctx().reloadCurrentChat==='function'){
    try{ await ctx().reloadCurrentChat(); }
    catch(err){ console.warn('[TavernBattle] reload after strip failed',err); }
  }
  setTimeout(decorateChat,50);
}

function bindGlobalClicks(){
  document.addEventListener('click',e=>{
    const enter=e.target.closest('.tb-enter-battle');
    if(enter){
      const item=metadata().triggers?.[enter.dataset.triggerKey];
      if(item) openOverlay({mode:'battle',triggerItem:item});
      return;
    }

    const view=e.target.closest('.tb-view-result');
    if(view){
      const item=metadata().triggers?.[view.dataset.triggerKey];
      if(item) showStoredResult(item);
    }
  });
}

function bindSettingsUi(){
  const s=settings();
  const bindings=[
    ['#tb_enabled','enabled'],
    ['#tb_inject_protocol','injectProtocol'],
    ['#tb_auto_narrate','autoNarrate'],
    ['#tb_strip_trigger','stripTrigger']
  ];
  for(const [selector,key] of bindings){
    document.querySelector(selector)?.addEventListener('change',async e=>{
      s[key]=!!e.target.checked;
      ctx().saveSettingsDebounced?.();
      if(key==='enabled'||key==='injectProtocol') await refreshProtocolPrompt();
      updateSettingsUi();
      decorateChat();
    });
  }

  document.querySelector('#tb_open_editor')?.addEventListener('click',()=>openOverlay({mode:'editor'}));
  document.querySelector('#tb_test_battle')?.addEventListener('click',()=>openOverlay({mode:'battle'}));
  document.querySelector('#tb_reinject_protocol')?.addEventListener('click',async()=>{
    protocolGenerationAllowed=true;
    await refreshProtocolPrompt();
    const entry=ctx().extensionPrompts?.[PROMPT_ID];
    if(entry?.value){
      toast('success',`战斗协议已重新注册：${String(entry.value).length} 字符`);
    }else{
      toast('error','重新注册失败：extensionPrompts 中仍找不到战斗协议');
    }
    updateProtocolStatusUi();
  });
}

async function init(){
  if(initialized) return;
  initialized=true;

  const c=ctx();
  settings();
  metadata();

  try{
    const html=await c.renderExtensionTemplateAsync(EXTENSION_FOLDER,'settings');
    document.querySelector('#extensions_settings2')?.insertAdjacentHTML('beforeend',html);
    bindSettingsUi();
    updateSettingsUi();
  }catch(err){
    console.error('[TavernBattle] settings UI failed',err);
  }

  ensureOverlay();
  bindGlobalClicks();
  await refreshProtocolPrompt();

  const ev=c.eventTypes||c.event_types;
  c.eventSource?.on(ev.MESSAGE_RECEIVED,handleMessageReceived);
  c.eventSource?.on(ev.CHARACTER_MESSAGE_RENDERED,()=>setTimeout(decorateChat,0));
  c.eventSource?.on(ev.MESSAGE_EDITED,()=>setTimeout(()=>captureTriggers({all:true}).then(decorateChat),0));
  c.eventSource?.on(ev.MESSAGE_SWIPED,()=>setTimeout(()=>captureTriggers({all:true}).then(decorateChat),0));
  c.eventSource?.on(ev.CHAT_CHANGED,()=>setTimeout(handleAppReady,60));
  c.eventSource?.on(ev.APP_READY,handleAppReady);

  // Re-register immediately before each normal story generation.
  c.eventSource?.on(ev.GENERATION_AFTER_COMMANDS,handleGenerationAfterCommands);

  // Chat Completion safety net: inspect the actual outgoing message arrays.
  c.eventSource?.on(ev.CHAT_COMPLETION_PROMPT_READY,handleChatCompletionPromptReady);
  c.eventSource?.on(ev.CHAT_COMPLETION_SETTINGS_READY,handleChatCompletionSettingsReady);

  c.eventSource?.on(ev.GENERATION_ENDED,handleGenerationFinished);
  c.eventSource?.on(ev.GENERATION_STOPPED,handleGenerationFinished);

  window.addEventListener('message',async event=>{
    if(event.origin!==window.location.origin) return;
    if(event.source!==overlayFrame?.contentWindow) return;
    const msg=event.data;
    if(msg?.source!=='tavern-battle-frame') return;

    if(msg.type==='frame-ready'){
      if(pendingFrameSetup){
        const setup=pendingFrameSetup;
        pendingFrameSetup=null;
        try{ await setupFrame(setup.mode,setup.triggerItem); }
        catch(err){
          console.error('[TavernBattle] frame setup failed',err);
          updateOverlayStatus(`载入失败：${err.message}`,true);
          toast('error',`战斗载入失败：${err.message}`);
        }
      }
    }else if(msg.type==='collection-changed'){
      if(msg.payload?.collection) await saveCollection(msg.payload.collection);
    }else if(msg.type==='battle-finished'){
      await handleBattleFinished(msg.payload||{});
    }
  });

  console.log('[TavernBattle] v0.21 initialized');
}

export async function onActivate(){
  // Synchronous-ish lifecycle entry; APP_READY performs asynchronous work.
  setTimeout(()=>init().catch(err=>console.error('[TavernBattle] init failed',err)),0);
}
