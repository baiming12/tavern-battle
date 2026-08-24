
(() => {
  'use strict';

  const root=document.querySelector('#editorRoot');
  const toggle=document.querySelector('#toggleEditorBtn');
  if(!root || !toggle || !window.BattleDemoAPI) return;
  const api=window.BattleDemoAPI;

  const E={
    tab:'scene',
    scene:null,
    sceneTool:'select',
    selectedTeam:'ally',
    selectedRef:'',
    selectedCell:null,
    codexKind:'ally',
    selectedId:null,
    aiKind:null,
    aiSchema:null,
    aiTargetApply:null,
    aiMode:'modify',
    aiCurrent:null,
    aiPlain:false,
    aiHints:null,
    aiReturnTab:'scene',
    aiIncludeStory:true,
    aiIncludeWorldInfo:true,
    aiExtraRequirements:'',
    lang:'zh'
  };

  const esc=(s)=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const clone=(v)=>JSON.parse(JSON.stringify(v));

  const ENUM_LABELS={
    zh:{
      skillKind:{attack:'攻击招式',qinggong:'轻功 / 位移',buff:'心法 / 增益技能'},
      shape:{single:'单格',diamond:'菱形',cross:'十字',square:'方形',line:'直线'},
      slot:{weapon:'武器',armor:'防具',accessory:'饰品',other:'其他'},
      rarity:{common:'普通',uncommon:'优秀',rare:'稀有',epic:'史诗',legendary:'传奇'},
      talentType:{triggered:'触发型',passive:'被动型'},
      event:{
        battle_start:'战斗开始',turn_start:'行动开始',turn_end:'行动结束',attack_hit:'攻击命中',attack_crit:'攻击暴击',
        damage_taken:'受到伤害',hp_changed:'气血变化',move_step:'每移动一步',defend:'执行防御',rest:'执行调息',kill:'击杀单位',
        skill_used:'使用技能',status_applied:'获得状态',status_removed:'状态移除',status_resisted:'状态被抵抗',status_threshold:'状态达到层数阈值',
        shield_gained:'获得护盾',shield_absorbed:'护盾吸收伤害',forced_move:'发生强制位移',positions_swapped:'发生换位',teleported:'发生瞬移',
        unit_summoned:'召唤单位',object_summoned:'生成地面物'
      },
      field:{hit:'是否命中',crit:'是否暴击',damage:'实际气血伤害',hpPercent:'自身气血%',qiPercent:'自身真气%',targetHpPercent:'目标气血%',moveSpent:'本回合已移动格数',relation:'攻击方位',skillId:'技能ID'},
      effect:{
        modify_stat:'修改属性',gain_gauge:'增加集气',heal:'治疗',deal_damage:'造成额外伤害',apply_status:'施加状态',grant_move:'增加临时移动力',
        refund_qi:'回复真气',remove_status:'移除指定状态',dispel:'驱散状态',shield:'获得护盾',lifesteal:'吸血',reflect_damage:'反伤',
        swap_position:'与目标换位',teleport_behind:'闪到目标背后',summon_unit:'召唤单位',summon_object:'生成地面物'
      },
      stat:{attack:'攻击',defense:'防御',qiSpeed:'集气速率',move:'移动力',maxHp:'最大气血',maxQi:'最大真气',crit:'暴击',dodge:'闪避',accuracy:'命中',statusResist:'状态抗性'},
      target:{self:'自身',target:'本次目标',attacker:'攻击者',allies:'我方全体',enemies:'敌方全体',random_ally:'随机我方',random_enemy:'随机敌方'},
      duration:{instant:'立即',turns:'若干自身回合',action:'当前行动',battle:'本场战斗',permanent:'永久'},
      mode:{flat:'固定值',percent:'百分比'},
      scope:{once_per_action:'每次技能 / 攻击至多1次',per_target:'每个实际命中目标1次',once_per_turn:'每回合至多1次',per_event:'每次事件都触发'},
      polarity:{buff:'增益',debuff:'减益'},
      polarityFilter:{any:'任意状态',buff:'只驱散增益',debuff:'只驱散减益'},
      control:{stun:'眩晕',root:'定身',silence:'封技',disarm:'缴械'},
      coreEffect:{damage:'伤害',heal:'治疗',apply_status:'施加状态',push:'击退',pull:'拉拽',move_self:'自身位移',swap_position:'与目标换位',teleport_behind:'闪到目标背后',lifesteal:'吸血',shield:'护盾',summon_unit:'召唤单位',summon_object:'生成地面物'},
      coreTarget:{enemies:'范围内敌方',allies:'范围内我方',self:'自身',all_units:'范围内所有单位',neutral:'范围内中立单位',random_enemies:'范围内随机敌方',random_allies:'范围内随机我方',random_units:'范围内随机单位'},
      stackMode:{refresh:'不叠层，仅刷新持续时间',add_refresh:'增加层数并刷新持续时间',replace:'直接替换当前层数'},
      summonTeam:{same:'与施法者同阵营',template:'沿用图鉴阵营',ally:'我方',enemy:'敌方',neutral:'中立'}
    },
    en:{
      skillKind:{attack:'Attack',qinggong:'Mobility',buff:'Buff / Inner art'},shape:{single:'Single tile',diamond:'Diamond',cross:'Cross',square:'Square',line:'Line'},
      slot:{weapon:'Weapon',armor:'Armor',accessory:'Accessory',other:'Other'},rarity:{common:'Common',uncommon:'Uncommon',rare:'Rare',epic:'Epic',legendary:'Legendary'},
      talentType:{triggered:'Triggered',passive:'Passive'},
      event:{battle_start:'Battle start',turn_start:'Turn start',turn_end:'Turn end',attack_hit:'Attack hit',attack_crit:'Critical hit',damage_taken:'Damage taken',hp_changed:'HP changed',move_step:'Move one tile',defend:'Defend',rest:'Rest',kill:'Kill',skill_used:'Skill used',status_applied:'Status applied',status_removed:'Status removed',status_resisted:'Status resisted',status_threshold:'Status threshold',shield_gained:'Shield gained',shield_absorbed:'Shield absorbed',forced_move:'Forced move',positions_swapped:'Positions swapped',teleported:'Teleported',unit_summoned:'Unit summoned',object_summoned:'Object summoned'},
      field:{hit:'Hit',crit:'Critical',damage:'HP damage',hpPercent:'Self HP %',qiPercent:'Self Qi %',targetHpPercent:'Target HP %',moveSpent:'Tiles moved this turn',relation:'Attack direction',skillId:'Skill ID'},
      effect:{modify_stat:'Modify stat',gain_gauge:'Gain gauge',heal:'Heal',deal_damage:'Deal extra damage',apply_status:'Apply status',grant_move:'Grant temporary movement',refund_qi:'Refund Qi',remove_status:'Remove specific status',dispel:'Dispel',shield:'Shield',lifesteal:'Lifesteal',reflect_damage:'Reflect damage',swap_position:'Swap positions',teleport_behind:'Teleport behind target',summon_unit:'Summon unit',summon_object:'Summon ground object'},
      stat:{attack:'Attack',defense:'Defense',qiSpeed:'Gauge speed',move:'Movement',maxHp:'Max HP',maxQi:'Max Qi',crit:'Critical',dodge:'Dodge',accuracy:'Accuracy',statusResist:'Status resistance'},
      target:{self:'Self',target:'Current target',attacker:'Attacker',allies:'All allies',enemies:'All enemies',random_ally:'Random ally',random_enemy:'Random enemy'},
      duration:{instant:'Instant',turns:'Turns',action:'Current action',battle:'Battle',permanent:'Permanent'},mode:{flat:'Flat',percent:'Percent'},
      scope:{once_per_action:'Once per action',per_target:'Once per hit target',once_per_turn:'Once per turn',per_event:'Every event'},
      polarity:{buff:'Buff',debuff:'Debuff'},polarityFilter:{any:'Any status',buff:'Buffs only',debuff:'Debuffs only'},control:{stun:'Stun',root:'Root',silence:'Silence',disarm:'Disarm'},
      coreEffect:{damage:'Damage',heal:'Heal',apply_status:'Apply status',push:'Push',pull:'Pull',move_self:'Move self',swap_position:'Swap positions',teleport_behind:'Teleport behind target',lifesteal:'Lifesteal',shield:'Shield',summon_unit:'Summon unit',summon_object:'Summon ground object'},
      coreTarget:{enemies:'Enemies in area',allies:'Allies in area',self:'Self',all_units:'All units in area',neutral:'Neutral units in area',random_enemies:'Random enemies in area',random_allies:'Random allies in area',random_units:'Random units in area'},
      stackMode:{refresh:'Refresh duration only',add_refresh:'Add stacks + refresh',replace:'Replace stack count'},summonTeam:{same:'Same as caster',template:'Use template team',ally:'Ally',enemy:'Enemy',neutral:'Neutral'}
    }
  };

  function enumLabel(group,value){
    return ENUM_LABELS[E.lang]?.[group]?.[value] ?? value;
  }
  function options(values,group,current){
    return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(enumLabel(group,v))}</option>`).join('');
  }

  const languageSelect=document.querySelector('#editorLanguageSelect');
  if(languageSelect){
    languageSelect.value='zh';
    languageSelect.addEventListener('change',()=>{
      E.lang=languageSelect.value==='en'?'en':'zh';
      if(!root.hidden) render();
    });
  }

  toggle.addEventListener('click',()=>{
    const willOpen=root.hidden;
    root.hidden=!willOpen;
    toggle.textContent=willOpen?'收起编辑器':'展开编辑器';
    if(willOpen){ E.scene=api.getScene(); render(); }
  });

  function collection(){ return api.getCollection(); }
  function bucket(kind){
    const c=collection();
    return kind==='ally'?c.allies:kind==='enemy'?c.enemies:kind==='neutral'?c.neutrals:
      kind==='skill'?c.skills:kind==='equipment'?c.equipment:kind==='status'?c.statuses:c.talents;
  }

  function statusOptions(current='',includeEmpty=true){
    const b=bucket('status')||{};
    const list=Object.values(b).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'zh-CN'));
    let out=includeEmpty?'<option value="">— 请选择状态 —</option>':'';
    if(current && !b[current]) out+=`<option value="${esc(current)}" selected>未知状态：${esc(current)}</option>`;
    out+=list.map(s=>`<option value="${esc(s.id)}" ${s.id===current?'selected':''}>${esc(s.name||s.id)}（${esc(s.id)}）</option>`).join('');
    return out;
  }

  function statusMultiOptions(currents=[]){
    const selected=new Set(currents||[]),b=bucket('status')||{};
    return Object.values(b).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'zh-CN'))
      .map(s=>`<option value="${esc(s.id)}" ${selected.has(s.id)?'selected':''}>${esc(s.name||s.id)}（${esc(s.id)}）</option>`).join('');
  }

  function templateOptions(currentRef='',currentTeam=''){
    const c=collection(),items=[];
    for(const [team,b,label] of [['ally',c.allies||{},'我方图鉴'],['neutral',c.neutrals||{},'中立图鉴'],['enemy',c.enemies||{},'敌方图鉴']]){
      for(const item of Object.values(b))items.push({team,item,label});
    }
    items.sort((a,b)=>String(a.item.name||a.item.id).localeCompare(String(b.item.name||b.item.id),'zh-CN'));
    let out='<option value="">— 请选择召唤模板 —</option>';
    out+=items.map(({team,item,label})=>{
      const value=`${team}:${item.id}`,selected=item.id===currentRef&&(!currentTeam||team===currentTeam);
      return `<option value="${esc(value)}" ${selected?'selected':''}>${esc(item.name||item.id)}（${label} · ${esc(item.id)}）</option>`;
    }).join('');
    return out;
  }

  function selectedValues(select){return [...(select?.selectedOptions||[])].map(o=>o.value).filter(Boolean);}

  function libraryPickerItems(kind){
    const b=bucket(kind)||{};
    return Object.values(b).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'zh-CN'));
  }

  function libraryPickerMeta(kind,item){
    if(kind==='skill') return `${enumLabel('skillKind',item.kind||'attack')} · ${item.id}`;
    if(kind==='equipment') return `${enumLabel('slot',item.slot||'other')} · ${item.id}`;
    if(kind==='talent') return `${enumLabel('rarity',item.rarity||'common')} · ${item.id}`;
    return item.id;
  }


  function libraryKindLabel(kind){
    return {skill:'技能',equipment:'装备',talent:'天赋'}[kind]||kind;
  }

  function libraryFilterDefs(kind){
    if(kind==='skill') return [
      ['all','全部'],['attack',enumLabel('skillKind','attack')],
      ['qinggong',enumLabel('skillKind','qinggong')],
      ['buff',enumLabel('skillKind','buff')]
    ];
    if(kind==='equipment') return [
      ['all','全部'],['weapon',enumLabel('slot','weapon')],
      ['armor',enumLabel('slot','armor')],
      ['accessory',enumLabel('slot','accessory')],
      ['other',enumLabel('slot','other')]
    ];
    if(kind==='talent') return [
      ['all','全部'],['passive',enumLabel('talentType','passive')],
      ['triggered',enumLabel('talentType','triggered')]
    ];
    return [['all','全部']];
  }

  function libraryItemFilterValue(kind,item){
    if(kind==='skill') return item.kind||'attack';
    if(kind==='equipment') return item.slot||'other';
    if(kind==='talent') return item.type||'passive';
    return 'all';
  }

  function librarySearchText(kind,item){
    return [
      item.name,item.id,item.description,
      ...(item.tags||[]),
      libraryPickerMeta(kind,item),
      enumLabel('skillKind',item.kind||''),
      enumLabel('slot',item.slot||''),
      enumLabel('talentType',item.type||''),
      enumLabel('rarity',item.rarity||'')
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function selectedLibraryHTML(kind,selected=[],elementId='picker'){
    const ids=Array.isArray(selected)?selected:[];
    return `<div id="${elementId}" class="compact-library-picker" data-kind="${esc(kind)}" data-selected="${esc(JSON.stringify(ids))}">
      <div class="selected-library-list"></div>
      <div class="compact-library-footer">
        <button type="button" class="secondary small" data-open-library-picker>+ 选择${libraryKindLabel(kind)}</button>
        <span class="muted selected-count"></span>
      </div>
    </div>`;
  }

  function selectedIdsFromSection(section){
    try{
      const parsed=JSON.parse(section?.dataset?.selected||'[]');
      return Array.isArray(parsed)?parsed:[];
    }catch{return [];}
  }

  function setSelectedIds(section,ids){
    const unique=[];
    for(const id of ids||[]) if(id && !unique.includes(id)) unique.push(id);
    section.dataset.selected=JSON.stringify(unique);
    renderSelectedLibrary(section);
  }

  function checkedLibraryValues(container){
    return selectedIdsFromSection(container);
  }

  function renderSelectedLibrary(section){
    if(!section)return;
    const kind=section.dataset.kind;
    const bucketData=bucket(kind)||{};
    const ids=selectedIdsFromSection(section);
    const list=section.querySelector('.selected-library-list');
    const count=section.querySelector('.selected-count');

    if(!ids.length){
      list.innerHTML=`<div class="selected-library-empty">尚未选择${libraryKindLabel(kind)}。</div>`;
    }else{
      list.innerHTML=ids.map((id,index)=>{
        const item=bucketData[id];
        const name=item?.name||id;
        const meta=item?libraryPickerMeta(kind,item):`未知ID · ${id}`;
        return `<div class="selected-library-chip" draggable="true" data-selected-id="${esc(id)}">
          <span class="selected-drag" title="拖动排序">☰</span>
          <span class="selected-main">
            <b>${esc(name)}</b>
            <small>${esc(meta)}</small>
          </span>
          <span class="selected-order-actions">
            <button type="button" class="icon-button" data-move-up title="上移" ${index===0?'disabled':''}>↑</button>
            <button type="button" class="icon-button" data-move-down title="下移" ${index===ids.length-1?'disabled':''}>↓</button>
            <button type="button" class="icon-button danger" data-remove-selected title="移除">×</button>
          </span>
        </div>`;
      }).join('');
    }
    if(count) count.textContent=`已选择 ${ids.length} 个`;
  }

  let pickerModalState=null;

  function ensureLibraryPickerModal(){
    let modal=document.querySelector('#libraryPickerModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='libraryPickerModal';
    modal.className='library-picker-modal';
    modal.hidden=true;
    modal.innerHTML=`
      <div class="library-picker-backdrop" data-picker-cancel></div>
      <section class="library-picker-dialog" role="dialog" aria-modal="true">
        <div class="library-picker-titlebar">
          <div>
            <h3 id="libraryPickerTitle">选择</h3>
            <div id="libraryPickerSummary" class="muted"></div>
          </div>
          <button type="button" class="icon-button" data-picker-cancel>×</button>
        </div>
        <div class="library-picker-toolbar">
          <input id="libraryPickerSearch" type="search" placeholder="搜索名称、ID、说明或标签">
          <div id="libraryPickerFilters" class="library-picker-filters"></div>
        </div>
        <div id="libraryPickerResults" class="library-picker-results"></div>
        <div class="library-picker-actions">
          <button type="button" class="secondary" data-picker-cancel>取消</button>
          <button type="button" id="libraryPickerConfirm">确认选择</button>
        </div>
      </section>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-picker-cancel]').forEach(x=>x.addEventListener('click',closeLibraryPicker));
    modal.querySelector('#libraryPickerSearch').addEventListener('input',renderLibraryPickerResults);
    modal.querySelector('#libraryPickerConfirm').addEventListener('click',()=>{
      if(!pickerModalState)return;
      setSelectedIds(pickerModalState.section,pickerModalState.tempIds);
      closeLibraryPicker();
    });
    return modal;
  }

  function closeLibraryPicker(){
    const modal=document.querySelector('#libraryPickerModal');
    if(modal)modal.hidden=true;
    pickerModalState=null;
  }

  function openLibraryPicker(section){
    const modal=ensureLibraryPickerModal();
    const kind=section.dataset.kind;
    pickerModalState={
      section,kind,
      tempIds:[...selectedIdsFromSection(section)],
      filter:'all'
    };

    modal.querySelector('#libraryPickerTitle').textContent=`选择${libraryKindLabel(kind)}`;
    modal.querySelector('#libraryPickerSearch').value='';
    const filters=modal.querySelector('#libraryPickerFilters');
    filters.innerHTML=libraryFilterDefs(kind).map(([value,label])=>
      `<button type="button" class="picker-filter ${value==='all'?'active':''}" data-picker-filter="${esc(value)}">${esc(label)}</button>`
    ).join('');
    filters.querySelectorAll('[data-picker-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      pickerModalState.filter=btn.dataset.pickerFilter;
      filters.querySelectorAll('[data-picker-filter]').forEach(x=>x.classList.toggle('active',x===btn));
      renderLibraryPickerResults();
    }));
    modal.hidden=false;
    renderLibraryPickerResults();
    setTimeout(()=>modal.querySelector('#libraryPickerSearch')?.focus(),0);
  }

  function renderLibraryPickerResults(){
    if(!pickerModalState)return;
    const modal=document.querySelector('#libraryPickerModal');
    const {kind,tempIds,filter}=pickerModalState;
    const query=(modal.querySelector('#libraryPickerSearch').value||'').trim().toLowerCase();
    const data=bucket(kind)||{};
    const items=libraryPickerItems(kind).filter(item=>{
      if(filter!=='all' && libraryItemFilterValue(kind,item)!==filter)return false;
      if(query && !librarySearchText(kind,item).includes(query))return false;
      return true;
    });

    modal.querySelector('#libraryPickerSummary').textContent=`已选择 ${tempIds.length} 个`;
    const results=modal.querySelector('#libraryPickerResults');

    if(!items.length){
      results.innerHTML='<div class="picker-no-result">没有匹配的数据。</div>';
      return;
    }

    results.innerHTML=items.map(item=>{
      const checked=tempIds.includes(item.id);
      return `<label class="picker-result ${checked?'selected':''}">
        <input type="checkbox" value="${esc(item.id)}" ${checked?'checked':''}>
        <span class="picker-result-main">
          <b>${esc(item.name||item.id)}</b>
          <small>${esc(libraryPickerMeta(kind,item))}</small>
          ${item.description?`<em>${esc(item.description)}</em>`:''}
        </span>
      </label>`;
    }).join('');

    results.querySelectorAll('input[type="checkbox"]').forEach(input=>input.addEventListener('change',()=>{
      const id=input.value;
      if(input.checked){
        if(!pickerModalState.tempIds.includes(id))pickerModalState.tempIds.push(id);
      }else{
        pickerModalState.tempIds=pickerModalState.tempIds.filter(x=>x!==id);
      }
      input.closest('.picker-result')?.classList.toggle('selected',input.checked);
      modal.querySelector('#libraryPickerSummary').textContent=`已选择 ${pickerModalState.tempIds.length} 个`;
    }));
  }

  function bindCompactLibrarySection(section){
    if(!section)return;
    renderSelectedLibrary(section);

    section.querySelector('[data-open-library-picker]')?.addEventListener('click',()=>openLibraryPicker(section));

    const list=section.querySelector('.selected-library-list');
    list.addEventListener('click',e=>{
      const chip=e.target.closest('[data-selected-id]');
      if(!chip)return;
      const id=chip.dataset.selectedId;
      let ids=selectedIdsFromSection(section);
      const index=ids.indexOf(id);
      if(index<0)return;

      if(e.target.closest('[data-remove-selected]')){
        ids.splice(index,1);
        setSelectedIds(section,ids);
      }else if(e.target.closest('[data-move-up]') && index>0){
        [ids[index-1],ids[index]]=[ids[index],ids[index-1]];
        setSelectedIds(section,ids);
      }else if(e.target.closest('[data-move-down]') && index<ids.length-1){
        [ids[index+1],ids[index]]=[ids[index],ids[index+1]];
        setSelectedIds(section,ids);
      }
    });

    let draggedId=null;
    list.addEventListener('dragstart',e=>{
      const chip=e.target.closest('[data-selected-id]');
      if(!chip)return;
      draggedId=chip.dataset.selectedId;
      chip.classList.add('dragging');
      if(e.dataTransfer)e.dataTransfer.effectAllowed='move';
    });
    list.addEventListener('dragend',e=>{
      e.target.closest('[data-selected-id]')?.classList.remove('dragging');
      draggedId=null;
    });
    list.addEventListener('dragover',e=>{
      if(draggedId)e.preventDefault();
    });
    list.addEventListener('drop',e=>{
      if(!draggedId)return;
      e.preventDefault();
      const target=e.target.closest('[data-selected-id]');
      if(!target||target.dataset.selectedId===draggedId)return;
      const ids=selectedIdsFromSection(section);
      const from=ids.indexOf(draggedId),to=ids.indexOf(target.dataset.selectedId);
      if(from<0||to<0)return;
      ids.splice(from,1);
      ids.splice(to,0,draggedId);
      setSelectedIds(section,ids);
    });
  }

  function bindActorLibraryPickers(body){
    ['#aSkills','#aEquip','#aTalent'].forEach(sel=>bindCompactLibrarySection(body.querySelector(sel)));
  }

  function tabs(){
    return ['scene','codex','skill','equipment','status','talent','trigger','ai'].map(id=>{
      const label={scene:'场景',codex:'角色图鉴',skill:'技能',equipment:'装备',status:'状态（增益 / 减益）',talent:'天赋',trigger:'酒馆触发',ai:'AI填写'}[id];
      return `<button class="editor-tab ${E.tab===id?'active':''}" data-tab="${id}">${label}</button>`;
    }).join('');
  }

  function render(){
    root.innerHTML=`<div class="editor-tabs">${tabs()}</div><div id="editorBody"></div>`;
    root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{E.tab=b.dataset.tab; render();}));
    const body=root.querySelector('#editorBody');
    ({
      scene:renderScene,
      codex:renderCodex,
      skill:()=>renderLibraryEditor('skill'),
      equipment:()=>renderLibraryEditor('equipment'),
      status:renderStatus,
      talent:renderTalent,
      trigger:renderTrigger,
      ai:renderAI
    })[E.tab](body);
  }

  // ---------- 场景编辑 ----------
  function renderScene(body){
    E.scene=E.scene||api.getScene();
    const c=collection();
    const refs={
      ally:Object.values(c.allies||{}),
      neutral:Object.values(c.neutrals||{}),
      enemy:Object.values(c.enemies||{})
    };
    if(!E.selectedRef) E.selectedRef=refs[E.selectedTeam]?.[0]?.id||'';

    body.innerHTML=`
      <div class="editor-grid">
        <div class="editor-panel">
          <h3>场景设置</h3>
          <div class="form-grid">
            <label class="form-field full">名称<input id="sceneName" value="${esc(E.scene.name)}"></label>
            <label class="form-field">棋盘尺寸<input id="sceneSize" type="number" min="5" max="15" value="${num(E.scene.boardSize,9)}"></label>
            <label class="form-field">放置角色
              <select id="sceneRef"></select>
            </label>
          </div>
          <div class="palette-row">
            ${[
              ['select','查看'],['ally','放我方'],['neutral','放中立'],['enemy','放敌方'],
              ['obstacle','放障碍'],['evac','放撤离点'],['erase','擦除']
            ].map(([id,l])=>`<button class="palette-btn ${E.sceneTool===id?'active':''}" data-tool="${id}">${l}</button>`).join('')}
          </div>
          <div id="sceneToolFields"></div>
          <div class="editor-actions">
            <button id="applySceneBtn">保存并开始此场景</button>
            <button id="reloadSceneBtn" class="secondary">放弃修改</button>
            <button id="sceneAINewBtn" class="secondary">✨ AI新建场景</button>
            <button id="sceneAIModifyBtn" class="secondary">🪄 AI修改当前场景</button>
          </div>
          <p class="editor-warning">坐标在文件里是0开始；这里直接点格子即可。重复使用同一个图鉴角色时，会自动生成独立实例ID。</p>
          <div id="cellInfo" class="json-preview">${E.selectedCell?esc(JSON.stringify(E.selectedCell,null,2)):'点击格子查看/编辑。'}</div>
        </div>
        <div class="editor-panel">
          <h3>可视化棋盘</h3>
          <div id="sceneBoard" class="scene-editor-board"></div>
        </div>
      </div>`;

    const refSel=body.querySelector('#sceneRef');
    const refreshRefs=()=>{
      E.selectedTeam=['ally','neutral','enemy'].includes(E.sceneTool)?E.sceneTool:E.selectedTeam;
      const arr=refs[E.selectedTeam]||[];
      refSel.innerHTML=arr.map(x=>`<option value="${esc(x.id)}" ${x.id===E.selectedRef?'selected':''}>${esc(x.name)} (${esc(x.id)})</option>`).join('');
      if(!arr.some(x=>x.id===E.selectedRef)) E.selectedRef=arr[0]?.id||'';
      refSel.value=E.selectedRef;
      refSel.disabled=!['ally','neutral','enemy'].includes(E.sceneTool);
    };
    refreshRefs();
    refSel.addEventListener('change',()=>E.selectedRef=refSel.value);

    body.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{
      E.sceneTool=b.dataset.tool;
      if(['ally','neutral','enemy'].includes(E.sceneTool)) E.selectedTeam=E.sceneTool;
      renderScene(body);
    }));

    const toolFields=body.querySelector('#sceneToolFields');
    if(E.sceneTool==='obstacle'){
      toolFields.innerHTML=`<div class="form-grid">
        <label class="form-field">障碍名称<input id="obsName" value="障碍物"></label>
        <label class="form-field">血量<input id="obsHp" type="number" min="1" value="500"></label>
        <label class="form-field full">阻断攻击<select id="obsBlock"><option value="true">是</option><option value="false">否</option></select></label>
      </div>`;
    }else if(E.sceneTool==='evac'){
      toolFields.innerHTML=`<div class="form-grid">
        <label class="form-field">撤离点名称<input id="evacName" value="撤离点"></label>
        <label class="form-field">允许阵营<select id="evacTeam"><option value="ally">我方</option><option value="enemy">敌方</option><option value="ally+enemy">双方</option></select></label>
      </div>`;
    }else{
      toolFields.innerHTML='';
    }

    body.querySelector('#sceneName').addEventListener('input',e=>E.scene.name=e.target.value);
    body.querySelector('#sceneSize').addEventListener('change',e=>{
      E.scene.boardSize=Math.max(5,Math.min(15,num(e.target.value,9)));
      // 删除超出新棋盘范围的对象
      const ok=p=>p.x>=0&&p.y>=0&&p.x<E.scene.boardSize&&p.y<E.scene.boardSize;
      E.scene.placements=(E.scene.placements||[]).filter(ok);
      E.scene.obstacles=(E.scene.obstacles||[]).filter(ok);
      E.scene.evacPoints=(E.scene.evacPoints||[]).filter(ok);
      renderScene(body);
    });

    body.querySelector('#applySceneBtn').addEventListener('click',()=>{
      E.scene.id=E.scene.id||`scene-${Date.now()}`;
      api.updateScene(E.scene,true);
      E.scene=api.getScene();
      renderScene(body);
    });
    body.querySelector('#reloadSceneBtn').addEventListener('click',()=>{E.scene=api.getScene(); renderScene(body);});
    body.querySelector('#sceneAINewBtn').addEventListener('click',()=>{
      openAI('scene',null,sceneSchema(),json=>{E.scene=json; E.tab='scene'; render();},false,{
        mode:'create',returnTab:'scene',hints:{boardSize:E.scene?.boardSize||9}
      });
    });
    body.querySelector('#sceneAIModifyBtn').addEventListener('click',()=>{
      openAI('scene',E.scene,sceneSchema(),json=>{E.scene=json; E.tab='scene'; render();},false,{
        mode:'modify',returnTab:'scene'
      });
    });

    renderSceneBoard(body.querySelector('#sceneBoard'),body);
  }

  function clearCell(scene,x,y){
    scene.placements=(scene.placements||[]).filter(p=>!(p.x===x&&p.y===y));
    scene.obstacles=(scene.obstacles||[]).filter(p=>!(p.x===x&&p.y===y));
    scene.evacPoints=(scene.evacPoints||[]).filter(p=>!(p.x===x&&p.y===y));
  }

  function renderSceneBoard(board,body){
    const size=num(E.scene.boardSize,9);
    board.style.gridTemplateColumns=`repeat(${size},1fr)`;
    board.style.gridTemplateRows=`repeat(${size},1fr)`;
    board.innerHTML='';
    const c=collection();
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const cell=document.createElement('button');
      cell.type='button'; cell.className='scene-cell'; cell.title=`(${x+1},${y+1})`;
      const p=(E.scene.placements||[]).find(v=>v.x===x&&v.y===y);
      const o=(E.scene.obstacles||[]).find(v=>v.x===x&&v.y===y);
      const ev=(E.scene.evacPoints||[]).find(v=>v.x===x&&v.y===y);
      if(o) cell.innerHTML=`<span class="scene-token obstacle">${esc(o.name)}<br>${o.hp}/${o.maxHp}</span>`;
      if(p){
        const b=p.team==='ally'?c.allies:p.team==='enemy'?c.enemies:c.neutrals;
        const name=b?.[p.ref]?.name||p.ref;
        cell.innerHTML+=`<span class="scene-token ${p.team}">${esc(name)}<br>${esc(p.facing||'N')}</span>`;
      }
      if(ev) cell.innerHTML+=`<span class="scene-token evac">⇱</span>`;

      cell.addEventListener('click',()=>{
        if(E.sceneTool==='select'){
          E.selectedCell={x,y,placement:p||null,obstacle:o||null,evac:ev||null};
          body.querySelector('#cellInfo').textContent=JSON.stringify(E.selectedCell,null,2);
          return;
        }
        if(E.sceneTool==='erase'){
          clearCell(E.scene,x,y); renderScene(body); return;
        }
        if(['ally','neutral','enemy'].includes(E.sceneTool)){
          clearCell(E.scene,x,y);
          if(!E.selectedRef) return;
          const same=(E.scene.placements||[]).filter(q=>q.ref===E.selectedRef).length+1;
          E.scene.placements.push({
            team:E.sceneTool,ref:E.selectedRef,
            instanceId:same>1?`${E.selectedRef}_${same}`:undefined,
            x,y,facing:E.sceneTool==='enemy'?'S':'N'
          });
          renderScene(body); return;
        }
        if(E.sceneTool==='obstacle'){
          clearCell(E.scene,x,y);
          const name=body.querySelector('#obsName')?.value||'障碍物';
          const hp=Math.max(1,num(body.querySelector('#obsHp')?.value,500));
          const blocks=body.querySelector('#obsBlock')?.value!=='false';
          E.scene.obstacles.push({id:`obstacle-${Date.now()}-${x}-${y}`,name,x,y,maxHp:hp,hp,blocksAttack:blocks});
          renderScene(body); return;
        }
        if(E.sceneTool==='evac'){
          // 撤离点允许与角色同格，不清 placement，只替换原撤离点
          E.scene.evacPoints=(E.scene.evacPoints||[]).filter(q=>!(q.x===x&&q.y===y));
          const name=body.querySelector('#evacName')?.value||'撤离点';
          const teams=(body.querySelector('#evacTeam')?.value||'ally').split('+');
          E.scene.evacPoints.push({id:`evac-${Date.now()}-${x}-${y}`,name,x,y,allowedTeams:teams});
          renderScene(body);
        }
      });
      board.appendChild(cell);
    }
  }

  // ---------- 图鉴 ----------
  function renderCodex(body){
    const kind=E.codexKind;
    const b=bucket(kind);
    const ids=Object.keys(b||{});
    if(!E.selectedId || !b[E.selectedId]) E.selectedId=ids[0]||null;
    const item=E.selectedId?clone(b[E.selectedId]):newActor(kind);

    body.innerHTML=`
      <div class="editor-grid">
        <div class="editor-panel">
          <h3>角色图鉴</h3>
          <div class="palette-row">
            ${[['ally','我方'],['neutral','中立'],['enemy','敌方']].map(([k,l])=>`<button class="palette-btn ${kind===k?'active':''}" data-kind="${k}">${l}</button>`).join('')}
          </div>
          <div class="editor-list">${ids.map(id=>`<button class="editor-chip ${id===E.selectedId?'active':''}" data-id="${esc(id)}">${esc(b[id].name||id)}</button>`).join('')}</div>
          <div class="editor-actions">
            <button id="newActorBtn">新建角色</button>
            <button id="deleteActorBtn" class="secondary" ${!E.selectedId?'disabled':''}>删除</button>
            <button id="actorAINewBtn" class="secondary">✨ AI新建角色</button>
            <button id="actorAIModifyBtn" class="secondary">🪄 AI修改当前</button>
          </div>
        </div>
        <div class="editor-panel">
          <h3>角色数据</h3>
          ${actorForm(item)}
          <div class="editor-actions"><button id="saveActorBtn">保存到图鉴</button></div>
        </div>
      </div>`;
    bindActorLibraryPickers(body);

    body.querySelectorAll('[data-kind]').forEach(x=>x.addEventListener('click',()=>{E.codexKind=x.dataset.kind; E.selectedId=null; renderCodex(body);}));
    body.querySelectorAll('[data-id]').forEach(x=>x.addEventListener('click',()=>{E.selectedId=x.dataset.id; renderCodex(body);}));
    body.querySelector('#newActorBtn').addEventListener('click',()=>{E.selectedId=null; renderCodex(body);});
    body.querySelector('#deleteActorBtn').addEventListener('click',()=>{
      if(!E.selectedId)return;
      if(confirm(`删除 ${E.selectedId}？`)){api.deleteLibrary(kind,E.selectedId,false); E.selectedId=null; renderCodex(body);}
    });
    body.querySelector('#saveActorBtn').addEventListener('click',()=>{
      const data=readActorForm(body,kind);
      if(!data.id) return alert('必须填写ID');
      api.updateLibrary(kind,data.id,data,true); E.selectedId=data.id; renderCodex(body);
    });
    body.querySelector('#actorAINewBtn').addEventListener('click',()=>{
      openAI('actor',null,actorSchema(),json=>{
        json.team=kind;
        api.updateLibrary(kind,json.id,json,true); E.selectedId=json.id; E.tab='codex'; render();
      },false,{mode:'create',returnTab:'codex',hints:{team:kind}});
    });
    body.querySelector('#actorAIModifyBtn').addEventListener('click',()=>{
      const current=readActorForm(body,kind);
      openAI('actor',current,actorSchema(),json=>{
        json.team=kind;
        api.updateLibrary(kind,json.id,json,true); E.selectedId=json.id; E.tab='codex'; render();
      },false,{mode:'modify',returnTab:'codex',hints:{team:kind}});
    });
  }

  function newActor(kind){ return {id:'',name:'',short:'',team:kind,maxHp:1000,hp:1000,maxQi:300,qi:300,attack:200,defense:150,crit:5,dodge:5,accuracy:0,qiSpeed:400,move:4,skills:['basic'],equipment:[],talents:[]}; }
  function actorForm(a){
    const f=(id,label,val,type='number')=>`<label class="form-field">${label}<input id="${id}" type="${type}" value="${esc(val)}"></label>`;
    return `<div class="form-grid">
      ${f('aId','ID',a.id||'','text')}${f('aName','名称',a.name||'','text')}
      ${f('aShort','棋盘简称',a.short||'','text')}${f('aHp','最大HP',a.maxHp||1000)}
      ${f('aQi','最大真气',a.maxQi||300)}${f('aAtk','攻击',a.attack||200)}
      ${f('aDef','防御',a.defense||150)}${f('aSpeed','集气速率',a.qiSpeed||400)}
      ${f('aMove','移动力',a.move||4)}${f('aCrit','暴击%',a.crit||0)}
      ${f('aDodge','闪避%',a.dodge||0)}${f('aAcc','命中修正',a.accuracy||0)}
      ${f('aStatusResist','状态抗性%',a.statusResist||0)}
      <label class="form-field">免疫标签（逗号）<input id="aImmunity" value="${esc((a.immunities||[]).join(','))}"></label>
      <div class="form-field full">
        <span>技能</span>
        ${selectedLibraryHTML('skill',a.skills||[],'aSkills')}
      </div>
      <div class="form-field full">
        <span>装备</span>
        ${selectedLibraryHTML('equipment',a.equipment||[],'aEquip')}
      </div>
      <div class="form-field full">
        <span>天赋</span>
        ${selectedLibraryHTML('talent',a.talents||[],'aTalent')}
      </div>
    </div>`;
  }
  function readActorForm(body,kind){
    const g=id=>body.querySelector(`#${id}`)?.value??'';
    const arr=id=>g(id).split(',').map(x=>x.trim()).filter(Boolean);
    const maxHp=Math.max(1,num(g('aHp'),1000)), maxQi=Math.max(0,num(g('aQi'),300));
    return {id:g('aId').trim(),name:g('aName').trim(),short:(g('aShort').trim()||g('aName').trim().slice(0,1)),team:kind,
      maxHp,hp:maxHp,maxQi,qi:maxQi,attack:num(g('aAtk'),200),defense:num(g('aDef'),150),qiSpeed:num(g('aSpeed'),400),
      move:num(g('aMove'),4),crit:num(g('aCrit')),dodge:num(g('aDodge')),accuracy:num(g('aAcc')),
      statusResist:num(g('aStatusResist')),immunities:arr('aImmunity'),
      skills:checkedLibraryValues(body.querySelector('#aSkills')),
      equipment:checkedLibraryValues(body.querySelector('#aEquip')),
      talents:checkedLibraryValues(body.querySelector('#aTalent'))};
  }

  function effectCardHTML(effect={},ei=0){
    const type=effect.type||'apply_status';
    return `<div class="effect-card" data-effect-index="${ei}">
      <div class="rule-card-head"><b>效果 ${ei+1}</b><button type="button" class="secondary tiny" data-remove-effect>删除效果</button></div>
      <div class="form-grid">
        <label class="form-field">效果类型<select data-eff="type">${options(['apply_status','remove_status','dispel','modify_stat','gain_gauge','heal','deal_damage','grant_move','refund_qi','shield','lifesteal','reflect_damage','swap_position','teleport_behind','summon_unit','summon_object'],'effect',type)}</select></label>
        <label class="form-field">作用目标<select data-eff="target">${options(['self','target','attacker','allies','enemies','random_ally','random_enemy'],'target',effect.target||'target')}</select></label>
        <label class="form-field" data-eff-fields="apply_status,remove_status">状态<select data-eff="statusId">${statusOptions(effect.statusId||'',true)}</select></label>
        <label class="form-field" data-eff-fields="apply_status">层数<input data-eff="stacks" type="number" min="1" value="${num(effect.stacks,1)}"></label>
        <label class="form-field" data-eff-fields="apply_status">施加概率%<input data-eff="chance" type="number" min="0" max="100" value="${num(effect.chance,100)}"></label>
        <label class="form-field" data-eff-fields="modify_stat">属性<select data-eff="stat">${options(['attack','defense','qiSpeed','move','maxHp','maxQi','crit','dodge','accuracy','statusResist'],'stat',effect.stat||'attack')}</select></label>
        <label class="form-field" data-eff-fields="modify_stat,gain_gauge,heal,deal_damage,grant_move,refund_qi,shield,lifesteal,reflect_damage">数值<input data-eff="value" type="number" value="${num(effect.value,0)}"></label>
        <label class="form-field" data-eff-fields="modify_stat,heal,deal_damage,shield">数值模式<select data-eff="mode">${options(['flat','percent'],'mode',effect.mode||'flat')}</select></label>
        <label class="form-field" data-eff-fields="shield">护盾持续类型<select data-eff="durationType">${options(['turns','action','battle','permanent'],'duration',effect.duration?.type||'turns')}</select></label>
        <label class="form-field" data-eff-fields="shield">护盾持续回合<input data-eff="durationTurns" type="number" min="0" value="${num(effect.duration?.turns,1)}"></label>
        <label class="form-field" data-target-field="random">随机目标数量<input data-eff="randomCount" type="number" min="1" value="${num(effect.randomCount,1)}"></label>
        <label class="form-field" data-eff-fields="dispel">驱散类型<select data-eff="polarity">${options(['any','buff','debuff'],'polarityFilter',effect.polarity||'any')}</select></label>
        <label class="form-field" data-eff-fields="dispel">驱散数量<input data-eff="count" type="number" min="1" value="${num(effect.count,1)}"></label>
        <label class="form-field full" data-eff-fields="dispel">驱散标签（逗号）<input data-eff="tags" value="${esc((effect.tags||[]).join(','))}"></label>
        <label class="form-field full" data-eff-fields="summon_unit">召唤角色模板<select data-eff="template">${templateOptions(effect.templateRef||'',effect.templateTeam||'')}</select></label>
        <label class="form-field" data-eff-fields="summon_unit">召唤阵营<select data-eff="summonTeam">${options(['same','template','ally','enemy','neutral'],'summonTeam',effect.summonTeam||'same')}</select></label>
        <label class="form-field" data-eff-fields="summon_unit">起始集气<input data-eff="startGauge" type="number" min="0" value="${num(effect.startGauge,0)}"></label>
        <label class="form-field full" data-eff-fields="summon_object">地面物名称<input data-eff="objectName" value="${esc(effect.objectName||'召唤地面物')}"></label>
        <label class="form-field" data-eff-fields="summon_object">地面物HP<input data-eff="hp" type="number" min="1" value="${num(effect.hp,100)}"></label>
        <label class="form-field" data-eff-fields="summon_object">持续回合（0=永久）<input data-eff="objectDuration" type="number" min="0" value="${num(effect.durationTurns,0)}"></label>
        <label class="form-field" data-eff-fields="summon_object">阻挡移动<select data-eff="blocksMovement"><option value="true" ${effect.blocksMovement!==false?'selected':''}>是</option><option value="false" ${effect.blocksMovement===false?'selected':''}>否</option></select></label>
        <label class="form-field" data-eff-fields="summon_object">阻断攻击<select data-eff="blocksAttack"><option value="true" ${effect.blocksAttack===true?'selected':''}>是</option><option value="false" ${effect.blocksAttack!==true?'selected':''}>否</option></select></label>
      </div>
    </div>`;
  }

  function refreshEffectCard(card){
    if(!card)return;
    const type=card.querySelector('[data-eff="type"]')?.value||'',target=card.querySelector('[data-eff="target"]')?.value||'';
    card.querySelectorAll('[data-eff-fields]').forEach(field=>{const types=(field.dataset.effFields||'').split(',').filter(Boolean);field.hidden=!types.includes(type);});
    card.querySelectorAll('[data-target-field="random"]').forEach(field=>field.hidden=!['random_ally','random_enemy'].includes(target));
  }

  function ruleCardHTML(rule={},ri=0,defaultEvent='attack_hit'){
    const cond=rule.conditions?.[0]||{event:defaultEvent};
    const extra=(rule.conditions||[]).find(c=>c.field)||{};
    const effects=rule.effects?.length?rule.effects:[{}];
    return `<div class="rule-card" data-rule-index="${ri}">
      <div class="rule-card-head"><b>规则 ${ri+1}</b><button type="button" class="secondary tiny" data-remove-rule>删除规则</button></div>
      <div class="form-grid">
        <label class="form-field">事件<select data-rule="event">${options(['skill_used','attack_hit','attack_crit','damage_taken','hp_changed','move_step','turn_start','turn_end','defend','rest','kill','status_applied','status_removed','status_resisted','status_threshold','shield_gained','shield_absorbed','forced_move','positions_swapped','teleported','unit_summoned','object_summoned'],'event',cond.event||defaultEvent)}</select></label>
        <label class="form-field">触发频率<select data-rule="scope">${options(['once_per_action','per_target','once_per_turn','per_event'],'scope',rule.triggerScope||'once_per_action')}</select></label>
        <label class="form-field">条件字段<select data-rule="field"><option value="">无附加条件</option>${options(['hit','crit','damage','hpPercent','qiPercent','targetHpPercent','moveSpent','relation','skillId'],'field',extra.field||'')}</select></label>
        <label class="form-field">比较<select data-rule="op">${['==','!=','<','<=','>','>='].map(x=>`<option value="${x}" ${extra.op===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="form-field">条件值<input data-rule="value" value="${esc(extra.value??'')}"></label>
        <label class="form-field">内部冷却<input data-rule="cooldown" type="number" min="0" value="${num(rule.cooldown,0)}"></label>
      </div>
      <div class="effects-list">${effects.map((e,i)=>effectCardHTML(e,i)).join('')}</div>
      <button type="button" class="secondary small" data-add-effect>+ 添加效果</button>
    </div>`;
  }

  function rulesEditorHTML(prefix,rules=[],defaultEvent='attack_hit'){
    return `<div class="full rules-editor" data-rules-editor="${prefix}" data-default-event="${esc(defaultEvent)}">
      <div class="rules-editor-head"><div><b>通用规则引擎</b><div class="muted">每个来源可有多条规则；每条规则可有多个 Effect。</div></div><button type="button" class="secondary small" data-add-rule>+ 添加规则</button></div>
      <div class="rules-list">${(rules||[]).map((r,i)=>ruleCardHTML(r,i,defaultEvent)).join('')}</div>
    </div>`;
  }

  function bindRulesEditor(container){
    if(!container)return;
    const list=container.querySelector('.rules-list');
    const defaultEvent=container.dataset.defaultEvent||'attack_hit';
    const reindex=()=>{
      [...list.querySelectorAll(':scope > .rule-card')].forEach((card,ri)=>{
        card.dataset.ruleIndex=ri;
        card.querySelector('.rule-card-head b').textContent=`规则 ${ri+1}`;
        [...card.querySelectorAll('.effect-card')].forEach((eff,ei)=>{
          eff.dataset.effectIndex=ei;
          eff.querySelector('.rule-card-head b').textContent=`效果 ${ei+1}`;
        });
      });
    };
    const bindEffect=(node)=>{
      node.querySelector('[data-remove-effect]')?.addEventListener('click',()=>{node.remove();reindex();});
      node.querySelector('[data-eff="type"]')?.addEventListener('change',()=>refreshEffectCard(node));
      node.querySelector('[data-eff="target"]')?.addEventListener('change',()=>refreshEffectCard(node));
      refreshEffectCard(node);
    };
    const bindCard=(card)=>{
      card.querySelector('[data-remove-rule]')?.addEventListener('click',()=>{card.remove();reindex();});
      card.querySelector('[data-add-effect]')?.addEventListener('click',()=>{
        const effects=card.querySelector('.effects-list');
        const wrap=document.createElement('div');wrap.innerHTML=effectCardHTML({},effects.children.length);
        const node=wrap.firstElementChild;effects.appendChild(node);bindEffect(node);reindex();
      });
      card.querySelectorAll('.effect-card').forEach(bindEffect);
    };
    list.querySelectorAll(':scope > .rule-card').forEach(bindCard);
    container.querySelector('[data-add-rule]')?.addEventListener('click',()=>{
      const wrap=document.createElement('div');wrap.innerHTML=ruleCardHTML({},list.children.length,defaultEvent);
      const node=wrap.firstElementChild;list.appendChild(node);bindCard(node);reindex();
    });
  }

  function bindAllRulesEditors(body){body.querySelectorAll('[data-rules-editor]').forEach(bindRulesEditor);}

  function readEffectCard(card){
    const g=k=>card.querySelector(`[data-eff="${k}"]`)?.value??'';
    const type=g('type'),effect={type,target:g('target')||'target'};
    if(['random_ally','random_enemy'].includes(effect.target))effect.randomCount=Math.max(1,num(g('randomCount'),1));
    if(type==='apply_status'){
      effect.statusId=g('statusId');effect.stacks=Math.max(1,num(g('stacks'),1));effect.chance=Math.max(0,Math.min(100,num(g('chance'),100)));
    }else if(type==='remove_status')effect.statusId=g('statusId');
    else if(type==='dispel'){effect.polarity=g('polarity')||'any';effect.count=Math.max(1,num(g('count'),1));effect.tags=g('tags').split(',').map(x=>x.trim()).filter(Boolean);}
    else if(type==='modify_stat'){effect.stat=g('stat');effect.value=num(g('value'));effect.mode=g('mode')||'flat';}
    else if(['heal','deal_damage','shield'].includes(type)){effect.value=num(g('value'));effect.mode=g('mode')||'flat';if(type==='shield')effect.duration={type:g('durationType')||'turns',turns:Math.max(0,num(g('durationTurns'),1))};}
    else if(['gain_gauge','grant_move','refund_qi','lifesteal','reflect_damage'].includes(type))effect.value=num(g('value'));
    else if(type==='summon_unit'){
      const raw=g('template'),cut=raw.indexOf(':');effect.templateTeam=cut>=0?raw.slice(0,cut):'';effect.templateRef=cut>=0?raw.slice(cut+1):raw;effect.summonTeam=g('summonTeam')||'same';effect.startGauge=Math.max(0,num(g('startGauge'),0));
    }else if(type==='summon_object'){
      effect.objectName=g('objectName').trim()||'召唤地面物';effect.hp=Math.max(1,num(g('hp'),100));effect.durationTurns=Math.max(0,num(g('objectDuration'),0));effect.blocksMovement=g('blocksMovement')!=='false';effect.blocksAttack=g('blocksAttack')==='true';
    }
    return effect;
  }

  function readRulesEditor(body,prefix){
    const editor=body.querySelector(`[data-rules-editor="${prefix}"]`);if(!editor)return [];
    return [...editor.querySelectorAll('.rules-list > .rule-card')].map((card,ri)=>{
      const g=k=>card.querySelector(`[data-rule="${k}"]`)?.value??'';
      const conditions=[{event:g('event')}],field=g('field');
      if(field)conditions.push({field,op:g('op')||'==',value:parseValue(g('value'))});
      return {id:`${prefix}_rule_${ri+1}`,conditions,effects:[...card.querySelectorAll('.effects-list > .effect-card')].map(readEffectCard),triggerScope:g('scope')||'once_per_action',cooldown:Math.max(0,num(g('cooldown'),0))};
    }).filter(r=>r.effects.length);
  }

  function effectsOnlyEditorHTML(prefix,effects=[]){
    return `<div class="full effects-only-editor" data-effects-only="${prefix}">
      <div class="rules-editor-head">
        <div><b>阈值触发 Effect</b><div class="muted">达到层数阈值后按顺序执行。</div></div>
        <button type="button" class="secondary small" data-add-only-effect>+ 添加效果</button>
      </div>
      <div class="effects-list">${(effects||[]).map((e,i)=>effectCardHTML(e,i)).join('')}</div>
    </div>`;
  }

  function bindEffectsOnlyEditor(container){
    if(!container)return;
    const list=container.querySelector('.effects-list');
    const reindex=()=>[...list.querySelectorAll(':scope > .effect-card')].forEach((card,i)=>{
      card.dataset.effectIndex=i;
      const title=card.querySelector('.rule-card-head b');if(title)title.textContent=`效果 ${i+1}`;
    });
    const bind=card=>{
      card.querySelector('[data-remove-effect]')?.addEventListener('click',()=>{card.remove();reindex();});
      card.querySelector('[data-eff="type"]')?.addEventListener('change',()=>refreshEffectCard(card));
      card.querySelector('[data-eff="target"]')?.addEventListener('change',()=>refreshEffectCard(card));
      refreshEffectCard(card);
    };
    list.querySelectorAll(':scope > .effect-card').forEach(bind);
    container.querySelector('[data-add-only-effect]')?.addEventListener('click',()=>{
      const wrap=document.createElement('div');wrap.innerHTML=effectCardHTML({},list.children.length);
      const card=wrap.firstElementChild;list.appendChild(card);bind(card);reindex();
    });
  }

  function readEffectsOnlyEditor(body,prefix){
    const editor=body.querySelector(`[data-effects-only="${prefix}"]`);
    if(!editor)return [];
    return [...editor.querySelectorAll('.effects-list > .effect-card')].map(readEffectCard);
  }

  function normalizedCoreEffects(skill){
    if(Array.isArray(skill?.coreEffects)&&skill.coreEffects.length)return clone(skill.coreEffects);
    if(skill?.kind==='attack')return [{type:'damage',target:'enemies',multiplier:num(skill.multiplier,1),hitCheck:true,canCrit:true,affectsObstacles:true}];
    return [];
  }

  function coreEffectCardHTML(effect={},i=0){
    return `<div class="core-effect-card" data-core-index="${i}">
      <div class="rule-card-head"><b>本体效果 ${i+1}</b><button type="button" class="secondary tiny" data-remove-core>删除</button></div>
      <div class="form-grid">
        <label class="form-field">效果类型<select data-core="type">${options(['damage','heal','apply_status','push','pull','move_self','swap_position','teleport_behind','lifesteal','shield','summon_unit','summon_object'],'coreEffect',effect.type||'damage')}</select></label>
        <label class="form-field" data-core-fields="damage,heal,apply_status,push,pull,swap_position,teleport_behind,shield">作用目标<select data-core="target">${options(['enemies','allies','self','all_units','neutral','random_enemies','random_allies','random_units'],'coreTarget',effect.target||'enemies')}</select></label>
        <label class="form-field" data-core-random="true">随机目标数量<input data-core="randomCount" type="number" min="1" value="${num(effect.randomCount,1)}"></label>
        <label class="form-field" data-core-fields="damage">伤害倍率<input data-core="multiplier" type="number" step="0.05" value="${num(effect.multiplier,1)}"></label>
        <label class="form-field" data-core-fields="heal,shield,lifesteal">数值<input data-core="value" type="number" value="${num(effect.value,0)}"></label>
        <label class="form-field" data-core-fields="heal,shield">数值模式<select data-core="mode">${options(['flat','percent'],'mode',effect.mode||'flat')}</select></label>
        <label class="form-field" data-core-fields="apply_status">状态<select data-core="statusId">${statusOptions(effect.statusId||'',true)}</select></label>
        <label class="form-field" data-core-fields="apply_status">状态层数<input data-core="stacks" type="number" min="1" value="${num(effect.stacks,1)}"></label>
        <label class="form-field" data-core-fields="apply_status">施加概率%<input data-core="chance" type="number" min="0" max="100" value="${num(effect.chance,100)}"></label>
        <label class="form-field" data-core-fields="push,pull,move_self">位移格数<input data-core="distance" type="number" min="0" value="${num(effect.distance,1)}"></label>
        <label class="form-field" data-core-fields="apply_status,push,pull,swap_position,teleport_behind">需要先由本招命中<select data-core="requiresHit"><option value="true" ${effect.requiresHit===true?'selected':''}>是</option><option value="false" ${effect.requiresHit!==true?'selected':''}>否</option></select></label>
        <label class="form-field" data-core-fields="damage">需要命中判定<select data-core="hitCheck"><option value="true" ${effect.hitCheck!==false?'selected':''}>是</option><option value="false" ${effect.hitCheck===false?'selected':''}>否</option></select></label>
        <label class="form-field" data-core-fields="damage">可暴击<select data-core="canCrit"><option value="true" ${effect.canCrit!==false?'selected':''}>是</option><option value="false" ${effect.canCrit===false?'selected':''}>否</option></select></label>
        <label class="form-field" data-core-fields="damage">可伤害障碍<select data-core="affectsObstacles"><option value="true" ${effect.affectsObstacles!==false?'selected':''}>是</option><option value="false" ${effect.affectsObstacles===false?'selected':''}>否</option></select></label>
        <label class="form-field" data-core-fields="shield">护盾持续回合<input data-core="durationTurns" type="number" min="0" value="${num(effect.duration?.turns??effect.durationTurns,1)}"></label>
        <label class="form-field full" data-core-fields="summon_unit">召唤角色模板<select data-core="template">${templateOptions(effect.templateRef||'',effect.templateTeam||'')}</select></label>
        <label class="form-field" data-core-fields="summon_unit">召唤阵营<select data-core="summonTeam">${options(['same','template','ally','enemy','neutral'],'summonTeam',effect.summonTeam||'same')}</select></label>
        <label class="form-field" data-core-fields="summon_unit">起始集气<input data-core="startGauge" type="number" min="0" value="${num(effect.startGauge,0)}"></label>
        <label class="form-field full" data-core-fields="summon_object">地面物名称<input data-core="objectName" value="${esc(effect.objectName||'召唤地面物')}"></label>
        <label class="form-field" data-core-fields="summon_object">地面物HP<input data-core="hp" type="number" min="1" value="${num(effect.hp,100)}"></label>
        <label class="form-field" data-core-fields="summon_object">持续回合（0=永久）<input data-core="objectDuration" type="number" min="0" value="${num(effect.durationTurns,0)}"></label>
        <label class="form-field" data-core-fields="summon_object">阻挡移动<select data-core="blocksMovement"><option value="true" ${effect.blocksMovement!==false?'selected':''}>是</option><option value="false" ${effect.blocksMovement===false?'selected':''}>否</option></select></label>
        <label class="form-field" data-core-fields="summon_object">阻断攻击<select data-core="blocksAttack"><option value="true" ${effect.blocksAttack===true?'selected':''}>是</option><option value="false" ${effect.blocksAttack!==true?'selected':''}>否</option></select></label>
      </div>
    </div>`;
  }

  function refreshCoreEffectCard(card){
    const type=card.querySelector('[data-core="type"]')?.value||'',target=card.querySelector('[data-core="target"]')?.value||'';
    card.querySelectorAll('[data-core-fields]').forEach(field=>{const allowed=(field.dataset.coreFields||'').split(',').filter(Boolean);field.hidden=!allowed.includes(type);});
    card.querySelectorAll('[data-core-random]').forEach(field=>field.hidden=!['random_enemies','random_allies','random_units'].includes(target));
  }

  function coreEffectsEditorHTML(skill){
    const effects=normalizedCoreEffects(skill);
    return `<div class="full core-effects-editor" data-core-effects>
      <div class="rules-editor-head">
        <div><b>技能本体 Effect</b><div class="muted">主动释放时直接执行；下面的 Rule 则监听战斗 Event。</div></div>
        <button type="button" class="secondary small" data-add-core>+ 添加本体效果</button>
      </div>
      <div class="core-effects-list">${effects.map(coreEffectCardHTML).join('')}</div>
    </div>`;
  }

  function bindCoreEffectsEditor(body){
    const editor=body.querySelector('[data-core-effects]');
    if(!editor)return;
    const list=editor.querySelector('.core-effects-list');
    const reindex=()=>[...list.querySelectorAll(':scope > .core-effect-card')].forEach((card,i)=>{
      card.dataset.coreIndex=i;
      const title=card.querySelector('.rule-card-head b');if(title)title.textContent=`本体效果 ${i+1}`;
    });
    const bind=card=>{
      card.querySelector('[data-remove-core]')?.addEventListener('click',()=>{card.remove();reindex();});
      card.querySelector('[data-core="type"]')?.addEventListener('change',()=>refreshCoreEffectCard(card));
      card.querySelector('[data-core="target"]')?.addEventListener('change',()=>refreshCoreEffectCard(card));
      refreshCoreEffectCard(card);
    };
    list.querySelectorAll(':scope > .core-effect-card').forEach(bind);
    editor.querySelector('[data-add-core]')?.addEventListener('click',()=>{
      const wrap=document.createElement('div');wrap.innerHTML=coreEffectCardHTML({},list.children.length);
      const card=wrap.firstElementChild;list.appendChild(card);bind(card);reindex();
    });
  }

  function readCoreEffectsEditor(body){
    const editor=body.querySelector('[data-core-effects]');if(!editor)return [];
    return [...editor.querySelectorAll('.core-effects-list > .core-effect-card')].map(card=>{
      const g=k=>card.querySelector(`[data-core="${k}"]`)?.value??'',type=g('type'),effect={type};
      if(['damage','heal','apply_status','push','pull','swap_position','teleport_behind','shield'].includes(type)){
        effect.target=g('target')||'enemies';if(effect.target.startsWith('random_'))effect.randomCount=Math.max(1,num(g('randomCount'),1));
      }
      if(type==='damage'){effect.multiplier=num(g('multiplier'),1);effect.hitCheck=g('hitCheck')!=='false';effect.canCrit=g('canCrit')!=='false';effect.affectsObstacles=g('affectsObstacles')!=='false';}
      else if(type==='heal'){effect.value=num(g('value'));effect.mode=g('mode')||'flat';}
      else if(type==='apply_status'){effect.statusId=g('statusId');effect.stacks=Math.max(1,num(g('stacks'),1));effect.chance=Math.max(0,Math.min(100,num(g('chance'),100)));effect.requiresHit=g('requiresHit')==='true';}
      else if(type==='push'||type==='pull'){effect.distance=Math.max(0,num(g('distance'),1));effect.requiresHit=g('requiresHit')==='true';}
      else if(type==='move_self'){effect.target='self';effect.distance=Math.max(0,num(g('distance'),1));}
      else if(type==='swap_position'||type==='teleport_behind'){effect.requiresHit=g('requiresHit')==='true';}
      else if(type==='lifesteal'){effect.target='self';effect.value=Math.max(0,num(g('value'),0));}
      else if(type==='shield'){effect.value=Math.max(0,num(g('value'),0));effect.mode=g('mode')||'flat';effect.duration={type:'turns',turns:Math.max(0,num(g('durationTurns'),1))};}
      else if(type==='summon_unit'){const raw=g('template'),cut=raw.indexOf(':');effect.templateTeam=cut>=0?raw.slice(0,cut):'';effect.templateRef=cut>=0?raw.slice(cut+1):raw;effect.summonTeam=g('summonTeam')||'same';effect.startGauge=Math.max(0,num(g('startGauge'),0));}
      else if(type==='summon_object'){effect.objectName=g('objectName').trim()||'召唤地面物';effect.hp=Math.max(1,num(g('hp'),100));effect.durationTurns=Math.max(0,num(g('objectDuration'),0));effect.blocksMovement=g('blocksMovement')!=='false';effect.blocksAttack=g('blocksAttack')==='true';}
      return effect;
    });
  }


  // ---------- 技能 / 装备 ----------
  function renderLibraryEditor(kind){
    const body=root.querySelector('#editorBody');
    const b=bucket(kind), ids=Object.keys(b||{});
    if(!E.selectedId || !b[E.selectedId]) E.selectedId=ids[0]||null;
    const item=E.selectedId?clone(b[E.selectedId]):(kind==='skill'?newSkill():newEquip());

    body.innerHTML=`
      <div class="editor-grid">
        <div class="editor-panel">
          <h3>${kind==='skill'?'技能库':'装备库'}</h3>
          <div class="editor-list">${ids.map(id=>`<button class="editor-chip ${id===E.selectedId?'active':''}" data-id="${esc(id)}">${esc(b[id].name||id)}</button>`).join('')}</div>
          <div class="editor-actions">
            <button id="newLibBtn">新建</button>
            <button id="deleteLibBtn" class="secondary" ${!E.selectedId?'disabled':''}>删除</button>
            <button id="libAINewBtn" class="secondary">✨ AI新建</button>
            <button id="libAIModifyBtn" class="secondary">🪄 AI修改当前</button>
          </div>
        </div>
        <div class="editor-panel">
          <h3>数据</h3>
          ${kind==='skill'?skillForm(item):equipForm(item)}
          <div class="editor-actions"><button id="saveLibBtn">保存</button></div>
        </div>
      </div>`;
    bindAllRulesEditors(body);
    if(kind==='skill') bindCoreEffectsEditor(body);
    body.querySelectorAll('[data-id]').forEach(x=>x.addEventListener('click',()=>{E.selectedId=x.dataset.id; renderLibraryEditor(kind);}));
    body.querySelector('#newLibBtn').addEventListener('click',()=>{E.selectedId=null; renderLibraryEditor(kind);});
    body.querySelector('#deleteLibBtn').addEventListener('click',()=>{
      if(E.selectedId&&confirm(`删除 ${E.selectedId}？`)){api.deleteLibrary(kind,E.selectedId,true);E.selectedId=null;renderLibraryEditor(kind);}
    });
    body.querySelector('#saveLibBtn').addEventListener('click',()=>{
      const data=kind==='skill'?readSkillForm(body):readEquipForm(body);
      if(!data.id)return alert('必须填写ID');
      api.updateLibrary(kind,data.id,data,true); E.selectedId=data.id; renderLibraryEditor(kind);
    });
    body.querySelector('#libAINewBtn').addEventListener('click',()=>{
      openAI(kind,null,kind==='skill'?skillSchema():equipSchema(),json=>{
        api.updateLibrary(kind,json.id,json,true);E.selectedId=json.id;E.tab=kind;render();
      },false,{mode:'create',returnTab:kind});
    });
    body.querySelector('#libAIModifyBtn').addEventListener('click',()=>{
      const data=kind==='skill'?readSkillForm(body):readEquipForm(body);
      openAI(kind,data,kind==='skill'?skillSchema():equipSchema(),json=>{
        api.updateLibrary(kind,json.id,json,true);E.selectedId=json.id;E.tab=kind;render();
      },false,{mode:'modify',returnTab:kind});
    });
  }

  function newSkill(){return{id:'',name:'',kind:'attack',castMask:{shape:'diamond',radius:1,includeOrigin:false},aiWeight:1,effectMask:{shape:'single'},multiplier:1,coreEffects:[{type:'damage',target:'enemies',multiplier:1,hitCheck:true,canCrit:true,affectsObstacles:true}],qiCost:0,cooldown:0,hitMod:0,canMoveAfterAction:false,description:''};}
  function skillForm(s){return `<div class="form-grid">
    <label class="form-field">ID<input id="sId" value="${esc(s.id||'')}"></label>
    <label class="form-field">名称<input id="sName" value="${esc(s.name||'')}"></label>
    <label class="form-field">类型<select id="sKind">${options(['attack','qinggong','buff'],'skillKind',s.kind||'attack')}</select></label>
    <label class="form-field">释放形状<select id="sCastShape">${options(['single','diamond','cross','square','line'],'shape',s.castMask?.shape||'diamond')}</select></label>
    <label class="form-field">释放半径<input id="sCastRadius" type="number" min="0" value="${num(s.castMask?.radius,1)}"></label>
    <label class="form-field">作用形状<select id="sEffShape">${options(['single','diamond','cross','square','line'],'shape',s.effectMask?.shape||'single')}</select></label>
    <label class="form-field">作用半径<input id="sEffRadius" type="number" min="0" value="${num(s.effectMask?.radius,0)}"></label>
    <label class="form-field">真气消耗<input id="sCost" type="number" min="0" value="${num(s.qiCost,0)}"></label>
    <label class="form-field">冷却<input id="sCd" type="number" min="0" value="${num(s.cooldown,0)}"></label>
    <label class="form-field">命中修正<input id="sHit" type="number" value="${num(s.hitMod,0)}"></label>
    <label class="form-field">攻击后可移动<select id="sMoveAfter"><option value="false">否</option><option value="true" ${s.canMoveAfterAction?'selected':''}>是</option></select></label>
    <label class="form-field">释放范围包含自身格<select id="sIncludeOrigin"><option value="false">否</option><option value="true" ${s.castMask?.includeOrigin?'selected':''}>是</option></select></label>
    <label class="form-field">AI使用权重<input id="sAIWeight" type="number" step="0.1" min="0" value="${num(s.aiWeight,1)}"></label>
    <label class="form-field full">说明<textarea id="sDesc">${esc(s.description||'')}</textarea></label>
    ${coreEffectsEditorHTML(s)}
    ${rulesEditorHTML('s',s.rules||[],'attack_hit')}
  </div>`;}
  function readSkillForm(body){
    const g=id=>body.querySelector(`#${id}`)?.value??'';
    const coreEffects=readCoreEffectsEditor(body),firstDamage=coreEffects.find(e=>e.type==='damage');
    return{
      id:g('sId').trim(),name:g('sName').trim(),kind:g('sKind'),
      castMask:{shape:g('sCastShape'),radius:num(g('sCastRadius'),1),includeOrigin:g('sIncludeOrigin')==='true'},
      effectMask:{shape:g('sEffShape'),radius:num(g('sEffRadius'),0)},
      multiplier:num(firstDamage?.multiplier,1),coreEffects,
      qiCost:num(g('sCost')),cooldown:num(g('sCd')),hitMod:num(g('sHit')),
      aiWeight:Math.max(0,num(g('sAIWeight'),1)),
      canMoveAfterAction:g('sMoveAfter')==='true',description:g('sDesc'),rules:readRulesEditor(body,'s')
    };
  }

  function newEquip(){return{id:'',name:'',slot:'weapon',description:'',modifiers:{attack:0,defense:0,maxHp:0,maxQi:0,qiSpeed:0,move:0,crit:0,dodge:0,accuracy:0}};}
  function equipForm(e){const m=e.modifiers||{};return `<div class="form-grid">
    <label class="form-field">ID<input id="eId" value="${esc(e.id||'')}"></label>
    <label class="form-field">名称<input id="eName" value="${esc(e.name||'')}"></label>
    <label class="form-field">槽位<select id="eSlot">${options(['weapon','armor','accessory','other'],'slot',e.slot||'weapon')}</select></label>
    ${[['eAtk','攻击','attack'],['eDef','防御','defense'],['eHp','HP','maxHp'],['eQi','真气','maxQi'],['eSpeed','集气','qiSpeed'],['eMove','移动','move'],['eCrit','暴击','crit'],['eDodge','闪避','dodge'],['eAcc','命中','accuracy'],['eStatusResist','状态抗性','statusResist']].map(([id,l,k])=>`<label class="form-field">${l}<input id="${id}" type="number" value="${num(m[k],0)}"></label>`).join('')}
    <label class="form-field full">说明<textarea id="eDesc">${esc(e.description||'')}</textarea></label>
    ${rulesEditorHTML('e',e.rules||[],'attack_crit')}
  </div>`;}
  function readEquipForm(body){const g=id=>body.querySelector(`#${id}`)?.value??'';return{id:g('eId').trim(),name:g('eName').trim(),slot:g('eSlot'),description:g('eDesc'),modifiers:{
    attack:num(g('eAtk')),defense:num(g('eDef')),maxHp:num(g('eHp')),maxQi:num(g('eQi')),qiSpeed:num(g('eSpeed')),move:num(g('eMove')),crit:num(g('eCrit')),dodge:num(g('eDodge')),accuracy:num(g('eAcc')),statusResist:num(g('eStatusResist'))
  },rules:readRulesEditor(body,'e')};}

  // ---------- Buff / Debuff ----------
  function renderStatus(body){
    const b=bucket('status')||{},ids=Object.keys(b);
    if(!E.selectedId||!b[E.selectedId])E.selectedId=ids[0]||null;
    const st=E.selectedId?clone(b[E.selectedId]):newStatus();
    const mod=st.modifiers?.[0]||{};
    body.innerHTML=`<div class="editor-grid">
      <div class="editor-panel"><h3>Buff / Debuff 状态库</h3>
        <div class="editor-list">${ids.map(id=>`<button class="editor-chip ${id===E.selectedId?'active':''}" data-id="${esc(id)}">${esc(b[id].name||id)}</button>`).join('')}</div>
        <div class="editor-actions"><button id="newStatusBtn">新建状态</button><button id="deleteStatusBtn" class="secondary" ${!E.selectedId?'disabled':''}>删除</button><button id="statusAINewBtn" class="secondary">✨ AI新建</button><button id="statusAIModifyBtn" class="secondary">🪄 AI修改当前</button></div>
        <p class="editor-warning">状态可被技能、装备、天赋的通用 Effect 使用 <code>apply_status</code> 施加。状态自身也能带规则，例如“行动结束时流血掉血”。</p>
      </div>
      <div class="editor-panel"><h3>状态数据</h3><div class="form-grid">
        <label class="form-field">ID<input id="stId" value="${esc(st.id||'')}"></label>
        <label class="form-field">名称<input id="stName" value="${esc(st.name||'')}"></label>
        <label class="form-field">类型<select id="stPolarity">${options(['buff','debuff'],'polarity',st.polarity||'buff')}</select></label>
        <label class="form-field">图标<input id="stIcon" value="${esc(st.icon||'')}"></label>
        <label class="form-field full">标签（逗号）<input id="stTags" value="${esc((st.tags||[]).join(','))}"></label>
        <label class="form-field full">控制效果（可多选）<select id="stControls" multiple size="4">${['stun','root','silence','disarm'].map(v=>`<option value="${v}" ${(st.controlTags||[]).includes(v)?'selected':''}>${esc(enumLabel('control',v))}</option>`).join('')}</select></label>
        <label class="form-field full">互斥状态（可多选）<select id="stConflicts" multiple size="5">${statusMultiOptions(st.conflicts||[])}</select></label>
        <label class="form-field">基础施加概率%<input id="stApplyChance" type="number" min="0" max="100" value="${num(st.applyChance,100)}"></label>
        <label class="form-field">最大层数<input id="stMax" type="number" min="1" value="${num(st.maxStacks,1)}"></label>
        <label class="form-field">叠层方式<select id="stStack">${options(['refresh','add_refresh','replace'],'stackMode',st.stackMode||'refresh')}</select></label>
        <label class="form-field">可驱散<select id="stDispel"><option value="true" ${st.dispellable!==false?'selected':''}>是</option><option value="false" ${st.dispellable===false?'selected':''}>否</option></select></label>
        <label class="form-field">持续类型<select id="stDurType">${options(['turns','action','battle','permanent'],'duration',st.duration?.type||'turns')}</select></label>
        <label class="form-field">持续回合<input id="stTurns" type="number" min="0" value="${num(st.duration?.turns,2)}"></label>
        <label class="form-field">属性修正<select id="stStat">${options(['attack','defense','qiSpeed','move','crit','dodge','accuracy','statusResist'],'stat',mod.stat||'defense')}</select></label>
        <label class="form-field">修正模式<select id="stMode">${options(['flat','percent'],'mode',mod.mode||'percent')}</select></label>
        <label class="form-field">每层数值<input id="stValue" type="number" value="${num(mod.value,0)}"></label>
        <label class="form-field">随层数叠加<select id="stPerStack"><option value="true" ${mod.perStack!==false?'selected':''}>是</option><option value="false" ${mod.perStack===false?'selected':''}>否</option></select></label>
        <label class="form-field">层数阈值<input id="stThreshold" type="number" min="0" value="${num(st.threshold?.stacks,0)}"></label>
        <label class="form-field">阈值触发后<select id="stThresholdConsume"><option value="all" ${st.threshold?.consume!=='threshold'?'selected':''}>清空状态</option><option value="threshold" ${st.threshold?.consume==='threshold'?'selected':''}>只消耗阈值层数</option></select></label>
        ${effectsOnlyEditorHTML('threshold',st.threshold?.effects||[])}
        <label class="form-field full">说明<textarea id="stDesc">${esc(st.description||'')}</textarea></label>
        ${rulesEditorHTML('st',st.rules||[],'turn_end')}
      </div><div class="editor-actions"><button id="saveStatusBtn">保存状态</button></div></div>
    </div>`;
    bindAllRulesEditors(body);
    bindEffectsOnlyEditor(body.querySelector('[data-effects-only="threshold"]'));
    body.querySelectorAll('[data-id]').forEach(x=>x.addEventListener('click',()=>{E.selectedId=x.dataset.id;renderStatus(body);}));
    body.querySelector('#newStatusBtn').addEventListener('click',()=>{E.selectedId=null;renderStatus(body);});
    body.querySelector('#deleteStatusBtn').addEventListener('click',()=>{if(E.selectedId&&confirm(`删除 ${E.selectedId}？`)){api.deleteLibrary('status',E.selectedId,true);E.selectedId=null;renderStatus(body);}});
    body.querySelector('#saveStatusBtn').addEventListener('click',()=>{const data=readStatus(body);if(!data.id)return alert('必须填写ID');api.updateLibrary('status',data.id,data,true);E.selectedId=data.id;renderStatus(body);});
    body.querySelector('#statusAINewBtn').addEventListener('click',()=>{
      openAI('status',null,statusSchema(),json=>{api.updateLibrary('status',json.id,json,true);E.selectedId=json.id;E.tab='status';render();},false,{mode:'create',returnTab:'status'});
    });
    body.querySelector('#statusAIModifyBtn').addEventListener('click',()=>{
      openAI('status',readStatus(body),statusSchema(),json=>{api.updateLibrary('status',json.id,json,true);E.selectedId=json.id;E.tab='status';render();},false,{mode:'modify',returnTab:'status'});
    });
  }
  function newStatus(){return{id:'',name:'',polarity:'buff',icon:'',tags:[],controlTags:[],conflicts:[],applyChance:100,description:'',maxStacks:1,stackMode:'refresh',dispellable:true,duration:{type:'turns',turns:2},modifiers:[],rules:[]};}
  function readStatus(body){
    const g=id=>body.querySelector(`#${id}`)?.value??'',arr=id=>g(id).split(',').map(x=>x.trim()).filter(Boolean);
    const value=num(g('stValue')),modifiers=value===0?[]:[{stat:g('stStat'),mode:g('stMode'),value,perStack:g('stPerStack')!=='false'}];
    const thresholdStacks=Math.max(0,num(g('stThreshold'),0)),thresholdEffects=readEffectsOnlyEditor(body,'threshold');
    const threshold=thresholdStacks>0?{stacks:thresholdStacks,consume:g('stThresholdConsume')||'all',effects:thresholdEffects}:undefined;
    return {
      id:g('stId').trim(),name:g('stName').trim(),polarity:g('stPolarity'),icon:g('stIcon').trim(),tags:arr('stTags'),
      controlTags:selectedValues(body.querySelector('#stControls')),conflicts:selectedValues(body.querySelector('#stConflicts')),
      applyChance:Math.max(0,Math.min(100,num(g('stApplyChance'),100))),description:g('stDesc'),maxStacks:Math.max(1,num(g('stMax'),1)),
      stackMode:g('stStack'),dispellable:g('stDispel')!=='false',duration:{type:g('stDurType'),turns:num(g('stTurns'),0)},modifiers,threshold,rules:readRulesEditor(body,'st')
    };
  }

  // ---------- 天赋 ----------
  function renderTalent(body){
    const b=bucket('talent'), ids=Object.keys(b||{});
    if(!E.selectedId||!b[E.selectedId])E.selectedId=ids[0]||null;
    const t=E.selectedId?clone(b[E.selectedId]):newTalent();
    const cond=t.conditions?.[0]||{};
    const eff=t.effects?.[0]||{};
    body.innerHTML=`
      <div class="editor-grid">
        <div class="editor-panel">
          <h3>天赋库</h3>
          <div class="editor-list">${ids.map(id=>`<button class="editor-chip ${id===E.selectedId?'active':''}" data-id="${esc(id)}">${esc(b[id].name||id)}</button>`).join('')}</div>
          <div class="editor-actions">
            <button id="newTalentBtn">新建天赋</button>
            <button id="deleteTalentBtn" class="secondary" ${!E.selectedId?'disabled':''}>删除</button>
            <button id="talentAINewBtn" class="secondary">✨ AI新建</button>
            <button id="talentAIModifyBtn" class="secondary">🪄 AI修改当前</button>
          </div>
          <hr>
          <h3>奖励 Roll · 3选1</h3>
          <div class="form-grid">
            <label class="form-field">Roll Seed<input id="talentSeed" type="number" value="${Date.now()%1000000000}"></label>
            <label class="form-field">候选数量<input id="talentCount" type="number" min="1" max="5" value="3"></label>
          </div>
          <button id="rollTalentBtn">Roll</button>
          <div id="talentChoices" class="talent-choice-grid"></div>
          <p class="editor-warning">触发型天赋现在已经接入战斗事件引擎。攻击命中事件按“实际命中单位”产生，因此范围技点击空地仍能触发。默认攻击命中类天赋每次技能只触发1次，可改为“每个实际命中目标1次”。</p>
        </div>
        <div class="editor-panel">
          <h3>天赋：当…时 → 触发… → 维持…</h3>
          <div class="form-grid">
            <label class="form-field">ID<input id="tId" value="${esc(t.id||'')}"></label>
            <label class="form-field">名称<input id="tName" value="${esc(t.name||'')}"></label>
            <label class="form-field">类型<select id="tType">${options(['triggered','passive'],'talentType',t.type||'triggered')}</select></label>
            <label class="form-field">稀有度<select id="tRare">${options(['common','uncommon','rare','epic','legendary'],'rarity',t.rarity||'common')}</select></label>
            <label class="form-field">权重<input id="tWeight" type="number" min="0" value="${num(t.weight,100)}"></label>
            <label class="form-field">触发事件<select id="tEvent">${options(['battle_start','turn_start','turn_end','attack_hit','attack_crit','damage_taken','hp_changed','move_step','defend','rest','kill'],'event',cond.event||'attack_hit')}</select></label>
            <label class="form-field">触发频率<select id="tScope">${options(['once_per_action','per_target','once_per_turn','per_event'],'scope',t.triggerScope||((cond.event==='attack_hit'||cond.event==='attack_crit')?'once_per_action':'per_event'))}</select></label>
            <label class="form-field">条件字段<select id="tField">${options(['hit','crit','damage','hpPercent','qiPercent','targetHpPercent','moveSpent','relation','skillId'],'field',cond.field||'hit')}</select></label>
            <label class="form-field">比较<select id="tOp">${['==','!=','<','<=','>','>='].map(x=>`<option value="${x}" ${cond.op===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
            <label class="form-field">条件值<input id="tCondVal" value="${esc(cond.value??'')}"></label>
            <label class="form-field">效果类型<select id="tEffType">${options(['modify_stat','gain_gauge','heal','deal_damage','apply_status','remove_status','grant_move','refund_qi'],'effect',eff.type||'modify_stat')}</select></label>
            <label class="form-field">状态ID<input id="tStatusId" value="${esc(eff.statusId||'')}"></label>
            <label class="form-field">状态层数<input id="tStatusStacks" type="number" min="1" value="${num(eff.stacks,1)}"></label>
            <label class="form-field">效果属性<select id="tStat">${options(['attack','defense','qiSpeed','move','crit','dodge','accuracy','statusResist'],'stat',eff.stat||'attack')}</select></label>
            <label class="form-field">效果数值<input id="tEffVal" type="number" value="${num(eff.value,0)}"></label>
            <label class="form-field">数值模式<select id="tMode">${options(['flat','percent'],'mode',eff.mode||'flat')}</select></label>
            <label class="form-field">目标<select id="tTarget">${options(['self','target','attacker','allies','enemies'],'target',eff.target||'self')}</select></label>
            <label class="form-field">持续类型<select id="tDurationType">${options(['instant','turns','action','battle','permanent'],'duration',t.duration?.type||'turns')}</select></label>
            <label class="form-field">持续回合<input id="tTurns" type="number" min="0" value="${num(t.duration?.turns,0)}"></label>
            <label class="form-field">内部冷却<input id="tCooldown" type="number" min="0" value="${num(t.cooldown,0)}"></label>
            <label class="form-field full">说明<textarea id="tDesc">${esc(t.description||'')}</textarea></label>
            ${rulesEditorHTML('t',t.rules||[],'attack_hit')}
          </div>
          <div class="editor-actions"><button id="saveTalentBtn">保存天赋</button></div>
        </div>
      </div>`;
    bindAllRulesEditors(body);

    body.querySelectorAll('[data-id]').forEach(x=>x.addEventListener('click',()=>{E.selectedId=x.dataset.id;renderTalent(body);}));
    body.querySelector('#newTalentBtn').addEventListener('click',()=>{E.selectedId=null;renderTalent(body);});
    body.querySelector('#deleteTalentBtn').addEventListener('click',()=>{if(E.selectedId&&confirm(`删除 ${E.selectedId}？`)){api.deleteLibrary('talent',E.selectedId,true);E.selectedId=null;renderTalent(body);}});
    body.querySelector('#saveTalentBtn').addEventListener('click',()=>{
      const data=readTalentForm(body);if(!data.id)return alert('必须填写ID');
      api.updateLibrary('talent',data.id,data,true);E.selectedId=data.id;renderTalent(body);
    });
    body.querySelector('#talentAINewBtn').addEventListener('click',()=>{
      openAI('talent',null,talentSchema(),json=>{api.updateLibrary('talent',json.id,json,true);E.selectedId=json.id;E.tab='talent';render();},false,{mode:'create',returnTab:'talent'});
    });
    body.querySelector('#talentAIModifyBtn').addEventListener('click',()=>{
      openAI('talent',readTalentForm(body),talentSchema(),json=>{api.updateLibrary('talent',json.id,json,true);E.selectedId=json.id;E.tab='talent';render();},false,{mode:'modify',returnTab:'talent'});
    });
    body.querySelector('#rollTalentBtn').addEventListener('click',()=>{
      const count=Math.max(1,Math.min(5,num(body.querySelector('#talentCount').value,3)));
      const seed=num(body.querySelector('#talentSeed').value,Date.now());
      const picks=api.rollTalentChoices(count,seed);
      body.querySelector('#talentChoices').innerHTML=picks.map(t=>`<div class="talent-choice"><b>${esc(t.name)}</b><span>${esc(t.rarity||'')}</span><p>${esc(t.description||'')}</p><code>${esc(t.id)}</code></div>`).join('');
    });
  }
  function newTalent(){return{id:'',name:'',rarity:'common',type:'triggered',weight:100,description:'',triggerScope:'once_per_action',conditions:[{event:'attack_hit',subject:'self',field:'hit',op:'==',value:true}],effects:[{type:'modify_stat',target:'self',stat:'attack',mode:'percent',value:10}],duration:{type:'turns',turns:1},cooldown:0};}
  function parseValue(v){if(v==='true')return true;if(v==='false')return false;if(v!==''&&!Number.isNaN(Number(v)))return Number(v);return v;}
  function readTalentForm(body){const g=id=>body.querySelector(`#${id}`)?.value??'';const type=g('tType');return{
    id:g('tId').trim(),name:g('tName').trim(),rarity:g('tRare'),type,weight:num(g('tWeight'),100),description:g('tDesc'),
    triggerScope:g('tScope')||'once_per_action',
    conditions:type==='passive'?[]:[{event:g('tEvent'),subject:'self',field:g('tField'),op:g('tOp'),value:parseValue(g('tCondVal'))}],
    effects:[(()=>{const e={type:g('tEffType'),target:g('tTarget'),stat:g('tStat'),mode:g('tMode'),value:num(g('tEffVal'))};if(e.type==='apply_status'||e.type==='remove_status'){e.statusId=g('tStatusId').trim();e.stacks=Math.max(1,num(g('tStatusStacks'),1));}return e;})()],
    duration:{type:type==='passive'?'permanent':g('tDurationType'),turns:num(g('tTurns'))},cooldown:num(g('tCooldown')),
    rules:type==='passive'?[]:readRulesEditor(body,'t')
  };}

  // ---------- 酒馆触发 ----------
  function renderTrigger(body){
    const trigger=api.generateTrigger(E.scene||api.getScene());
    body.innerHTML=`
      <div class="editor-grid">
        <div class="editor-panel">
          <h3>简单 BATTLE_TRIGGER 格式</h3>
          <textarea id="triggerText" class="trigger-box">${esc(trigger)}</textarea>
          <div class="editor-actions">
            <button id="genTriggerBtn">按当前场景重新生成</button>
            <button id="applyTriggerBtn" class="secondary">解析并载入</button>
            <button id="triggerAIBtn" class="secondary">AI生成战斗触发</button>
          </div>
          <p class="editor-warning">这里故意不用大段JSON。酒馆回复里只放图鉴引用、坐标、障碍和撤离点；完整角色/技能/装备/天赋从当前合集读取。</p>
        </div>
        <div class="editor-panel">
          <h3>格式说明</h3>
          <pre class="json-preview">我方=p1@2,7,N
敌方=e1@7,3,S; e1#刺客乙@8,4,W
障碍=巨石@5,5,800
撤离=1,9,ally

坐标为界面坐标（1开始）。
# 后面是可选实例ID，用于同一种敌人重复出现。</pre>
        </div>
      </div>`;
    body.querySelector('#genTriggerBtn').addEventListener('click',()=>body.querySelector('#triggerText').value=api.generateTrigger(E.scene||api.getScene()));
    body.querySelector('#applyTriggerBtn').addEventListener('click',()=>{
      try{E.scene=api.parseTrigger(body.querySelector('#triggerText').value);api.updateScene(E.scene,true);alert('已解析并载入场景');}
      catch(e){alert(`解析失败：${e.message}`);}
    });
    body.querySelector('#triggerAIBtn').addEventListener('click',()=>{
      openAI('battle_trigger',null,triggerSchema(),jsonOrText=>{
        body.querySelector('#triggerText').value=typeof jsonOrText==='string'?jsonOrText:(jsonOrText.trigger||'');
      },true,{mode:'create',returnTab:'trigger',hints:{currentTrigger:body.querySelector('#triggerText').value}});
    });
  }

  // ---------- AI新建 / AI修改 ----------
  function openAI(kind,current,schema,applyFn,plainText=false,options={}){
    E.aiKind=kind;
    E.aiSchema=schema;
    E.aiTargetApply=applyFn;
    E.aiCurrent=current;
    E.aiPlain=plainText;
    E.aiMode=options.mode||'modify';
    E.aiHints=options.hints||null;
    E.aiReturnTab=options.returnTab||E.tab||'scene';
    E.aiIncludeStory=options.includeStory!==false;
    E.aiIncludeWorldInfo=options.includeWorldInfo!==false;
    E.aiExtraRequirements='';
    E.tab='ai';
    render();
  }

  function aiKindLabel(kind){
    return ({
      actor:'角色',skill:'技能',equipment:'装备',status:'状态',
      talent:'天赋',scene:'场景',battle_trigger:'战斗触发'
    })[kind]||kind;
  }

  function aiModeLabel(mode){
    return mode==='create'?'AI 新建':'AI 修改当前';
  }

  function idExistsForAI(kind,id){
    if(!id)return false;
    const c=collection();
    if(kind==='actor'){
      return !!(c.allies?.[id]||c.neutrals?.[id]||c.enemies?.[id]);
    }
    return !!bucket(kind)?.[id];
  }

  function buildAIPrompt(kind,current,schema,{mode='modify',extraRequirements='',hints=null}={}){
    const lines=[
      `你正在为一个 SillyTavern 回合制战斗插件${mode==='create'?'创建全新数据':'修改现有数据'}。`,
      `任务类型：${kind}`,
      `操作模式：${mode==='create'?'CREATE / 新建':'MODIFY / 修改当前'}`,
      '',
      '硬性要求：',
      '1. 战斗数值必须内部一致，不要为了预设剧情结果故意加强或削弱。',
      '2. 角色的技能 / 装备 / 天赋引用，以及技能与规则的状态引用，都使用已有 ID。',
      '3. 只输出目标结构要求的数据，不要输出解释性正文。',
      `4. ${kind==='battle_trigger'?'返回简洁的 <BATTLE>...</BATTLE> 文本。':'只返回一个合法 JSON 对象。'}`
    ];

    if(mode==='create'){
      lines.push(
        '5. 这是“新建”任务：不要复制当前正在浏览的对象，不要沿用它的 ID。',
        '6. 必须生成一个语义清晰、不会与已有数据库重复的新 ID。'
      );
    }else{
      lines.push(
        '5. 这是“修改当前”任务：必须以当前数据为基底修改。',
        '6. 除非补充要求明确要求改 ID，否则保持当前 id 不变；未要求改动的复杂规则应尽量保留。'
      );
    }

    if(hints && Object.keys(hints).length){
      lines.push('', '固定提示 / 环境约束：', JSON.stringify(hints,null,2));
    }

    if(mode==='modify'){
      lines.push('', '当前数据：', JSON.stringify(current||{},null,2));
    }

    lines.push('', '目标结构：', JSON.stringify(schema||{},null,2));

    const extra=String(extraRequirements||'').trim();
    lines.push('', '补充要求：', extra||'（无额外要求，请根据当前剧情、世界设定与战斗数据库合理处理。）');

    return lines.join('\n');
  }

  function renderAI(body){
    const kind=E.aiKind||'actor';
    const mode=E.aiMode||'modify';
    const refreshPrompt=()=>{
      const extra=body.querySelector('#aiExtraRequirements')?.value??E.aiExtraRequirements??'';
      E.aiExtraRequirements=extra;
      const prompt=buildAIPrompt(kind,E.aiCurrent||{},E.aiSchema||{},{
        mode,
        extraRequirements:extra,
        hints:E.aiHints
      });
      const box=body.querySelector('#aiPrompt');
      if(box)box.value=prompt;
    };

    body.innerHTML=`
      <div class="editor-grid">
        <div class="editor-panel">
          <div class="ai-title-row">
            <div>
              <h3>${aiModeLabel(mode)} · ${aiKindLabel(kind)}</h3>
              <div class="muted">${mode==='create'?'生成独立的新对象，不把当前对象当模板。':'保留当前对象作为基底，再按要求修改。'}</div>
            </div>
            <span class="ai-mode-badge ${mode}">${mode==='create'?'新建':'修改'}</span>
          </div>

          <div id="aiStatus" class="ai-status">已连接 SillyTavern 时，会使用当前连接模型进行隔离的数据生成。</div>

          <div class="ai-context-options">
            <label class="checkbox-label-local">
              <input id="aiIncludeStory" type="checkbox" ${E.aiIncludeStory?'checked':''}>
              <span>附加最近剧情与当前角色参考</span>
            </label>
            <label class="checkbox-label-local">
              <input id="aiIncludeWorldInfo" type="checkbox" ${E.aiIncludeWorldInfo?'checked':''}>
              <span>附加当前激活世界书</span>
            </label>
          </div>

          <label class="form-field full ai-extra-field">
            补充要求
            <textarea id="aiExtraRequirements" placeholder="例如：设计一把洛家筑基期常用的水属性长剑，偏集气和闪避，强度中等。">${esc(E.aiExtraRequirements||'')}</textarea>
          </label>

          <details class="ai-prompt-details">
            <summary>查看 / 手动编辑实际数据任务提示词</summary>
            <textarea id="aiPrompt" class="trigger-box"></textarea>
          </details>

          <div class="editor-actions">
            <button id="callAIButton">${mode==='create'?'✨ 调用 AI 新建':'🪄 调用 AI 修改'}</button>
            <button id="copyPromptBtn" class="secondary">复制任务提示词</button>
          </div>

          <p class="editor-warning">
            “最近剧情 / 当前激活世界书”只作为参考资料附加给数据生成；数据 AI 仍使用独立 system prompt，
            不会要求模型继续写小说。世界书关闭时不会发送世界书内容。
          </p>
        </div>

        <div class="editor-panel">
          <h3>AI 返回结果</h3>
          <textarea id="aiResult" class="trigger-box" placeholder="${E.aiPlain?'等待 <BATTLE>...</BATTLE>':'等待 JSON'}"></textarea>
          <div class="editor-actions">
            <button id="applyAIResultBtn">应用结果</button>
            <button id="backAITab" class="secondary">返回</button>
          </div>
        </div>
      </div>`;

    refreshPrompt();

    body.querySelector('#aiExtraRequirements').addEventListener('input',refreshPrompt);
    body.querySelector('#aiIncludeStory').addEventListener('change',e=>E.aiIncludeStory=!!e.target.checked);
    body.querySelector('#aiIncludeWorldInfo').addEventListener('change',e=>E.aiIncludeWorldInfo=!!e.target.checked);

    body.querySelector('#copyPromptBtn').addEventListener('click',async()=>{
      const t=body.querySelector('#aiPrompt').value;
      try{await navigator.clipboard.writeText(t);body.querySelector('#aiStatus').textContent='任务提示词已复制。';}
      catch{prompt('复制：',t);}
    });

    body.querySelector('#callAIButton').addEventListener('click',async()=>{
      const provider=window.TavernBattleAIProvider;
      if(!provider?.generate){
        body.querySelector('#aiStatus').textContent='未连接酒馆 AI Provider，请复制提示词或手动粘贴 AI 结果。';
        return;
      }

      const btn=body.querySelector('#callAIButton');
      btn.disabled=true;
      const contexts=[
        E.aiIncludeStory?'最近剧情':'不含剧情',
        E.aiIncludeWorldInfo?'激活世界书':'不含世界书'
      ].join(' + ');
      body.querySelector('#aiStatus').textContent=`正在请求当前模型（${contexts}）……`;

      try{
        E.aiExtraRequirements=body.querySelector('#aiExtraRequirements').value;
        const result=await provider.generate({
          kind,
          operation:mode,
          prompt:body.querySelector('#aiPrompt').value,
          schema:E.aiSchema,
          current:mode==='modify'?E.aiCurrent:null,
          hints:E.aiHints,
          includeStory:E.aiIncludeStory,
          includeWorldInfo:E.aiIncludeWorldInfo,
          extraRequirements:E.aiExtraRequirements,
          plainText:E.aiPlain
        });
        body.querySelector('#aiResult').value=typeof result==='string'?result:JSON.stringify(result,null,2);
        body.querySelector('#aiStatus').textContent=`AI ${mode==='create'?'新建':'修改'}完成，请检查后应用。`;
      }catch(err){
        body.querySelector('#aiStatus').textContent=`AI 请求失败：${err.message}`;
      }finally{
        btn.disabled=false;
      }
    });

    body.querySelector('#applyAIResultBtn').addEventListener('click',()=>{
      try{
        const raw=body.querySelector('#aiResult').value.trim();
        const result=E.aiPlain?raw:JSON.parse(raw);
        if(!E.aiTargetApply)throw new Error('没有目标编辑器');

        if(mode==='create' && !E.aiPlain && result?.id && idExistsForAI(kind,result.id)){
          throw new Error(`新建失败：ID「${result.id}」已经存在，请让 AI 生成新的唯一 ID。`);
        }
        if(mode==='modify' && !E.aiPlain && E.aiCurrent?.id && result?.id && result.id!==E.aiCurrent.id){
          const ok=confirm(`AI 将 ID 从「${E.aiCurrent.id}」改成「${result.id}」。这可能使已有引用失效，仍要应用吗？`);
          if(!ok)return;
        }

        E.aiTargetApply(result);
      }catch(err){
        alert(`应用失败：${err.message}`);
      }
    });

    body.querySelector('#backAITab').addEventListener('click',()=>{
      E.tab=E.aiReturnTab||'scene';
      render();
    });
  }

  // ---------- schema示例 ----------  // ---------- schema示例 ----------
  function actorSchema(){return{
    id:'enemy_bandit',name:'山贼',short:'贼',team:'enemy',
    maxHp:900,maxQi:250,attack:220,defense:150,crit:5,dodge:5,accuracy:0,
    qiSpeed:400,move:4,statusResist:0,immunities:[],
    skills:['basic'],equipment:[],talents:[]
  };}

  function skillSchema(){return{
    id:'skill_id',name:'技能名',kind:'attack',
    castMask:{shape:'diamond',radius:2,includeOrigin:false},
    effectMask:{shape:'single',radius:0},
    multiplier:1.2,aiWeight:1,
    coreEffects:[
      {type:'damage',target:'enemies',multiplier:1.2,hitCheck:true,canCrit:true,affectsObstacles:true}
    ],
    qiCost:30,cooldown:2,hitMod:0,canMoveAfterAction:false,
    description:'',
    rules:[]
  };}

  function equipSchema(){return{
    id:'equip_id',name:'装备名',slot:'weapon',description:'',
    modifiers:{
      attack:20,defense:0,maxHp:0,maxQi:0,qiSpeed:0,move:0,
      crit:0,dodge:0,accuracy:0,statusResist:0
    },
    rules:[]
  };}

  function statusSchema(){return{
    id:'status_id',name:'状态名',polarity:'debuff',icon:'🩸',
    tags:['physical'],controlTags:[],conflicts:[],applyChance:100,
    description:'',maxStacks:3,stackMode:'add_refresh',dispellable:true,
    duration:{type:'turns',turns:3},
    modifiers:[{stat:'defense',mode:'percent',value:-10,perStack:true}],
    threshold:{stacks:3,consume:'all',effects:[]},
    rules:[]
  };}

  function talentSchema(){return{
    id:'talent_id',name:'天赋名',rarity:'uncommon',type:'triggered',weight:70,
    triggerScope:'once_per_action',description:'',
    conditions:[{event:'attack_hit',subject:'self',field:'hit',op:'==',value:true}],
    effects:[{type:'modify_stat',target:'self',stat:'attack',mode:'percent',value:10}],
    duration:{type:'turns',turns:2},cooldown:0,
    rules:[]
  };}

  function sceneSchema(){return{
    schema:'tavern-battle-scene',version:1,id:'scene_id',name:'场景名',boardSize:9,
    placements:[
      {team:'ally',ref:'hero',x:1,y:7,facing:'N'},
      {team:'enemy',ref:'enemy',instanceId:'enemy_1',x:6,y:2,facing:'S'}
    ],
    obstacles:[
      {id:'rock_1',name:'巨石',x:4,y:4,maxHp:800,hp:800,blocksMovement:true,blocksAttack:true}
    ],
    evacPoints:[{id:'evac_1',name:'撤离点',x:0,y:8,allowedTeams:['ally']}],
    victory:{type:'eliminate-or-evacuate'}
  };}

  function triggerSchema(){return{
    trigger:"<BATTLE>\\n合集=...\\n场景=...\\n尺寸=9\\n我方=...\\n敌方=...\\n障碍=...\\n撤离=...\\n目标=...\\n</BATTLE>"
  };}

})();
