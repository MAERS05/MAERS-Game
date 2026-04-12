/**
 * @file ui.js
 * @description 博弈战斗系统 — UI 交互层
 *
 * 职责：
 *  - 持有所有 DOM 引用
 *  - 监听用户输入并调用引擎公共 API
 *  - 订阅引擎事件，将状态变化映射到 DOM 更新
 *  - 不包含任何游戏逻辑，不直接修改引擎内部状态
 *
 * 扩展指南：
 *  - 新增 UI 组件：在 DOM 引用区添加引用，在对应事件处理器中更新
 *  - 新增效果项：由此文件的 renderEffectList() 函数动态生成，
 *    效果定义由外部数据层（effect/ 目录）提供
 */

'use strict';

import { BattleEngine } from './base/engine.js';
import {
  EngineEvent, EngineState, PlayerId, Action, ActionName,
  DefaultStats, TimerConfig, Phase, EngineMode,
  EffectId, EffectDefs, EFFECT_SLOTS,
} from './base/constants.js';

// ─── 常量 ─────────────────────────────────────────────
const RING_CIRC = 226.195; // 2π × 36（SVG 弧长）

// ─── 引擎初始化 ───────────────────────────────────────
const engine = new BattleEngine(EngineMode.PVE, {
  p1Name: '少女',
  p2Name: '马厄斯',
});

// ─── DOM 引用 ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const ui = {
  // 倒计时环
  p1Arc:        $('p1Arc'),
  p2Arc:        $('p2Arc'),
  p1RingWrap:   $('p1RingWrap'),
  p2RingWrap:   $('p2RingWrap'),
  p1Sec:        $('p1Sec'),
  p2Sec:        $('p2Sec'),
  p1Phase:      $('p1Phase'),
  p2Phase:      $('p2Phase'),
  // 状态显示
  p1SpeedVal:   $('p1SpeedVal'),
  p2SpeedVal:   $('p2SpeedVal'),
  // 行动按钮
  btnDodge:     $('btn-dodge'),
  btnGuard:     $('btn-guard'),
  btnAttack:    $('btn-attack'),
  ptDodge:      $('pt-dodge'),
  ptGuard:      $('pt-guard'),
  ptAttack:     $('pt-attack'),
  // 速度调节
  p1SpeedUp:    $('p1SpeedUp'),
  p1SpeedDown:  $('p1SpeedDown'),
  // 指令区
  standbyBtn:         $('standbyBtn'),
  readyBtn:           $('readyBtn'),
  redecideBtn:        $('redecideBtn'),
  declineRedecideBtn: $('declineRedecideBtn'),
  waitingLabel:       $('waitingLabel'),
  insightBtn:         $('insightBtn'),
  // 行动配置面板
  actionConfigPanel: $('actionConfigPanel'),
  configCloseBtn:    $('configCloseBtn'),
  enhanceRow:        $('enhanceRow'),
  enhanceInfo:       $('enhanceInfo'),
  enhanceMinusBtn:   $('enhanceMinusBtn'),
  enhancePlusBtn:    $('enhancePlusBtn'),
  maxEffectSlots:    $('maxEffectSlots'),
  effectList:        $('effectList'),
  // 日志
  battleLog:      $('battleLog'),
  clashName:      $('clashName'),
  logDetail:      $('logDetail'),
  insightNotice:  $('insightNotice'),
  // 历史
  historyBtn:     $('historyBtn'),
  historyModal:   $('historyModal'),
  historyList:    $('historyList'),
  historyClose:   $('historyClose'),
  turnIndicator:  $('turnIndicator'),
  // 情报框
  intelBox:       $('intelBox'),
  intelList:      $('intelList'),
  // 装备期
  equipOverlay:   $('equipOverlay'),
  equipCountdown: $('equipCountdown'),
  effectPicker:   $('effectPicker'),
  effectPickerClose: $('effectPickerClose'),
  effectPickerList:  $('effectPickerList'),
};

// ─── 本地 UI 状态 ─────────────────────────────────────
let selectedAction      = null;  // 当前选中的行动类型
let localEnhance        = 0;     // P1 当前强化次数
let matchHistory        = [];    // 战事录
let isGameOver          = false;
let pendingInsightAction = null; // 主动洞察结果，等对方就绪后才揭示

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/**
 * 更新倒计时环 SVG
 * isOpponent=true 时完全不更新（避免信息泄露）
 */
function updateRing(arc, ringWrap, secEl, phaseEl, remaining, phase, ready, isOpponent = false) {
  if (isOpponent) return;

  const ratio  = remaining / TimerConfig.TOTAL;
  const offset = RING_CIRC * (1 - ratio);

  arc.style.strokeDashoffset = offset;
  arc.classList.toggle('insight-phase', phase === Phase.INSIGHT);

  secEl.textContent   = remaining;
  phaseEl.textContent = phase === Phase.INSIGHT ? '洞察期' : '决策期';

  ringWrap.classList.toggle('is-ready', ready);
}

/** 刷新 HP / 精力格 pip 状态 */
function updatePips(prefix, current, max, type) {
  for (let i = 1; i <= max; i++) {
    const el = $(`${prefix}-${i}`);
    if (!el) continue;
    if (type === 'hp')   el.classList.toggle('lost',  i > current);
    if (type === 'stam') el.classList.toggle('spent', i <= max - current);
  }
}

/** 实时计算包含了当前行动消耗在内的预期精力 */
function getProjectedStamina(player) {
  let s = player.stamina;
  if (player.actionCtx && player.actionCtx.action !== Action.STANDBY) {
    // 闪避、攻击、守备的消耗统一为 1 + enhance
    s -= (1 + (player.actionCtx.enhance || 0));
  }
  return Math.max(0, Math.min(DefaultStats.MAX_STAMINA, s));
}

/** 刷新行动按钮上的点数显示，并根据精力控制按钮可用性 */
function refreshPoints(stamina, speed) {
  const atkPt = 1 + (selectedAction === 'attack' ? localEnhance : 0);
  const grdPt = 1 + (selectedAction === 'guard'  ? localEnhance : 0);
  const dgePt = 1 + (selectedAction === 'dodge'  ? localEnhance : 0);

  ui.ptAttack.textContent = atkPt;
  ui.ptGuard.textContent  = grdPt;
  ui.ptDodge.textContent  = dgePt;

  const canAct = stamina >= 1;
  ui.btnAttack.toggleAttribute('disabled', !canAct);
  ui.btnGuard.toggleAttribute('disabled',  !canAct);
  ui.btnDodge.toggleAttribute('disabled',  !canAct);

  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  ui.p1SpeedUp.disabled   = p1.stamina <= 1;
  ui.p1SpeedDown.disabled = p1.speed <= DefaultStats.BASE_SPEED;
}

// ═══════════════════════════════════════════════════════
// 行动配置面板
// ═══════════════════════════════════════════════════════

/** 同步强化栏与效果槽数显示，并展示当前行动对应的已装配效果 */
function updateConfigPanel() {
  ui.enhanceRow.classList.remove('disabled'); // 闪避幅度同样可强化

  const snap    = engine.getSnapshot();
  const p1      = snap.players[PlayerId.P1];
  const totalPts = 1 + localEnhance; // 攻击/守备/闪避统一为 1+enhance

  ui.enhanceInfo.textContent = `✦ 强化 +${localEnhance} 点数（消耗 ${localEnhance} 精力）`;
  ui.maxEffectSlots.textContent = totalPts;

  // 强化按钮可用性
  ui.enhanceMinusBtn.disabled = localEnhance <= 0;
  const nextCost = 1 + localEnhance + 1; // 再加一次强化的总消耗
  ui.enhancePlusBtn.disabled = nextCost > p1.stamina;

  // 渲染已装备的效果（根据 pts 决定前端显示失效状态）
  ui.effectList.innerHTML = '';
  const actionEnum = Action[selectedAction.toUpperCase()];
  const equipped = p1.equippedEffects[actionEnum] || [];
  
  for (let i = 0; i < EFFECT_SLOTS; i++) {
    const effectId = equipped[i];
    const item = document.createElement('div');
    const isValid = i < totalPts;
    
    item.className = 'effect-item' + (!isValid ? ' incompatible' : '') + (effectId && isValid ? ' selected' : '');
    
    if (effectId && EffectDefs[effectId]) {
      const def = EffectDefs[effectId];
      item.innerHTML = `
        <div class="effect-item-main">
          <div class="effect-item-name">${def.name}</div>
          <div class="effect-item-desc">${def.desc}</div>
        </div>
      `;
    } else {
      item.innerHTML = `
        <div class="effect-item-main">
          <div class="effect-item-name" style="color:#64748b">槽位 ${i + 1} - 未装配</div>
          <div class="effect-item-desc" style="color:#475569">在装备期点击 + 号装配效果</div>
        </div>
      `;
    }
    
    item.style.cursor = 'default';
    ui.effectList.appendChild(item);
  }
}

/** 选中行动：打开配置面板 */
function selectAction(type, btn) {
  if (isGameOver) return;

  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  if (p1.ready) return;

  if (selectedAction === type) {
    cancelSelection();
    return;
  }

  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedAction = type;
  localEnhance   = 0;

  engine.submitAction(PlayerId.P1, { action: Action[type.toUpperCase()], enhance: 0 });
  ui.actionConfigPanel.classList.add('show');
  updateConfigPanel();
}

/** 取消行动选择：关闭面板，回到待命 */
function cancelSelection() {
  selectedAction = null;
  localEnhance   = 0;
  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  engine.submitAction(PlayerId.P1, { action: Action.STANDBY, enhance: 0 });
  ui.actionConfigPanel.classList.remove('show');
  const snap = engine.getSnapshot();
  refreshPoints(snap.players[PlayerId.P1].stamina, snap.players[PlayerId.P1].speed);
}

/** 新回合开始时重置 P1 操作区 */
function resetForNewTurn() {
  selectedAction       = null;
  localEnhance         = 0;
  pendingInsightAction = null;
  document.querySelectorAll('.act-btn').forEach(b => {
    b.classList.remove('selected');
    b.removeAttribute('disabled');
  });
  ui.actionConfigPanel.classList.remove('show');
  ui.p1RingWrap.classList.remove('is-ready');
  ui.standbyBtn.disabled  = false;
  ui.readyBtn.disabled    = false;
  ui.p1SpeedUp.disabled   = false;
  ui.p1SpeedDown.disabled = false;
  ui.redecideBtn.classList.remove('show');
  ui.declineRedecideBtn.classList.remove('show');
  ui.waitingLabel.classList.remove('show');
  
  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  refreshPoints(p1.stamina, p1.speed);
  
  // 新回合开始：insightUsed 必然被引擎重置为 false，
  // 此处只需判断精力是否足够（避免在 _beginTurn 还未执行时读到旧 insightUsed）
  const projStam = getProjectedStamina(p1);
  ui.insightBtn.disabled = projStam < 1;
}

// ═══════════════════════════════════════════════════════
// 事件绑定（用户输入 → 引擎 API）
// ═══════════════════════════════════════════════════════

ui.btnDodge.addEventListener('click',  () => selectAction('dodge',  ui.btnDodge));
ui.btnGuard.addEventListener('click',  () => selectAction('guard',  ui.btnGuard));
ui.btnAttack.addEventListener('click', () => selectAction('attack', ui.btnAttack));

ui.p1SpeedUp.addEventListener('click',   () => engine.adjustSpeed(PlayerId.P1, +1));
ui.p1SpeedDown.addEventListener('click', () => engine.adjustSpeed(PlayerId.P1, -1));

ui.standbyBtn.addEventListener('click', () => {
  if (isGameOver) return;
  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  if (p1.ready) return;
  
  // 取消正在选中的下方按钮并将预期行为置为待命
  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  selectedAction = null;
  localEnhance = 0;
  ui.actionConfigPanel.classList.remove('show');
  
  engine.submitAction(PlayerId.P1, { action: Action.STANDBY, enhance: 0 });
  engine.setReady(PlayerId.P1);
});

ui.readyBtn.addEventListener('click', () => {
  if (isGameOver) return;
  engine.setReady(PlayerId.P1);
});

ui.redecideBtn.addEventListener('click', () => {
  engine.requestRedecide(PlayerId.P1);
  ui.redecideBtn.classList.remove('show');
  ui.declineRedecideBtn.classList.remove('show');
});

ui.declineRedecideBtn.addEventListener('click', () => {
  engine.declineRedecide(PlayerId.P1);
  ui.redecideBtn.classList.remove('show');
  ui.declineRedecideBtn.classList.remove('show');
});

ui.insightBtn.addEventListener('click', () => {
  if (isGameOver) return;
  engine.useInsight(PlayerId.P1, PlayerId.P2);
});

ui.battleLog.addEventListener('click', () => {
  if (!ui.battleLog.classList.contains('show')) return;
  ui.battleLog.classList.remove('show');
  document.body.classList.remove('resolving');
  if (!isGameOver) {
    engine.acknowledgeResolve();
  } else {
    // 重新开局
    isGameOver = false;
    matchHistory = [];
    updateHistoryUI();
    ui.turnIndicator.textContent = "TURN 1";
    ui.battleLog.querySelector('.log-hint').textContent = "点击关闭，开始下一回合";
    
    initUI();
    engine.restartGame();
    resetForNewTurn();
  }
});

ui.historyBtn.addEventListener('click',   () => ui.historyModal.classList.add('show'));
ui.historyClose.addEventListener('click', () => ui.historyModal.classList.remove('show'));

// 行动配置面板：关闭只收起面板，不取消已选行动
ui.configCloseBtn.addEventListener('click', () => {
  ui.actionConfigPanel.classList.remove('show');
});

ui.enhancePlusBtn.addEventListener('click', () => {
  localEnhance++;
  engine.submitAction(PlayerId.P1, { enhance: localEnhance });
  updateConfigPanel();
});

ui.enhanceMinusBtn.addEventListener('click', () => {
  if (localEnhance <= 0) return;
  localEnhance--;
  engine.submitAction(PlayerId.P1, { enhance: localEnhance });
  updateConfigPanel();
});

// ═══════════════════════════════════════════════════════
// 引擎事件 → DOM 更新
// ═══════════════════════════════════════════════════════

engine.on(EngineEvent.TIMER_TICK, payload => {
  const p1Data = payload[PlayerId.P1];
  const p2Data = payload[PlayerId.P2];
  const snap   = engine.getSnapshot();

  updateRing(
    ui.p1Arc, ui.p1RingWrap, ui.p1Sec, ui.p1Phase,
    p1Data.remaining, p1Data.phase,
    snap.players[PlayerId.P1].ready
  );
  updateRing(
    ui.p2Arc, ui.p2RingWrap, ui.p2Sec, ui.p2Phase,
    p2Data.remaining, p2Data.phase,
    snap.players[PlayerId.P2].ready,
    true  // isOpponent：不向 P1 泄露 P2 信息
  );
});

// 强制保证 UI 表象与可用精力一致
function enforceUIConstraints(p1) {
  if (selectedAction) {
    if (selectedAction !== 'dodge') {
      const maxEnhance = Math.max(0, p1.stamina - 1);
      if (localEnhance > maxEnhance) {
        localEnhance = maxEnhance;
        engine.submitAction(PlayerId.P1, { enhance: localEnhance });
        updateConfigPanel();
        return false; // 下调导致触发了新的 ACTION_UPDATED，终止当前执行链
      }
    } else if (p1.stamina < 1) {
      cancelSelection();
      return false;
    }
  }
  return true;
}

engine.on(EngineEvent.ACTION_UPDATED, ({ playerId }) => {
  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  if (playerId === PlayerId.P1) {
    if (!enforceUIConstraints(p1)) return;
    refreshPoints(p1.stamina, p1.speed);
    ui.p1SpeedVal.textContent = p1.speed;
  }
  if (playerId === PlayerId.P2) {
    ui.p2SpeedVal.textContent = snap.players[PlayerId.P2].speed;
  }
  updatePips('p1-hp',   p1.hp,      DefaultStats.MAX_HP,      'hp');
  const projStam = getProjectedStamina(p1);
  updatePips('p1-stam', projStam, DefaultStats.MAX_STAMINA, 'stam');
  
  if (!p1.ready) {
    ui.insightBtn.disabled = p1.insightUsed || projStam < 1;
  }
});

engine.on(EngineEvent.PLAYER_READY, ({ playerId, ready }) => {
  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  const p2   = snap.players[PlayerId.P2];

  // 只更新 P1 自己的环，不让 P2 就绪引发任何视觉变化（防信息泄露）
  if (playerId === PlayerId.P1) {
    ui.p1RingWrap.classList.toggle('is-ready', p1.ready);
    ui.standbyBtn.disabled = ready;
    ui.readyBtn.disabled = ready;
    ui.waitingLabel.classList.toggle('show', ready && !p2.ready);
    if (ready) {
      document.querySelectorAll('.act-btn').forEach(b => b.setAttribute('disabled', ''));
      ui.p1SpeedUp.disabled  = true;
      ui.p1SpeedDown.disabled = true;
      ui.insightBtn.disabled  = true;
    }
  }
  // P2 就绪：若有挂起的洞察，此时才揭示意图
  if (playerId === PlayerId.P2 && ready && pendingInsightAction !== null) {
    const actName = ActionName[pendingInsightAction?.action] ?? '未知';
    showInsightNotice(`已洞察敌方意图：【${actName}】`);
    pendingInsightAction = null;
  }
});

engine.on(EngineEvent.REDECIDE_OFFER, ({ playerId }) => {
  if (playerId === PlayerId.P1) {
    ui.redecideBtn.classList.add('show');
    ui.declineRedecideBtn.classList.add('show');
  }
});

engine.on(EngineEvent.REDECIDED, ({ playerId }) => {
  if (playerId === PlayerId.P1) {
    // 重新决策：只恢复操作控件的可用性，不清除已选行动
    // 玩家知道对手意图，允许在已有选择基础上微调（或保持原选择直接就绪）
    ui.standbyBtn.disabled  = false;
    ui.readyBtn.disabled    = false;
    ui.p1SpeedUp.disabled   = false;
    ui.p1SpeedDown.disabled = false;
    ui.waitingLabel.classList.remove('show');
    const snap    = engine.getSnapshot();
    const p1State = snap.players[PlayerId.P1];
    ui.insightBtn.disabled = p1State.insightUsed || getProjectedStamina(p1State) < 1;
  }
});

engine.on(EngineEvent.PASSIVE_INSIGHT, ({ targetId, revealedAction }) => {
  const isP1Target = targetId === PlayerId.P1;
  const msg = isP1Target
    ? '随着时间推移，你的行为已经被洞察。'
    : `对方拖延太久——${ActionName[revealedAction?.action ?? 'standby']} 的意图已暴露。`;
  showInsightNotice(msg);
});

engine.on(EngineEvent.ACTIVE_INSIGHT, ({ casterId, revealedAction, revealed }) => {
  if (casterId === PlayerId.P1) {
    if (revealed && revealedAction) {
      // 对方已就绪，真正揭示意图
      const actName = ActionName[revealedAction.action] ?? '未知';
      showInsightNotice(`已洞察敌方意图：【${actName}】`);
      pendingInsightAction = null;
    } else {
      // 洞察已发起，对方尚未就绪
      pendingInsightAction = true; // 标记挂起，等 revealed 再清
      showInsightNotice('正在洞察对方意图…');
    }
    const snap = engine.getSnapshot();
    const p1 = snap.players[PlayerId.P1];
    if (!enforceUIConstraints(p1)) return;
    
    const projStam = getProjectedStamina(p1);
    updatePips('p1-stam', projStam, DefaultStats.MAX_STAMINA, 'stam');
    refreshPoints(p1.stamina, p1.speed);
    
    if (!p1.ready) {
      ui.insightBtn.disabled = p1.insightUsed || projStam < 1;
    }
  }
});

engine.on(EngineEvent.TURN_RESOLVED, result => {
  document.body.classList.add('resolving');
  ui.insightNotice.classList.remove('show');
  ui.insightNotice.textContent = '';

  updatePips('p1-hp',   result.newState.p1.hp,      DefaultStats.MAX_HP,      'hp');
  updatePips('p1-stam', result.newState.p1.stamina,  DefaultStats.MAX_STAMINA, 'stam');
  updatePips('p2-hp',   result.newState.p2.hp,       DefaultStats.MAX_HP,      'hp');
  updatePips('p2-stam', result.newState.p2.stamina,  DefaultStats.MAX_STAMINA, 'stam');

  ui.p1SpeedVal.textContent = DefaultStats.BASE_SPEED;
  ui.p2SpeedVal.textContent = DefaultStats.BASE_SPEED;

  ui.clashName.textContent = result.clashName;
  ui.logDetail.innerHTML   = result.clashDesc;
  ui.battleLog.classList.add('show');

  matchHistory.push(`
    <div style="color:var(--text-main);font-weight:bold;margin-bottom:4px">
      [TURN ${result.turn}] ${result.clashName}
    </div>
    <div style="color:var(--text-muted)">${result.clashDesc}</div>
    ${result.damageToP1 > 0 ? `<div style="color:var(--color-hp)">你受到 ${result.damageToP1} 次伤害</div>` : ''}
    ${result.damageToP2 > 0 ? `<div style="color:var(--color-atk)">敌方受到 ${result.damageToP2} 次伤害</div>` : ''}
  `);
  updateHistoryUI();

  if (!isGameOver) {
    ui.turnIndicator.textContent = `TURN ${result.turn + 1}`;
    resetForNewTurn();
  }

  // 情报框：每回合结算后刷新
  updateIntelBox();
});

engine.on(EngineEvent.GAME_OVER, ({ reason }) => {
  isGameOver = true;
  ui.logDetail.innerHTML += `<br><br><strong style="color:var(--color-atk)">${reason}</strong>`;
  ui.battleLog.querySelector('.log-hint').textContent = '点击屏幕，重新开局';
  ui.standbyBtn.disabled = true;
  ui.readyBtn.disabled   = true;
  ui.insightBtn.disabled = true;
});

// ═══════════════════════════════════════════════════════
// 辅助渲染
// ═══════════════════════════════════════════════════════

function updateHistoryUI() {
  if (!matchHistory.length) return;
  ui.historyList.innerHTML = '';
  matchHistory.forEach(rec => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = rec;
    ui.historyList.appendChild(div);
  });
  ui.historyList.scrollTop = ui.historyList.scrollHeight;
}

function showInsightNotice(msg) {
  ui.insightNotice.textContent = msg;
  ui.insightNotice.classList.add('show');
}

// ═══════════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════════

function initUI() {
  updatePips('p1-hp',   DefaultStats.MAX_HP,      DefaultStats.MAX_HP,      'hp');
  updatePips('p1-stam', DefaultStats.MAX_STAMINA, DefaultStats.MAX_STAMINA, 'stam');
  updatePips('p2-hp',   DefaultStats.MAX_HP,      DefaultStats.MAX_HP,      'hp');
  updatePips('p2-stam', DefaultStats.MAX_STAMINA, DefaultStats.MAX_STAMINA, 'stam');
  refreshPoints(DefaultStats.MAX_STAMINA, DefaultStats.BASE_SPEED);

  ui.p1Arc.style.strokeDashoffset = 0;
  ui.p2Arc.style.strokeDashoffset = 0;
  ui.p1Sec.textContent = TimerConfig.DECISION_TIME;
  ui.p2Sec.textContent = TimerConfig.DECISION_TIME;
}

// ═══════════════════════════════════════════════════════
// 装备期 UI 系统
// ═══════════════════════════════════════════════════════

// 当前正在选择的槽位上下文
let _pickCtx = null; // { action, slot }
let _swapCtx = null; // { action, slot } — 等待与另一槽交换

/** 刷新装备面板上所有槽位的显示，基于 engine 当前 equippedEffects */
function refreshEquipSlots() {
  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  if (!p1.equippedEffects) return;

  [Action.ATTACK, Action.GUARD, Action.DODGE].forEach(action => {
    const container = $(`equipSlots-${action}`);
    if (!container) return;

    const slots = container.querySelectorAll('.equip-slot');
    slots.forEach((slotEl, idx) => {
      const effectId = p1.equippedEffects[action]?.[idx] ?? null;
      slotEl.innerHTML = '';
      slotEl.classList.toggle('filled', !!effectId);

      if (effectId && EffectDefs[effectId]) {
        const def = EffectDefs[effectId];
        const nameEl   = document.createElement('div');
        nameEl.className = 'slot-name';
        nameEl.textContent = def.name;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'slot-actions';

        const changeEl = document.createElement('button');
        changeEl.className = 'slot-change slot-btn';
        changeEl.textContent = '更换';

        const swapEl = document.createElement('button');
        swapEl.className = 'slot-swap slot-btn';
        swapEl.textContent = '交换';
        swapEl.dataset.action = action;
        swapEl.dataset.slot   = idx;

        actionsEl.appendChild(changeEl);
        actionsEl.appendChild(swapEl);
        slotEl.appendChild(nameEl);
        slotEl.appendChild(actionsEl);
      } else {
        const plus  = document.createElement('span');
        plus.className = 'slot-add';
        plus.textContent = '+';
        slotEl.appendChild(plus);
      }

      // 标记待交换状态
      slotEl.classList.toggle('swapping',
        !!_swapCtx && _swapCtx.action === action && _swapCtx.slot === idx
      );
    });
  });
}

/** 打开效果库弹窗，供指定 (action, slot) 选择 */
function openEffectPicker(action, slot) {
  _pickCtx = { action, slot };

  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  const inv  = p1.effectInventory?.[action] ?? [];

  ui.effectPickerList.innerHTML = '';

  // 已装备在其他槽的效果 ID 集合（不含当前槽）
  const equippedElsewhere = new Set(
    (p1.equippedEffects?.[action] ?? []).filter((id, i) => i !== slot && id !== null)
  );

  inv.forEach(effectId => {
    const def = EffectDefs[effectId];
    if (!def) return;
    // 同效果只能装备一格，已在其他槽的不显示
    if (equippedElsewhere.has(effectId)) return;

    const item = document.createElement('div');
    item.className = 'effect-item';

    item.innerHTML = `
      <div class="effect-item-main">
        <div class="effect-item-name">${def.name}</div>
        <div class="effect-item-desc">${def.desc}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      engine.assignEffect(PlayerId.P1, action, slot, effectId);
      ui.effectPicker.classList.remove('show');
      _pickCtx = null;
      refreshEquipSlots();
    });

    ui.effectPickerList.appendChild(item);
  });

  // 同时提供"清空"选项
  const clearItem = document.createElement('div');
  clearItem.className = 'effect-item';
  clearItem.innerHTML = `<div class="effect-item-main"><div class="effect-item-name" style="color:#64748b">清空此槽</div></div>`;
  clearItem.addEventListener('click', () => {
    engine.assignEffect(PlayerId.P1, action, slot, null);
    ui.effectPicker.classList.remove('show');
    _pickCtx = null;
    refreshEquipSlots();
  });
  ui.effectPickerList.appendChild(clearItem);

  ui.effectPicker.classList.add('show');
}

// 效果库关闭按钮
ui.effectPickerClose.addEventListener('click', () => {
  ui.effectPicker.classList.remove('show');
  _pickCtx = null;
});

// 执行两个槽位的效果互换
function swapEffects(action, slotA, slotB) {
  const snap = engine.getSnapshot();
  const p1   = snap.players[PlayerId.P1];
  const slots = p1.equippedEffects?.[action] ?? [];
  const idA = slots[slotA] ?? null;
  const idB = slots[slotB] ?? null;
  
  // 先清空两边，防止引擎的唯一性同名检测导致分配失败
  engine.assignEffect(PlayerId.P1, action, slotA, null);
  engine.assignEffect(PlayerId.P1, action, slotB, null);
  
  // 再重新装配对应效果
  engine.assignEffect(PlayerId.P1, action, slotA, idB);
  engine.assignEffect(PlayerId.P1, action, slotB, idA);
  
  _swapCtx = null;
  refreshEquipSlots();
}

// 委托所有装备槽的点击（在 equip-overlay 内）
ui.equipOverlay.addEventListener('click', e => {
  // ── 点击「交换」按鈕 ──
  const swapBtn = e.target.closest('.slot-swap');
  if (swapBtn) {
    e.stopPropagation();
    const action = swapBtn.dataset.action;
    const slot   = parseInt(swapBtn.dataset.slot, 10);
    if (_swapCtx) {
      if (_swapCtx.action === action && _swapCtx.slot === slot) {
        // 点同一个——取消交换模式
        _swapCtx = null;
        refreshEquipSlots();
      } else if (_swapCtx.action === action) {
        // 同行动下的另一个槽——执行交换
        swapEffects(action, _swapCtx.slot, slot);
      } else {
        // 不同行动——重新选择
        _swapCtx = { action, slot };
        refreshEquipSlots();
      }
    } else {
      _swapCtx = { action, slot };
      refreshEquipSlots();
    }
    return;
  }

  const slotEl = e.target.closest('.equip-slot');
  if (!slotEl) return;

  const action = slotEl.dataset.action;
  const slot   = parseInt(slotEl.dataset.slot, 10);

  // 如果处于交换模式，点击某槽即完成交换
  if (_swapCtx) {
    if (_swapCtx.action === action && _swapCtx.slot !== slot) {
      swapEffects(action, _swapCtx.slot, slot);
    } else {
      _swapCtx = null;
      refreshEquipSlots();
    }
    return;
  }

  // 常规流程：打开效果库
  if (ui.effectPicker.classList.contains('show')) {
    ui.effectPicker.classList.remove('show');
    _pickCtx = null;
    return;
  }
  openEffectPicker(action, slot);
});

// 监听装备期开始事件 → 显示覆盖面板并倒计时
engine.on(EngineEvent.EQUIP_PHASE_START, ({ secondsLeft }) => {
  ui.equipCountdown.textContent = secondsLeft;
  if (!ui.equipOverlay.classList.contains('active')) {
    ui.equipOverlay.classList.add('active');
    // 每次进入装备期都刷新槽位显示
    refreshEquipSlots();
    // 主操作区禁用
    ui.standbyBtn.disabled = true;
    ui.readyBtn.disabled   = true;
    ui.insightBtn.disabled = true;
  }
});

// 监听装备期结束事件 → 隐藏覆盖面板，启用主操作区
engine.on(EngineEvent.EQUIP_PHASE_END, () => {
  ui.equipOverlay.classList.remove('active');
  ui.effectPicker.classList.remove('show');
  
  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  
  if (!p1.ready) {
    ui.standbyBtn.disabled = false;
    ui.readyBtn.disabled = false;
    const projStam = getProjectedStamina(p1);
    ui.insightBtn.disabled = p1.insightUsed || projStam < 1;
  }
});

// ═══════════════════════════════════════════════════════
// 情报框更新
// ═══════════════════════════════════════════════════════

function updateIntelBox() {
  const snap  = engine.getSnapshot();
  const intel = snap.players[PlayerId.P1].effectIntel ?? [];

  ui.intelList.innerHTML = '';

  if (intel.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'intel-empty';
    empty.textContent = '尚未获取任何情报';
    ui.intelList.appendChild(empty);
    return;
  }

  intel.forEach(effectId => {
    const def = EffectDefs[effectId];
    if (!def) return;

    const tag = document.createElement('div');
    tag.className = 'intel-tag';
    tag.innerHTML = `${def.name}<span>${def.desc}</span>`;
    ui.intelList.appendChild(tag);
  });
}

initUI();
engine.startGame();
