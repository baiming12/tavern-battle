(() => {
  'use strict';

  const CONFIG = {
    boardSize: 9,
    gaugeThreshold: 100,
    // 展示层时间压缩：保持集气速率的“相对快慢”，但不宣称这是逸剑底层真实 tick 公式。
    gaugeVisualScale: 0.060,
    baseHitChance: 86,
    sideDamageBonus: 0.15,       // 公开攻略：侧击伤害 +15%
    backDamageBonus: 0.15,       // 公开攻略：背击伤害 +15%
    backHitBonus: 50,            // 公开攻略：背击命中 +50%
    critMultiplier: 1.5,         // 公开攻略：暴击 1.5 倍
    defenseReduction: 0.30,      // 暂定规则，待继续考据/实测
    controlFieldPenalty: 1,      // 原作控制领域：位于敌人周身4格时移动-1，可叠加
    defenseFactor: 0.55,         // 暂定伤害公式参数，待反推原作
    restHpPct: 0.06,             // 暂定
    restQiPct: 0.12,             // 暂定
    maxLogLines: 260,
  };

  const SKILLS = {
    basic: {
      id: 'basic', name: '一式·平斩', kind: 'attack',
      castMask: { shape: 'diamond', radius: 1, includeOrigin: false },
      effectMask: { shape: 'single' },
      multiplier: 1.0, qiCost: 0, cooldown: 0, hitMod: 0,
      coreEffects:[{type:'damage',target:'enemies',multiplier:1.0,hitCheck:true,canCrit:true,affectsObstacles:true}],
      description: '近身单体攻击'
    },
    second: {
      id: 'second', name: '二式·回风', kind: 'attack',
      castMask: { shape: 'diamond', radius: 2, includeOrigin: false },
      effectMask: { shape: 'single' },
      multiplier: 1.25, qiCost: 35, cooldown: 2, hitMod: 6,
      coreEffects:[
        {type:'damage',target:'enemies',multiplier:1.25,hitCheck:true,canCrit:true,affectsObstacles:true},
        {type:'apply_status',target:'enemies',statusId:'bleeding',stacks:1,chance:100,requiresHit:true}
      ],
      description: '两格内单体攻击；命中附加1层流血'
    },
    third: {
      id: 'third', name: '三式·横云', kind: 'attack',
      castMask: { shape: 'diamond', radius: 2, includeOrigin: false },
      effectMask: { shape: 'cross', radius: 1 },
      multiplier: 1.38, qiCost: 55, cooldown: 3, hitMod: 8, canMoveAfterAction: true,
      coreEffects:[{type:'damage',target:'enemies',multiplier:1.38,hitCheck:true,canCrit:true,affectsObstacles:true}],
      description: '以落点为中心的十字范围攻击（Demo技能）；攻击后可继续使用剩余移动力'
    },
    ultimate: {
      id: 'ultimate', name: '绝式·惊鸿', kind: 'attack',
      castMask: { shape: 'diamond', radius: 2, includeOrigin: false },
      effectMask: { shape: 'diamond', radius: 1 },
      multiplier: 1.65, qiCost: 80, cooldown: 5, hitMod: 10,
      coreEffects:[
        {type:'damage',target:'enemies',multiplier:1.65,hitCheck:true,canCrit:true,affectsObstacles:true},
        {type:'push',target:'enemies',distance:1,requiresHit:true}
      ],
      description: '以落点为中心攻击周围1格，并将命中的敌人击退1格'
    },
    qinggong: {
      id: 'qinggong', name: '轻功·踏风', kind: 'qinggong', range: 4,
      qiCost: 25, cooldown: 3, description: '位移至4格内空地；穿越路径不受单位阻挡；行动后集气至少保留50%'
    },
    neigong: {
      id: 'neigong', name: '心法·聚气', kind: 'buff', range: 0,
      qiCost: 45, cooldown: 5, description: '自身获得聚气3回合，并获得25集气',
      rules:[{id:'neigong_gather',conditions:[{event:'skill_used'}],effects:[{type:'apply_status',target:'self',statusId:'gathering',stacks:1},{type:'gain_gauge',target:'self',value:25}],triggerScope:'once_per_action'}]
    }
  };


  const DEFAULT_SKILLS = JSON.parse(JSON.stringify(SKILLS));

  const DEFAULT_EQUIPMENT = {
    iron_sword: {
      id:'iron_sword', name:'练习铁剑', slot:'weapon', description:'Demo装备',
      modifiers:{ attack:35, crit:2 },
      rules:[{id:'iron_sword_crit_gauge',conditions:[{event:'attack_crit'}],effects:[{type:'gain_gauge',target:'self',value:10}],triggerScope:'once_per_action'}]
    },
    cloth_armor: {
      id:'cloth_armor', name:'青布劲装', slot:'armor', description:'Demo装备',
      modifiers:{ defense:28, maxHp:120 }
    }
  };

  const DEFAULT_TALENTS = {
    quick_breath: {
      id:'quick_breath',
      name:'行气如流',
      rarity:'common',
      type:'passive',
      weight:100,
      description:'被动：集气速率 +8%。',
      conditions:[],
      effects:[{type:'modify_stat', target:'self', stat:'qiSpeed', mode:'percent', value:8}],
      duration:{type:'permanent', turns:0}
    },
    last_stand: {
      id:'last_stand',
      name:'困兽',
      rarity:'rare',
      type:'triggered',
      weight:45,
      description:'当气血低于30%时，触发攻击提升20%，维持2回合。',
      conditions:[
        {event:'hp_changed', subject:'self', field:'hpPercent', op:'<=', value:30}
      ],
      effects:[
        {type:'modify_stat', target:'self', stat:'attack', mode:'percent', value:20}
      ],
      duration:{type:'turns', turns:2},
      cooldown:3,
      maxTriggersPerBattle:2
    },
    wind_after_strike: {
      id:'wind_after_strike',
      name:'乘隙而行',
      rarity:'uncommon',
      type:'triggered',
      weight:70,
      description:'当攻击命中后，获得1点临时移动力，维持至本次行动结束。',
      conditions:[
        {event:'attack_hit', subject:'self', field:'hit', op:'==', value:true}
      ],
      effects:[
        {type:'grant_move', target:'self', value:1}
      ],
      duration:{type:'action', turns:0},
      triggerScope:'once_per_action'
    }
  };

  const DEFAULT_STATUSES = {
    gathering: {
      id:'gathering', name:'聚气', polarity:'buff', icon:'⚡', tags:['qi'], controlTags:[], conflicts:[], applyChance:100, description:'集气速率提升。',
      maxStacks:1, stackMode:'refresh', dispellable:true,
      duration:{type:'turns',turns:3},
      modifiers:[{stat:'qiSpeed',mode:'percent',value:25,perStack:false}],
      rules:[]
    },
    bleeding: {
      id:'bleeding', name:'流血', polarity:'debuff', icon:'🩸', tags:['bleed','physical'], controlTags:[], conflicts:[], applyChance:100, description:'行动结束时受到伤害，可叠3层。',
      maxStacks:3, stackMode:'add_refresh', dispellable:true,
      duration:{type:'turns',turns:3},
      modifiers:[],
      rules:[{
        id:'bleeding_tick',
        conditions:[{event:'turn_end'}],
        effects:[{type:'deal_damage',target:'self',value:28,mode:'flat',perStack:true}],
        triggerScope:'per_event'
      }]
    },
    broken_guard: {
      id:'broken_guard', name:'破防', polarity:'debuff', icon:'🛡', tags:['physical','defense_down'], controlTags:[], conflicts:[], applyChance:100, description:'防御降低20%。',
      maxStacks:1, stackMode:'refresh', dispellable:true,
      duration:{type:'turns',turns:2},
      modifiers:[{stat:'defense',mode:'percent',value:-20,perStack:false}],
      rules:[]
    },
    stunned: {
      id:'stunned', name:'眩晕', polarity:'debuff', icon:'💫',
      tags:['control'], controlTags:['stun'], conflicts:[], applyChance:100,
      description:'无法移动或执行正式行动；轮到自身时直接跳过。',
      maxStacks:1, stackMode:'refresh', dispellable:true,
      duration:{type:'turns',turns:1}, modifiers:[], rules:[]
    },
    rooted: {
      id:'rooted', name:'定身', polarity:'debuff', icon:'⛓',
      tags:['control','movement'], controlTags:['root'], conflicts:[], applyChance:100,
      description:'无法普通移动，也不能使用轻功位移。',
      maxStacks:1, stackMode:'refresh', dispellable:true,
      duration:{type:'turns',turns:2}, modifiers:[], rules:[]
    },
    silenced: {
      id:'silenced', name:'封技', polarity:'debuff', icon:'🤐',
      tags:['control','skill_lock'], controlTags:['silence'], conflicts:[], applyChance:100,
      description:'无法使用心法 / Buff 类技能。',
      maxStacks:1, stackMode:'refresh', dispellable:true,
      duration:{type:'turns',turns:2}, modifiers:[], rules:[]
    },
    disarmed: {
      id:'disarmed', name:'缴械', polarity:'debuff', icon:'🚫',
      tags:['control','weapon_lock'], controlTags:['disarm'], conflicts:[], applyChance:100,
      description:'无法使用攻击类招式。',
      maxStacks:1, stackMode:'refresh', dispellable:true,
      duration:{type:'turns',turns:2}, modifiers:[], rules:[]
    }
  };

  const DEFAULT_ACTOR_TEMPLATES = [
    {
      id: 'p1', name: '宇文逸', short: '逸', team: 'ally', x: 1, y: 6, facing: 'N',
      maxHp: 1120, hp: 1120, maxQi: 520, qi: 520,
      attack: 285, defense: 175, crit: 14, dodge: 7, accuracy: 5,
      qiSpeed: 505, move: 4, statusResist: 0, immunities: [], gauge: 58,
      skills: ['basic', 'second', 'third', 'ultimate', 'qinggong', 'neigong'],
      equipment: ['iron_sword','cloth_armor'],
      talents: ['quick_breath']
    },
    {
      id: 'p2', name: '队友', short: '友', team: 'ally', x: 2, y: 7, facing: 'N',
      maxHp: 980, hp: 980, maxQi: 440, qi: 440,
      attack: 245, defense: 190, crit: 10, dodge: 6, accuracy: 3,
      qiSpeed: 465, move: 4, statusResist: 0, immunities: [], gauge: 20,
      skills: ['basic', 'second', 'third', 'qinggong', 'neigong'],
      equipment: ['cloth_armor'],
      talents: []
    },
    {
      id: 'e1', name: '黑衣剑客', short: '剑', team: 'enemy', x: 6, y: 2, facing: 'S',
      maxHp: 900, hp: 900, maxQi: 400, qi: 400,
      attack: 235, defense: 150, crit: 9, dodge: 5, accuracy: 2,
      qiSpeed: 440, move: 4, statusResist: 0, immunities: [], gauge: 72,
      skills: ['basic', 'second']
    },
    {
      id: 'e2', name: '黑衣刀客', short: '刀', team: 'enemy', x: 7, y: 3, facing: 'W',
      maxHp: 1040, hp: 1040, maxQi: 380, qi: 380,
      attack: 260, defense: 165, crit: 8, dodge: 4, accuracy: 1,
      qiSpeed: 420, move: 3, statusResist: 0, immunities: [], gauge: 35,
      skills: ['basic', 'second']
    },
    {
      id: 'n1', name: '中立路人', short: '路', team: 'neutral', x: 0, y: 0, facing: 'S',
      maxHp: 500, hp: 500, maxQi: 100, qi: 100,
      attack: 80, defense: 80, crit: 0, dodge: 0, accuracy: 0,
      qiSpeed: 100, move: 3, statusResist: 0, immunities: [], gauge: 0,
      skills: []
    }
  ];

  const DEFAULT_SCENE = {
    schema: 'tavern-battle-scene',
    version: 1,
    id: 'bamboo-road-demo',
    name: '竹林山道',
    boardSize: 9,
    placements: [
      { team:'ally', ref:'p1', x:1, y:6, facing:'N', overrides:{gauge:58} },
      { team:'ally', ref:'p2', x:2, y:7, facing:'N', overrides:{gauge:20} },
      { team:'enemy', ref:'e1', x:6, y:2, facing:'S', overrides:{gauge:72} },
      { team:'enemy', ref:'e2', x:7, y:3, facing:'W', overrides:{gauge:35} }
    ],
    obstacles: [
      { id:'rock-1', name:'山石', x:4, y:3, maxHp:520, hp:520 },
      { id:'bamboo-1', name:'粗竹', x:4, y:4, maxHp:360, hp:360 },
      { id:'rock-2', name:'断壁', x:5, y:5, maxHp:680, hp:680 }
    ],
    evacPoints: [
      { id:'exit-southwest', name:'西南撤离点', x:0, y:8, allowedTeams:['ally'] }
    ],
    victory: { type:'eliminate-or-evacuate' }
  };

  function makeDefaultCollection() {
    const allies = {}, enemies = {}, neutrals = {};
    for (const actor of DEFAULT_ACTOR_TEMPLATES) {
      const copy = JSON.parse(JSON.stringify(actor));
      delete copy.x; delete copy.y; delete copy.facing; delete copy.gauge;
      if (actor.team === 'ally') allies[actor.id] = copy;
      else if (actor.team === 'enemy') enemies[actor.id] = copy;
      else neutrals[actor.id] = copy;
    }
    return {
      schema:'tavern-battle-collection',
      version:1,
      id:'default-collection',
      name:'默认合集',
      allies, neutrals, enemies,
      skills:JSON.parse(JSON.stringify(DEFAULT_SKILLS)),
      equipment:JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT)),
      talents:JSON.parse(JSON.stringify(DEFAULT_TALENTS)),
      statuses:JSON.parse(JSON.stringify(DEFAULT_STATUSES)),
      rewardSettings:{ talentChoices:3 },
      scenes:[JSON.parse(JSON.stringify(DEFAULT_SCENE))]
    };
  }


  const state = {
    actors: [],
    currentActorId: null,
    gamePaused: false,
    manualPaused: false,
    speed: 1,
    mode: null,
    modeSkill: null,
    movedThisTurn: false,
    actedThisTurn: false,
    actionIndex: 0,
    logs: [],
    aiTimer: null,
    lastTick: performance.now(),
    battleEnded: false,
    turnSnapshot: null,
    lastMoveLogIndex: null,
    hoveredTile: null,
    pendingAction: null,
    seed: 1,
    rngState: 1,
    forcedTurns: [],
    reachableCache: null,
    moveSpentThisTurn: 0,
    moveHistoryThisTurn: [],
    movementLocked: false,
    collection: null,
    scene: null,
    obstacles: [],
    evacPoints: [],
    battleOutcome: null,
    eventActionSeq: 0,
    eventDepth: 0,
  };

  const $ = (sel) => document.querySelector(sel);
  const boardEl = $('#board');
  const timelineEl = $('#timeline');
  const actorCardEl = $('#actorCard');
  const actionsEl = $('#actions');
  const turnHintEl = $('#turnHint');
  const logEl = $('#log');
  const cancelModeBtn = $('#cancelModeBtn');
  const skillDetailEl = $('#skillDetail');
  const resultDialog = $('#resultDialog');
  const seedInput = $('#seedInput');
  const dataStatusEl = $('#dataStatus');
  const sceneFileInput = $('#sceneFileInput');
  const collectionFolderInput = $('#collectionFolderInput');

  function collectionBucket(team, collection = state.collection) {
    if (!collection) return {};
    if (team === 'ally') return collection.allies || {};
    if (team === 'enemy') return collection.enemies || {};
    return collection.neutrals || {};
  }

  function actorTemplateByRef(team, ref) {
    return collectionBucket(team)?.[ref] || null;
  }

  function normalizeActorRuntime(actor, teamOverride = null) {
    return {
      ...actor,
      team: teamOverride || actor.team || 'neutral',
      cooldowns: {},
      buffs: [],
      talentEffects: [],
      talentRuntime: {},
      ruleRuntime: {},
      statuses: [],
      shields: [],
      tempMoveBonus: 0,
      allowMoveAfterAction: false,
      defending: false,
      turnCount: 0,
      alive: actor.alive !== false,
      escaped: false,
      gauge: Number(actor.gauge || 0),
    };
  }

  function cloneActorsFromScene() {
    const scene = state.scene || DEFAULT_SCENE;
    const out = [];
    const refCounts={};
    for (const p of scene.placements || []) {
      let base = p.actor ? JSON.parse(JSON.stringify(p.actor)) : JSON.parse(JSON.stringify(actorTemplateByRef(p.team, p.ref) || {}));
      const templateId=p.ref || base.id || `unit-${out.length+1}`;
      refCounts[templateId]=(refCounts[templateId]||0)+1;
      base.templateId=templateId;
      base.id=p.instanceId || (refCounts[templateId]===1 ? templateId : `${templateId}__${refCounts[templateId]}`);
      if (!base.id) base.id = `unit-${out.length+1}`;
      if (!base.name) base.name = p.ref || `单位${out.length+1}`;
      if (!base.short) base.short = base.name.slice(0,1);
      base.team = p.team || base.team || 'neutral';
      base.x = Number(p.x); base.y = Number(p.y);
      base.facing = p.facing || base.facing || 'N';
      Object.assign(base, p.overrides || {});

      // 装备加成：v0.7 先支持通用数值 modifiers。
      for (const equipId of (base.equipment || [])) {
        const equip=state.collection?.equipment?.[equipId];
        if (!equip?.modifiers) continue;
        for (const [stat,val] of Object.entries(equip.modifiers)) {
          if (typeof val!=='number') continue;
          base[stat]=Number(base[stat]||0)+val;
        }
      }

      // 被动天赋直接结算基础属性；触发型天赋由 Event→Condition→Effect 运行时处理。
      for (const talentId of (base.talents || [])) {
        const talent=state.collection?.talents?.[talentId];
        if (talent?.type!=='passive') continue;
        for (const eff of (talent.effects || [])) {
          if (eff.type!=='modify_stat' || eff.target!=='self') continue;
          const stat=eff.stat;
          const oldVal=Number(base[stat]||0);
          if (eff.mode==='percent') base[stat]=oldVal*(1+Number(eff.value||0)/100);
          else base[stat]=oldVal+Number(eff.value||0);
        }
      }

      base.maxHp=Math.round(Number(base.maxHp||1));
      base.hp=Math.min(Number(base.hp ?? base.maxHp),base.maxHp);
      base.maxQi=Math.round(Number(base.maxQi||0));
      base.qi=Math.min(Number(base.qi ?? base.maxQi),base.maxQi);
      base.attack=Math.round(Number(base.attack||0));
      base.defense=Math.round(Number(base.defense||0));
      base.qiSpeed=Math.round(Number(base.qiSpeed||0));

      out.push(normalizeActorRuntime(base, base.team));
    }
    return out;
  }

  function cloneObstaclesFromScene() {
    return (state.scene?.obstacles || []).map((o,i) => ({
      id:o.id || `obstacle-${i+1}`,
      name:o.name || `障碍物${i+1}`,
      x:Number(o.x), y:Number(o.y),
      maxHp:Math.max(1,Number(o.maxHp ?? o.hp ?? 1)),
      hp:Math.max(0,Number(o.hp ?? o.maxHp ?? 1)),
      blocksMovement:o.blocksMovement !== false,
      blocksAttack:o.blocksAttack !== false,
      kind:o.kind || 'obstacle',
      durationTurns:Math.max(0,Number(o.durationTurns||0)),
      sourceActorId:o.sourceActorId||null,
      sourceTurnCount:Number(o.sourceTurnCount||0),
      destroyed:false
    }));
  }

  function cloneEvacPointsFromScene() {
    return (state.scene?.evacPoints || []).map((e,i) => ({
      id:e.id || `evac-${i+1}`,
      name:e.name || `撤离点${i+1}`,
      x:Number(e.x), y:Number(e.y),
      allowedTeams:Array.isArray(e.allowedTeams) && e.allowedTeams.length ? [...e.allowedTeams] : ['ally']
    }));
  }


  function resetBattle(seedValue = null) {
    clearTimeout(state.aiTimer);
    if (!state.collection) state.collection = makeDefaultCollection();
    if (!state.scene) state.scene = JSON.parse(JSON.stringify(DEFAULT_SCENE));

    // 同步技能库到运行时对象；保留同一个 SKILLS 引用，避免战斗逻辑重写。
    const runtimeSkills=state.collection.skills && Object.keys(state.collection.skills).length
      ? state.collection.skills : DEFAULT_SKILLS;
    for (const key of Object.keys(SKILLS)) delete SKILLS[key];
    Object.assign(SKILLS, JSON.parse(JSON.stringify(runtimeSkills)));

    CONFIG.boardSize = clamp(Number(state.scene.boardSize || 9), 5, 15);
    state.actors = cloneActorsFromScene();
    state.obstacles = cloneObstaclesFromScene();
    state.evacPoints = cloneEvacPointsFromScene();
    state.battleOutcome = null;
    state.currentActorId = null;
    state.gamePaused = false;
    state.manualPaused = false;
    state.speed = 1;
    state.mode = null;
    state.modeSkill = null;
    state.movedThisTurn = false;
    state.actedThisTurn = false;
    state.actionIndex = 0;
    state.logs = [];
    state.battleEnded = false;
    state.turnSnapshot = null;
    state.lastMoveLogIndex = null;
    state.hoveredTile = null;
    state.pendingAction = null;
    state.forcedTurns = [];
    state.reachableCache = null;
    state.moveSpentThisTurn = 0;
    state.moveHistoryThisTurn = [];
    state.movementLocked = false;
    state.eventActionSeq = 0;
    state.eventDepth = 0;
    state.seed = normalizeSeed(seedValue ?? seedInput?.value ?? state.seed ?? randomSeed());
    state.rngState = state.seed;
    if (seedInput) seedInput.value = String(state.seed);
    state.lastTick = performance.now();
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    $('#pauseBtn').textContent = '暂停';
    if (resultDialog.open) resultDialog.close();
    log(`【战斗开始】场景「${state.scene.name || '未命名场景'}」载入；障碍 ${state.obstacles.length}；撤离点 ${state.evacPoints.length}。Battle Seed=${state.seed}。`, 'system');
    for (const actor of aliveActors()) {
      emitBattleEvent('battle_start',{actor,target:actor,actionKey:'battle_start'});
    }
    renderAll();
  }

  function actorById(id) { return state.actors.find(a => a.id === id); }
  function currentActor() { return actorById(state.currentActorId); }
  function aliveActors(team) { return state.actors.filter(a => a.alive && !a.escaped && (!team || a.team === team)); }
  function actorAt(x, y) { return state.actors.find(a => a.alive && !a.escaped && a.x === x && a.y === y); }
  function combatActors() { return aliveActors().filter(a => a.team === 'ally' || a.team === 'enemy'); }
  function obstacleAt(x, y) { return state.obstacles.find(o => !o.destroyed && o.hp > 0 && o.x === x && o.y === y); }
  function evacAt(x, y) { return state.evacPoints.find(e => e.x === x && e.y === y); }
  function blockedAt(x, y, ignoreActorId = null) {
    const a = actorAt(x,y);
    const o = obstacleAt(x,y);
    return (!!a && a.id !== ignoreActorId) || (!!o && o.blocksMovement !== false);
  }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pct(v, max) { return max <= 0 ? 0 : clamp(v / max * 100, 0, 100); }
  function signDir(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }

  function normalizeSeed(value) {
    let n = Number(value);
    if (!Number.isFinite(n)) n = Date.now();
    n = (Math.trunc(n) >>> 0) || 0x6d2b79f5;
    return n;
  }

  function randomSeed() {
    const mix = (Date.now() ^ Math.floor(performance.now() * 1000) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    return normalizeSeed(mix);
  }

  // xorshift32：所有战斗随机判定只走这里，便于重放与Debug。
  function rng() {
    let x = state.rngState >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    state.rngState = x >>> 0;
    return (state.rngState >>> 0) / 4294967296;
  }

  function inBounds(x, y) { return x >= 0 && y >= 0 && x < CONFIG.boardSize && y < CONFIG.boardSize; }
  function keyOf(x, y) { return `${x},${y}`; }
  const DIR4 = [[0,-1],[1,0],[0,1],[-1,0]];

  function neighbors4(x, y) {
    return DIR4.map(([dx,dy]) => ({x:x+dx, y:y+dy})).filter(p => inBounds(p.x,p.y));
  }

  function reconstructPath(prev, endKey) {
    const out=[];
    let k=endKey;
    while (k) {
      const [x,y]=k.split(',').map(Number);
      out.push({x,y});
      k=prev.get(k) || null;
    }
    return out.reverse();
  }

  function reachablePaths(actor, maxSteps) {
    const start=keyOf(actor.x,actor.y);
    const distMap=new Map([[start,0]]);
    const prev=new Map();
    const queue=[{x:actor.x,y:actor.y}];
    for (let qi=0; qi<queue.length; qi++) {
      const cur=queue[qi];
      const cd=distMap.get(keyOf(cur.x,cur.y));
      if (cd >= maxSteps) continue;
      for (const n of neighbors4(cur.x,cur.y)) {
        const nk=keyOf(n.x,n.y);
        if (distMap.has(nk)) continue;
        if (blockedAt(n.x,n.y,actor.id)) continue; // 普通移动不能穿过单位或障碍物
        distMap.set(nk,cd+1);
        prev.set(nk,keyOf(cur.x,cur.y));
        queue.push(n);
      }
    }
    const paths=new Map();
    for (const [k,d] of distMap) paths.set(k,{distance:d,path:reconstructPath(prev,k)});
    return paths;
  }

  function facingFromStep(from, to, fallback='N') {
    const dx=to.x-from.x, dy=to.y-from.y;
    if (dx>0) return 'E';
    if (dx<0) return 'W';
    if (dy>0) return 'S';
    if (dy<0) return 'N';
    return fallback;
  }

  function pathText(path) {
    return path.map(p => `(${p.x+1},${p.y+1})`).join(' → ');
  }

  function maskLabel(mask) {
    if (!mask) return '—';
    if (mask.shape === 'single') return '单格';
    const names={diamond:'菱形',cross:'十字',square:'方形',line:'直线'};
    return `${names[mask.shape] || mask.shape}${mask.radius ? `·${mask.radius}` : ''}`;
  }

  function pointInMask(dx, dy, mask) {
    if (!mask) return false;
    if (mask.shape === 'single') return dx===0 && dy===0;
    const r=mask.radius || 0;
    if (dx===0 && dy===0 && mask.includeOrigin===false) return false;
    if (mask.shape === 'diamond') return Math.abs(dx)+Math.abs(dy) <= r;
    if (mask.shape === 'cross') return (dx===0 || dy===0) && Math.abs(dx)+Math.abs(dy) <= r;
    if (mask.shape === 'square') return Math.max(Math.abs(dx),Math.abs(dy)) <= r;
    if (mask.shape === 'line') return (dx===0 || dy===0) && Math.abs(dx)+Math.abs(dy) <= r;
    if (mask.shape === 'custom' && Array.isArray(mask.offsets)) return mask.offsets.some(p => p.x===dx && p.y===dy);
    return false;
  }

  function isWithinCastMask(originX, originY, x, y, skill) {
    if (!inBounds(x,y) || !skill?.castMask) return false;
    return pointInMask(x-originX, y-originY, skill.castMask);
  }

  // Bresenham 格线：返回从起点到目标格依次穿过的格子（含起点和终点）。
  function lineCells(x0, y0, x1, y1) {
    const out=[];
    let x=x0, y=y0;
    const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
    const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
    let err=dx+dy;
    while (true) {
      out.push({x,y});
      if (x===x1 && y===y1) break;
      const e2=2*err;
      if (e2>=dy) { err+=dy; x+=sx; }
      if (e2<=dx) { err+=dx; y+=sy; }
    }
    return out;
  }

  function obstacleBlocksAttack(obstacle) {
    return !!obstacle && obstacle.blocksAttack !== false && !obstacle.destroyed && obstacle.hp > 0;
  }

  // 目标格本身若是障碍物，仍然允许选中并攻击；
  // 只有“目标之前”的障碍物会截断攻击射线。
  function hasClearAttackLine(originX, originY, targetX, targetY) {
    const cells=lineCells(originX,originY,targetX,targetY);
    for (let i=1;i<cells.length-1;i++) {
      const o=obstacleAt(cells[i].x,cells[i].y);
      if (obstacleBlocksAttack(o)) return false;
    }
    return true;
  }

  function isCastTileAllowedFrom(actor, originX, originY, x, y, skill) {
    if (!isWithinCastMask(originX,originY,x,y,skill)) return false;
    return hasClearAttackLine(originX,originY,x,y);
  }

  function isCastTileAllowed(actor, x, y, skill) {
    if (!actor) return false;
    return isCastTileAllowedFrom(actor,actor.x,actor.y,x,y,skill);
  }

  function effectTiles(actor, centerX, centerY, skill) {
    const out=[];
    for (let y=0;y<CONFIG.boardSize;y++) for (let x=0;x<CONFIG.boardSize;x++) {
      if (pointInMask(x-centerX,y-centerY,skill.effectMask || {shape:'single'})) out.push({x,y});
    }
    return out;
  }

  function skillCoreEffects(skill) {
    if (Array.isArray(skill?.coreEffects) && skill.coreEffects.length) return skill.coreEffects;
    if (skill?.kind==='attack') {
      return [{type:'damage',target:'enemies',multiplier:Number(skill.multiplier||1),hitCheck:true,canCrit:true,affectsObstacles:true}];
    }
    return [];
  }

  function primaryDamageEffect(skill) {
    return skillCoreEffects(skill).find(e=>e.type==='damage') || null;
  }

  function coreBaseTargetType(targetType='enemies') {
    return ({
      random_enemies:'enemies',
      random_allies:'allies',
      random_units:'all_units'
    })[targetType] || targetType;
  }

  function coreTargetMatches(attacker,unit,targetType='enemies') {
    if (!unit) return false;
    targetType=coreBaseTargetType(targetType);
    if (targetType==='self') return unit.id===attacker.id;
    if (targetType==='allies') return unit.team===attacker.team;
    if (targetType==='enemies') return unit.team!==attacker.team && unit.team!=='neutral';
    if (targetType==='all_units') return true;
    if (targetType==='neutral') return unit.team==='neutral';
    return false;
  }

  function coreAreaSnapshot(attacker,centerX,centerY,skill) {
    const keys=new Set(effectTiles(attacker,centerX,centerY,skill).map(p=>keyOf(p.x,p.y)));
    return {
      actors:aliveActors().filter(a=>keys.has(keyOf(a.x,a.y))),
      obstacles:state.obstacles.filter(o=>!o.destroyed&&o.hp>0&&keys.has(keyOf(o.x,o.y)))
    };
  }

  function actorsForCoreEffect(attacker,snapshot,effect,preview=false) {
    const targetType=effect.target||'enemies';
    if (targetType==='self') return [attacker];
    const candidates=snapshot.actors.filter(a=>coreTargetMatches(attacker,a,targetType));
    if (preview) return candidates;
    if (targetType.startsWith('random_')) return randomPick(candidates,effect.randomCount||1);
    return candidates;
  }

  function skillPreviewActors(attacker,centerX,centerY,skill) {
    const snapshot=coreAreaSnapshot(attacker,centerX,centerY,skill);
    const seen=new Set(),out=[];
    for (const effect of skillCoreEffects(skill)) {
      if (effect.type==='move_self') continue;
      for (const actor of actorsForCoreEffect(attacker,snapshot,effect,true)) {
        if (!seen.has(actor.id)) { seen.add(actor.id); out.push(actor); }
      }
    }
    return out;
  }

  function coreEffectName(type) {
    return ({
      damage:'伤害',heal:'治疗',apply_status:'施加状态',push:'击退',pull:'拉拽',
      move_self:'自身位移',swap_position:'换位',teleport_behind:'闪到背后',
      lifesteal:'吸血',shield:'护盾',summon_unit:'召唤单位',summon_object:'召唤地面物'
    })[type] || type;
  }

  function skillPreviewObstacles(attacker,centerX,centerY,skill) {
    if (!skillCoreEffects(skill).some(e=>e.type==='damage' && e.affectsObstacles!==false)) return [];
    return coreAreaSnapshot(attacker,centerX,centerY,skill).obstacles;
  }

  function targetsForCast(attacker, centerX, centerY, skill) {
    const targetTeam=attacker.team==='ally'?'enemy':'ally';
    const keys=new Set(effectTiles(attacker,centerX,centerY,skill).map(p=>keyOf(p.x,p.y)));
    return aliveActors(targetTeam).filter(t=>keys.has(keyOf(t.x,t.y)));
  }
  function obstaclesForCast(centerX, centerY, skill) {
    const keys = new Set(effectTiles(null,centerX,centerY,skill).map(p=>keyOf(p.x,p.y)));
    return state.obstacles.filter(o => !o.destroyed && o.hp > 0 && keys.has(keyOf(o.x,o.y)));
  }


  // ==========================================================
  // v0.8 天赋事件引擎：Event -> Condition -> Effect -> Duration
  // ==========================================================
  function effectiveStat(actor, stat) {
    if (!actor) return 0;
    let base=Number(actor[stat]||0);
    let flat=0, percent=0;
    for (const e of (actor.talentEffects||[])) {
      if (e.type!=='modify_stat' || e.stat!==stat) continue;
      if (e.mode==='percent') percent += Number(e.value||0);
      else flat += Number(e.value||0);
    }
    for (const runtime of (actor.statuses||[])) {
      const def=statusById(runtime.statusId);
      if (!def) continue;
      for (const mod of (def.modifiers||[])) {
        if (mod.stat!==stat) continue;
        const stacks=mod.perStack===false ? 1 : Math.max(1,Number(runtime.stacks||1));
        const amount=Number(mod.value||0)*stacks;
        if (mod.mode==='percent') percent += amount;
        else flat += amount;
      }
    }
    return (base + flat) * (1 + percent/100);
  }

  function statusById(id) {
    return state.collection?.statuses?.[id] || null;
  }

  function sourceLabel(type,source) {
    const prefix={talent:'天赋',equipment:'装备',skill:'技能',status:'状态'}[type]||'规则';
    return `${prefix}「${source?.name||source?.id||'未命名'}」`;
  }

  function ruleRuntime(owner,key) {
    if (!owner.ruleRuntime) owner.ruleRuntime={};
    return owner.ruleRuntime[key] || (owner.ruleRuntime[key]={cooldown:0,triggers:0,lastActionKey:null,lastTurnIndex:null});
  }

  function normalizeTalentRules(talent) {
    if (Array.isArray(talent.rules) && talent.rules.length) return talent.rules;
    if (talent.type!=='triggered') return [];
    return [{
      id:`${talent.id}:legacy`,conditions:talent.conditions||[],effects:talent.effects||[],
      duration:talent.duration,cooldown:talent.cooldown,triggerScope:talent.triggerScope,
      maxTriggersPerBattle:talent.maxTriggersPerBattle,listen:talent.listen
    }];
  }

  function activeRuleSources(owner,event) {
    const out=[];
    for (const talentId of (owner.talents||[])) {
      const source=state.collection?.talents?.[talentId];
      if (!source || source.type==='passive') continue;
      for (const rule of normalizeTalentRules(source)) out.push({sourceType:'talent',source,rule,key:`talent:${talentId}:${rule.id||'rule'}`});
    }
    for (const equipId of (owner.equipment||[])) {
      const source=state.collection?.equipment?.[equipId];
      if (!source) continue;
      for (const rule of (source.rules||[])) out.push({sourceType:'equipment',source,rule,key:`equipment:${equipId}:${rule.id||'rule'}`});
    }
    for (const runtime of (owner.statuses||[])) {
      const source=statusById(runtime.statusId);
      if (!source) continue;
      for (const rule of (source.rules||[])) out.push({sourceType:'status',source,rule,key:`status:${runtime.instanceId}:${rule.id||'rule'}`,statusRuntime:runtime});
    }
    if (event?.skill && event.actor?.id===owner.id) {
      const source=event.skill;
      for (const rule of (source.rules||[])) out.push({sourceType:'skill',source,rule,key:`skill:${source.id}:${rule.id||'rule'}`});
    }
    return out;
  }

  function statusTags(def) {
    return [...new Set([def?.id,...(def?.tags||[]),...(def?.controlTags||[])].filter(Boolean))];
  }

  function actorHasControl(actor, controlTag) {
    return !!actor && (actor.statuses||[]).some(runtime => {
      const def=statusById(runtime.statusId);
      return (def?.controlTags||[]).includes(controlTag);
    });
  }

  function skillControlBlockReason(actor, skill) {
    if (!actor || !skill) return null;
    if (actorHasControl(actor,'stun')) return '眩晕中';
    if (skill.kind==='attack' && actorHasControl(actor,'disarm')) return '缴械中';
    if (skill.kind==='qinggong' && actorHasControl(actor,'root')) return '定身中';
    if (skill.kind==='buff' && actorHasControl(actor,'silence')) return '封技中';
    return null;
  }

  function statusImmuneReason(target, def) {
    const immunities=new Set(target?.immunities||[]);
    for (const tag of statusTags(def)) if (immunities.has(tag)) return tag;
    return null;
  }

  function statusApplyChance(target,def,opts={}) {
    const base=Number(opts.chance ?? def?.applyChance ?? 100);
    if (def?.polarity!=='debuff' || opts.ignoreResistance) return clamp(base,0,100);
    return clamp(base - effectiveStat(target,'statusResist'),0,100);
  }

  function dispelStatuses(target,opts={}) {
    if (!target?.statuses?.length) return 0;
    const polarity=opts.polarity || 'any';
    const tags=(opts.tags||[]).filter(Boolean);
    const count=Math.max(1,Number(opts.count||1));
    const candidates=target.statuses.filter(runtime=>{
      const def=statusById(runtime.statusId);
      if (!def || def.dispellable===false) return false;
      if (polarity!=='any' && def.polarity!==polarity) return false;
      if (tags.length && !tags.some(t=>statusTags(def).includes(t))) return false;
      return true;
    });
    let removed=0;
    for (const runtime of candidates.slice(0,count)) {
      if (removeStatus(target,runtime.statusId,'被驱散')) removed++;
    }
    return removed;
  }

  function fireStatusThreshold(sourceActor,target,def,runtime,event={}) {
    const threshold=def?.threshold;
    if (!threshold || runtime.stacks < Number(threshold.stacks||Infinity)) return;
    const effects=Array.isArray(threshold.effects)?threshold.effects:[];
    if (effects.length) {
      log(`  → 状态「${def.name}」达到 ${runtime.stacks} 层，触发层数阈值效果。`);
      const entry={
        sourceType:'status',source:def,
        rule:{id:`${def.id}:threshold`,effects,conditions:[],triggerScope:'per_event'},
        key:`status-threshold:${runtime.instanceId}`,statusRuntime:runtime
      };
      for (const effect of effects) applyRuleEffect(target,entry,effect,{
        type:'status_threshold',actor:target,target,attacker:sourceActor,
        status:def,statusRuntime:runtime,actionKey:event.actionKey||null
      });
    }
    const consume=threshold.consume||'all';
    if (consume==='all') removeStatus(target,def.id,'层数阈值消耗');
    else if (consume==='threshold') {
      runtime.stacks=Math.max(0,runtime.stacks-Number(threshold.stacks||0));
      if (runtime.stacks<=0) removeStatus(target,def.id,'层数阈值消耗');
    }
  }

  function applyStatus(sourceActor,target,statusId,opts={},event={}) {
    const def=statusById(statusId);
    if (!def || !target || !target.alive || target.escaped) return false;

    const immune=statusImmuneReason(target,def);
    if (immune && !opts.ignoreImmunity) {
      log(`  → ${target.name} 对状态「${def.name}」免疫（${immune}）。`);
      emitBattleEvent('status_resisted',{actor:target,target,attacker:sourceActor,status:def,reason:'immunity',tag:immune,actionKey:event.actionKey||null});
      return false;
    }

    const chance=statusApplyChance(target,def,opts);
    if (chance < 100 && rng()*100 >= chance) {
      log(`  → ${target.name} 抵抗了${def.polarity==='debuff'?'Debuff':'状态'}「${def.name}」（成功率 ${chance.toFixed(0)}%）。`);
      emitBattleEvent('status_resisted',{actor:target,target,attacker:sourceActor,status:def,reason:'resist',chance,actionKey:event.actionKey||null});
      return false;
    }

    for (const conflictId of (def.conflicts||[])) {
      if ((target.statuses||[]).some(s=>s.statusId===conflictId)) {
        removeStatus(target,conflictId,`被互斥状态「${def.name}」覆盖`);
      }
    }

    const addStacks=Math.max(1,Number(opts.stacks||1));
    const maxStacks=Math.max(1,Number(def.maxStacks||1));
    const durationTurns=Math.max(0,Number(opts.durationTurns ?? def.duration?.turns ?? 0));
    const durationType=opts.durationType || def.duration?.type || 'turns';
    const mode=def.stackMode||'refresh';
    let runtime=(target.statuses||[]).find(s=>s.statusId===statusId);
    let action='获得';

    if (!runtime) {
      runtime={
        instanceId:`${statusId}:${target.id}:${Date.now()}:${Math.floor(rng()*1e6)}`,
        statusId,stacks:Math.min(maxStacks,addStacks),
        remainingTurns:durationTurns,durationType,
        sourceActorId:sourceActor?.id||null,appliedTurnCount:target.turnCount
      };
      target.statuses.push(runtime);
    } else {
      action='刷新';
      if (mode==='add_refresh') runtime.stacks=Math.min(maxStacks,Number(runtime.stacks||1)+addStacks);
      else if (mode==='replace') runtime.stacks=Math.min(maxStacks,addStacks);
      else runtime.stacks=Math.max(Number(runtime.stacks||1),Math.min(maxStacks,addStacks));
      runtime.remainingTurns=durationTurns;
      runtime.durationType=durationType;
      runtime.sourceActorId=sourceActor?.id||runtime.sourceActorId;
      runtime.appliedTurnCount=target.turnCount;
    }

    log(`  → ${target.name} ${action}${def.polarity==='debuff'?'Debuff':'Buff'}「${def.name}」${maxStacks>1?` ${runtime.stacks}/${maxStacks}层`:''}${durationType==='turns'?`，持续${runtime.remainingTurns}回合`:''}。`);
    emitBattleEvent('status_applied',{actor:target,target,attacker:sourceActor,status:def,statusRuntime:runtime,actionKey:event.actionKey||null});
    fireStatusThreshold(sourceActor,target,def,runtime,event);
    return true;
  }

  function removeStatus(target,statusId,reason='移除') {
    if (!target?.statuses) return false;
    const idx=target.statuses.findIndex(s=>s.statusId===statusId);
    if (idx<0) return false;
    const runtime=target.statuses[idx], def=statusById(statusId);
    target.statuses.splice(idx,1);
    log(`  → ${target.name} 的${def?.polarity==='debuff'?'Debuff':'Buff'}「${def?.name||statusId}」${reason}。`);
    emitBattleEvent('status_removed',{actor:target,target,status:def,statusRuntime:runtime});
    return true;
  }

  function tickStatusesAtTurnEnd(actor) {
    if (!actor?.statuses?.length) return;
    const expire=[];
    for (const runtime of actor.statuses) {
      if (runtime.durationType==='battle'||runtime.durationType==='permanent') continue;
      if (runtime.durationType==='action') { expire.push(runtime.statusId); continue; }
      if (runtime.durationType==='turns' && actor.turnCount>Number(runtime.appliedTurnCount||0)) {
        runtime.remainingTurns=Math.max(0,Number(runtime.remainingTurns||0)-1);
        runtime.appliedTurnCount=actor.turnCount;
        if (runtime.remainingTurns<=0) expire.push(runtime.statusId);
      }
    }
    for (const id of expire) removeStatus(actor,id,'到期消失');
  }

  function tickRuleCooldowns(actor) {
    for (const rt of Object.values(actor.ruleRuntime||{})) rt.cooldown=Math.max(0,Number(rt.cooldown||0)-1);
  }

  function talentById(id) {
    return state.collection?.talents?.[id] || null;
  }

  function talentRuntime(actor, talentId) {
    if (!actor.talentRuntime) actor.talentRuntime={};
    return actor.talentRuntime[talentId] || (actor.talentRuntime[talentId]={
      cooldown:0,
      triggers:0,
      lastActionKey:null,
      lastTurnIndex:null
    });
  }

  function eventSubject(owner, event, subject='self') {
    if (subject==='self') return owner;
    if (subject==='target') return event.target || null;
    if (subject==='attacker') return event.attacker || null;
    return owner;
  }

  function eventFieldValue(owner, event, condition) {
    const subject=eventSubject(owner,event,condition.subject||'self');
    const field=condition.field || '';
    if (!field) return true;

    if (field==='hpPercent') return subject ? pct(subject.hp,subject.maxHp) : 0;
    if (field==='qiPercent') return subject ? pct(subject.qi,subject.maxQi) : 0;
    if (field==='moveSpent') return subject?.id===state.currentActorId ? state.moveSpentThisTurn : 0;
    if (field==='relation') return event.relation;
    if (field==='skillId') return event.skill?.id || event.skillId;
    if (field==='targetHpPercent') return event.target ? pct(event.target.hp,event.target.maxHp) : 0;
    if (Object.prototype.hasOwnProperty.call(event,field)) return event[field];
    if (subject && Object.prototype.hasOwnProperty.call(subject,field)) return subject[field];
    return undefined;
  }

  function compareCondition(actual, op, expected) {
    switch(op) {
      case '==': return actual == expected;
      case '!=': return actual != expected;
      case '<': return Number(actual) < Number(expected);
      case '<=': return Number(actual) <= Number(expected);
      case '>': return Number(actual) > Number(expected);
      case '>=': return Number(actual) >= Number(expected);
      default: return !!actual;
    }
  }

  function talentConditionsPass(owner,talent,event) {
    const conditions=Array.isArray(talent.conditions)?talent.conditions:[];
    if (!conditions.length) return false;

    // 默认：事件属于该天赋拥有者。这样“攻击命中”不会因为别人命中而全场一起触发。
    if (event.actor && event.actor.id!==owner.id && talent.listen!=='global') return false;

    for (const c of conditions) {
      if (c.event && c.event!==event.type) return false;
      const actual=eventFieldValue(owner,event,c);
      if (!compareCondition(actual,c.op||'==',c.value)) return false;
    }
    return true;
  }

  function talentTriggerAllowed(owner,talent,event) {
    const rt=talentRuntime(owner,talent.id);
    if (rt.cooldown>0) return false;
    if (Number.isFinite(Number(talent.maxTriggersPerBattle)) &&
        rt.triggers>=Number(talent.maxTriggersPerBattle)) return false;

    let scope=talent.triggerScope;
    if (!scope) {
      scope=(event.type==='attack_hit'||event.type==='attack_crit') ? 'once_per_action' : 'per_event';
    }
    if (scope==='once_per_action' && event.actionKey && rt.lastActionKey===event.actionKey) return false;
    if (scope==='once_per_turn' && rt.lastTurnIndex===state.actionIndex) return false;
    return true;
  }

  function randomPick(list,count=1) {
    const pool=[...(list||[])],out=[];
    const n=Math.max(0,Math.min(pool.length,Number(count||1)));
    while (pool.length && out.length<n) {
      const i=Math.floor(rng()*pool.length);
      out.push(pool.splice(i,1)[0]);
    }
    return out;
  }

  function resolveEffectTargets(owner,event,targetType='self',effect={}) {
    if (targetType==='self') return [owner].filter(Boolean);
    if (targetType==='target') return [event.target].filter(Boolean);
    if (targetType==='attacker') return [event.attacker].filter(Boolean);
    if (targetType==='allies') return aliveActors(owner.team);
    if (targetType==='enemies') {
      const opposite=owner.team==='ally'?'enemy':owner.team==='enemy'?'ally':null;
      return opposite ? aliveActors(opposite) : [];
    }
    if (targetType==='random_ally') return randomPick(aliveActors(owner.team),effect.randomCount||1);
    if (targetType==='random_enemy') {
      const opposite=owner.team==='ally'?'enemy':owner.team==='enemy'?'ally':null;
      return opposite ? randomPick(aliveActors(opposite),effect.randomCount||1) : [];
    }
    return [owner].filter(Boolean);
  }

  function addTalentStatEffect(target, talent, effect, duration) {
    const item={
      id:`talent:${talent.id}:${effect.stat}`,
      sourceTalentId:talent.id,
      sourceTalentName:talent.name,
      type:'modify_stat',
      stat:effect.stat,
      mode:effect.mode||'flat',
      value:Number(effect.value||0),
      durationType:duration?.type||'turns',
      remainingTurns:Math.max(0,Number(duration?.turns||0)),
      appliedActionIndex:state.actionIndex
    };

    if (item.durationType==='permanent') {
      const old=Number(target[effect.stat]||0);
      target[effect.stat]=item.mode==='percent' ? old*(1+item.value/100) : old+item.value;
      return;
    }

    if (!talent.stackable) {
      target.talentEffects=(target.talentEffects||[]).filter(e=>!(e.sourceTalentId===talent.id && e.stat===effect.stat));
    }
    target.talentEffects.push(item);
  }

  function emitHpEvents(target,before,after,meta={}) {
    if (!target || before===after) return;
    emitBattleEvent('hp_changed',{
      actor:target,target,attacker:meta.attacker||null,
      beforeHp:before,afterHp:after,
      hpPercent:pct(after,target.maxHp),
      damage:meta.damage||0,heal:meta.heal||0,
      actionKey:meta.actionKey||null,
      skill:meta.skill||null
    });
  }

  function applyTalentEffect(owner,talent,effect,event) {
    const targets=resolveEffectTargets(owner,event,effect.target||'self');
    const duration=talent.duration||{type:'instant',turns:0};

    for (const target of targets) {
      if (!target || !target.alive || target.escaped) continue;

      if (effect.type==='modify_stat') {
        addTalentStatEffect(target,talent,effect,duration);
        log(`  → 天赋「${talent.name}」：${target.name} 的 ${effect.stat} ${effect.mode==='percent'?`${effect.value}%`:`${effect.value>=0?'+':''}${effect.value}`}（${duration.type}${duration.turns?` ${duration.turns}回合`:''}）。`);
      }
      else if (effect.type==='gain_gauge') {
        grantGauge(target,Number(effect.value||0),`天赋「${talent.name}」`);
      }
      else if (effect.type==='heal') {
        const before=target.hp;
        const value=effect.mode==='percent'
          ? Math.round(target.maxHp*Number(effect.value||0)/100)
          : Math.round(Number(effect.value||0));
        target.hp=Math.min(target.maxHp,target.hp+Math.max(0,value));
        log(`  → 天赋「${talent.name}」治疗 ${target.name}：HP ${before} → ${target.hp}。`);
        emitHpEvents(target,before,target.hp,{heal:target.hp-before,actionKey:event.actionKey});
      }
      else if (effect.type==='deal_damage') {
        const before=target.hp;
        const value=effect.mode==='percent'
          ? Math.round(target.maxHp*Number(effect.value||0)/100)
          : Math.round(Number(effect.value||0));
        const damage=Math.max(0,value);
        target.hp=Math.max(0,target.hp-damage);
        log(`  → 天赋「${talent.name}」对 ${target.name} 造成 ${damage} 伤害；HP ${before} → ${target.hp}。`);
        emitBattleEvent('damage_taken',{actor:target,target,attacker:owner,damage,actionKey:event.actionKey});
        emitHpEvents(target,before,target.hp,{attacker:owner,damage,actionKey:event.actionKey});
        if (target.hp<=0 && target.alive) {
          target.alive=false;
          emitBattleEvent('kill',{actor:owner,attacker:owner,target,killed:true,actionKey:event.actionKey});
        }
      }
      else if (effect.type==='apply_status') {
        target.buffs.push({
          id:effect.statusId||`talent-status:${talent.id}`,
          name:effect.statusName||talent.name,
          type:'generic',
          value:Number(effect.value||0),
          turns:Math.max(1,Number(duration.turns||1))
        });
        log(`  → ${target.name} 获得状态「${effect.statusName||talent.name}」。`);
      }
      else if (effect.type==='grant_move') {
        target.tempMoveBonus=Number(target.tempMoveBonus||0)+Number(effect.value||0);
        target.allowMoveAfterAction=true;
        log(`  → 天赋「${talent.name}」：${target.name} 获得临时移动力 +${Number(effect.value||0)}。`);
      }
      else if (effect.type==='refund_qi') {
        const before=target.qi;
        target.qi=Math.min(target.maxQi,target.qi+Number(effect.value||0));
        log(`  → 天赋「${talent.name}」：${target.name} 真气 ${before} → ${target.qi}。`);
      }
    }
  }

  function triggerTalent(owner,talent,event) {
    const rt=talentRuntime(owner,talent.id);
    rt.triggers++;
    rt.cooldown=Math.max(0,Number(talent.cooldown||0));
    if (event.actionKey) rt.lastActionKey=event.actionKey;
    rt.lastTurnIndex=state.actionIndex;

    log(`【天赋触发】${owner.name} · ${talent.name}`);
    for (const effect of (talent.effects||[])) applyTalentEffect(owner,talent,effect,event);
  }

  function ruleConditionsPass(owner,rule,event) {
    const conditions=Array.isArray(rule.conditions)?rule.conditions:[];
    if (event.actor && event.actor.id!==owner.id && rule.listen!=='global') return false;
    for (const c of conditions) {
      if (c.event && c.event!==event.type) return false;
      if (!c.field) continue;
      const actual=eventFieldValue(owner,event,c);
      if (!compareCondition(actual,c.op||'==',c.value)) return false;
    }
    return true;
  }

  function ruleTriggerAllowed(owner,entry,event) {
    const {rule,key}=entry;
    const rt=ruleRuntime(owner,key);
    if (rt.cooldown>0) return false;
    if (Number.isFinite(Number(rule.maxTriggersPerBattle)) && rt.triggers>=Number(rule.maxTriggersPerBattle)) return false;
    let scope=rule.triggerScope;
    if (!scope) scope=(event.type==='attack_hit'||event.type==='attack_crit')?'once_per_action':'per_event';
    if (scope==='once_per_action' && event.actionKey && rt.lastActionKey===event.actionKey) return false;
    if (scope==='once_per_turn' && rt.lastTurnIndex===state.actionIndex) return false;
    return true;
  }

  function genericEffectTargets(owner,event,targetType='self',effect={}) {
    return resolveEffectTargets(owner,event,targetType,effect);
  }

  function totalShield(actor) {
    return Math.max(0,(actor?.shields||[]).reduce((s,x)=>s+Math.max(0,Number(x.amount||0)),0));
  }

  function addShield(target,amount,duration={},sourceName='护盾') {
    const value=Math.max(0,Math.round(Number(amount||0)));
    if (!target || value<=0) return 0;
    const type=duration?.type||'turns';
    target.shields=target.shields||[];
    target.shields.push({
      id:`shield:${Date.now()}:${Math.floor(rng()*1e7)}`,
      name:sourceName,
      amount:value,
      durationType:type,
      remainingTurns:Math.max(0,Number(duration?.turns||0)),
      appliedTurnCount:target.turnCount
    });
    log(`  → ${target.name} 获得 ${value} 点护盾${type==='turns'?`（${Math.max(0,Number(duration?.turns||0))}回合）`:''}。`);
    emitBattleEvent('shield_gained',{actor:target,target,shield:value,sourceName});
    return value;
  }

  function absorbDamage(target,rawDamage) {
    let remaining=Math.max(0,Math.round(Number(rawDamage||0))),absorbed=0;
    const shields=target?.shields||[];
    for (const shield of shields) {
      if (remaining<=0) break;
      const take=Math.min(Math.max(0,Number(shield.amount||0)),remaining);
      shield.amount-=take;
      remaining-=take;
      absorbed+=take;
    }
    target.shields=shields.filter(s=>Number(s.amount||0)>0);
    if (absorbed>0) {
      log(`  → ${target.name} 的护盾吸收 ${absorbed} 伤害${remaining>0?`，仍有 ${remaining} 伤害穿透`:''}。`);
      emitBattleEvent('shield_absorbed',{actor:target,target,absorbed,remainingDamage:remaining});
    }
    return {remaining,absorbed};
  }

  function applyRawDamage(target,rawDamage) {
    const raw=Math.max(0,Math.round(Number(rawDamage||0)));
    const before=target.hp;
    const {remaining,absorbed}=absorbDamage(target,raw);
    target.hp=Math.max(0,target.hp-remaining);
    return {
      rawDamage:raw,
      absorbed,
      hpDamage:before-target.hp,
      beforeHp:before,
      afterHp:target.hp
    };
  }

  function emitResolvedDamage(target,result,meta={}) {
    if (result.hpDamage>0) {
      emitBattleEvent('damage_taken',{
        actor:target,target,
        attacker:meta.attacker||null,
        damage:result.hpDamage,
        rawDamage:result.rawDamage,
        absorbed:result.absorbed,
        damageKind:meta.damageKind||'normal',
        actionKey:meta.actionKey||null,
        sourceType:meta.sourceType,
        source:meta.source,
        skill:meta.skill||null
      });
      emitHpEvents(target,result.beforeHp,result.afterHp,{
        attacker:meta.attacker||null,
        damage:result.hpDamage,
        actionKey:meta.actionKey||null,
        skill:meta.skill||null
      });
    }
    if (target.hp<=0 && target.alive) {
      target.alive=false;
      log(`  → ${target.name} 失去战斗能力。`);
      emitBattleEvent('kill',{
        actor:meta.attacker||target,
        attacker:meta.attacker||null,
        target,
        killed:true,
        actionKey:meta.actionKey||null,
        damageKind:meta.damageKind||'normal'
      });
    }
  }

  function healActor(target,amount,meta={}) {
    if (!target || !target.alive) return 0;
    const before=target.hp;
    const value=Math.max(0,Math.round(Number(amount||0)));
    target.hp=Math.min(target.maxHp,target.hp+value);
    const healed=target.hp-before;
    if (healed>0) {
      log(`  → ${meta.label||'效果'}治疗 ${target.name} ${healed} 点；HP ${before} → ${target.hp}。`);
      emitHpEvents(target,before,target.hp,{heal:healed,actionKey:meta.actionKey||null,attacker:meta.attacker||null});
    }
    return healed;
  }

  function tickShieldsAtTurnEnd(actor) {
    if (!actor?.shields?.length) return;
    const kept=[];
    for (const shield of actor.shields) {
      if (shield.durationType==='battle'||shield.durationType==='permanent') { kept.push(shield); continue; }
      if (shield.durationType==='action') continue;
      if (shield.durationType==='turns') {
        if (actor.turnCount>Number(shield.appliedTurnCount||0)) {
          shield.remainingTurns=Math.max(0,Number(shield.remainingTurns||0)-1);
          shield.appliedTurnCount=actor.turnCount;
        }
        if (shield.remainingTurns>0) kept.push(shield);
      } else kept.push(shield);
    }
    actor.shields=kept;
  }

  function swapActorPositions(a,b,reason='换位') {
    if (!a||!b||a.id===b.id||!a.alive||!b.alive) return false;
    const ax=a.x,ay=a.y,af=a.facing;
    a.x=b.x;a.y=b.y;
    b.x=ax;b.y=ay;
    setFacingToward(a,b.x,b.y);
    setFacingToward(b,a.x,a.y);
    log(`  → ${a.name} 与 ${b.name} ${reason}。`);
    emitBattleEvent('positions_swapped',{actor:a,target:b,attacker:a});
    return true;
  }

  function behindCell(target) {
    const d={N:[0,1],S:[0,-1],E:[-1,0],W:[1,0]}[target?.facing]||[0,1];
    return {x:target.x+d[0],y:target.y+d[1]};
  }

  function teleportBehind(actor,target,meta={}) {
    if (!actor||!target||actor.id===target.id||!actor.alive||!target.alive) return false;
    const dest=behindCell(target);
    if (!inBounds(dest.x,dest.y)||blockedAt(dest.x,dest.y,actor.id)) {
      log(`  → ${actor.name} 无法闪身到 ${target.name} 背后：目标背后没有可用空格。`);
      return false;
    }
    const from={x:actor.x,y:actor.y};
    actor.x=dest.x;actor.y=dest.y;
    setFacingToward(actor,target.x,target.y);
    log(`  → ${actor.name} 闪身至 ${target.name} 背后：(${from.x+1},${from.y+1}) → (${actor.x+1},${actor.y+1})。`);
    emitBattleEvent('teleported',{actor,target,attacker:actor,fromX:from.x,fromY:from.y,x:actor.x,y:actor.y,actionKey:meta.actionKey||null});
    return true;
  }

  function findNearestSpawnCell(cx,cy,maxRadius=3,allowOccupied=false) {
    const candidates=[];
    for (let r=0;r<=maxRadius;r++) {
      for (let y=0;y<CONFIG.boardSize;y++) for (let x=0;x<CONFIG.boardSize;x++) {
        if (Math.abs(x-cx)+Math.abs(y-cy)!==r) continue;
        if (!inBounds(x,y)) continue;
        if (!allowOccupied && blockedAt(x,y)) continue;
        if (allowOccupied && obstacleAt(x,y)) continue;
        candidates.push({x,y});
      }
      if (candidates.length) return candidates[0];
    }
    return null;
  }

  function actorTemplateAny(ref,preferredTeam=null) {
    if (!ref) return null;
    const buckets=[
      ['ally',state.collection?.allies||{}],
      ['neutral',state.collection?.neutrals||{}],
      ['enemy',state.collection?.enemies||{}]
    ];
    if (preferredTeam) {
      const hit=buckets.find(([team,b])=>team===preferredTeam && b[ref]);
      if (hit) return {team:hit[0],template:hit[1]};
    }
    for (const [team,b] of buckets) if (b[ref]) return {team,template:b[ref]};
    return null;
  }

  function applyTemplateBonuses(base) {
    for (const equipId of (base.equipment||[])) {
      const equip=state.collection?.equipment?.[equipId];
      for (const [stat,val] of Object.entries(equip?.modifiers||{})) {
        if (typeof val==='number') base[stat]=Number(base[stat]||0)+val;
      }
    }
    for (const talentId of (base.talents||[])) {
      const talent=state.collection?.talents?.[talentId];
      if (talent?.type!=='passive') continue;
      for (const eff of (talent.effects||[])) {
        if (eff.type!=='modify_stat'||eff.target!=='self') continue;
        const old=Number(base[eff.stat]||0);
        base[eff.stat]=eff.mode==='percent'?old*(1+Number(eff.value||0)/100):old+Number(eff.value||0);
      }
    }
  }

  function summonUnit(source,effect,cx,cy,meta={}) {
    const found=actorTemplateAny(effect.templateRef,effect.templateTeam);
    if (!found) { log(`  → 召唤失败：找不到角色模板 ${effect.templateRef||'（未填写）'}。`); return null; }
    const pos=findNearestSpawnCell(cx,cy,Math.max(1,Number(effect.spawnRadius||3)),false);
    if (!pos) { log(`  → 召唤失败：附近没有可用空格。`); return null; }

    const base=deepClone(found.template);
    const team=effect.summonTeam==='same'||!effect.summonTeam ? source.team :
      effect.summonTeam==='template' ? found.team : effect.summonTeam;
    applyTemplateBonuses(base);
    base.team=team;
    base.templateId=effect.templateRef;
    base.id=`summon:${effect.templateRef}:${state.actionIndex}:${++state.eventActionSeq}`;
    base.x=pos.x;base.y=pos.y;base.facing=effect.facing||source.facing||'N';
    base.maxHp=Math.max(1,Math.round(Number(base.maxHp||1)));
    base.hp=base.maxHp;
    base.maxQi=Math.max(0,Math.round(Number(base.maxQi||0)));
    base.qi=base.maxQi;
    base.gauge=Math.max(0,Number(effect.startGauge||0));
    const actor=normalizeActorRuntime(base,team);
    state.actors.push(actor);
    log(`  → ${source.name} 召唤「${actor.name}」至 (${actor.x+1},${actor.y+1})。`);
    emitBattleEvent('unit_summoned',{actor:source,target:actor,summoned:actor,actionKey:meta.actionKey||null});
    return actor;
  }

  function summonGroundObject(source,effect,cx,cy,meta={}) {
    const blocksMovement=effect.blocksMovement!==false;
    let pos;
    if (!blocksMovement && !obstacleAt(cx,cy)) pos={x:cx,y:cy};
    else pos=findNearestSpawnCell(cx,cy,Math.max(1,Number(effect.spawnRadius||2)),!blocksMovement);
    if (!pos) { log(`  → 召唤地面物失败：附近没有可用格子。`); return null; }
    const hp=Math.max(1,Math.round(Number(effect.hp||1)));
    const obj={
      id:`ground:${state.actionIndex}:${++state.eventActionSeq}`,
      name:effect.objectName||'召唤地面物',
      kind:'ground',
      x:pos.x,y:pos.y,maxHp:hp,hp,
      blocksMovement,
      blocksAttack:effect.blocksAttack===true,
      durationTurns:Math.max(0,Number(effect.durationTurns||0)),
      sourceActorId:source.id,
      sourceTurnCount:source.turnCount,
      destroyed:false
    };
    state.obstacles.push(obj);
    log(`  → ${source.name} 在 (${obj.x+1},${obj.y+1}) 生成「${obj.name}」。`);
    emitBattleEvent('object_summoned',{actor:source,target:source,object:obj,actionKey:meta.actionKey||null});
    return obj;
  }

  function tickSummonedObjects(actor) {
    for (const obj of state.obstacles) {
      if (obj.destroyed||obj.kind!=='ground'||obj.durationTurns<=0||obj.sourceActorId!==actor.id) continue;
      if (actor.turnCount>Number(obj.sourceTurnCount||0)) {
        obj.durationTurns=Math.max(0,obj.durationTurns-1);
        obj.sourceTurnCount=actor.turnCount;
        if (obj.durationTurns<=0) {
          obj.destroyed=true;
          log(`  → 地面物「${obj.name}」持续时间结束并消失。`);
        }
      }
    }
  }

  function applyRuleEffect(owner,entry,effect,event) {
    const {sourceType,source,rule,statusRuntime}=entry;
    const targets=genericEffectTargets(owner,event,effect.target||'self',effect);
    const duration=effect.duration || rule.duration || source.duration || {type:'instant',turns:0};
    const stackMult=(effect.perStack && statusRuntime)?Math.max(1,Number(statusRuntime.stacks||1)):1;

    if (effect.type==='reflect_damage') {
      if (event.damageKind==='reflect'||!event.attacker||!event.attacker.alive||Number(event.damage||0)<=0) return;
      const raw=Math.max(0,Math.round(Number(event.damage||0)*Number(effect.value||0)*stackMult/100));
      const result=applyRawDamage(event.attacker,raw);
      log(`  → ${sourceLabel(sourceType,source)}反伤 ${event.attacker.name} ${result.hpDamage} 点${result.absorbed?`（护盾吸收${result.absorbed}）`:''}。`);
      emitResolvedDamage(event.attacker,result,{attacker:owner,actionKey:event.actionKey,damageKind:'reflect',sourceType,source});
      return;
    }

    if (effect.type==='swap_position') {
      const target=targets.find(t=>t&&t.id!==owner.id);
      if (target) swapActorPositions(owner,target,`因${sourceLabel(sourceType,source)}换位`);
      return;
    }

    if (effect.type==='teleport_behind') {
      const mover=targets[0]||owner;
      const reference=(event.target&&event.target.id!==mover.id)?event.target:event.attacker;
      if (reference) teleportBehind(mover,reference,{actionKey:event.actionKey});
      return;
    }

    if (effect.type==='summon_unit') {
      const center=targets[0]||event.target||owner;
      summonUnit(owner,effect,center.x,center.y,{actionKey:event.actionKey});
      return;
    }

    if (effect.type==='summon_object') {
      const center=targets[0]||event.target||owner;
      summonGroundObject(owner,effect,center.x,center.y,{actionKey:event.actionKey});
      return;
    }

    for (const target of targets) {
      if (!target || !target.alive || target.escaped) continue;

      if (effect.type==='apply_status') {
        applyStatus(owner,target,effect.statusId,{
          stacks:Number(effect.stacks||1),durationTurns:effect.durationTurns,durationType:effect.durationType,
          chance:effect.chance,ignoreResistance:!!effect.ignoreResistance,ignoreImmunity:!!effect.ignoreImmunity
        },event);
      } else if (effect.type==='remove_status') {
        removeStatus(target,effect.statusId,'被移除');
      } else if (effect.type==='dispel') {
        const removed=dispelStatuses(target,{polarity:effect.polarity||'any',count:Number(effect.count||1),tags:Array.isArray(effect.tags)?effect.tags:[]});
        log(`  → ${sourceLabel(sourceType,source)}：${target.name} 驱散 ${removed} 个状态。`);
      } else if (effect.type==='modify_stat') {
        addTalentStatEffect(target,{id:entry.key,name:source.name,stackable:rule.stackable}, {...effect,value:Number(effect.value||0)*stackMult},duration);
        log(`  → ${sourceLabel(sourceType,source)}：${target.name} 的 ${effect.stat} ${effect.mode==='percent'?`${Number(effect.value||0)*stackMult}%`:`${Number(effect.value||0)*stackMult>=0?'+':''}${Number(effect.value||0)*stackMult}`}。`);
      } else if (effect.type==='gain_gauge') {
        grantGauge(target,Number(effect.value||0)*stackMult,sourceLabel(sourceType,source));
      } else if (effect.type==='heal') {
        const base=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
        healActor(target,base*stackMult,{label:sourceLabel(sourceType,source),actionKey:event.actionKey,attacker:owner});
      } else if (effect.type==='deal_damage') {
        const base=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
        const raw=Math.max(0,Math.round(base*stackMult));
        const result=applyRawDamage(target,raw);
        log(`  → ${sourceLabel(sourceType,source)}对 ${target.name} 造成 ${result.hpDamage} 伤害${result.absorbed?`（护盾吸收${result.absorbed}）`:''}；HP ${result.beforeHp} → ${result.afterHp}。`);
        emitResolvedDamage(target,result,{attacker:owner,actionKey:event.actionKey,damageKind:effect.damageKind||'effect',sourceType,source});
      } else if (effect.type==='grant_move') {
        target.tempMoveBonus=Number(target.tempMoveBonus||0)+Number(effect.value||0)*stackMult;
        target.allowMoveAfterAction=true;
        log(`  → ${sourceLabel(sourceType,source)}：${target.name} 获得临时移动力 +${Number(effect.value||0)*stackMult}。`);
      } else if (effect.type==='refund_qi') {
        const before=target.qi; target.qi=Math.min(target.maxQi,target.qi+Number(effect.value||0)*stackMult);
        log(`  → ${sourceLabel(sourceType,source)}：${target.name} 真气 ${before} → ${target.qi}。`);
      } else if (effect.type==='shield') {
        const base=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
        addShield(target,base*stackMult,effect.duration||duration,sourceLabel(sourceType,source));
      } else if (effect.type==='lifesteal') {
        const dealt=Math.max(0,Number(event.damage||0));
        const heal=dealt*Number(effect.value||0)*stackMult/100;
        healActor(target,heal,{label:`${sourceLabel(sourceType,source)}吸血`,actionKey:event.actionKey,attacker:owner});
      }
    }
  }

  function triggerRule(owner,entry,event) {
    const {rule,key,sourceType,source}=entry;
    const rt=ruleRuntime(owner,key);
    rt.triggers++;
    rt.cooldown=Math.max(0,Number(rule.cooldown||source.cooldown||0));
    if (event.actionKey) rt.lastActionKey=event.actionKey;
    rt.lastTurnIndex=state.actionIndex;
    log(`【规则触发】${owner.name} · ${sourceLabel(sourceType,source)}`);
    for (const effect of (rule.effects||[])) applyRuleEffect(owner,entry,effect,event);
  }

  function emitBattleEvent(type,payload={}) {
    if (state.eventDepth>24) { log('【规则警告】事件链过深，已阻止继续递归。','system'); return; }
    state.eventDepth++;
    try {
      const event={type,...payload};
      for (const owner of aliveActors()) {
        for (const entry of activeRuleSources(owner,event)) {
          if (!ruleConditionsPass(owner,entry.rule,event)) continue;
          if (!ruleTriggerAllowed(owner,entry,event)) continue;
          triggerRule(owner,entry,event);
        }
      }
    } finally { state.eventDepth--; }
  }


  function tickTalentCooldowns(actor) {
    for (const talentId of (actor.talents||[])) {
      const rt=talentRuntime(actor,talentId);
      rt.cooldown=Math.max(0,Number(rt.cooldown||0)-1);
    }
  }

  function expireTalentEffectsAtTurnEnd(actor) {
    if (!actor?.talentEffects) return;
    const kept=[];
    for (const e of actor.talentEffects) {
      if (e.durationType==='battle') { kept.push(e); continue; }
      if (e.durationType==='action') continue;
      if (e.durationType==='turns') {
        if (e.appliedActionIndex < state.actionIndex) e.remainingTurns--;
        if (e.remainingTurns>0) kept.push(e);
        continue;
      }
      kept.push(e);
    }
    actor.talentEffects=kept;
  }


  function grantGauge(actor, amount, reason='') {
    const before=actor.gauge;
    actor.gauge=Math.max(0,actor.gauge+amount);
    if (reason) log(`  → ${actor.name} 集气 ${before.toFixed(1)} → ${actor.gauge.toFixed(1)}（${reason}）。`);
  }

  // 预留给“立即再行动 / 强制插队”型武学；普通集气仍由时间轴决定。
  function queueForcedTurn(actor, priority=100, reason='强制行动') {
    if (!actor?.alive) return;
    state.forcedTurns.push({actorId:actor.id,priority,reason,seq:state.actionIndex});
    state.forcedTurns.sort((a,b)=>b.priority-a.priority || a.seq-b.seq);
  }

  function effectiveQiSpeed(actor) {
    let mult = 1;
    for (const b of actor.buffs) {
      if (b.type === 'qiSpeed') mult *= (1 + b.value);
    }
    return Math.max(1, effectiveStat(actor,'qiSpeed') * mult);
  }

  function controlFieldCount(actor) {
    const opposite = actor.team === 'ally' ? 'enemy' : 'ally';
    return aliveActors(opposite).filter(enemy => dist(actor, enemy) === 1).length;
  }

  function effectiveMove(actor) {
    if (actorHasControl(actor,'stun') || actorHasControl(actor,'root')) return 0;
    const penalty = controlFieldCount(actor) * CONFIG.controlFieldPenalty;
    return Math.max(0, effectiveStat(actor,'move') + Number(actor.tempMoveBonus||0) - penalty);
  }

  function remainingMove(actor) {
    if (!actor || state.movementLocked) return 0;
    return Math.max(0, effectiveMove(actor) - state.moveSpentThisTurn);
  }

  function canUseOrdinaryMove(actor) {
    return !!actor && actor.team === 'ally' && actor.id === state.currentActorId &&
      !state.movementLocked && remainingMove(actor) > 0;
  }

  function refreshMovementLog(actor) {
    const steps = Math.max(0, state.moveHistoryThisTurn.length - 1);
    if (steps <= 0) {
      if (state.lastMoveLogIndex !== null && state.logs[state.lastMoveLogIndex]) {
        state.logs.splice(state.lastMoveLogIndex, 1);
      }
      state.lastMoveLogIndex = null;
      renderLog();
      return;
    }
    const text = `${actor.name} 本回合普通移动累计 ${steps} 格；路径：${pathText(state.moveHistoryThisTurn)}。`;
    if (state.lastMoveLogIndex === null || !state.logs[state.lastMoveLogIndex]) {
      state.lastMoveLogIndex = state.logs.length;
      log(text);
    } else {
      state.logs[state.lastMoveLogIndex].text = text;
      renderLog();
    }
  }

  function stepMove(actor, x, y) {
    if (!canUseOrdinaryMove(actor)) return false;
    if (!inBounds(x, y) || blockedAt(x, y, actor.id)) return false;
    if (Math.abs(actor.x - x) + Math.abs(actor.y - y) !== 1) return false;

    const from = {x:actor.x, y:actor.y, facing:actor.facing};
    actor.facing = facingFromStep(from, {x,y}, actor.facing);
    actor.x = x; actor.y = y;
    state.moveSpentThisTurn += 1;
    state.movedThisTurn = true;
    state.moveHistoryThisTurn.push({x,y,facing:actor.facing});
    refreshMovementLog(actor);
    emitBattleEvent('move_step',{
      actor,target:actor,
      fromX:from.x,fromY:from.y,x,y,
      moveSpent:state.moveSpentThisTurn,
      actionKey:`turn:${state.actionIndex}`
    });

    const remain = remainingMove(actor);
    if (remain <= 0) {
      state.mode = null;
      state.modeSkill = null;
      state.hoveredTile = null;
      cancelModeBtn.disabled = true;
      if (state.actedThisTurn) {
        log(`${actor.name} 的剩余移动力已用完，结束行动。`);
        finishTurn(actor);
        return true;
      }
      turnHintEl.textContent = `${actor.name} 的普通移动力已用完，请选择正式行动。`;
    } else {
      turnHintEl.textContent = `${actor.name} 继续移动：剩余 ${remain} 格；可继续点相邻绿色格，或退出移动后出招。`;
    }
    renderAll();
    return true;
  }

  function settleAction(actor, skill = null, finishOpts = {}) {
    state.actedThisTurn = true;
    if ((skill?.canMoveAfterAction || actor.allowMoveAfterAction) && remainingMove(actor) > 0) {
      state.movementLocked = false;
      state.mode = null;
      state.modeSkill = null;
      state.pendingAction = null;
      state.hoveredTile = null;
      cancelModeBtn.disabled = true;
      turnHintEl.textContent = `${actor.name} 的技能允许攻击后移动：还可移动 ${remainingMove(actor)} 格，或直接结束行动。`;
      renderAll();
      return;
    }
    state.movementLocked = true;
    finishTurn(actor, finishOpts);
  }

  function tick(now) {
    const dt = Math.min(0.12, (now - state.lastTick) / 1000);
    state.lastTick = now;

    if (!state.battleEnded && !state.gamePaused && !state.manualPaused && !state.currentActorId) {
      // 强制行动队列优先于普通集气（当前Demo没有技能使用它，只先把底层接口留好）。
      while (state.forcedTurns.length && !state.currentActorId) {
        const item=state.forcedTurns.shift();
        const forced=actorById(item.actorId);
        if (forced?.alive) {
          log(`【强制行动】${forced.name}：${item.reason}。`);
          beginTurn(forced,{consumeGauge:false});
          break;
        }
      }
      if (!state.currentActorId) {
        for (const actor of combatActors()) actor.gauge += effectiveQiSpeed(actor) * CONFIG.gaugeVisualScale * dt * state.speed;
        const ready = combatActors().filter(a => a.gauge >= CONFIG.gaugeThreshold)
          .sort((a, b) => b.gauge - a.gauge || effectiveQiSpeed(b) - effectiveQiSpeed(a) || a.id.localeCompare(b.id));
        if (ready.length) beginTurn(ready[0]);
      }
    }

    renderTimeline();
    requestAnimationFrame(tick);
  }

  function beginTurn(actor, opts = {}) {
    state.currentActorId = actor.id;
    state.gamePaused = true;
    state.mode = null;
    state.modeSkill = null;
    state.movedThisTurn = false;
    state.actedThisTurn = false;
    state.moveSpentThisTurn = 0;
    state.moveHistoryThisTurn = [{x:actor.x,y:actor.y,facing:actor.facing}];
    state.movementLocked = false;
    actor.tempMoveBonus = 0;
    actor.allowMoveAfterAction = false;
    state.turnSnapshot = { x: actor.x, y: actor.y, facing: actor.facing, gauge: actor.gauge };
    state.lastMoveLogIndex = null;
    state.hoveredTile = null;
    state.pendingAction = null;
    state.reachableCache = null;
    actor.turnCount += 1;
    actor.defending = false;
    if (opts.consumeGauge !== false) actor.gauge = Math.max(0, actor.gauge - CONFIG.gaugeThreshold); // 保留溢出集气

    for (const key of Object.keys(actor.cooldowns)) actor.cooldowns[key] = Math.max(0, actor.cooldowns[key] - 1);
    tickTalentCooldowns(actor);
    tickRuleCooldowns(actor);
    actor.buffs.forEach(b => b.turns--);
    actor.buffs = actor.buffs.filter(b => b.turns > 0);

    log(`\n【行动 ${++state.actionIndex}】${actor.name} 获得行动；行动后保留溢出集气 ${actor.gauge.toFixed(1)}。`);
    emitBattleEvent('turn_start',{actor,target:actor,actionKey:`turn:${state.actionIndex}`});
    if (actorHasControl(actor,'stun')) {
      log(`${actor.name} 受到「眩晕」控制，本次行动被跳过。`);
      turnHintEl.textContent = `${actor.name} 眩晕中，本次行动跳过。`;
      renderAll();
      setTimeout(()=>finishTurn(actor),260);
      return;
    }
    if (actor.team === 'ally') {
      turnHintEl.textContent = `${actor.name} 行动：普通移动剩余 ${remainingMove(actor)} 格；可逐格移动后再进行一次正式行动。`;
      renderAll();
    } else {
      turnHintEl.textContent = `${actor.name} 正在行动……`;
      renderAll();
      state.aiTimer = setTimeout(() => enemyTurn(actor), 420);
    }
  }

  function finishTurn(actor, opts = {}) {
    if (!actor || !actor.alive) return;
    emitBattleEvent('turn_end',{actor,target:actor,actionKey:`turn:${state.actionIndex}`});
    tickStatusesAtTurnEnd(actor);
    tickShieldsAtTurnEnd(actor);
    tickSummonedObjects(actor);
    expireTalentEffectsAtTurnEnd(actor);
    actor.tempMoveBonus=0;
    actor.allowMoveAfterAction=false;
    // 普通行动不再把集气清零：beginTurn已扣除100，剩余溢出自然进入下一轮时间轴。
    if (Number.isFinite(opts.setGauge)) actor.gauge = Math.max(0, opts.setGauge);
    if (Number.isFinite(opts.minGauge)) actor.gauge = Math.max(actor.gauge, opts.minGauge);
    state.currentActorId = null;
    state.gamePaused = false;
    state.mode = null;
    state.modeSkill = null;
    state.movedThisTurn = false;
    state.actedThisTurn = false;
    state.turnSnapshot = null;
    state.lastMoveLogIndex = null;
    state.hoveredTile = null;
    state.pendingAction = null;
    state.reachableCache = null;
    state.moveSpentThisTurn = 0;
    state.moveHistoryThisTurn = [];
    state.movementLocked = false;
    checkBattleEnd();
    renderAll();
  }

  function setFacingToward(actor, x, y) {
    const dx = x - actor.x;
    const dy = y - actor.y;
    if (Math.abs(dx) > Math.abs(dy)) actor.facing = dx > 0 ? 'E' : 'W';
    else if (dy !== 0) actor.facing = dy > 0 ? 'S' : 'N';
  }

  function setFacing(actor, dir) {
    if (!actor || !['N', 'E', 'S', 'W'].includes(dir)) return false;
    actor.facing = dir;
    return true;
  }

  function directionFromAdjacent(actor, x, y) {
    const dx = x - actor.x;
    const dy = y - actor.y;
    if (dx === 0 && dy === -1) return 'N';
    if (dx === 1 && dy === 0) return 'E';
    if (dx === 0 && dy === 1) return 'S';
    if (dx === -1 && dy === 0) return 'W';
    return null;
  }

  function directionActionLabel(id) {
    return ({
      defend: '防御',
      rest: '调息',
      neigong: SKILLS.neigong.name,
      endturn: '结束行动'
    })[id] || id;
  }

  function relativeAttackType(attacker, target) {
    const dx = signDir(attacker.x - target.x);
    const dy = signDir(attacker.y - target.y);
    let incoming;
    if (Math.abs(attacker.x - target.x) > Math.abs(attacker.y - target.y)) incoming = dx > 0 ? 'E' : 'W';
    else incoming = dy > 0 ? 'S' : 'N';

    const behind = { N: 'S', S: 'N', E: 'W', W: 'E' }[target.facing];
    if (incoming === behind) return 'back';
    if (incoming === target.facing) return 'front';
    return 'side';
  }

  function getHitChance(attacker, target, skill) {
    const relation = relativeAttackType(attacker, target);
    let chance = CONFIG.baseHitChance + effectiveStat(attacker,'accuracy') + (skill.hitMod || 0) - effectiveStat(target,'dodge');
    if (relation === 'back') chance += CONFIG.backHitBonus;
    return { chance: clamp(chance, 5, 99), relation };
  }

  function rollHit(attacker, target, skill) {
    const info=getHitChance(attacker,target,skill);
    return { hit: rng() * 100 < info.chance, ...info };
  }

  function baseDamageBeforeVariance(attacker, target, skill, relation, multiplierOverride=null) {
    const mult=multiplierOverride ?? primaryDamageEffect(skill)?.multiplier ?? skill.multiplier ?? 1;
    let raw = effectiveStat(attacker,'attack') * Number(mult) - effectiveStat(target,'defense') * CONFIG.defenseFactor;
    raw = Math.max(18, raw);
    if (relation === 'side' || relation === 'back') raw *= (1 + CONFIG.sideDamageBonus);
    if (target.defending) raw *= (1 - CONFIG.defenseReduction);
    return raw;
  }

  function damagePreview(attacker,target,skill,relation,effect=null) {
    const raw=baseDamageBeforeVariance(attacker,target,skill,relation,effect?.multiplier ?? null);
    return {
      min:Math.max(1,Math.round(raw*0.94)),
      max:Math.max(1,Math.round(raw*1.06)),
      crit:effect?.canCrit===false?0:effectiveStat(attacker,'crit')
    };
  }

  function calcDamage(attacker, target, skill, relation, effect=null) {
    let raw = baseDamageBeforeVariance(attacker,target,skill,relation,effect?.multiplier ?? null);
    const crit = effect?.canCrit===false ? false : rng() * 100 < effectiveStat(attacker,'crit');
    if (crit) raw *= CONFIG.critMultiplier;
    const variance = 0.94 + rng() * 0.12;
    return { damage: Math.max(1, Math.round(raw * variance)), crit };
  }

  function chooseStepToward(fromX,fromY,toX,toY,ignoreActorId=null) {
    const dx=toX-fromX,dy=toY-fromY,candidates=[];
    if (Math.abs(dx)>=Math.abs(dy) && dx!==0) candidates.push({x:fromX+Math.sign(dx),y:fromY});
    if (dy!==0) candidates.push({x:fromX,y:fromY+Math.sign(dy)});
    if (Math.abs(dx)<Math.abs(dy) && dx!==0) candidates.push({x:fromX+Math.sign(dx),y:fromY});
    return candidates.find(p=>inBounds(p.x,p.y)&&!blockedAt(p.x,p.y,ignoreActorId))||null;
  }

  function chooseStepAway(source,target,ignoreActorId=null) {
    const dx=target.x-source.x,dy=target.y-source.y,candidates=[];
    if (Math.abs(dx)>=Math.abs(dy) && dx!==0) candidates.push({x:target.x+Math.sign(dx),y:target.y});
    if (dy!==0) candidates.push({x:target.x,y:target.y+Math.sign(dy)});
    if (Math.abs(dx)<Math.abs(dy) && dx!==0) candidates.push({x:target.x+Math.sign(dx),y:target.y});
    return candidates.find(p=>inBounds(p.x,p.y)&&!blockedAt(p.x,p.y,ignoreActorId))||null;
  }

  function forcedMoveActor(actor,source,mode,distance,meta={}) {
    if (!actor || !actor.alive || actor.escaped) return 0;
    let moved=0;
    const path=[{x:actor.x,y:actor.y}];
    for (let i=0;i<Math.max(0,Number(distance||0));i++) {
      let next=null;
      if (mode==='push') next=chooseStepAway(source,actor,actor.id);
      else if (mode==='pull') next=chooseStepToward(actor.x,actor.y,source.x,source.y,actor.id);
      else if (mode==='toward_cast') next=chooseStepToward(actor.x,actor.y,meta.centerX,meta.centerY,actor.id);
      if (!next) break;
      const from={x:actor.x,y:actor.y};
      actor.x=next.x;actor.y=next.y;
      actor.facing=facingFromStep(from,next,actor.facing);
      moved++;
      path.push({x:actor.x,y:actor.y});
      emitBattleEvent('forced_move',{actor,target:actor,attacker:source,mode,fromX:from.x,fromY:from.y,x:actor.x,y:actor.y,actionKey:meta.actionKey||null,skill:meta.skill||null});
    }
    if (moved>0) log(`  → ${actor.name} ${mode==='push'?'被击退':mode==='pull'?'被拉近':'位移'} ${moved} 格：${pathText(path)}。`);
    return moved;
  }

  function healFromCoreEffect(attacker,target,effect,meta={}) {
    const before=target.hp;
    const base=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
    const amount=Math.max(0,Math.round(base));
    target.hp=Math.min(target.maxHp,target.hp+amount);
    log(`  → ${attacker.name} 的技能治疗 ${target.name}：HP ${before} → ${target.hp}。`);
    emitHpEvents(target,before,target.hp,{heal:target.hp-before,attacker,skill:meta.skill,actionKey:meta.actionKey});
  }

  function resolveCoreDamage(attacker,target,skill,effect,meta={}) {
    const relation=relativeAttackType(attacker,target);
    let hit=true,chance=100;
    if (effect.hitCheck!==false) {
      const roll=rollHit(attacker,target,{...skill,hitMod:Number(skill.hitMod||0)+Number(effect.hitMod||0)});
      hit=roll.hit;chance=roll.chance;
    }
    const relationLabel={front:'正面',side:'侧击',back:'背击'}[relation];
    if (!hit) {
      log(`  → ${target.name} · ${relationLabel}；命中判定失败（${chance.toFixed(0)}%）。`);
      return {hit:false,crit:false,damage:0,hpDamage:0,absorbed:0,target};
    }

    const rolled=calcDamage(attacker,target,skill,relation,effect);
    const result=applyRawDamage(target,rolled.damage);
    log(`  → ${target.name} · ${relationLabel}${rolled.crit?'·暴击':''}；造成 ${result.hpDamage} 伤害${result.absorbed?`（护盾吸收${result.absorbed}）`:''}；HP ${result.beforeHp} → ${result.afterHp}。`);

    const evt={
      actor:attacker,attacker,target,skill,hit:true,crit:rolled.crit,
      damage:result.hpDamage,rawDamage:result.rawDamage,absorbed:result.absorbed,
      relation,actionKey:meta.actionKey||null,centerX:meta.centerX,centerY:meta.centerY
    };
    emitBattleEvent('attack_hit',evt);
    if (rolled.crit) emitBattleEvent('attack_crit',evt);
    emitResolvedDamage(target,result,{attacker,actionKey:meta.actionKey,damageKind:'skill',skill});

    return {hit:true,crit:rolled.crit,damage:result.hpDamage,hpDamage:result.hpDamage,absorbed:result.absorbed,target};
  }

  function resolveCoreObstacleDamage(attacker,obstacle,skill,effect) {
    const variance=0.94+rng()*0.12;
    const mult=Number(effect.multiplier ?? primaryDamageEffect(skill)?.multiplier ?? skill.multiplier ?? 1);
    const damage=Math.max(1,Math.round(effectiveStat(attacker,'attack')*mult*variance));
    const before=obstacle.hp;
    obstacle.hp=Math.max(0,obstacle.hp-damage);
    log(`  → 命中障碍「${obstacle.name}」，造成 ${damage} 伤害；HP ${before} → ${obstacle.hp}。`);
    if (obstacle.hp<=0) {
      obstacle.destroyed=true;
      log(`  → 障碍「${obstacle.name}」被破坏，所在格恢复通行。`);
    }
  }

  function executeSkillCoreEffects(attacker,skill,centerX,centerY,actionKey) {
    const effects=skillCoreEffects(skill);
    const snapshot=coreAreaSnapshot(attacker,centerX,centerY,skill);
    const hitResults=new Map();
    let totalHpDamage=0;

    for (const effect of effects) {
      if (effect.type==='damage') {
        for (const target of actorsForCoreEffect(attacker,snapshot,effect)) {
          if (!target.alive) continue;
          const result=resolveCoreDamage(attacker,target,skill,effect,{actionKey,centerX,centerY});
          hitResults.set(target.id,result);
          totalHpDamage+=Number(result.hpDamage||0);
        }
        if (effect.affectsObstacles!==false) {
          for (const obstacle of snapshot.obstacles) if (!obstacle.destroyed) resolveCoreObstacleDamage(attacker,obstacle,skill,effect);
        }
      } else if (effect.type==='heal') {
        for (const target of actorsForCoreEffect(attacker,snapshot,effect)) {
          if (!target.alive) continue;
          const base=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
          healActor(target,base,{label:`「${skill.name}」`,actionKey,attacker});
        }
      } else if (effect.type==='apply_status') {
        for (const target of actorsForCoreEffect(attacker,snapshot,effect)) {
          if (!target.alive) continue;
          if (effect.requiresHit && !hitResults.get(target.id)?.hit) continue;
          applyStatus(attacker,target,effect.statusId,{
            stacks:Number(effect.stacks||1),chance:effect.chance,
            durationTurns:effect.durationTurns,durationType:effect.durationType
          },{actionKey,skill});
        }
      } else if (effect.type==='push' || effect.type==='pull') {
        for (const target of actorsForCoreEffect(attacker,snapshot,effect)) {
          if (!target.alive || target.id===attacker.id) continue;
          if (effect.requiresHit!==false && !hitResults.get(target.id)?.hit) continue;
          forcedMoveActor(target,attacker,effect.type,Number(effect.distance||1),{actionKey,skill,centerX,centerY});
        }
      } else if (effect.type==='move_self') {
        forcedMoveActor(attacker,attacker,'toward_cast',Number(effect.distance||1),{actionKey,skill,centerX,centerY});
      } else if (effect.type==='swap_position') {
        const target=actorsForCoreEffect(attacker,snapshot,effect)[0];
        if (target && (!effect.requiresHit || hitResults.get(target.id)?.hit)) swapActorPositions(attacker,target,`因「${skill.name}」换位`);
      } else if (effect.type==='teleport_behind') {
        const target=actorsForCoreEffect(attacker,snapshot,effect)[0];
        if (target && (!effect.requiresHit || hitResults.get(target.id)?.hit)) teleportBehind(attacker,target,{actionKey});
      } else if (effect.type==='lifesteal') {
        const value=Math.max(0,totalHpDamage*Number(effect.value||0)/100);
        healActor(attacker,value,{label:`「${skill.name}」吸血`,actionKey,attacker});
      } else if (effect.type==='shield') {
        for (const target of actorsForCoreEffect(attacker,snapshot,effect)) {
          const amount=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
          addShield(target,amount,effect.duration||{type:'turns',turns:Number(effect.durationTurns||1)},`「${skill.name}」`);
        }
      } else if (effect.type==='summon_unit') {
        summonUnit(attacker,effect,centerX,centerY,{actionKey});
      } else if (effect.type==='summon_object') {
        summonGroundObject(attacker,effect,centerX,centerY,{actionKey});
      }
    }
  }

  function castAttackAt(attacker, centerX, centerY, skill) {
    if (!attacker.alive) return false;
    const controlBlock=skillControlBlockReason(attacker,skill);
    if (controlBlock) { log(`${attacker.name} 因「${controlBlock}」无法使用「${skill.name}」。`); return false; }
    if (attacker.qi < skill.qiCost) { log(`${attacker.name} 真气不足，无法使用「${skill.name}」。`); return false; }
    const cd = attacker.cooldowns[skill.id] || 0;
    if (cd > 0) { log(`「${skill.name}」仍在冷却（${cd}）。`); return false; }
    if (!isCastTileAllowed(attacker, centerX, centerY, skill)) return false;

    setFacingToward(attacker, centerX, centerY);
    attacker.qi -= skill.qiCost;
    if (skill.cooldown > 0) attacker.cooldowns[skill.id] = skill.cooldown + 1;

    const actionKey=`attack:${state.actionIndex}:${++state.eventActionSeq}:${attacker.id}:${skill.id}`;
    emitBattleEvent('skill_used',{actor:attacker,target:attacker,skill,skillId:skill.id,actionKey,centerX,centerY});
    const previewActors=skillPreviewActors(attacker,centerX,centerY,skill);
    const obstacleTargets=skillPreviewObstacles(attacker,centerX,centerY,skill);
    const coveredNames=[...previewActors.map(t=>t.name),...obstacleTargets.map(o=>`障碍:${o.name}`)];
    const centerLabel=`(${centerX + 1},${centerY + 1})`;
    log(`${attacker.name} 面向${dirName(attacker.facing)}对格子 ${centerLabel} 使用「${skill.name}」${coveredNames.length?`，覆盖 ${coveredNames.join('、')}`:'（空放）'}。`);

    const effects=skillCoreEffects(skill);
    if (!effects.length) log(`  → 技能没有配置本体 Effect。`);
    else executeSkillCoreEffects(attacker,skill,centerX,centerY,actionKey);

    return true;
  }

  function attack(attacker, target, skill) {
    if (!target) return false;
    return castAttackAt(attacker, target.x, target.y, skill);
  }

  function resolveAttackOnTarget(attacker, target, skill, meta={}) {
    const hitRoll = rollHit(attacker, target, skill);
    const relationLabel = { front: '正面', side: '侧击', back: '背击' }[hitRoll.relation];
    if (!hitRoll.hit) {
      log(`  → ${relationLabel}；命中判定失败（${hitRoll.chance.toFixed(0)}%），攻击未命中。`);
      return;
    }

    const { damage, crit } = calcDamage(attacker, target, skill, hitRoll.relation);
    const before = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    log(`  → ${relationLabel}${crit ? '·暴击' : ''}；命中，造成 ${damage} 伤害；${target.name} HP ${before} → ${target.hp}。`);

    // 关键：attack_hit 绑定“实际命中的目标”，而不是玩家点击的技能中心格。
    // 因此 AOE 点空地但范围内命中敌人，也会正常触发攻击命中类天赋。
    const evt={
      actor:attacker,attacker,target,skill,
      hit:true,crit,damage,relation:hitRoll.relation,
      actionKey:meta.actionKey||null,
      centerX:meta.centerX,centerY:meta.centerY
    };
    emitBattleEvent('attack_hit',evt);
    if (crit) emitBattleEvent('attack_crit',evt);

    emitBattleEvent('damage_taken',{
      actor:target,target,attacker,skill,damage,crit,
      actionKey:meta.actionKey||null
    });
    emitHpEvents(target,before,target.hp,{
      attacker,damage,skill,actionKey:meta.actionKey||null
    });

    if (target.hp <= 0) {
      target.alive = false;
      log(`  → ${target.name} 失去战斗能力。`);
      emitBattleEvent('kill',{
        actor:attacker,attacker,target,skill,
        killed:true,actionKey:meta.actionKey||null
      });
    }
  }

  function resolveAttackOnObstacle(attacker, obstacle, skill, meta={}) {
    const variance = 0.94 + rng() * 0.12;
    const damage = Math.max(1, Math.round(effectiveStat(attacker,'attack') * (skill.multiplier || 1) * variance));
    const before = obstacle.hp;
    obstacle.hp = Math.max(0, obstacle.hp - damage);
    log(`  → 命中障碍「${obstacle.name}」，造成 ${damage} 伤害；HP ${before} → ${obstacle.hp}。`);
    if (obstacle.hp <= 0) {
      obstacle.destroyed = true;
      log(`  → 障碍「${obstacle.name}」被破坏，所在格恢复通行。`);
    }
  }


  function defend(actor) {
    actor.defending = true;
    log(`${actor.name} 面向${dirName(actor.facing)}选择【防御】，在下次行动前受到的伤害降低 ${Math.round(CONFIG.defenseReduction * 100)}%（暂定规则）。`);
    emitBattleEvent('defend',{actor,target:actor,actionKey:`turn:${state.actionIndex}`});
    settleAction(actor);
  }

  function rest(actor) {
    const hpGain = Math.round(actor.maxHp * CONFIG.restHpPct);
    const qiGain = Math.round(actor.maxQi * CONFIG.restQiPct);
    const hp0 = actor.hp, qi0 = actor.qi;
    actor.hp = Math.min(actor.maxHp, actor.hp + hpGain);
    actor.qi = Math.min(actor.maxQi, actor.qi + qiGain);
    log(`${actor.name} 面向${dirName(actor.facing)}选择【调息】：HP ${hp0} → ${actor.hp}；真气 ${qi0} → ${actor.qi}（恢复比例暂定）。`);
    emitHpEvents(actor,hp0,actor.hp,{heal:actor.hp-hp0,actionKey:`turn:${state.actionIndex}`});
    emitBattleEvent('rest',{actor,target:actor,hpRecovered:actor.hp-hp0,qiRecovered:actor.qi-qi0,actionKey:`turn:${state.actionIndex}`});
    settleAction(actor);
  }

  function useNeigong(actor, skill) {
    const controlBlock=skillControlBlockReason(actor,skill);
    if (controlBlock) { log(`${actor.name} 因「${controlBlock}」无法使用「${skill.name}」。`); return false; }
    if (actor.qi < skill.qiCost || (actor.cooldowns[skill.id] || 0) > 0) return false;
    actor.qi -= skill.qiCost;
    actor.cooldowns[skill.id] = skill.cooldown + 1;
    const actionKey=`skill:${state.actionIndex}:${++state.eventActionSeq}:${actor.id}:${skill.id}`;
    log(`${actor.name} 面向${dirName(actor.facing)}使用「${skill.name}」：真气 -${skill.qiCost}。`);
    emitBattleEvent('skill_used',{actor,target:actor,skill,skillId:skill.id,actionKey});
    settleAction(actor, skill);
    return true;
  }

  function qinggongMove(actor, x, y, skill) {
    const controlBlock=skillControlBlockReason(actor,skill);
    if (controlBlock) { log(`${actor.name} 因「${controlBlock}」无法使用「${skill.name}」。`); return false; }
    if (actor.qi < skill.qiCost || (actor.cooldowns[skill.id] || 0) > 0) return false;
    if (blockedAt(x, y, actor.id)) return false;
    if (Math.abs(actor.x - x) + Math.abs(actor.y - y) > skill.range) return false;
    const from = `(${actor.x + 1},${actor.y + 1})`;
    setFacingToward(actor, x, y);
    actor.x = x; actor.y = y;
    actor.qi -= skill.qiCost;
    actor.cooldowns[skill.id] = skill.cooldown + 1;
    const actionKey=`skill:${state.actionIndex}:${++state.eventActionSeq}:${actor.id}:${skill.id}`;
    emitBattleEvent('skill_used',{actor,target:actor,skill,skillId:skill.id,actionKey,x,y});
    log(`${actor.name} 使用「${skill.name}」，从 ${from} 位移至 (${x + 1},${y + 1})；真气 -${skill.qiCost}；行动后集气至少保留50%。`);
    state.actedThisTurn = true;
    finishTurn(actor, { minGauge: CONFIG.gaugeThreshold*0.5 });
    return true;
  }

  function normalMove(actor, x, y) {
    return stepMove(actor, x, y);
  }

  function undoMove(actor) {
    if (!actor || actor.team !== 'ally' || state.moveSpentThisTurn <= 0 || state.actedThisTurn || !state.turnSnapshot) return false;
    actor.x = state.turnSnapshot.x;
    actor.y = state.turnSnapshot.y;
    actor.facing = state.turnSnapshot.facing;
    state.moveSpentThisTurn = 0;
    state.moveHistoryThisTurn = [{x:actor.x,y:actor.y,facing:actor.facing}];
    state.movedThisTurn = false;
    state.mode = null;
    state.modeSkill = null;
    state.hoveredTile = null;
    if (state.lastMoveLogIndex !== null && state.logs[state.lastMoveLogIndex]) state.logs.splice(state.lastMoveLogIndex,1);
    state.lastMoveLogIndex = null;
    cancelModeBtn.disabled = true;
    turnHintEl.textContent = `${actor.name} 已悔棋，撤销本回合全部普通移动。`;
    renderAll();
    return true;
  }

  function undoOneMoveStep(actor) {
    if (!actor || actor.team !== 'ally' || state.moveSpentThisTurn <= 0 || state.actedThisTurn || state.moveHistoryThisTurn.length <= 1) return false;
    state.moveHistoryThisTurn.pop();
    state.moveSpentThisTurn -= 1;
    const prev = state.moveHistoryThisTurn[state.moveHistoryThisTurn.length-1];
    actor.x=prev.x; actor.y=prev.y; actor.facing=prev.facing;
    state.movedThisTurn = state.moveSpentThisTurn > 0;
    refreshMovementLog(actor);
    state.mode='move';
    cancelModeBtn.disabled=false;
    turnHintEl.textContent = `${actor.name} 撤销一步；剩余 ${remainingMove(actor)} 格。`;
    renderAll();
    return true;
  }

  // ==========================================================
  // v0.13 本地战术 AI
  // 不调用大模型。AI读取技能数据并给“技能+落点+移动位置”打分。
  // 因为评分过程不调用 rng()，真正结算仍只由 Battle Seed 决定。
  // ==========================================================
  function aiUsableCastSkills(actor) {
    return (actor.skills||[])
      .map(id=>SKILLS[id])
      .filter(skill =>
        skill &&
        skill.kind!=='qinggong' &&
        skill.castMask &&
        skillControlBlockReason(actor,skill)===null &&
        actor.qi>=Number(skill.qiCost||0) &&
        Number(actor.cooldowns[skill.id]||0)<=0 &&
        skillCoreEffects(skill).length>0
      );
  }

  function aiStatusValue(statusId,target) {
    const def=statusById(statusId);
    if (!def) return 8;
    const existing=(target.statuses||[]).find(s=>s.statusId===statusId);
    let value=def.polarity==='debuff'?18:12;

    const controls=new Set(def.controlTags||[]);
    if (controls.has('stun')) value+=70;
    if (controls.has('disarm')) value+=38;
    if (controls.has('root')) value+=28;
    if (controls.has('silence')) value+=28;

    for (const mod of (def.modifiers||[])) {
      const magnitude=Math.abs(Number(mod.value||0));
      value += mod.mode==='percent' ? magnitude*0.7 : magnitude*0.05;
    }

    if (existing) {
      if (Number(def.maxStacks||1)<=1) value*=0.25;
      else if (Number(existing.stacks||1)>=Number(def.maxStacks||1)) value*=0.35;
      else value*=0.75;
    }
    return value;
  }

  function aiExpectedDamage(actor,target,skill,effect) {
    const relation=relativeAttackType(actor,target);
    const base=baseDamageBeforeVariance(actor,target,skill,relation,effect?.multiplier??null);
    const chance=effect?.hitCheck===false?1:getHitChance(actor,target,skill).chance/100;
    const critChance=effect?.canCrit===false?0:clamp(effectiveStat(actor,'crit'),0,100)/100;
    const critFactor=1+critChance*(CONFIG.critMultiplier-1);
    return Math.max(0,base*chance*critFactor);
  }

  function aiCoreTargetsForScore(actor,snapshot,effect) {
    const targetType=effect.target||'enemies';
    if (targetType==='self') return [actor];
    return snapshot.actors.filter(a=>coreTargetMatches(actor,a,targetType));
  }

  function aiCoreEffectScore(actor,skill,effect,snapshot,centerX,centerY) {
    const targets=aiCoreTargetsForScore(actor,snapshot,effect);
    const missingHp=Math.max(0,actor.maxHp-actor.hp);
    let score=0;

    if (effect.type==='damage') {
      for (const target of targets) {
        if (!target.alive) continue;
        const expected=aiExpectedDamage(actor,target,skill,effect);
        score += expected/14;
        if (expected>=target.hp) score+=55;
        const rel=relativeAttackType(actor,target);
        if (rel==='back') score+=13;
        else if (rel==='side') score+=5;
      }
      if (effect.affectsObstacles!==false) {
        const blockers=snapshot.obstacles.filter(o=>o.blocksAttack!==false||o.blocksMovement!==false);
        score += blockers.length*2;
      }
    }
    else if (effect.type==='heal') {
      for (const target of targets) {
        const missing=Math.max(0,target.maxHp-target.hp);
        const amount=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
        score += Math.min(missing,Math.max(0,amount))/11;
        if (target.hp/target.maxHp<0.3) score+=18;
      }
    }
    else if (effect.type==='shield') {
      for (const target of targets) {
        const amount=effect.mode==='percent'?target.maxHp*Number(effect.value||0)/100:Number(effect.value||0);
        score += Math.max(0,amount)/18;
        if (target.hp/target.maxHp<0.4) score+=12;
      }
    }
    else if (effect.type==='apply_status') {
      for (const target of targets) {
        const relation=target.team===actor.team?'ally':'enemy';
        let v=aiStatusValue(effect.statusId,target)*(Number(effect.chance??100)/100);
        if (relation==='ally' && statusById(effect.statusId)?.polarity==='debuff') v*=-1;
        if (relation==='enemy' && statusById(effect.statusId)?.polarity==='buff') v*=-1;
        score+=v;
      }
    }
    else if (effect.type==='push'||effect.type==='pull') {
      score += targets.filter(t=>t.id!==actor.id).length * (7+Number(effect.distance||1)*3);
    }
    else if (effect.type==='swap_position') {
      const target=targets.find(t=>t.id!==actor.id);
      if (target) {
        const rel=relativeAttackType(actor,target);
        score+=rel==='back'?16:8;
      }
    }
    else if (effect.type==='teleport_behind') {
      const target=targets.find(t=>t.id!==actor.id);
      if (target) {
        const dest=behindCell(target);
        score += inBounds(dest.x,dest.y)&&!blockedAt(dest.x,dest.y,actor.id)?28:-15;
      }
    }
    else if (effect.type==='lifesteal') {
      if (missingHp>0) score += Math.min(25,missingHp/25) * Math.max(0,Number(effect.value||0))/20;
    }
    else if (effect.type==='move_self') {
      const nearest=aliveActors(actor.team==='enemy'?'ally':'enemy').sort((a,b)=>dist(actor,a)-dist(actor,b))[0];
      if (nearest) score+=Math.max(0,dist(actor,nearest)-Math.abs(centerX-nearest.x)-Math.abs(centerY-nearest.y))*4;
    }
    else if (effect.type==='summon_unit') {
      const found=actorTemplateAny(effect.templateRef,effect.templateTeam);
      if (found) {
        const t=found.template;
        score += 25 + Number(t.attack||0)/25 + Number(t.maxHp||0)/90;
      }
    }
    else if (effect.type==='summon_object') {
      score += 12;
      if (effect.blocksAttack===true) score+=10;
      if (effect.blocksMovement!==false) score+=6;
    }

    return score;
  }

  function aiCastScore(actor,skill,centerX,centerY) {
    if (!isCastTileAllowed(actor,centerX,centerY,skill)) return -Infinity;
    const snapshot=coreAreaSnapshot(actor,centerX,centerY,skill);
    let score=0;
    for (const effect of skillCoreEffects(skill)) {
      score += aiCoreEffectScore(actor,skill,effect,snapshot,centerX,centerY);
    }

    // 资源与冷却成本：不是禁止高耗技能，只避免无脑把绝招打在低价值目标上。
    score -= Number(skill.qiCost||0)*0.055;
    score -= Number(skill.cooldown||0)*0.8;
    score *= Math.max(0,Number(skill.aiWeight??1));

    // 没有覆盖任何人/障碍且也不是召唤技能时，显著降分。
    const hasIndependent=skillCoreEffects(skill).some(e=>['summon_unit','summon_object','move_self'].includes(e.type));
    if (!snapshot.actors.length && !snapshot.obstacles.length && !hasIndependent) score-=60;
    return score;
  }

  function aiLegalCastTiles(actor,skill) {
    const out=[];
    for (let y=0;y<CONFIG.boardSize;y++) for (let x=0;x<CONFIG.boardSize;x++) {
      if (isCastTileAllowed(actor,x,y,skill)) out.push({x,y});
    }
    return out;
  }

  function aiBestCast(actor) {
    let best=null;
    for (const skill of aiUsableCastSkills(actor)) {
      for (const tile of aiLegalCastTiles(actor,skill)) {
        const score=aiCastScore(actor,skill,tile.x,tile.y);
        const candidate={skill,x:tile.x,y:tile.y,score};
        if (!best ||
            candidate.score>best.score+1e-9 ||
            (Math.abs(candidate.score-best.score)<1e-9 && Number(skill.qiCost||0)<Number(best.skill.qiCost||0)) ||
            (Math.abs(candidate.score-best.score)<1e-9 && skill.id<best.skill.id)) {
          best=candidate;
        }
      }
    }
    return best;
  }

  function aiMoveAlongPath(actor,path) {
    if (!path || path.length<=1) return 0;
    let moved=0;
    for (const next of path.slice(1)) {
      if (!actor.alive || blockedAt(next.x,next.y,actor.id)) break;
      const from={x:actor.x,y:actor.y};
      actor.x=next.x; actor.y=next.y;
      actor.facing=facingFromStep(from,next,actor.facing);
      state.moveSpentThisTurn+=1;
      state.movedThisTurn=true;
      moved++;
      emitBattleEvent('move_step',{
        actor,target:actor,fromX:from.x,fromY:from.y,x:actor.x,y:actor.y,
        moveSpent:state.moveSpentThisTurn,actionKey:`turn:${state.actionIndex}`
      });
      if (actorHasControl(actor,'stun')||actorHasControl(actor,'root')) break;
    }
    if (moved) log(`${actor.name} 移动 ${moved} 格；路径：${pathText(path.slice(0,moved+1))}。`);
    return moved;
  }

  function aiBestMoveAndCast(actor) {
    const reachable=reachablePaths(actor,effectiveMove(actor));
    const ox=actor.x,oy=actor.y,of=actor.facing;
    let best={x:ox,y:oy,path:[{x:ox,y:oy}],cast:aiBestCast(actor),score:-Infinity};
    best.score=best.cast?.score??-Infinity;

    for (const [key,info] of reachable) {
      const [x,y]=key.split(',').map(Number);
      if (info.distance===0||blockedAt(x,y,actor.id)) continue;

      actor.x=x;actor.y=y;
      const cast=aiBestCast(actor);
      let score=(cast?.score??-Infinity)-info.distance*0.35;

      // 若仍不能出招，则至少靠近最近的敌人。
      if (!Number.isFinite(score)) {
        const foes=aliveActors(actor.team==='enemy'?'ally':'enemy');
        const nearest=foes.length?Math.min(...foes.map(t=>dist(actor,t))):99;
        score=-nearest*2-info.distance*0.2;
      }

      if (score>best.score) best={x,y,path:info.path,cast,score};
    }

    actor.x=ox;actor.y=oy;actor.facing=of;
    return best;
  }

  function aiTryQinggong(actor) {
    const skill=(actor.skills||[]).map(id=>SKILLS[id]).find(s=>
      s?.kind==='qinggong' &&
      actor.qi>=Number(s.qiCost||0) &&
      Number(actor.cooldowns[s.id]||0)<=0 &&
      !skillControlBlockReason(actor,s)
    );
    if (!skill) return false;

    const foes=aliveActors(actor.team==='enemy'?'ally':'enemy');
    if (!foes.length) return false;
    const nearest=foes.slice().sort((a,b)=>dist(actor,a)-dist(actor,b))[0];
    const before=dist(actor,nearest);
    let best=null;

    for (let y=0;y<CONFIG.boardSize;y++) for (let x=0;x<CONFIG.boardSize;x++) {
      if (blockedAt(x,y,actor.id)) continue;
      if (Math.abs(actor.x-x)+Math.abs(actor.y-y)>Number(skill.range||0)) continue;
      const d=Math.abs(x-nearest.x)+Math.abs(y-nearest.y);
      if (!best||d<best.d) best={x,y,d};
    }
    if (!best || best.d>=before) return false;
    return qinggongMove(actor,best.x,best.y,skill);
  }

  function aiTryUtility(actor) {
    // 当前特殊心法仍使用原有 useNeigong 入口；后续普通 Buff 技能只要拥有 castMask/coreEffects，
    // 已会自动进入 aiBestCast。
    const neigong=(actor.skills||[]).map(id=>SKILLS[id]).find(s=>s?.id==='neigong');
    if (neigong &&
        actor.qi>=Number(neigong.qiCost||0) &&
        Number(actor.cooldowns[neigong.id]||0)<=0 &&
        !skillControlBlockReason(actor,neigong) &&
        !(actor.statuses||[]).some(s=>s.statusId==='gathering')) {
      // 只有没有好攻击机会时才使用，避免见面先无脑聚气。
      return useNeigong(actor,neigong);
    }

    if (actor.hp/actor.maxHp<0.35 || actor.qi/Math.max(1,actor.maxQi)<0.12) {
      rest(actor);
      return true;
    }
    defend(actor);
    return true;
  }

  function enemyTurn(actor) {
    if (state.battleEnded || !actor.alive || currentActor()?.id!==actor.id) return;
    const foes=aliveActors(actor.team==='enemy'?'ally':'enemy');
    if (!foes.length) return;

    if (actorHasControl(actor,'stun')) {
      finishTurn(actor);
      return;
    }

    // 1. 先找“移动 + 释放技能”的最高评分方案。
    const plan=aiBestMoveAndCast(actor);
    if (plan && (plan.x!==actor.x||plan.y!==actor.y)) aiMoveAlongPath(actor,plan.path);

    // 移动途中可能触发状态/位移，所以到位后重新计算一次。
    const cast=aiBestCast(actor);
    if (cast && cast.score>0.5) {
      log(`【战术AI】${actor.name} 选择「${cast.skill.name}」，评分 ${cast.score.toFixed(1)}。`);
      const ok=castAttackAt(actor,cast.x,cast.y,cast.skill);
      if (ok) {
        state.actedThisTurn=true;
        finishTurn(actor);
        return;
      }
    }

    // 2. 普通移动后仍无合适技能，可尝试轻功继续接近。
    if (aiTryQinggong(actor)) return;

    // 3. 再无可用攻击时，选择心法 / 调息 / 防御。
    aiTryUtility(actor);
  }



  function setDirectionMode(actionId, skillId = null) {
    const actor = currentActor();
    if (!actor || actor.team !== 'ally' || (state.actedThisTurn && actionId !== 'endturn')) return;
    if (actionId==='neigong') {
      const reason=skillControlBlockReason(actor,SKILLS.neigong);
      if (reason) { turnHintEl.textContent=`${actor.name} ${reason}，无法使用「${SKILLS.neigong.name}」。`; renderActions(); return; }
    }
    state.mode = 'direction';
    state.modeSkill = skillId;
    state.pendingAction = actionId;
    state.hoveredTile = null;
    cancelModeBtn.disabled = false;
    turnHintEl.textContent = `「${directionActionLabel(actionId)}」：请选择结算后的朝向。可点击棋盘相邻方向，或使用方向按钮。`;
    renderBoard();
    renderActions();
  }

  function executeDirectionalAction(dir) {
    const actor = currentActor();
    if (!actor || actor.team !== 'ally' || state.mode !== 'direction' || !state.pendingAction) return false;

    const actionId = state.pendingAction;
    setFacing(actor, dir);

    // 清掉选择态，但不先render；具体行动函数会负责结束行动与刷新。
    state.mode = null;
    state.modeSkill = null;
    state.pendingAction = null;
    state.hoveredTile = null;
    cancelModeBtn.disabled = true;

    if (actionId === 'defend') {
      defend(actor);
      return true;
    }
    if (actionId === 'rest') {
      rest(actor);
      return true;
    }
    if (actionId === 'neigong') {
      return useNeigong(actor, SKILLS.neigong);
    }
    if (actionId === 'endturn') {
      log(`${actor.name} 调整为面向${dirName(actor.facing)}，结束行动。`);
      finishTurn(actor);
      return true;
    }
    return false;
  }

  function setMode(mode, skillId = null) {
    const actor = currentActor();
    if (!actor || actor.team !== 'ally') return;
    if (mode === 'move' && !canUseOrdinaryMove(actor)) return;
    if (mode !== 'move' && state.actedThisTurn) return;
    if ((mode==='attack'||mode==='qinggong') && skillId) {
      const skill=SKILLS[skillId], reason=skillControlBlockReason(actor,skill);
      if (reason) { turnHintEl.textContent=`${actor.name} ${reason}，无法使用「${skill?.name||skillId}」。`; renderActions(); return; }
    }
    state.mode = mode;
    state.modeSkill = skillId;
    state.pendingAction = null;
    state.hoveredTile = null;
    state.reachableCache = null;
    cancelModeBtn.disabled = false;
    if (mode === 'move') {
      const c = controlFieldCount(actor);
      turnHintEl.textContent = `逐格移动：剩余 ${remainingMove(actor)} 格${c?`（当前受${c}个控制领域牵制）`:''}；只能点相邻绿色空格。`;
    } else if (mode === 'qinggong') turnHintEl.textContent = `选择 ${SKILLS.qinggong.range} 格内空地施展轻功（可越过单位）。`;
    else if (mode === 'attack') turnHintEl.textContent = `选择「${SKILLS[skillId].name}」合法落点；障碍物会截断攻击射线，但障碍物自身所在格仍可选中攻击。`;
    renderBoard();
    renderActions();
  }

  function cancelMode() {
    state.mode = null;
    state.modeSkill = null;
    state.pendingAction = null;
    state.hoveredTile = null;
    state.reachableCache = null;
    cancelModeBtn.disabled = true;
    const actor = currentActor();
    turnHintEl.textContent = actor ? `${actor.name} 行动中。` : '时间轴流动中……';
    renderBoard();
    renderActions();
  }

  function onTileClick(x, y) {
    const actor = currentActor();
    if (!actor || actor.team !== 'ally' || state.battleEnded) return;

    if (state.mode === 'direction') {
      const dir = directionFromAdjacent(actor, x, y);
      if (dir) executeDirectionalAction(dir);
      return;
    }
    if (state.mode === 'move') {
      normalMove(actor, x, y);
      return;
    }
    if (state.mode === 'qinggong') {
      if (qinggongMove(actor, x, y, SKILLS.qinggong)) cancelMode();
      return;
    }
    if (state.mode === 'attack') {
      const skill = SKILLS[state.modeSkill];
      if (isCastTileAllowed(actor,x,y,skill) && castAttackAt(actor,x,y,skill)) {
        cancelMode();
        settleAction(actor, skill);
      }
    }
  }
  function currentEvacFor(actor) {
    if (!actor) return null;
    return state.evacPoints.find(e => e.x===actor.x && e.y===actor.y && e.allowedTeams.includes(actor.team)) || null;
  }

  function escapeActor(actor) {
    const evac = currentEvacFor(actor);
    if (!actor || !evac || actor.team !== 'ally' || state.actedThisTurn) return false;
    actor.escaped = true;
    log(`${actor.name} 从「${evac.name}」撤离战场。`, 'system');
    state.battleOutcome = 'evacuated';
    finishTurn(actor);
    return true;
  }


  function checkBattleEnd() {
    const allies = aliveActors('ally');
    const enemies = aliveActors('enemy');
    const escapedAllies = state.actors.filter(a => a.team==='ally' && a.escaped);
    const defeatedAllies = state.actors.filter(a => a.team==='ally' && !a.alive);

    if (allies.length && enemies.length) return false;

    let result = null;
    if (!enemies.length && allies.length) result = 'victory';
    else if (!allies.length && escapedAllies.length) result = 'evacuated';
    else if (!allies.length) result = 'defeat';
    else if (!enemies.length) result = 'victory';
    if (!result) return false;

    state.battleOutcome = result;
    state.battleEnded = true;
    state.gamePaused = true;
    const label = result==='victory' ? '我方胜利' : result==='evacuated' ? `撤离成功${defeatedAllies.length ? '（存在失能队员）' : ''}` : '我方败北';
    log(`\n【战斗结束】${label}。`, 'system');
    renderAll();
    showResult(result);
    notifyHost('battle-finished',{
      outcome:result,
      packet:buildBattlePacket(),
      narrativeLog:buildNarrativeLog(),
      collection:collectionForExport(),
      scene:sceneForExport()
    });
    return true;
  }


  function buildNarrativeLog() {
    return [
      '<BATTLE_NARRATIVE_LOG>',
      ...state.logs.map(x => x.text),
      '</BATTLE_NARRATIVE_LOG>'
    ].join('\n');
  }

  function buildBattlePacket() {
    const result = state.battleOutcome==='victory' ? '我方胜利' : state.battleOutcome==='evacuated' ? '我方撤离' : state.battleOutcome==='defeat' ? '我方败北' : '战斗进行中';
    const statusLines = state.actors.map(a => `- ${a.name}：${a.escaped ? '已撤离' : a.alive ? '存活' : '失去战斗能力'}；HP ${a.hp}/${a.maxHp}；护盾 ${totalShield(a)}；真气 ${a.qi}/${a.maxQi}；位置(${a.x + 1},${a.y + 1})；朝向${dirName(a.facing)}`);
    const obstacleLines = state.obstacles.map(o => `- ${o.name}：${o.destroyed || o.hp<=0 ? '已破坏' : '存在'}；HP ${o.hp}/${o.maxHp}；位置(${o.x+1},${o.y+1})`);
    return [
      '<BATTLE_RESULT>',
      `结果：${result}`,
      `Battle Seed：${state.seed}`,
      `有效行动节点：${state.actionIndex}`,
      '',
      '【最终状态】',
      ...statusLines,
      '',
      '【场景物件】',
      ...obstacleLines,
      '',
      '【不可修改事实 / 战斗过程】',
      ...state.logs.map(x => x.text),
      '',
      '写作约束：小游戏已经决定战斗事实。不得修改命中、伤害、位移、死亡/失能、技能使用与最终结果；可补充动作细节、环境、对白、心理与感官描写。',
      '</BATTLE_RESULT>'
    ].join('\n');
  }

  function showResult(result) {
    $('#resultTitle').textContent = result==='victory' ? '战斗胜利' : result==='evacuated' ? '撤离成功' : '战斗失败';
    $('#resultText').textContent = buildBattlePacket();
    if (!resultDialog.open) resultDialog.showModal();
  }

  function log(text, type = 'normal') {
    state.logs.push({ text, type, ts: Date.now() });
    if (state.logs.length > CONFIG.maxLogLines) state.logs.shift();
    renderLog();
    renderDataStatus();
  }

  function dirName(dir) { return ({N:'北',S:'南',E:'东',W:'西'})[dir] || dir; }
  function dirArrow(dir) { return ({N:'▲',S:'▼',E:'▶',W:'◀'})[dir] || '•'; }
  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

  function sanitizeScene(scene) {
    if (!scene || typeof scene !== 'object') throw new Error('场景文件不是有效对象');
    const out = deepClone(scene);
    out.schema = 'tavern-battle-scene';
    out.version = Number(out.version || 1);
    out.id = String(out.id || `scene-${Date.now()}`);
    out.name = String(out.name || '未命名场景');
    out.boardSize = clamp(Number(out.boardSize || 9), 5, 15);
    out.placements = Array.isArray(out.placements) ? out.placements : [];
    out.obstacles = Array.isArray(out.obstacles) ? out.obstacles : [];
    out.evacPoints = Array.isArray(out.evacPoints) ? out.evacPoints : [];
    for (const p of out.placements) {
      if (!['ally','enemy','neutral'].includes(p.team)) throw new Error(`未知阵营：${p.team}`);
      if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) throw new Error('存在无效初始位置');
    }
    for (const o of out.obstacles) {
      o.maxHp = Math.max(1,Number(o.maxHp ?? o.hp ?? 1));
      o.hp = Math.max(0,Number(o.hp ?? o.maxHp));
      o.blocksAttack = o.blocksAttack !== false;
      if (!o.name) o.name='障碍物';
    }
    return out;
  }

  function validateSceneRefs(scene, collection=state.collection) {
    const missing=[];
    for (const p of scene.placements || []) {
      if (p.actor) continue;
      if (!actorTemplateByRef.call(null,p.team,p.ref)) missing.push(`${p.team}:${p.ref}`);
    }
    if (missing.length) throw new Error(`场景引用的图鉴角色不存在：${missing.join('、')}`);
  }

  function applyScene(scene) {
    const clean = sanitizeScene(scene);
    // validate using current collection explicitly
    const missing=[];
    for (const p of clean.placements) {
      if (p.actor) continue;
      const bucket = p.team==='ally' ? state.collection?.allies : p.team==='enemy' ? state.collection?.enemies : state.collection?.neutrals;
      if (!bucket?.[p.ref]) missing.push(`${p.team}:${p.ref}`);
    }
    if (missing.length) throw new Error(`当前合集缺少：${missing.join('、')}`);
    state.scene = clean;
    const existing = state.collection.scenes || (state.collection.scenes=[]);
    const idx=existing.findIndex(s=>s.id===clean.id);
    if (idx>=0) existing[idx]=deepClone(clean); else existing.push(deepClone(clean));
    resetBattle(state.seed);
    renderDataStatus();
  }

  function sceneForExport() {
    return deepClone(state.scene || DEFAULT_SCENE);
  }

  function collectionForExport() {
    const c=deepClone(state.collection || makeDefaultCollection());
    const s=sceneForExport();
    c.scenes = Array.isArray(c.scenes) ? c.scenes : [];
    const idx=c.scenes.findIndex(x=>x.id===s.id);
    if (idx>=0)c.scenes[idx]=s; else c.scenes.push(s);
    return c;
  }

  function downloadJson(filename, data) {
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function renderDataStatus() {
    const c=state.collection || makeDefaultCollection(), s=state.scene || DEFAULT_SCENE;
    if (dataStatusEl) dataStatusEl.textContent=`${c.name || '未命名合集'} · ${s.name || '未命名场景'}`;
    $('#sceneNameText').textContent=s.name || '未命名场景';
    $('#obstacleCountText').textContent=String((s.obstacles||[]).length);
    $('#evacCountText').textContent=String((s.evacPoints||[]).length);
    $('#allyDexCount').textContent=String(Object.keys(c.allies||{}).length);
    $('#neutralDexCount').textContent=String(Object.keys(c.neutrals||{}).length);
    $('#enemyDexCount').textContent=String(Object.keys(c.enemies||{}).length);
    $('#boardTitle').textContent=`${CONFIG.boardSize} × ${CONFIG.boardSize} 战场 · ${s.name || '未命名场景'}`;
  }

  async function loadJsonFile(file) {
    return JSON.parse(await file.text());
  }

  async function importSceneFile(file) {
    const data=await loadJsonFile(file);
    applyScene(data);
    log(`【数据】已导入场景「${state.scene.name}」。`,'system');
  }

  function actorTemplateFromRuntime(a) {
    const copy=deepClone(a);
    for (const k of ['x','y','facing','gauge','cooldowns','buffs','statuses','ruleRuntime','talentRuntime','talentEffects','defending','turnCount','alive','escaped']) delete copy[k];
    return copy;
  }

  function newCollectionFromCurrent() {
    const name=prompt('新合集名称：','我的战斗合集');
    if (!name) return;
    const c={schema:'tavern-battle-collection',version:1,id:`collection-${Date.now()}`,name,allies:{},neutrals:{},enemies:{},skills:deepClone(state.collection?.skills||DEFAULT_SKILLS),equipment:deepClone(state.collection?.equipment||{}),talents:deepClone(state.collection?.talents||{}),statuses:deepClone(state.collection?.statuses||DEFAULT_STATUSES),rewardSettings:deepClone(state.collection?.rewardSettings||{talentChoices:3}),scenes:[sceneForExport()]};
    for (const a of state.actors) {
      const b=a.team==='ally'?c.allies:a.team==='enemy'?c.enemies:c.neutrals;
      b[a.id]=actorTemplateFromRuntime(a);
    }
    state.collection=c;
    // 当前 scene placements 继续引用相同 id
    renderDataStatus();
    log(`【数据】已新建合集「${name}」，并收录当前战斗角色与场景。`,'system');
  }

  function normalizeCollectionPackage(data) {
    if (!data || typeof data!=='object') throw new Error('合集数据无效');
    return {
      schema:'tavern-battle-collection',
      version:Number(data.version||1),
      id:String(data.id||`collection-${Date.now()}`),
      name:String(data.name||'导入合集'),
      allies:data.allies||{},
      neutrals:data.neutrals||{},
      enemies:data.enemies||{},
      skills:data.skills||JSON.parse(JSON.stringify(DEFAULT_SKILLS)),
      equipment:data.equipment||{},
      talents:data.talents||{},
      statuses:data.statuses||JSON.parse(JSON.stringify(DEFAULT_STATUSES)),
      rewardSettings:data.rewardSettings||{talentChoices:3},
      scenes:Array.isArray(data.scenes)?data.scenes:[]
    };
  }

  async function importCollectionFolder(files) {
    const c={schema:'tavern-battle-collection',version:1,id:`collection-${Date.now()}`,name:'导入合集',allies:{},neutrals:{},enemies:{},skills:{},equipment:{},talents:{},statuses:{},rewardSettings:{talentChoices:3},scenes:[]};
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.json')) continue;
      const rel=(file.webkitRelativePath||file.name).replace(/\\/g,'/');
      const data=await loadJsonFile(file);
      if (rel.endsWith('/collection.json') || rel==='collection.json') {
        if (data.name)c.name=data.name;
        if (data.id)c.id=data.id;
        continue;
      }
      if (rel.includes('/我方图鉴/')) c.allies[data.id || file.name.replace(/\.json$/i,'')]=data;
      else if (rel.includes('/敌方图鉴/')) c.enemies[data.id || file.name.replace(/\.json$/i,'')]=data;
      else if (rel.includes('/中立图鉴/')) c.neutrals[data.id || file.name.replace(/\.json$/i,'')]=data;
      else if (rel.endsWith('/scenes.json') || rel==='scenes.json') c.scenes=Array.isArray(data)?data:(data.scenes||[]);
      else if (rel.endsWith('/skills.json') || rel==='skills.json') c.skills=data.skills||data;
      else if (rel.endsWith('/equipment.json') || rel==='equipment.json') c.equipment=data.equipment||data;
      else if (rel.endsWith('/talents.json') || rel==='talents.json') c.talents=data.talents||data;
      else if (rel.endsWith('/statuses.json') || rel==='statuses.json') c.statuses=data.statuses||data;
      else if (rel.endsWith('/reward.json') || rel==='reward.json') c.rewardSettings=data.rewardSettings||data;
      else if (data.schema==='tavern-battle-scene') c.scenes.push(data);
      else if (data.schema==='tavern-battle-collection') {
        Object.assign(c, normalizeCollectionPackage(data));
      }
    }
    state.collection=normalizeCollectionPackage(c);
    if (state.collection.scenes.length) state.scene=sanitizeScene(state.collection.scenes[0]);
    else state.scene=deepClone(DEFAULT_SCENE);
    resetBattle(state.seed);
    renderDataStatus();
    log(`【数据】已导入合集「${state.collection.name}」：我方${Object.keys(state.collection.allies).length} / 中立${Object.keys(state.collection.neutrals).length} / 敌方${Object.keys(state.collection.enemies).length}。`,'system');
  }

  async function writeJsonFile(dirHandle, name, data) {
    const handle=await dirHandle.getFileHandle(name,{create:true});
    const writable=await handle.createWritable();
    await writable.write(JSON.stringify(data,null,2));
    await writable.close();
  }

  async function saveCollectionToDirectory() {
    const c=collectionForExport();
    if (!window.showDirectoryPicker) {
      downloadJson(`${c.name}.collection.json`,c);
      alert('当前浏览器不支持直接写入文件夹，已改为导出单个合集 JSON。Chrome / Edge 可使用“保存合集文件夹”。');
      return;
    }
    const root=await window.showDirectoryPicker({mode:'readwrite'});
    await writeJsonFile(root,'collection.json',{schema:c.schema,version:c.version,id:c.id,name:c.name});
    await writeJsonFile(root,'scenes.json',c.scenes||[]);
    await writeJsonFile(root,'skills.json',c.skills||{});
    await writeJsonFile(root,'equipment.json',c.equipment||{});
    await writeJsonFile(root,'talents.json',c.talents||{});
    await writeJsonFile(root,'statuses.json',c.statuses||{});
    await writeJsonFile(root,'reward.json',c.rewardSettings||{talentChoices:3});
    const groups=[['我方图鉴',c.allies||{}],['中立图鉴',c.neutrals||{}],['敌方图鉴',c.enemies||{}]];
    for (const [folder,items] of groups) {
      const dir=await root.getDirectoryHandle(folder,{create:true});
      for (const [id,item] of Object.entries(items)) await writeJsonFile(dir,`${id}.json`,item);
    }
    log(`【数据】合集「${c.name}」已保存到所选文件夹。`,'system');
  }


  function renderTimeline() {
    timelineEl.innerHTML = state.actors.filter(a => a.alive && !a.escaped && (a.team==='ally'||a.team==='enemy')).map(a => {
      const ready = a.gauge >= CONFIG.gaugeThreshold;
      return `<div class="timeline-row ${ready ? 'ready' : ''}">
        <div class="timeline-name">${a.team === 'ally' ? '◆' : '◇'} ${a.name}</div>
        <div class="gauge"><i style="width:${clamp(a.gauge,0,100)}%"></i></div>
        <div class="timeline-value">${a.gauge.toFixed(1)} / ${effectiveQiSpeed(a).toFixed(0)}</div>
      </div>`;
    }).join('');
  }

  function tileModeClass(x, y) {
    const actor = currentActor();
    if (!actor || actor.team !== 'ally') return '';
    const classes = [];
    const occ = actorAt(x, y);
    const obstacle = obstacleAt(x, y);
    const d = Math.abs(actor.x - x) + Math.abs(actor.y - y);
    if (state.mode === 'direction' && d === 1) classes.push('direction-choice');
    if (state.mode === 'move') {
      const adjacent = Math.abs(actor.x-x)+Math.abs(actor.y-y)===1;
      if (!occ && !obstacle && adjacent && remainingMove(actor)>0) classes.push('moveable','step-moveable');
    }
    if (state.mode === 'qinggong' && !occ && !obstacle && d <= SKILLS.qinggong.range && d>0) classes.push('moveable');
    if (state.mode === 'attack') {
      const skill = SKILLS[state.modeSkill];
      if (isCastTileAllowed(actor,x,y,skill)) {
        classes.push('skill-range','targetable');
      } else if (isWithinCastMask(actor.x,actor.y,x,y,skill)) {
        classes.push('skill-blocked');
      }
    }
    return classes.join(' ');
  }

  function clearPreviews() {
    boardEl.querySelectorAll('.tile.aoe-preview,.tile.path-preview,.tile.path-destination,.tile.will-hit').forEach(t=>t.classList.remove('aoe-preview','path-preview','path-destination','will-hit'));
  }

  function updateMovePathPreview() {
    // 玩家普通移动已改为逐格即时执行，不再自动预览最短路。
  }

  function updateAttackPreview(centerX = null, centerY = null) {
    boardEl.querySelectorAll('.tile.aoe-preview,.tile.will-hit').forEach(t => t.classList.remove('aoe-preview','will-hit'));
    if (state.mode !== 'attack' || centerX === null || centerY === null) return;
    const actor = currentActor(), skill = SKILLS[state.modeSkill];
    if (!actor || !skill || !isCastTileAllowed(actor,centerX,centerY,skill)) return;
    for (const p of effectTiles(actor,centerX,centerY,skill)) {
      const tile=boardEl.querySelector(`.tile[data-x="${p.x}"][data-y="${p.y}"]`);
      if (tile) {
        tile.classList.add('aoe-preview');
        const unit=actorAt(p.x,p.y);
        const obstacle=obstacleAt(p.x,p.y);
        const unitIds=new Set(skillPreviewActors(actor,centerX,centerY,skill).map(a=>a.id));
        const obstacleIds=new Set(skillPreviewObstacles(actor,centerX,centerY,skill).map(o=>o.id));
        if ((unit && unitIds.has(unit.id)) || (obstacle && obstacleIds.has(obstacle.id))) tile.classList.add('will-hit');
      }
    }
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${CONFIG.boardSize}, minmax(0, 1fr))`;
    boardEl.style.gridTemplateRows = `repeat(${CONFIG.boardSize}, minmax(0, 1fr))`;
    const cur = currentActor();
    for (let y = 0; y < CONFIG.boardSize; y++) {
      for (let x = 0; x < CONFIG.boardSize; x++) {
        const tile = document.createElement('button');
        tile.className = `tile ${tileModeClass(x, y)}`;
        tile.dataset.x = x; tile.dataset.y = y;
        const unit = actorAt(x, y);
        const obstacle = obstacleAt(x, y);
        const evac = evacAt(x, y);
        if (evac) {
          tile.classList.add('evac-point');
          tile.title = `${evac.name}\n允许撤离：${evac.allowedTeams.join('、')}`;
        }
        if (cur && cur.x === x && cur.y === y) tile.classList.add('current');
        if (obstacle) {
          tile.classList.add('has-obstacle');
          if (obstacle.kind==='ground') tile.classList.add('ground-object');
          const hpP = pct(obstacle.hp, obstacle.maxHp);
          tile.innerHTML = `<div class="obstacle-unit ${obstacle.kind==='ground'?'ground':''}"><span class="obstacle-name">${obstacle.name}</span><span class="hp-mini"><i style="width:${hpP}%"></i></span></div>`;
          tile.title = `${obstacle.name}\n${obstacle.kind==='ground'?'地面物':'障碍物'} HP ${obstacle.hp}/${obstacle.maxHp}\n阻挡移动：${obstacle.blocksMovement===false?'否':'是'}\n阻断攻击：${obstacle.blocksAttack===false?'否':'是'}${obstacle.durationTurns>0?`\n剩余持续：${obstacle.durationTurns}个召唤者回合`:''}`;
        }
        if (unit) {
          const hpP = pct(unit.hp, unit.maxHp);
          tile.innerHTML += `<div class="unit ${unit.team}"><span class="facing">${dirArrow(unit.facing)}</span>${unit.short}<span class="hp-mini"><i style="width:${hpP}%"></i></span></div>`;
          tile.title = `${unit.name}\nHP ${unit.hp}/${unit.maxHp}\n真气 ${unit.qi}/${unit.maxQi}\n集气速率 ${effectiveQiSpeed(unit).toFixed(0)}\n朝向 ${dirName(unit.facing)}`;
        }
        if (cur && state.mode === 'direction') {
          const dir = directionFromAdjacent(cur, x, y);
          if (dir) {
            const marker = document.createElement('span');
            marker.className = 'direction-marker'; marker.textContent = dirArrow(dir); marker.title = `面向${dirName(dir)}`;
            tile.appendChild(marker);
          }
        }
        tile.addEventListener('click', () => onTileClick(x, y));
        tile.addEventListener('mouseenter', () => {
          state.hoveredTile={x,y};
          if (state.mode==='attack') { updateAttackPreview(x,y); renderSkillDetail(); }
          if (state.mode==='move') updateMovePathPreview(x,y);
        });
        tile.addEventListener('mouseleave', () => {
          state.hoveredTile=null;
          if (state.mode==='attack') { updateAttackPreview(); renderSkillDetail(); }
          if (state.mode==='move') updateMovePathPreview();
        });
        boardEl.appendChild(tile);
      }
    }
    if (state.hoveredTile) {
      if (state.mode==='attack') updateAttackPreview(state.hoveredTile.x,state.hoveredTile.y);
      if (state.mode==='move') updateMovePathPreview(state.hoveredTile.x,state.hoveredTile.y);
    }
  }

  function renderActorCard() {
    const a = currentActor();
    if (!a) {
      actorCardEl.className = 'actor-card empty';
      actorCardEl.textContent = state.manualPaused ? '时间轴已暂停' : '尚未轮到任何角色';
      return;
    }
    actorCardEl.className = 'actor-card';
    const legacyBuffs = a.buffs.length ? a.buffs.map(b => `${b.name}(${b.turns})`) : [];
    const statusBuffs=(a.statuses||[]).map(s=>{
      const d=statusById(s.statusId);
      if(!d) return `<span class="status-chip">${s.statusId}</span>`;
      const tags=[...(d.tags||[]),...(d.controlTags||[])].join(', ')||'无';
      const title=`${d.name}\n${d.description||''}\n层数 ${s.stacks}/${d.maxStacks||1}\n标签：${tags}${s.durationType==='turns'?`\n剩余 ${s.remainingTurns} 回合`:''}`;
      return `<span class="status-chip ${d.polarity==='debuff'?'debuff':'buff'}" title="${title.replace(/"/g,'&quot;')}"><i>${d.icon||(d.polarity==='debuff'?'↓':'↑')}</i>${d.name}${s.stacks>1?`×${s.stacks}`:''}${s.durationType==='turns'?` · ${s.remainingTurns}`:''}</span>`;
    });
    const buffs=legacyBuffs.map(x=>`<span class="status-chip buff">${x}</span>`).concat(statusBuffs).join('')||'<span class="muted">无</span>';
    const moveNow = effectiveMove(a), control = controlFieldCount(a);
    const moveRemain = a.team === 'ally' ? remainingMove(a) : moveNow;
    actorCardEl.innerHTML = `
      <div class="actor-name-row"><span class="actor-name">${a.name}</span><span class="team-tag">${a.team === 'ally' ? '我方' : a.team === 'enemy' ? '敌方' : '中立'} · 朝向${dirName(a.facing)}</span></div>
      <div class="bars">
        <div class="bar-row"><span>HP</span><span class="meter hp"><i style="width:${pct(a.hp,a.maxHp)}%"></i></span><span>${a.hp}/${a.maxHp}</span></div>
        <div class="bar-row"><span>护盾</span><span class="meter shield"><i style="width:${pct(totalShield(a),Math.max(1,a.maxHp))}%"></i></span><span>${totalShield(a)}</span></div>
        <div class="bar-row"><span>真气</span><span class="meter qi"><i style="width:${pct(a.qi,a.maxQi)}%"></i></span><span>${a.qi}/${a.maxQi}</span></div>
        <div class="bar-row"><span>集气</span><span class="meter gas"><i style="width:${clamp(a.gauge,0,100)}%"></i></span><span>${a.gauge.toFixed(1)}/100</span></div>
      </div>
      <div class="stats">
        <div class="stat-line"><span>攻击</span><b>${Math.round(effectiveStat(a,'attack'))}</b></div><div class="stat-line"><span>防御</span><b>${Math.round(effectiveStat(a,'defense'))}</b></div>
        <div class="stat-line"><span>集气速率</span><b>${effectiveQiSpeed(a).toFixed(0)}</b></div><div class="stat-line"><span>移动</span><b>${a.team==='ally'?`${moveRemain}剩余 / ${moveNow}上限`:moveNow}${control ? `（牵制-${a.move-moveNow}）` : ''}</b></div>
        <div class="stat-line"><span>暴击</span><b>${effectiveStat(a,'crit').toFixed(0)}%</b></div><div class="stat-line"><span>闪避</span><b>${effectiveStat(a,'dodge').toFixed(0)}%</b></div>
        <div class="stat-line"><span>状态抗性</span><b>${effectiveStat(a,'statusResist').toFixed(0)}%</b></div><div class="stat-line"><span>免疫标签</span><b>${(a.immunities||[]).join(' / ')||'无'}</b></div>
      </div>
      <div class="status-chip-row"><span class="muted">状态：</span>${buffs}</div>`;
  }

  function actionButton(label, subtitle, cls, disabled, handler) {
    const b = document.createElement('button');
    b.className = `action-btn ${cls || ''}`;
    b.disabled = !!disabled;
    b.innerHTML = `${label}${subtitle ? `<small>${subtitle}</small>` : ''}`;
    b.addEventListener('click', handler);
    actionsEl.appendChild(b);
  }

  function renderSkillDetail() {
    const actor = currentActor();
    const skill = state.modeSkill ? SKILLS[state.modeSkill] : null;
    if (!actor || actor.team !== 'ally') { skillDetailEl.className='skill-detail empty'; skillDetailEl.textContent='选择技能后显示技能数据'; return; }

    if (!skill && state.mode === 'direction' && state.pendingAction) {
      const info={
        defend:{name:'防御',desc:`受到伤害降低 ${Math.round(CONFIG.defenseReduction*100)}%，持续至下次自身行动。`},
        rest:{name:'调息',desc:`恢复约 ${Math.round(CONFIG.restHpPct*100)}% 最大气血与 ${Math.round(CONFIG.restQiPct*100)}% 最大真气（Demo暂定）。`},
        endturn:{name:'结束行动',desc:'不使用招式，仅调整朝向后结束本次行动。'}
      }[state.pendingAction];
      if (info) { skillDetailEl.className='skill-detail'; skillDetailEl.innerHTML=`<div class="skill-detail-name">${info.name}</div><div class="skill-detail-desc">${info.desc}</div><div class="skill-detail-tip">先选择最终朝向，再正式结算。</div>`; return; }
    }
    if (!skill) { skillDetailEl.className='skill-detail empty'; skillDetailEl.textContent='选择技能后显示技能数据'; return; }

    const kindLabel={attack:'攻击招式',qinggong:'轻功',buff:'心法'}[skill.kind]||skill.kind;
    const cdNow=actor.cooldowns[skill.id]||0;
    const rangeText=skill.kind==='attack'?maskLabel(skill.castMask):`${skill.range ?? 0} 格`;
    const aoeText=skill.kind==='attack'?maskLabel(skill.effectMask):'—';
    const damageEffect=primaryDamageEffect(skill);
    const multText=skill.kind==='attack'&&damageEffect?`${Number(damageEffect.multiplier??skill.multiplier??1).toFixed(2)}×`:'—';
    const hitText=skill.kind==='attack'?`${skill.hitMod>=0?'+':''}${skill.hitMod||0}%`:'—';

    let preview='';
    if (skill.kind==='attack' && state.mode==='attack' && state.hoveredTile && isCastTileAllowed(actor,state.hoveredTile.x,state.hoveredTile.y,skill)) {
      const targets=skillPreviewActors(actor,state.hoveredTile.x,state.hoveredTile.y,skill);
      const obsTargets=skillPreviewObstacles(actor,state.hoveredTile.x,state.hoveredTile.y,skill);
      const damageEff=primaryDamageEffect(skill);
      if (!targets.length && !obsTargets.length) preview='<div class="preview-box"><div class="preview-title">落点预览</div><div class="muted">空放：作用范围内没有本体 Effect 的有效目标。</div></div>';
      else {
        const actorRows=targets.map(t=>{
          if (damageEff && coreTargetMatches(actor,t,damageEff.target||'enemies')) {
            const h=getHitChance(actor,t,skill),d=damagePreview(actor,t,skill,h.relation,damageEff),rel={front:'正面',side:'侧击',back:'背击'}[h.relation];
            return `<div class="preview-row"><span>${t.name} · ${rel} · 命中${damageEff.hitCheck===false?'100':h.chance.toFixed(0)}%</span><b>${d.min}~${d.max}${d.crit?` · 暴击${d.crit}%`:''}</b></div>`;
          }
          const names=skillCoreEffects(skill).filter(e=>coreTargetMatches(actor,t,e.target||'enemies')).map(e=>coreEffectName(e.type)).join(' / ');
          return `<div class="preview-row"><span>${t.name}</span><b>${names||'受影响'}</b></div>`;
        }).join('');
        const obstacleRows=obsTargets.map(o=>`<div class="preview-row"><span>障碍 · ${o.name}</span><b>HP ${o.hp}/${o.maxHp}</b></div>`).join('');
        preview=`<div class="preview-box"><div class="preview-title">技能本体预览</div>${actorRows}${obstacleRows}</div>`;
      }
    }

    skillDetailEl.className='skill-detail';
    skillDetailEl.innerHTML=`
      <div class="skill-detail-name">${skill.name}${skill.kind==='attack'?`<span class="mask-badge">Mask</span>`:''}</div>
      <div class="skill-detail-grid">
        <span>类型</span><b>${kindLabel}</b><span>释放范围</span><b>${rangeText}</b><span>作用范围</span><b>${aoeText}</b>
        <span>伤害倍率</span><b>${multText}</b><span>本体效果</span><b>${skillCoreEffects(skill).length} 个</b><span>真气消耗</span><b>${skill.qiCost||0}</b><span>冷却</span><b>${skill.cooldown||0}（当前 ${cdNow}）</b><span>命中修正</span><b>${hitText}</b>
      </div>
      <div class="skill-detail-desc">${skill.description||'暂无说明'}</div>
      ${skill.canMoveAfterAction?'<div class="skill-detail-tip">特殊：使用后可继续消耗本回合剩余普通移动力。</div>':''}
      ${skill.kind==='attack'?'<div class="skill-detail-tip">点击任意合法落点释放，可空放。障碍物会截断攻击射线，但可以直接选择并破坏障碍物本身。</div>':''}
      ${preview}`;
  }

  function renderActions() {
    actionsEl.innerHTML = '';
    const a = currentActor();
    if (!a || a.team !== 'ally' || state.battleEnded) {
      actionButton('等待时间轴', '', '', true, () => {});
      cancelModeBtn.disabled = true;
      renderSkillDetail();
      return;
    }

    if (state.mode === 'direction' && state.pendingAction) {
      const label = directionActionLabel(state.pendingAction);
      const note=document.createElement('div'); note.className='direction-note'; note.textContent=`「${label}」尚未结算，请选择最终朝向：`; actionsEl.appendChild(note);
      actionButton('▲ 北', a.facing==='N'?'当前朝向':'', 'utility', false, ()=>executeDirectionalAction('N'));
      actionButton('▶ 东', a.facing==='E'?'当前朝向':'', 'utility', false, ()=>executeDirectionalAction('E'));
      actionButton('▼ 南', a.facing==='S'?'当前朝向':'', 'utility', false, ()=>executeDirectionalAction('S'));
      actionButton('◀ 西', a.facing==='W'?'当前朝向':'', 'utility', false, ()=>executeDirectionalAction('W'));
      renderSkillDetail();
      return;
    }

    const moveNow = effectiveMove(a), control = controlFieldCount(a), moveRemain = remainingMove(a);
    const moveNote=document.createElement('div');
    moveNote.className='move-state-note';
    moveNote.innerHTML=`普通移动：剩余 <b>${moveRemain}</b> 格 / 当前上限 <b>${moveNow}</b> 格；本回合已走 <b>${state.moveSpentThisTurn}</b> 格。`;
    actionsEl.appendChild(moveNote);
    actionButton('移动',moveRemain>0?`逐格移动 · 剩余${moveRemain}`:'无剩余移动力','utility',!canUseOrdinaryMove(a),()=>setMode('move'));
    actionButton('退一步','撤销最后1格移动','utility',state.moveSpentThisTurn<=0||state.actedThisTurn,()=>undoOneMoveStep(a));
    actionButton('悔棋','撤销本回合全部普通移动','utility',state.moveSpentThisTurn<=0||state.actedThisTurn,()=>undoMove(a));
    const evac = currentEvacFor(a);
    if (evac) actionButton('撤离', `从「${evac.name}」离开战场`, 'escape', state.actedThisTurn, ()=>escapeActor(a));
    for (const id of a.skills) {
      const s=SKILLS[id];
      if (s.kind==='attack') {
        const cd=a.cooldowns[id]||0, block=skillControlBlockReason(a,s);
        const disabled=state.actedThisTurn||cd>0||a.qi<s.qiCost||!!block;
        actionButton(s.name,block?block:`真气${s.qiCost} · CD${cd||0}`,'skill',disabled,()=>setMode('attack',id));
      }
    }
    if (a.skills.includes('qinggong')) { const s=SKILLS.qinggong,cd=a.cooldowns.qinggong||0,block=skillControlBlockReason(a,s); actionButton(s.name,block?block:`真气${s.qiCost} · CD${cd||0}`,'utility',state.actedThisTurn||cd>0||a.qi<s.qiCost||!!block,()=>setMode('qinggong','qinggong')); }
    if (a.skills.includes('neigong')) { const s=SKILLS.neigong,cd=a.cooldowns.neigong||0,block=skillControlBlockReason(a,s); actionButton(s.name,block?block:`真气${s.qiCost} · CD${cd||0}`,'utility',state.actedThisTurn||cd>0||a.qi<s.qiCost||!!block,()=>setDirectionMode('neigong','neigong')); }
    actionButton('防御','选择朝向后结算','utility',state.actedThisTurn,()=>setDirectionMode('defend'));
    actionButton('调息','选择朝向后结算','utility',state.actedThisTurn,()=>setDirectionMode('rest'));
    actionButton('结束行动','可调整最终朝向','',false,()=>setDirectionMode('endturn'));
    renderSkillDetail();
  }

  function renderLog() {
    logEl.textContent = state.logs.map(x => x.text).join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderAll() {
    renderTimeline();
    renderBoard();
    renderActorCard();
    renderActions();
    renderLog();
  }

  function copyText(text, btn) {
    navigator.clipboard?.writeText(text).then(() => {
      const old = btn.textContent; btn.textContent = '已复制';
      setTimeout(() => btn.textContent = old, 900);
    }).catch(() => {
      prompt('浏览器禁止自动复制，请手动复制：', text);
    });
  }

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.speed = Number(btn.dataset.speed);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  $('#pauseBtn').addEventListener('click', () => {
    state.manualPaused = !state.manualPaused;
    $('#pauseBtn').textContent = state.manualPaused ? '继续' : '暂停';
    renderActorCard();
  });
  cancelModeBtn.addEventListener('click', cancelMode);
  $('#copyLogBtn').addEventListener('click', (e) => copyText(buildNarrativeLog(), e.currentTarget));
  $('#copyResultBtn').addEventListener('click', (e) => copyText(buildBattlePacket(), e.currentTarget));
  $('#restartBtn').addEventListener('click', () => resetBattle(state.seed));
  $('#sameSeedBtn').addEventListener('click', () => resetBattle(seedInput.value));
  $('#newSeedBtn').addEventListener('click', () => { const s=randomSeed(); seedInput.value=String(s); resetBattle(s); });
  seedInput.addEventListener('change', () => { seedInput.value=String(normalizeSeed(seedInput.value)); });


  $('#importSceneBtn').addEventListener('click',()=>sceneFileInput.click());
  sceneFileInput.addEventListener('change',async()=>{
    const file=sceneFileInput.files?.[0]; if(!file)return;
    try{await importSceneFile(file);}catch(err){alert(`导入场景失败：${err.message}`);}
    sceneFileInput.value='';
  });
  $('#exportSceneBtn').addEventListener('click',()=>downloadJson(`${(state.scene?.name||'scene').replace(/[\\/:*?"<>|]/g,'_')}.scene.json`,sceneForExport()));
  $('#newCollectionBtn').addEventListener('click',newCollectionFromCurrent);
  $('#importCollectionBtn').addEventListener('click',()=>collectionFolderInput.click());
  collectionFolderInput.addEventListener('change',async()=>{
    const files=[...(collectionFolderInput.files||[])]; if(!files.length)return;
    try{await importCollectionFolder(files);}catch(err){alert(`导入合集失败：${err.message}`);}
    collectionFolderInput.value='';
  });
  $('#saveCollectionBtn').addEventListener('click',()=>saveCollectionToDirectory().catch(err=>{
    if(err?.name!=='AbortError') alert(`保存合集失败：${err.message}`);
  }));
  $('#exportCollectionBtn').addEventListener('click',()=>{
    const c=collectionForExport();
    downloadJson(`${(c.name||'collection').replace(/[\\/:*?"<>|]/g,'_')}.collection.json`,c);
  });


  function notifyHost(type,payload={}) {
    if (window.parent===window) return;
    try {
      window.parent.postMessage({
        source:'tavern-battle-frame',
        type,
        payload
      }, window.location.origin);
    } catch (err) {
      console.warn('[TavernBattleFrame] notifyHost failed',err);
    }
  }

  const EMBED_MODE=new URLSearchParams(window.location.search).get('mode')||'standalone';
  if (EMBED_MODE!=='standalone') {
    document.body.classList.add('tb-embedded',`tb-embed-${EMBED_MODE}`);
  }

  // ---------- v0.7 外部/编辑器 API ----------
  window.BattleDemoAPI = {
    getCollection:()=>deepClone(collectionForExport()),
    getScene:()=>deepClone(sceneForExport()),
    getRuntimeState:()=>state,
    getBattlePacket:()=>buildBattlePacket(),
    getNarrativeLog:()=>buildNarrativeLog(),
    getOutcome:()=>state.battleOutcome,
    isBattleEnded:()=>!!state.battleEnded,
    setPaused:(value=true)=>{
      state.manualPaused=!!value;
      const btn=document.querySelector('#pauseBtn');
      if(btn) btn.textContent=state.manualPaused?'继续':'暂停';
      renderAll();
    },
    getSkills:()=>deepClone(state.collection?.skills||DEFAULT_SKILLS),
    getEquipment:()=>deepClone(state.collection?.equipment||{}),
    getTalents:()=>deepClone(state.collection?.talents||{}),
    getStatuses:()=>deepClone(state.collection?.statuses||{}),
    getActorTemplates:()=>deepClone({
      allies:state.collection?.allies||{},
      neutrals:state.collection?.neutrals||{},
      enemies:state.collection?.enemies||{}
    }),
    hasControl:(actorId,tag)=>actorHasControl(actorById(actorId),tag),

    replaceCollection(collection, sceneId=null) {
      state.collection=normalizeCollectionPackage(deepClone(collection));
      const chosen=sceneId
        ? state.collection.scenes.find(s=>s.id===sceneId)
        : state.collection.scenes[0];
      state.scene=sanitizeScene(chosen || DEFAULT_SCENE);
      resetBattle(state.seed);
      renderDataStatus();
      notifyHost('collection-loaded',{collection:collectionForExport()});
    },

    updateScene(scene, restart=true) {
      state.scene=sanitizeScene(deepClone(scene));
      const list=state.collection.scenes || (state.collection.scenes=[]);
      const idx=list.findIndex(s=>s.id===state.scene.id);
      if(idx>=0) list[idx]=deepClone(state.scene); else list.push(deepClone(state.scene));
      if(restart) resetBattle(state.seed); else renderDataStatus();
      notifyHost('collection-changed',{collection:collectionForExport()});
    },

    updateLibrary(kind, id, data, restart=false) {
      const map={
        ally:'allies', allies:'allies',
        neutral:'neutrals', neutrals:'neutrals',
        enemy:'enemies', enemies:'enemies',
        skill:'skills', skills:'skills',
        equipment:'equipment', talent:'talents', talents:'talents', status:'statuses', statuses:'statuses'
      };
      const bucketName=map[kind];
      if(!bucketName) throw new Error(`未知数据类型：${kind}`);
      const bucket=state.collection[bucketName] || (state.collection[bucketName]={});
      bucket[id]=deepClone({...data,id});
      if(restart) resetBattle(state.seed); else renderDataStatus();
      notifyHost('collection-changed',{collection:collectionForExport()});
    },

    deleteLibrary(kind,id,restart=false) {
      const map={ally:'allies',neutral:'neutrals',enemy:'enemies',skill:'skills',equipment:'equipment',talent:'talents',status:'statuses'};
      const bucket=state.collection[map[kind]];
      if(bucket) delete bucket[id];
      if(restart) resetBattle(state.seed); else renderDataStatus();
      notifyHost('collection-changed',{collection:collectionForExport()});
    },

    restart:()=>resetBattle(state.seed),

    generateTrigger(scene=state.scene) {
      const s=scene||DEFAULT_SCENE;
      const fmtPlacement=(team)=> (s.placements||[])
        .filter(p=>p.team===team)
        .map(p=>`${p.ref}${p.instanceId?`#${p.instanceId}`:''}@${Number(p.x)+1},${Number(p.y)+1},${p.facing||'N'}`)
        .join('; ');
      const obs=(s.obstacles||[]).map(o=>`${o.name}@${Number(o.x)+1},${Number(o.y)+1},${o.maxHp||o.hp||1}`).join('; ');
      const evac=(s.evacPoints||[]).map(e=>`${Number(e.x)+1},${Number(e.y)+1},${(e.allowedTeams||['ally']).join('+')}`).join('; ');
      return [
        '<BATTLE>',
        `合集=${state.collection?.name||'默认合集'}`,
        `场景=${s.name||'临时战斗'}`,
        `尺寸=${s.boardSize||9}`,
        `我方=${fmtPlacement('ally')}`,
        `中立=${fmtPlacement('neutral')}`,
        `敌方=${fmtPlacement('enemy')}`,
        `障碍=${obs}`,
        `撤离=${evac}`,
        `目标=${s.victory?.type||'eliminate-or-evacuate'}`,
        '</BATTLE>'
      ].join('\n');
    },

    parseTrigger(text) {
      const body=String(text||'').replace(/<\/?BATTLE(?:_TRIGGER)?>/gi,'').trim();
      const rows={};
      for(const raw of body.split(/\r?\n/)){
        const i=raw.indexOf('=');
        if(i<0) continue;
        rows[raw.slice(0,i).trim()]=raw.slice(i+1).trim();
      }
      const scene={
        schema:'tavern-battle-scene',version:1,
        id:`trigger-${Date.now()}`,
        name:rows['场景']||'临时战斗',
        boardSize:clamp(Number(rows['尺寸']||9),5,15),
        placements:[],obstacles:[],evacPoints:[],
        victory:{type:rows['目标']||'eliminate-or-evacuate'}
      };
      const parsePlacements=(label,team)=>{
        const items=(rows[label]||'').split(';').map(x=>x.trim()).filter(Boolean);
        for(const item of items){
          const m=item.match(/^([^@#]+)(?:#([^@]+))?@(\d+),(\d+),([NESW])$/i);
          if(!m) continue;
          scene.placements.push({
            team,ref:m[1].trim(),instanceId:m[2]?.trim()||undefined,
            x:Number(m[3])-1,y:Number(m[4])-1,facing:m[5].toUpperCase()
          });
        }
      };
      parsePlacements('我方','ally');
      parsePlacements('中立','neutral');
      parsePlacements('敌方','enemy');

      for(const item of (rows['障碍']||'').split(';').map(x=>x.trim()).filter(Boolean)){
        const m=item.match(/^([^@]+)@(\d+),(\d+),(\d+)$/);
        if(!m) continue;
        scene.obstacles.push({
          id:`obstacle-${scene.obstacles.length+1}`,name:m[1].trim(),
          x:Number(m[2])-1,y:Number(m[3])-1,maxHp:Number(m[4]),hp:Number(m[4]),blocksAttack:true
        });
      }
      for(const item of (rows['撤离']||'').split(';').map(x=>x.trim()).filter(Boolean)){
        const m=item.match(/^(\d+),(\d+),(.+)$/);
        if(!m) continue;
        scene.evacPoints.push({
          id:`evac-${scene.evacPoints.length+1}`,
          name:`撤离点${scene.evacPoints.length+1}`,
          x:Number(m[1])-1,y:Number(m[2])-1,
          allowedTeams:m[3].split('+').map(x=>x.trim()).filter(Boolean)
        });
      }
      return scene;
    },

    emitEvent:(type,payload={})=>emitBattleEvent(type,payload),
    effectiveStat:(actorId,stat)=>effectiveStat(actorById(actorId),stat),

    rollTalentChoices(count=3,seed=Date.now()) {
      const talents=Object.values(state.collection?.talents||{});
      const pool=talents.filter(t=>Number(t.weight??1)>0);
      const picked=[];
      let x=(Number(seed)||1)>>>0;
      const rnd=()=>{ x=(x+0x6D2B79F5)>>>0; let t=x; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
      const candidates=[...pool];
      while(candidates.length && picked.length<count){
        const total=candidates.reduce((s,t)=>s+Number(t.weight??1),0);
        let r=rnd()*total, idx=0;
        for(;idx<candidates.length;idx++){ r-=Number(candidates[idx].weight??1); if(r<=0) break; }
        picked.push(candidates.splice(Math.min(idx,candidates.length-1),1)[0]);
      }
      return deepClone(picked);
    }
  };

  state.collection=makeDefaultCollection();
  state.scene=deepClone(DEFAULT_SCENE);
  const initialSeed=randomSeed();
  seedInput.value=String(initialSeed);
  resetBattle(initialSeed);
  requestAnimationFrame(tick);

  setTimeout(()=>{
    notifyHost('frame-ready',{
      mode:EMBED_MODE,
      collection:collectionForExport(),
      scene:sceneForExport()
    });
  },0);

})();