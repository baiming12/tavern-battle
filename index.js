
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

function actorCatalogText(collection){
  const lines=[];
  for(const [label,key] of [['我方','allies'],['中立','neutrals'],['敌方','enemies']]){
    const items=Object.values(collection?.[key]||{});
    lines.push(`${label}图鉴：${items.length?items.map(x=>`${x.name||x.id}=${x.id}`).join('；'):'（空）'}`);
  }
  return lines.join('\n');
}

function protocolText(){
  const s=settings();
  const collection=s.collection;
  const catalog=collection
    ? actorCatalogText(collection)
    : '当前插件还未保存自定义合集；如需战斗，优先使用已知角色ID。';

  return `[酒馆战斗协议]
你正在与一个本地战斗小游戏协作。

当且仅当剧情已经明确即将进入需要实际结算的战斗时：
1. 正常叙事只能写到“第一项战斗动作发生之前”为止。
2. 不得替任何角色决定攻击命中、伤害、闪避、移动、技能结果、死亡或最终胜负。
3. 在回复最末尾附加一个 <BATTLE> 块。
4. 若本次没有进入战斗，不得输出 <BATTLE>。
5. 战斗中的事实由小游戏决定，战斗结束后会把事实重新提供给你续写。

当前可引用图鉴：
${catalog}

格式：
<BATTLE>
合集=${collection?.name||'默认合集'}
场景=用简短中文描述当前战场
尺寸=9
我方=角色ID@列,行,朝向
中立=
敌方=角色ID@列,行,朝向; 角色ID#可选实例名@列,行,朝向
障碍=障碍名@列,行,血量
撤离=列,行,ally
目标=eliminate-or-evacuate
</BATTLE>

规则：
- 坐标从1开始。
- 朝向只用 N/E/S/W。
- 同一种模板重复出现时可用 #实例名。
- 只引用当前图鉴中存在的角色ID；不要在 <BATTLE> 内临时捏造完整角色属性。
- 地图、障碍、初始位置应根据刚刚的剧情合理安排。
- <BATTLE> 必须放在整条回复最后。`;
}

async function refreshProtocolPrompt(){
  const c=ctx();
  const s=settings();
  if(typeof c.setExtensionPrompt!=='function') return;
  if(!s.enabled || !s.injectProtocol){
    await c.setExtensionPrompt(PROMPT_ID,'',-1,0,false,0);
    return;
  }
  await c.setExtensionPrompt(PROMPT_ID,protocolText(),1,0,false,0);
  const preview=document.querySelector('#tb_protocol_preview');
  if(preview) preview.textContent=protocolText();
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

async function aiProviderGenerate({kind,prompt,schema}){
  const c=ctx();
  const loader=c.loader?.show?.({blocking:false,message:`战斗数据 AI 填写：${kind}`,toastMode:'static'});
  try{
    let raw;
    if(schema && typeof schema==='object'){
      const jsonSchema={
        name:`TavernBattle_${String(kind||'data').replace(/\W/g,'_')}`,
        strict:false,
        value:{
          $schema:'http://json-schema.org/draft-04/schema#',
          ...schemaFromExample(schema)
        }
      };
      try{
        raw=await c.generateQuietPrompt({quietPrompt:prompt,jsonSchema});
        if(!raw || raw.trim()==='{}') throw new Error('structured output unavailable');
      }catch{
        raw=await c.generateQuietPrompt({quietPrompt:prompt});
      }
    }else{
      raw=await c.generateQuietPrompt({quietPrompt:prompt});
    }

    const text=String(raw||'').trim()
      .replace(/^```(?:json)?\s*/i,'')
      .replace(/\s*```$/,'');
    try{return JSON.parse(text);}
    catch{return text;}
  }finally{
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

  const url=`/scripts/extensions/${EXTENSION_FOLDER}/battle/index.html?mode=${encodeURIComponent(mode)}&v=0.15`;
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

  c.eventSource?.on(c.event_types.MESSAGE_RECEIVED,handleMessageReceived);
  c.eventSource?.on(c.event_types.CHARACTER_MESSAGE_RENDERED,()=>setTimeout(decorateChat,0));
  c.eventSource?.on(c.event_types.MESSAGE_EDITED,()=>setTimeout(()=>captureTriggers({all:true}).then(decorateChat),0));
  c.eventSource?.on(c.event_types.MESSAGE_SWIPED,()=>setTimeout(()=>captureTriggers({all:true}).then(decorateChat),0));
  c.eventSource?.on(c.event_types.CHAT_CHANGED,()=>setTimeout(handleAppReady,60));
  c.eventSource?.on(c.event_types.APP_READY,handleAppReady);

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

  console.log('[TavernBattle] v0.15 initialized');
}

export async function onActivate(){
  // Synchronous-ish lifecycle entry; APP_READY performs asynchronous work.
  setTimeout(()=>init().catch(err=>console.error('[TavernBattle] init failed',err)),0);
}
