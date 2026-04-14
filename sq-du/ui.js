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
 *    效果定义由外部数据层（skill/ 目录）提供
 */

'use strict';

import { BattleEngine } from './base/engine.js';
import {
  EngineEvent, EngineState, PlayerId, Action, ActionName,
  DefaultStats, TimerConfig, Phase, EngineMode,
  EffectId, EffectDefs, EFFECT_SLOTS,
} from './base/constants.js';
import { EffectHandlers } from './base/effect-handlers.js';
import { EffectLayer } from './main/effect.js';
import { EffectTimingLabel } from './effect/timing-constants.js';

// ─── 常量 ─────────────────────────────────────────────
const RING_CIRC = 226.195; // 2π × 36（SVG 弧长）

// ─── 引擎初始化 ───────────────────────────────────────
const engine = new BattleEngine(EngineMode.PVE, {
  p1Name: '少女',
  p2Name: '马厄斯',
});

// ─── 调试暴露 (仅供控制台使用) ──────────────────────────
window.engine = engine;
window.Action = Action;
window.PlayerId = PlayerId;

function getEffectMeta(effectId) {
  const handler = EffectHandlers[effectId] || {};
  const def = EffectDefs[effectId] || {};
  return {
    name: handler.name || def.name || effectId,
    desc: handler.desc || def.desc || '',
  };
}

// ─── DOM 引用 ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const ui = {
  // 倒计时环
  p1Arc: $('p1Arc'),
  p2Arc: $('p2Arc'),
  p1RingWrap: $('p1RingWrap'),
  p2RingWrap: $('p2RingWrap'),
  p1Sec: $('p1Sec'),
  p2Sec: $('p2Sec'),
  p1Phase: $('p1Phase'),
  p2Phase: $('p2Phase'),
  // 状态显示
  p1SpeedVal: $('p1SpeedVal'),
  p2SpeedVal: $('p2SpeedVal'),
  p1StatusTray: $('p1-status'),
  p2StatusTray: $('p2-status'),
  // 行动按钮
  btnDodge: $('btn-dodge'),
  btnGuard: $('btn-guard'),
  btnAttack: $('btn-attack'),
  ptDodge: $('pt-dodge'),
  ptGuard: $('pt-guard'),
  ptAttack: $('pt-attack'),
  // 动速调节
  p1SpeedUp: $('p1SpeedUp'),
  p1SpeedDown: $('p1SpeedDown'),
  // 指令区
  standbyBtn: $('standbyBtn'),
  readyBtn: $('readyBtn'),
  redecideBtn: $('redecideBtn'),
  declineRedecideBtn: $('declineRedecideBtn'),
  waitingLabel: $('waitingLabel'),
  insightBtn: $('insightBtn'),
  cancelActionBtn: $('cancelActionBtn'),
  // 行动配置面板
  actionConfigPanel: $('actionConfigPanel'),
  configCloseBtn: $('configCloseBtn'),
  enhanceRow: $('enhanceRow'),
  enhanceInfo: $('enhanceInfo'),
  enhanceMinusBtn: $('enhanceMinusBtn'),
  enhancePlusBtn: $('enhancePlusBtn'),
  maxEffectSlots: $('maxEffectSlots'),
  effectList: $('effectList'),
  // 日志
  battleLog: $('battleLog'),
  clashName: $('clashName'),
  logDetail: $('logDetail'),
  insightNotice: $('insightNotice'),
  // 历史
  historyBtn: $('historyBtn'),
  historyModal: $('historyModal'),
  historyList: $('historyList'),
  historyClose: $('historyClose'),
  turnIndicator: $('turnIndicator'),
  // 情报框
  intelBox: $('intelBox'),
  intelList: $('intelList'),
  p2IntelBtn: $('p2IntelBtn'),
  // 装备期
  equipOverlay: $('equipOverlay'),
  equipCountdown: $('equipCountdown'),
  effectPicker: $('effectPicker'),
  effectPickerClose: $('effectPickerClose'),
  effectPickerList: $('effectPickerList'),
  // 全局控制
  globalPauseBtn: $('globalPauseBtn'),
  // 阶段显示
  phaseIndicator: $('phaseIndicator'),
  equipOverlayTitle: $('equipOverlayTitle'),
  equipCountdownHint: $('equipCountdownHint'),
  actionNotice: $('actionNotice'),
  roundStartNotice: $('roundStartNotice'),
  roundStartCountdownHint: $('roundStartCountdownHint'),
  turnEndNotice: $('turnEndNotice'),
  turnEndCountdownHint: $('turnEndCountdownHint'),
  restartBtn: $('restartBtn'),
};

// ─── 本地 UI 状态 ─────────────────────────────────────
let selectedAction = null;  // 当前选中的行动类型
let localEnhance = 0;     // P1 当前强化次数
let matchHistory = [];    // 战事录
let isGameOver = false;
let pendingInsightAction = null; // 主动洞察结果，等对方就绪后才揭示
let enemyInfoUnlocked = false;    // 本回合是否已通过洞察解锁敌方就绪后信息
let enemyFogState = {
  hp: 3, // 默认初始命数
  stamina: 3, // 默认初始精力
  speed: 1, // 默认初始动速
};

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/**
 * 更新倒计时环 SVG
 * isOpponent=true 时完全不更新（避免信息泄露）
 */
function updateRing(arc, ringWrap, secEl, phaseEl, remaining, phase, ready, isOpponent = false) {
  if (isOpponent) return;

  const ratio = remaining / TimerConfig.TOTAL;
  const offset = RING_CIRC * (1 - ratio);

  arc.style.strokeDashoffset = offset;
  arc.classList.toggle('insight-phase', phase === Phase.INSIGHT);

  secEl.textContent = remaining;
  phaseEl.textContent = phase === Phase.INSIGHT ? '洞察期' : '决策期';

  ringWrap.classList.toggle('is-ready', ready);
}

/** 刷新 HP / 精力格 pip 状态 */
function updatePips(prefix, current, max, type, playerState) {
  const penalty = playerState?.staminaPenalty || 0;
  const discount = playerState?.staminaDiscount || 0;

  for (let i = 1; i <= max; i++) {
    const el = $(`${prefix}-${i}`);
    if (!el) continue;

    // 清除特殊状态
    el.classList.remove('lost', 'spent', 'penalty', 'discount');

    if (type === 'hp') {
      if (i > current) el.classList.add('lost');
    } else if (type === 'stam') {
      const idxFromRight = max - i + 1; // 1是第一格（最下面/左边），从上往下花
      // 真实消耗的
      if (idxFromRight > current) {
        el.classList.add('spent');
      }
      // 在当前的顶部添加 penalty 的视觉（虚假扣除）
      else if (idxFromRight > current - penalty) {
        el.classList.add('penalty');
      }
      // 如果超出了真实容量，但受到了 discount（不在此UI做超出绘制，只在已有格子上发光）
      else if (discount > 0 && idxFromRight === current) {
        el.classList.add('discount');
      }
    }
  }
}

/** 实时计算包含了当前行动消耗在内的预期精力 */

/** 当前可用于“是否还能执行一次行为/洞察”的真实剩余原始资源 */
function getEffectiveStamina(player) {
  return (player.stamina || 0) + (player.staminaDiscount || 0);
}

/** 统一渲染双方资源与基础状态（避免真实值/投影值显示不一致） */
function renderPlayerResources(p1, p2) {
  updatePips('p1-hp', p1.hp, DefaultStats.MAX_HP, 'hp', p1);
  updatePips('p1-stam', p1.stamina, DefaultStats.MAX_STAMINA, 'stam', p1);
  const p1ActSpeed = p1.speed + (p1.agilityBoost || 0) - (p1.agilityDebuff || 0);
  ui.p1SpeedVal.textContent = Math.max(0, p1ActSpeed);

  const canExposeEnemy = EffectLayer.canExposeOpponentRuntime(p1, p2, enemyInfoUnlocked);

  // 未被遮罩时，持续刷新敌方“最后已知状态”
  if (canExposeEnemy) {
    enemyFogState = { hp: p2.hp, stamina: p2.stamina, speed: p2.speed, staminaPenalty: p2.staminaPenalty, staminaDiscount: p2.staminaDiscount };
  }

  const showEnemy = canExposeEnemy ? { ...p2 } : enemyFogState;

  if (showEnemy.hp == null) {
    updatePips('p2-hp', 0, DefaultStats.MAX_HP, 'hp', showEnemy);
    updatePips('p2-stam', 0, DefaultStats.MAX_STAMINA, 'stam', showEnemy);
    ui.p2SpeedVal.textContent = '?';
  } else {
    updatePips('p2-hp', showEnemy.hp, DefaultStats.MAX_HP, 'hp', showEnemy);
    updatePips('p2-stam', showEnemy.stamina, DefaultStats.MAX_STAMINA, 'stam', showEnemy);
    const p2ActSpeed = showEnemy.speed + (p2.agilityBoost || 0) - (p2.agilityDebuff || 0);
    ui.p2SpeedVal.textContent = Math.max(0, p2ActSpeed);
  }
}

/** 刷新行动按钮上的点数显示，并根据精力控制按钮可用性 */
function refreshPoints() {
  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];

  let atkPt = 1 + (selectedAction === 'attack' ? localEnhance : 0) + (p1.chargeBoost || 0) - (p1.ptsDebuff || 0);
  let grdPt = 1 + (selectedAction === 'guard' ? localEnhance : 0) + (p1.guardBoost || 0) - (p1.guardDebuff || 0);
  let dgePt = 1 + (selectedAction === 'dodge' ? localEnhance : 0) + (p1.dodgeBoost || 0) - (p1.dodgeDebuff || 0);

  ui.ptAttack.textContent = Math.max(0, atkPt);
  ui.ptGuard.textContent = Math.max(0, grdPt);
  ui.ptDodge.textContent = Math.max(0, dgePt);

  const effectiveStamina = getEffectiveStamina(p1);
  // 如果你处于待命状态，你需要至少 1 点资源来发起行动（即使有高额的 penalty，只要求你余额非空）。
  // 如果你已经选中了一个行动，你已经支付了基础成本（包括 penalty），随时可以无缝切换到其他同级选项或取消它，所以必定可以点击。
  const canAct = effectiveStamina >= 1 || !!selectedAction;
  const blocked = p1.actionBlocked || [];

  ui.btnAttack.toggleAttribute('disabled', !canAct || blocked.includes(Action.ATTACK));
  ui.btnGuard.toggleAttribute('disabled', !canAct || blocked.includes(Action.GUARD));
  ui.btnDodge.toggleAttribute('disabled', !canAct || blocked.includes(Action.DODGE));

  // 若当前已选中的行动被封锁，立即取消选择
  if (selectedAction && blocked.includes(Action[selectedAction.toUpperCase()])) {
    cancelSelection();
  }

  // 取消行为按钮：只要有行动被选中就显示
  ui.cancelActionBtn.classList.toggle('visible', !!selectedAction);

  // 只要还有有效精力即可提速；是否透支行动由玩家自行选择
  ui.p1SpeedUp.disabled = effectiveStamina <= 0;
  ui.p1SpeedDown.disabled = p1.speed <= DefaultStats.BASE_SPEED;
}

// ═══════════════════════════════════════════════════════
// 行动配置面板
// ═══════════════════════════════════════════════════════

/** 同步强化栏与效果槽数显示，并展示当前行动对应的已装配效果 */
function updateConfigPanel() {
  if (!selectedAction) {
    ui.actionConfigPanel.classList.remove('show');
    return;
  }
  ui.enhanceRow.classList.remove('disabled'); // 闪避点数同样可强化

  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  const totalPts = 1 + localEnhance; // 攻击/守备/闪避统一为 1+enhance

  ui.enhanceInfo.textContent = `✦ 强化 +${localEnhance} 点数（消耗 ${localEnhance} 精力）`;
  ui.maxEffectSlots.textContent = totalPts;

  // 强化按钮可用性
  ui.enhanceMinusBtn.disabled = localEnhance <= 0;
  // 即时扣费模式下，当前行动基础成本已支付；再强化一次只需再支付 1 点“有效精力”
  ui.enhancePlusBtn.disabled = getEffectiveStamina(p1) < 1;

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
      const meta = getEffectMeta(effectId);
      item.innerHTML = `
        <div class="effect-item-main">
          <div class="effect-item-name">${meta.name}</div>
          <div class="effect-item-desc">${meta.desc}</div>
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
  const p1 = snap.players[PlayerId.P1];
  if (p1.ready) return;
  if (btn.hasAttribute('disabled')) return;
  if (selectedAction === type) {
    cancelSelection();
    return;
  }

  // 真正无可用精力时，禁止选择新的攻击/守备/闪避
  if (getEffectiveStamina(p1) < 1) return;

  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedAction = type;
  localEnhance = 0;

  engine.submitAction(PlayerId.P1, { action: Action[type.toUpperCase()], enhance: 0 });
  if (!selectedAction) return;
  ui.actionConfigPanel.classList.add('show');
  updateConfigPanel();
}

/** 取消行动选择：关闭面板，回到待命 */
function cancelSelection() {
  selectedAction = null;
  localEnhance = 0;
  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  engine.submitAction(PlayerId.P1, { action: Action.STANDBY, enhance: 0 });
  ui.actionConfigPanel.classList.remove('show');
  const snap = engine.getSnapshot();
  refreshPoints();
}

/** 新回合开始时重置 P1 操作区 */
function resetForNewTurn() {
  selectedAction = null;
  localEnhance = 0;
  pendingInsightAction = null;
  enemyInfoUnlocked = false;
  document.querySelectorAll('.act-btn').forEach(b => {
    b.classList.remove('selected');
  });
  ui.actionConfigPanel.classList.remove('show');
  ui.p1RingWrap.classList.remove('is-ready');
  ui.standbyBtn.disabled = false;
  ui.readyBtn.disabled = false;
  ui.p1SpeedUp.disabled = false;
  ui.p1SpeedDown.disabled = false;
  ui.redecideBtn.classList.remove('show');
  ui.declineRedecideBtn.classList.remove('show');
  ui.waitingLabel.classList.remove('show');

  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  refreshPoints();

  // 新回合开始时，记录敌方目前的真实状态作为本回合的基础情报
  // 若本回合未执行洞察，玩家看到的敌方血量、精力、速度将一直“锁定”在这个初始快照
  const p2 = snap.players[PlayerId.P2];
  enemyFogState = {
    hp: p2.hp,
    stamina: p2.stamina,
    speed: p2.speed
  };

  // 新回合开始：insightUsed 必然被引擎重置为 false，
  // 此处只需判断精力是否足够（避免在 _beginTurn 还未执行时读到旧 insightUsed）
  ui.insightBtn.disabled = getEffectiveStamina(p1) < 1;
}

// ═══════════════════════════════════════════════════════
// 事件绑定（用户输入 → 引擎 API）
// ═══════════════════════════════════════════════════════

ui.btnDodge.addEventListener('click', () => selectAction('dodge', ui.btnDodge));
ui.btnGuard.addEventListener('click', () => selectAction('guard', ui.btnGuard));
ui.btnAttack.addEventListener('click', () => selectAction('attack', ui.btnAttack));

// 取消行为按钮：无论精力多少，直接取消已选行动并退还精力
ui.cancelActionBtn.addEventListener('click', () => {
  if (isGameOver) return;
  const snap = engine.getSnapshot();
  if (snap.players[PlayerId.P1].ready) return;
  cancelSelection();
});

ui.p1SpeedUp.addEventListener('click', () => engine.adjustSpeed(PlayerId.P1, +1));
ui.p1SpeedDown.addEventListener('click', () => engine.adjustSpeed(PlayerId.P1, -1));

ui.standbyBtn.addEventListener('click', () => {
  if (isGameOver) return;
  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
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
  // 仅在游戏结束时，才允许点击强制重置
  if (!isGameOver) return;

  ui.battleLog.classList.remove('show');
  document.body.classList.remove('resolving');
  // 重新开局
  isGameOver = false;
  matchHistory = [];
  updateHistoryUI();
  ui.turnIndicator.textContent = "TURN 1";
  ui.battleLog.querySelector('.log-hint').textContent = "";

  engine.restartGame();
  initUI();
  resetForNewTurn();
});

ui.historyBtn.addEventListener('click', () => ui.historyModal.classList.add('show'));
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
  const snap = engine.getSnapshot();

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

// 每个阶段接口执行后刷新一次状态显示，确保“时机=结算=可见”
engine.on(EngineEvent.PHASE_STATE_SYNC, ({ state }) => {
  const p1 = state.players[PlayerId.P1];
  const p2 = state.players[PlayerId.P2];

  renderPlayerResources(p1, p2);

  updateStatusIcons(PlayerId.P1, p1);
  // 敌方图标可见性由效果层策略统一决定
  if (EffectLayer.canExposeOpponentRuntime(p1, p2, enemyInfoUnlocked)) {
    updateStatusIcons(PlayerId.P2, p2);
  }
});

// 强制保证 UI 表象与可用精力一致
function enforceUIConstraints(p1) {
  if (selectedAction) {
    // 即时扣费模式：基础行动成本已在选行动时扣除。
    // 当前剩余精力只决定“还能再强化几次”。
    const maxEnhance = Math.max(0, localEnhance + p1.stamina);
    if (localEnhance > maxEnhance) {
      localEnhance = maxEnhance;
      engine.submitAction(PlayerId.P1, { enhance: localEnhance });
      updateConfigPanel();
      return false; // 下调导致触发了新的 ACTION_UPDATED，终止当前执行链
    }
  }
  return true;
}

engine.on(EngineEvent.ACTION_UPDATED, ({ playerId }) => {
  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  if (playerId === PlayerId.P1) {
    if (!enforceUIConstraints(p1)) return;
    refreshPoints();
    ui.p1SpeedVal.textContent = p1.speed;
  }
  // 敌方即时变化是否可见，统一交给 renderPlayerResources/可见性策略处理
  renderPlayerResources(p1, snap.players[PlayerId.P2]);

  if (!p1.ready) {
    ui.insightBtn.disabled = p1.insightUsed || getEffectiveStamina(p1) < 1;
  }
});

engine.on(EngineEvent.PLAYER_READY, ({ playerId, ready }) => {
  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  const p2 = snap.players[PlayerId.P2];

  // 只更新 P1 自己的环，不让 P2 就绪引发任何视觉变化（防信息泄露）
  if (playerId === PlayerId.P1) {
    ui.p1RingWrap.classList.toggle('is-ready', p1.ready);
    ui.standbyBtn.disabled = ready;
    ui.readyBtn.disabled = ready;
    ui.waitingLabel.classList.toggle('show', ready && !p2.ready);
    if (ready) {
      document.querySelectorAll('.act-btn').forEach(b => b.setAttribute('disabled', ''));
      ui.p1SpeedUp.disabled = true;
      ui.p1SpeedDown.disabled = true;
      ui.insightBtn.disabled = true;
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
  ui.phaseIndicator.textContent = '重筹期';
  if (playerId === PlayerId.P1) {
    // 重新决策：只恢复操作控件的可用性，不清除已选行动
    // 玩家知道对手意图，允许在已有选择基础上微调（或保持原选择直接就绪）
    ui.standbyBtn.disabled = false;
    ui.readyBtn.disabled = false;
    ui.p1SpeedUp.disabled = false;
    ui.p1SpeedDown.disabled = false;
    ui.waitingLabel.classList.remove('show');
    const snap = engine.getSnapshot();
    const p1State = snap.players[PlayerId.P1];
    ui.insightBtn.disabled = p1State.insightUsed || getEffectiveStamina(p1State) < 1;
  }
});

// 进入洞察期（30s）就立即提示，不等到倒计时结束
engine.on(EngineEvent.PHASE_SHIFT, ({ playerId }) => {
  ui.phaseIndicator.textContent = '暴露期';
  if (playerId === PlayerId.P1) {
    showInsightNotice('随着时间推移，你的意图已经处于被对方洞察的状态。');
  } else if (playerId === PlayerId.P2) {
    showInsightNotice('随着时间推移，对方的意图正在被你洞察。');
  }
});

engine.on(EngineEvent.PASSIVE_INSIGHT, ({ targetId, revealedAction, revealed }) => {
  const isP1Target = targetId === PlayerId.P1;
  const snap = engine.getSnapshot();

  // 只有真正揭示（对方已就绪）时才解锁信息并刷新 UI
  if (!isP1Target && revealed) {
    enemyInfoUnlocked = true;
    renderPlayerResources(snap.players[PlayerId.P1], snap.players[PlayerId.P2]);
  }

  // 只有真正揭示时才发出通知（避免阶段转换时的空提示）
  if (revealed) {
    const msg = isP1Target
      ? '你的意图已被对方锁定。'
      : `对方意图已暴露：【${ActionName[revealedAction?.action ?? 'standby']}】`;
    showInsightNotice(msg);
  }
});

// 所有引擎内部阶段变化，在此统一同步渲染（单一数据源）
// 引擎发出的格式：{ phaseEvent, state: getSnapshot() }
engine.on(EngineEvent.PHASE_STATE_SYNC, ({ state }) => {
  const p1 = state.players[PlayerId.P1];
  const p2 = state.players[PlayerId.P2];
  if (!p1 || !p2) return; // 引擎初始化完成前不渲染
  renderPlayerResources(p1, p2);
  updateStatusIcons(PlayerId.P1, p1);
  if (!p2.ready || enemyInfoUnlocked) {
    updateStatusIcons(PlayerId.P2, p2);
  }
  refreshPoints(); // 包含速度、可用行为状态的刷新
});

engine.on(EngineEvent.ACTIVE_INSIGHT, ({ casterId, revealedAction, revealed }) => {
  if (casterId === PlayerId.P1) {
    if (revealed && revealedAction) {
      // 对方已就绪，真正揭示意图
      enemyInfoUnlocked = true;
      const actName = ActionName[revealedAction.action] ?? '未知';
      showInsightNotice(`已洞察敌方意图：【${actName}】`);
      pendingInsightAction = null;

      // 主动洞察成功时立刻更新一次资源显示（刷新迷雾快照）
      const snap = engine.getSnapshot();
      renderPlayerResources(snap.players[PlayerId.P1], snap.players[PlayerId.P2]);
    } else {
      // 洞察已发起，对方尚未就绪
      pendingInsightAction = true; // 标记挂起，等 revealed 再清
      showInsightNotice('正在洞察对方意图…');
    }
    const snap = engine.getSnapshot();
    const p1 = snap.players[PlayerId.P1];
    if (!enforceUIConstraints(p1)) return;

    updatePips('p1-stam', p1.stamina, DefaultStats.MAX_STAMINA, 'stam');
    refreshPoints();

    if (!p1.ready) {
      ui.insightBtn.disabled = p1.insightUsed || getEffectiveStamina(p1) < 1;
    }
  }
});

engine.on(EngineEvent.ACTION_PHASE_START, () => {
  ui.phaseIndicator.textContent = '行动期';

  // 行动期开始时刷新状态图标：敌方信息仍遵循洞察解锁规则
  const snap = engine.getSnapshot();
  updateStatusIcons(PlayerId.P1, snap.players[PlayerId.P1]);
  if (!snap.players[PlayerId.P2].ready || enemyInfoUnlocked) {
    updateStatusIcons(PlayerId.P2, snap.players[PlayerId.P2]);
  }

  ui.actionNotice.textContent = '双方行动中: 3s';
  ui.actionNotice.classList.add('show');

  let left = 2;
  const intv = setInterval(() => {
    if (left > 0) {
      ui.actionNotice.textContent = `双方行动中: ${left}s`;
      left--;
    } else {
      clearInterval(intv);
      ui.actionNotice.classList.remove('show');
    }
  }, 1000);
  ui.actionNotice._intv = intv;
});

engine.on(EngineEvent.TURN_RESOLVED, result => {
  ui.phaseIndicator.textContent = '结算期';
  if (ui.actionNotice._intv) clearInterval(ui.actionNotice._intv);
  ui.actionNotice.classList.remove('show');

  document.body.classList.add('resolving');
  ui.insightNotice.classList.remove('show');
  ui.insightNotice.textContent = '';

  renderPlayerResources(result.newState.p1, result.newState.p2);


  ui.p1SpeedVal.textContent = DefaultStats.BASE_SPEED;
  ui.p2SpeedVal.textContent = DefaultStats.BASE_SPEED;

  const p1Eff = formatEffects(result.p1ExposedEffects);
  const p2Eff = formatEffects(result.p2ExposedEffects);

  let extDesc = result.clashDesc;
  if (p1Eff || p2Eff) {
    extDesc += `<br><br><span style="color:var(--text-muted);font-size:0.9em;opacity:0.8;">` +
      (p1Eff ? `你的携带效果：【${p1Eff}】` : '') +
      (p1Eff && p2Eff ? '<br>' : '') +
      (p2Eff ? `敌方携带效果：【${p2Eff}】` : '') +
      `</span>`;
  }

  ui.clashName.textContent = result.clashName;
  ui.logDetail.innerHTML = extDesc;
  ui.battleLog.classList.add('show');

  matchHistory.push(`
    <div style="color:var(--text-main);font-weight:bold;margin-bottom:4px">
      [TURN ${result.turn}] ${result.clashName}
    </div>
    <div style="color:var(--text-muted)">${extDesc}</div>
    ${result.damageToP1 > 0 ? `<div style="color:var(--color-hp)">你受到 ${result.damageToP1} 次伤害</div>` : ''}
    ${result.damageToP2 > 0 ? `<div style="color:var(--color-atk)">敌方受到 ${result.damageToP2} 次伤害</div>` : ''}
  `);
  updateHistoryUI();

  if (!isGameOver) {
    const hintText = ui.battleLog.querySelector('.log-hint');
    hintText.textContent = "5s 后自动关闭";

    let left = 4;
    const intv = setInterval(() => {
      if (left >= 0 && ui.battleLog.classList.contains('show')) {
        hintText.textContent = `${left}s 后自动关闭`;
        left--;
      } else {
        clearInterval(intv);
      }
    }, 1000);

    setTimeout(() => {
      if (ui.battleLog.classList.contains('show') && !isGameOver) {
        ui.battleLog.classList.add('fade-out');
      }
    }, 4000);

    setTimeout(() => {
      if (ui.battleLog.classList.contains('show') && !isGameOver) {
        ui.battleLog.classList.remove('show');
        ui.battleLog.classList.remove('fade-out');
        document.body.classList.remove('resolving');
        engine.acknowledgeResolve();
      }
    }, 5000);

    ui.turnIndicator.textContent = `TURN ${result.turn + 1}`;
    resetForNewTurn();
  }

  // 情报框：每回合结算后刷新并短暂自动显示
  updateIntelBox();
  if (engine.getSnapshot().players[PlayerId.P1].effectIntel?.length > 0) {
    showTemporaryIntelBox();
  }
});

engine.on(EngineEvent.GAME_OVER, ({ reason }) => {
  isGameOver = true;
  ui.logDetail.innerHTML += `<br><br><strong style="color:var(--color-atk)">${reason}</strong>`;
  ui.standbyBtn.disabled = true;
  ui.readyBtn.disabled = true;
  ui.insightBtn.disabled = true;

  // 倒计时5s后关闭战报，展示重新开始面板
  const hintText = ui.battleLog.querySelector('.log-hint');
  hintText.textContent = '5s 后自动关闭';

  let left = 4;
  const intv = setInterval(() => {
    if (left >= 0) {
      hintText.textContent = `${left}s 后自动关闭`;
      left--;
    } else {
      clearInterval(intv);
    }
  }, 1000);

  setTimeout(() => {
    if (ui.battleLog.classList.contains('show')) {
      ui.battleLog.classList.add('fade-out');
    }
  }, 4000);

  setTimeout(() => {
    ui.battleLog.classList.remove('show');
    ui.battleLog.classList.remove('fade-out');
    document.body.classList.remove('resolving');
    // 显示重新开始按鈕
    ui.restartBtn.classList.add('show');
  }, 5000);
});

// ═══════════════════════════════════════════════════════
// 辅助渲染
// ═══════════════════════════════════════════════════════

function formatEffects(effectIds) {
  if (!effectIds || !effectIds.length) return '';
  const names = effectIds
    .filter(id => id !== null)
    .map(id => EffectDefs[id]?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join('、') : '';
}

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
  updatePips('p1-hp', DefaultStats.MAX_HP, DefaultStats.MAX_HP, 'hp');
  updatePips('p1-stam', DefaultStats.MAX_STAMINA, DefaultStats.MAX_STAMINA, 'stam');
  updatePips('p2-hp', DefaultStats.MAX_HP, DefaultStats.MAX_HP, 'hp');
  updatePips('p2-stam', DefaultStats.MAX_STAMINA, DefaultStats.MAX_STAMINA, 'stam');
  refreshPoints();

  ui.p1Arc.style.strokeDashoffset = 0;
  ui.p2Arc.style.strokeDashoffset = 0;
  ui.p1Sec.textContent = TimerConfig.DECISION_TIME;
  ui.p2Sec.textContent = TimerConfig.DECISION_TIME;

  updateStatusIcons(PlayerId.P1, engine.getSnapshot().players[PlayerId.P1]);
  updateStatusIcons(PlayerId.P2, engine.getSnapshot().players[PlayerId.P2]);
}

function updateStatusIcons(playerId, state) {
  const tray = playerId === PlayerId.P1 ? ui.p1StatusTray : ui.p2StatusTray;
  if (!tray) return;
  tray.innerHTML = '';

  const addIcon = (filename, effectText, timingKey) => {
    const img = document.createElement('img');
    img.className = 'status-icon';
    img.src = `sq-du/effect/${filename}`;

    img.onclick = (e) => {
      e.stopPropagation();
      const tooltip = playerId === PlayerId.P1
        ? document.getElementById('p1StatusTooltip')
        : document.getElementById('p2StatusTooltip');

      if (!tooltip) return;
      if (tooltip._timeoutId) clearTimeout(tooltip._timeoutId);

      document.querySelectorAll('.status-tooltip').forEach(el => el.classList.remove('show'));
      const timingLabel = timingKey ? (EffectTimingLabel[timingKey] || timingKey) : null;
      tooltip.textContent = timingLabel
        ? `时机：${timingLabel} 效果：${effectText}`
        : `效果：${effectText}`;
      tooltip.classList.add('show');

      tooltip._timeoutId = setTimeout(() => {
        tooltip.classList.remove('show');
      }, 2000);
    };

    tray.appendChild(img);
  };

  if (state.staminaPenalty > 0) addIcon('tired.svg', `精力消耗 +${state.staminaPenalty}`, 'ACTION_START');
  if (state.staminaDiscount > 0) addIcon('excited.svg', `精力消耗 -${state.staminaDiscount}`, 'ACTION_START');
  if (state.guardBoost > 0) addIcon('shield.svg', `守备点数 +${state.guardBoost}`, 'ACTION_START');
  if (state.guardDebuff > 0) addIcon('broken-shield.svg', `守备点数 -${state.guardDebuff}`, 'ACTION_START');
  if (state.chargeBoost > 0) addIcon('strong.svg', `攻击点数 +${state.chargeBoost}`, 'ACTION_START');
  if (state.ptsDebuff > 0) addIcon('broken-knife.svg', `攻击点数 -${state.ptsDebuff}`, 'ACTION_START');
  if (state.dodgeBoost > 0) addIcon('avoid.svg', `闪避点数 +${state.dodgeBoost}`, 'ACTION_START');
  if (state.dodgeDebuff > 0) addIcon('heavy.svg', `闪避点数 -${state.dodgeDebuff}`, 'ACTION_START');
  if (state.agilityBoost > 0) addIcon('fast.svg', `动速 +${state.agilityBoost}`, 'ACTION_START');
  if (state.agilityDebuff > 0) addIcon('slow.svg', `动速 -${state.agilityDebuff}`, 'ACTION_START');
  if (state.hpDrain > 0) addIcon('wound.svg', `命数 -${state.hpDrain}`, 'ACTION_START');
  if (state.hpBonusNextTurn > 0) addIcon('treat.svg', `命数 +${state.hpBonusNextTurn}`, 'TURN_START');

  if (state.insightDebuff > 0) addIcon('weak-eye.svg', `洞察精力消耗 +1`, 'ACTION_START');
  if (state.insightDebuff < 0) addIcon('eye.svg', `洞察精力消耗 -1`, 'ACTION_START');
  if (state.insightBlocked) addIcon('close-eye.svg', `禁止洞察`, 'ACTION_START');
  if (state.actionBlocked) {
    if (state.actionBlocked.includes(Action.ATTACK)) addIcon('close-knife.svg', `禁止攻击`, 'ACTION_START');
    if (state.actionBlocked.includes(Action.DODGE)) addIcon('close-avoid.svg', `禁止闪避`, 'ACTION_START');
    if (state.actionBlocked.includes(Action.GUARD)) addIcon('close-shield.svg', `禁止防御`, 'ACTION_START');
  }
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
  const p1 = snap.players[PlayerId.P1];
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
        const nameEl = document.createElement('div');
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
        swapEl.dataset.slot = idx;

        actionsEl.appendChild(changeEl);
        actionsEl.appendChild(swapEl);
        slotEl.appendChild(nameEl);
        slotEl.appendChild(actionsEl);
      } else {
        const plus = document.createElement('span');
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
  ui.effectPickerList.scrollTop = 0; // 切换动作或槽位时，重置列表滚动位置
  ui.effectPickerList.innerHTML = '';

  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];
  const inv = p1.effectInventory?.[action] ?? [];

  // 已装备在其他槽的效果 ID 集合（不含当前槽）
  const equippedElsewhere = new Set(
    (p1.equippedEffects?.[action] ?? []).filter((id, i) => i !== slot && id !== null)
  );

  inv.forEach(effectId => {
    const def = EffectDefs[effectId];
    if (!def) return;
    const meta = getEffectMeta(effectId);
    // 同效果只能装备一格，已在其他槽的不显示
    if (equippedElsewhere.has(effectId)) return;

    const item = document.createElement('div');
    item.className = 'effect-item';

    item.innerHTML = `
      <div class="effect-item-main">
        <div class="effect-item-name">${meta.name}</div>
        <div class="effect-item-desc">${meta.desc}</div>
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
  const p1 = snap.players[PlayerId.P1];
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
    const slot = parseInt(swapBtn.dataset.slot, 10);
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
  const slot = parseInt(slotEl.dataset.slot, 10);

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

  // 常规流程：打开或切换效果库
  if (ui.effectPicker.classList.contains('show')) {
    const isSame = _pickCtx && _pickCtx.action === action && _pickCtx.slot === slot;
    if (isSame) {
      ui.effectPicker.classList.remove('show');
      _pickCtx = null;
      return;
    }
    // 如果点的是另一个槽，不再执行 return，而是直接透传给下方的 openEffectPicker 重新刷新内容
  }
  openEffectPicker(action, slot);
});

// 监听回合结束期（1s）
engine.on(EngineEvent.TURN_END_PHASE, () => {
  ui.phaseIndicator.textContent = '回合结束期';

  ui.turnEndCountdownHint.textContent = '1s 后自动关闭';
  ui.turnEndNotice.classList.add('show');

  let left = 1;
  const intv = setInterval(() => {
    left--;
    if (left >= 0) {
      ui.turnEndCountdownHint.textContent = `${left}s 后自动关闭`;
    }
  }, 1000);

  setTimeout(() => {
    clearInterval(intv);
    ui.turnEndNotice.classList.remove('show');
  }, 1000);
});

// 监听回合开始期（1s）
engine.on(EngineEvent.TURN_START_PHASE, () => {
  ui.phaseIndicator.textContent = '回合开始期';
  ui.equipOverlayTitle.textContent = '装配期';

  // 回合开始：先刷新一次，敌方图标是否可见由可见性策略决定
  const snap = engine.getSnapshot();
  updateStatusIcons(PlayerId.P1, snap.players[PlayerId.P1]);
  if (EffectLayer.canExposeOpponentRuntime(snap.players[PlayerId.P1], snap.players[PlayerId.P2], enemyInfoUnlocked)) {
    updateStatusIcons(PlayerId.P2, snap.players[PlayerId.P2]);
  }

  ui.roundStartCountdownHint.textContent = '1s 后自动关闭';
  ui.roundStartNotice.classList.add('show');

  let left = 1;
  const intv = setInterval(() => {
    left--;
    if (left >= 0) {
      ui.roundStartCountdownHint.textContent = `${left}s 后自动关闭`;
    }
  }, 1000);

  setTimeout(() => {
    clearInterval(intv);
    ui.roundStartNotice.classList.remove('show');
  }, 1000);
});

// 监听装备期开始事件 → 显示覆盖面板并倒计时
engine.on(EngineEvent.EQUIP_PHASE_START, ({ secondsLeft }) => {
  ui.equipCountdownHint.textContent = `${secondsLeft}s 后关闭`;
  if (!ui.equipOverlay.classList.contains('active')) {
    ui.phaseIndicator.textContent = '装配期';
    ui.equipOverlay.classList.add('active');
    // 每次进入装备期都刷新槽位显示
    refreshEquipSlots();
    // 主操作区禁用
    ui.standbyBtn.disabled = true;
    ui.readyBtn.disabled = true;
    ui.insightBtn.disabled = true;
  }
});

// 监听装备期结束事件 → 隐藏覆盖面板，启用主操作区
engine.on(EngineEvent.EQUIP_PHASE_END, () => {
  ui.phaseIndicator.textContent = '决策期';
  ui.equipOverlay.classList.remove('active');
  ui.effectPicker.classList.remove('show');

  const snap = engine.getSnapshot();
  const p1 = snap.players[PlayerId.P1];

  if (!p1.ready) {
    ui.standbyBtn.disabled = false;
    ui.readyBtn.disabled = false;
    ui.insightBtn.disabled = p1.insightUsed || getEffectiveStamina(p1) < 1;
  }
});

// ═══════════════════════════════════════════════════════
// 情报框更新
// ═══════════════════════════════════════════════════════

function updateIntelBox() {
  const snap = engine.getSnapshot();
  const intel = snap.players[PlayerId.P1].effectIntel ?? [];

  ui.intelList.innerHTML = '';

  if (intel.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'intel-empty';
    empty.textContent = '尚未获取任何情报';
    ui.intelList.appendChild(empty);
    return;
  }

  const grouped = {
    [Action.ATTACK]: [],
    [Action.GUARD]: [],
    [Action.DODGE]: []
  };

  const actionName = {
    [Action.ATTACK]: '攻击',
    [Action.GUARD]: '守备',
    [Action.DODGE]: '闪避',
  };

  // 分类归档
  intel.forEach(effectId => {
    const def = EffectDefs[effectId];
    if (!def) return;
    def.applicableTo.forEach(act => {
      if (grouped[act]) grouped[act].push(effectId);
    });
  });

  // 渲染各类别
  [Action.ATTACK, Action.GUARD, Action.DODGE].forEach(act => {
    if (grouped[act].length === 0) return;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'intel-group';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'intel-group-title';
    titleDiv.textContent = actionName[act];
    groupDiv.appendChild(titleDiv);

    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'intel-group-tags';

    grouped[act].forEach(effectId => {
      const meta = getEffectMeta(effectId);
      const tag = document.createElement('div');
      tag.className = 'intel-tag';
      tag.innerHTML = `<strong>${meta.name}</strong><span>${meta.desc}</span>`;
      tagsDiv.appendChild(tag);
    });

    groupDiv.appendChild(tagsDiv);
    ui.intelList.appendChild(groupDiv);
  });
}

function showTemporaryIntelBox() {
  ui.intelBox.classList.add('show');
  ui.intelBox.classList.remove('fade-out');

  if (ui.intelBox._timeoutIdFade) clearTimeout(ui.intelBox._timeoutIdFade);
  if (ui.intelBox._timeoutIdClose) clearTimeout(ui.intelBox._timeoutIdClose);

  ui.intelBox._timeoutIdFade = setTimeout(() => {
    ui.intelBox.classList.add('fade-out');
  }, 3000);

  ui.intelBox._timeoutIdClose = setTimeout(() => {
    ui.intelBox.classList.remove('show');
    ui.intelBox.classList.remove('fade-out');
  }, 4000);
}

// 绑定 P2 人物框的情报图标点击事件
if (ui.p2IntelBtn) {
  ui.p2IntelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.intelBox.classList.remove('fade-out');
    ui.intelBox.classList.toggle('show');
    if (ui.intelBox._timeoutIdFade) clearTimeout(ui.intelBox._timeoutIdFade);
    if (ui.intelBox._timeoutIdClose) clearTimeout(ui.intelBox._timeoutIdClose);
  });
}

const intelClose = document.getElementById('intelClose');
if (intelClose) {
  intelClose.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.intelBox.classList.remove('show');
    ui.intelBox.classList.remove('fade-out');
    if (ui.intelBox._timeoutIdFade) clearTimeout(ui.intelBox._timeoutIdFade);
    if (ui.intelBox._timeoutIdClose) clearTimeout(ui.intelBox._timeoutIdClose);
  });
}

if (ui.globalPauseBtn) {
  const pauseOverlay = $('pauseOverlay');
  ui.globalPauseBtn.addEventListener('click', () => {
    const isPaused = engine.togglePause();
    ui.globalPauseBtn.textContent = isPaused ? '▶︎' : '⏸︎';
    ui.globalPauseBtn.classList.toggle('is-paused', isPaused);
    if (pauseOverlay) {
      pauseOverlay.classList.toggle('active', isPaused);
    }
  });
}

initUI();
engine.startGame();
