/**
 * @file ai-base.js
 * @description 博弈战斗系统 — AI 基础决策控制器（解耦分轴版）
 *
 * 架构原则：
 *  - 决策不是 "对手用了X → 我就用Y" 的情形配对
 *  - 而是在几条独立轴上各自打分，最终权重叠加自然涌现出行动
 *
 *  ┌─────────────────────────────────────────────┐
 *  │  情势评估（数值快照）                        │
 *  │    ↓ 独立                                    │
 *  │  行动类型轴打分  ←┐                         │
 *  │  速度轴打分      ←┤ 各轴互不感知，独立评价  │
 *  │  强化轴打分      ←┘                         │
 *  │    ↓ 叠加                                    │
 *  │  最终决策涌现                                │
 *  └─────────────────────────────────────────────┘
 *
 *  未来加入效果类时，只需在对应轴的打分函数里追加一条权重影响，
 *  不需要增加任何 if-else 情形分支。
 *
 * 对外接口：
 *  - scheduleAI(ctx)      → 时机调度（引擎调用）
 *  - buildDecision(ai, player, history) → 纯决策（可独立测试）
 */

'use strict';

import {
  Action,
  DefaultStats,
  EffectDefs,
  EngineState,
  PlayerId,
} from '../base/constants.js';

// ═══════════════════════════════════════════════════════════
// 时机调度（供引擎调用）
// ═══════════════════════════════════════════════════════════

/**
 * 为 AI 安排异步决策并在合适时机提交行动。
 * @param {{ getState, engineState, submitAction, setReady, getHistory }} ctx
 * @returns {{ cancel: () => void }}
 */
export function scheduleAI(ctx) {
  // 决策时间分布：
  //   60% → 5 ~ 20s（快速反应）
  //   30% → 20 ~ 30s（常规思考）
  //   10% → 30 ~ 40s（谨慎考虑）
  // 每档内 min(r1,r2) 向低端偏斜，避免总在末尾才决策。
  const early = () => Math.min(Math.random(), Math.random());
  const r = Math.random();
  const delay = r < 0.60
    ? (5 + early() * 15) * 1000
    : r < 0.90
      ? (20 + early() * 10) * 1000
      : (30 + early() * 10) * 1000;

  const handle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;

    const { ai, player } = ctx.getState();
    const history = ctx.getHistory ? ctx.getHistory() : [];
    const decision = buildDecision(ai, player, history);
    ctx.submitAction(PlayerId.P2, decision);
    ctx.setReady(PlayerId.P2);
  }, delay);

  return { cancel: () => clearTimeout(handle) };
}

// ═══════════════════════════════════════════════════════════
// 核心决策（纯函数，可独立测试）
// ═══════════════════════════════════════════════════════════

/**
 * AI 决策主入口。
 *
 * 三个维度完全独立决策，互不感知：
 *   1. 行动类型（攻击 / 守备 / 闪避 / 待命）
 *   2. 速度（消耗几格精力加速）
 *   3. 强化（消耗额外精力提升点数）
 *
 * @param {import('../base/constants.js').PlayerState} ai
 * @param {import('../base/constants.js').PlayerState} player
 * @param {HistoryEntry[]} history - 最近几回合的属性快照（不含情形名称）
 * @returns {Partial<import('../base/constants.js').ActionCtx>}
 */
export function buildDecision(ai, player, history = []) {
  // 精力为 0 → 唯一选项：待命
  if (ai.stamina <= 0) {
    return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
  }

  // ── Axis 0：情势快照（只读数值，不下结论） ─────────────
  const snap = _snapshot(ai, player, history);

  // ── Axis 1：行动轴打分 → 涌现行动类型 ─────────────────
  const action = _pickAction(snap, ai);

  // ── Axis 2：速度轴打分（不感知 action 的语义）──────────
  const speed = _pickSpeed(snap, action, ai);

  // ── Axis 3：强化轴打分（不感知 action / speed 的语义）─
  const enhance = _pickEnhance(snap, action, ai);

  // ── Axis 4：效果轴（直接从效果库报满，不走装备期）──
  const effects = _pickEffects(action, enhance, ai);

  return { action, enhance, speed, effects };
}

// ═══════════════════════════════════════════════════════════
// Axis 0：情势快照
// ═══════════════════════════════════════════════════════════

/**
 * 把当前状态和历史归纳为若干无量纲压力值（−1 ~ +1 或 0 ~ 1）。
 * 后续各轴打分函数只消费这些归纳值，不直接读取原始状态。
 *
 * @typedef {{
 *   aiHpRatio:          number,  // 自身气数占比 0~1，越低越危险
 *   playerHpRatio:      number,  // 对手气数占比 0~1，越低越有机会
 *   aiStaminaRatio:     number,  // 自身精力占比 0~1
 *   playerStaminaRatio: number,  // 对手精力占比 0~1，越低越有处决机会
 *   oppSpeedTrend:      number,  // 对手速度倾向 0~MAX_SPEED（历史均值）
 *   oppEnhanceTrend:    number,  // 对手强化倾向 0~MAX_ENHANCE（历史均值）
 *   oppAggression:      number,  // 对手进攻倾向 0~1（历史攻击比例）
 * }} Snapshot
 */
function _snapshot(ai, player, history) {
  const MAX_STAMINA = DefaultStats.MAX_STAMINA;
  const MAX_HP = DefaultStats.MAX_HP;

  // 历史属性均值（只记数值，不记情形）
  const recent = history.slice(-3); // 只看最近 3 回合
  const oppSpeedTrend = recent.length
    ? recent.reduce((s, h) => s + (h.opponentSpeed ?? DefaultStats.BASE_SPEED), 0) / recent.length
    : DefaultStats.BASE_SPEED;
  const oppEnhanceTrend = recent.length
    ? recent.reduce((s, h) => s + (h.opponentEnhance ?? 0), 0) / recent.length
    : 0;
  const oppAggression = recent.length
    ? recent.filter(h => h.opponentAction === Action.ATTACK).length / recent.length
    : 0.33; // 无历史时假设均等

  return {
    aiHpRatio: ai.hp / MAX_HP,
    playerHpRatio: player.hp / MAX_HP,
    aiStaminaRatio: ai.stamina / MAX_STAMINA,
    playerStaminaRatio: player.stamina / MAX_STAMINA,
    oppSpeedTrend,
    oppEnhanceTrend,
    oppAggression,
  };
}

// ═══════════════════════════════════════════════════════════
// Axis 1：行动类型打分
// ═══════════════════════════════════════════════════════════

/**
 * 各行动基础权重为 1.0，各轴独立叠加修正量。
 * 不依赖行动对（"对手攻击 → 我守备"），只依赖压力数值。
 */
function _pickAction(snap, ai) {
  const w = { attack: 1.0, guard: 1.0, dodge: 1.0 };

  // ── 处决机会：对手精力耗尽时，攻击性质最强 ───────────
  if (snap.playerStaminaRatio <= 0) {
    w.attack += 8;
    w.guard *= 0.1;
    w.dodge *= 0.1;
  }

  // ── 自身气数压力：气数越低，防御性质权重越高 ──────────
  // 不是"气数=1才防"，而是线性压力，让行为更自然
  const aiHpPressure = 1 - snap.aiHpRatio;          // 0~1，越高越危险
  w.guard += aiHpPressure * 2.5;
  w.dodge += aiHpPressure * 1.5;
  w.attack -= aiHpPressure * 0.5;

  // ── 进攻机会：对手气数压力越高，攻击性质权重越高 ──────
  const playerHpPressure = 1 - snap.playerHpRatio;  // 0~1，越高机会越大
  if (ai.stamina >= 2) {
    w.attack += playerHpPressure * 3.0;
  }

  // ── 对手近期进攻倾向：对手越爱攻击，我越倾向防御 ──────
  // 这是纯属性反应：对手攻击性高 → 我受击概率高 → 防御价值高
  w.guard += snap.oppAggression * 1.5;
  w.dodge += snap.oppAggression * 1.0;
  w.attack -= snap.oppAggression * 0.5;

  // ── 精力预算：精力越少，越不值得主动出击 ──────────────
  if (snap.aiStaminaRatio <= 0.34) { // 仅剩 1 格
    // 剩 1 格时攻击和守备消耗一样，但守备更安全
    w.guard += 1.0;
    w.attack -= 0.5;
  }

  return _pickWeighted({ [Action.ATTACK]: w.attack, [Action.GUARD]: w.guard, [Action.DODGE]: w.dodge });
}

// ═══════════════════════════════════════════════════════════
// Axis 2：速度打分
// ═══════════════════════════════════════════════════════════

/**
 * 速度决策与行动类型语义解耦：
 *  - 不是"因为我要袭击所以加速"
 *  - 而是"当前对手速度倾向高 / 我精力充足 → 速度性质权重增加"
 *
 * 返回的速度是 BASE_SPEED + 额外加速格数（每格消耗 1 精力）。
 * 加速需预留精力，因此内部会做可行性检查。
 */
function _pickSpeed(snap, action, ai) {
  const BASE = DefaultStats.BASE_SPEED;

  let speedBoostWeight = 0;

  // 对手速度倾向高 → 速度性质的价值升高
  speedBoostWeight += (snap.oppSpeedTrend - BASE) * 0.8;

  // 对手进攻倾向高 → 快就能抢先或弹开攻击
  speedBoostWeight += snap.oppAggression * 0.5;

  // ── 生存法则：防抽干的平滑权重曲线 ──
  // 精力越趋近于满，加速欲望越高；一旦脱离满精力（<0.9），为了避免把自己抽干吃处决，意愿会大幅倒扣！
  // 满精力(1.0) -> +0.4 ; 两格(0.66) -> -0.9 ; 一格(0.33) -> -2.2
  speedBoostWeight += (snap.aiStaminaRatio - 0.9) * 4.0;

  // 杀机对冲：如果你快死了或者你快没精力了，它的求生恐惧就会被嗜血欲抵消
  const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
  speedBoostWeight += playerWeakness * 2.0;

  // 闪避时：速度决定能否在攻击前挂载闪避 buff
  // “如果对手进攻倾向高，我需要更快雨年花彈”
  if (action === Action.DODGE) speedBoostWeight += snap.oppAggression * 1.2;

  // 精力不足时降低加速意愿（需给行动本身留出 1 格）
  const availableForBoost = ai.stamina - 1;  // 行动本身消耗 1
  if (availableForBoost <= 0) return BASE;

  const boostProb = Math.max(0, Math.min(0.9, 0.3 + speedBoostWeight * 0.3));
  const boost = Math.random() < boostProb ? 1 : 0;

  const canAfford = ai.stamina >= 1 + boost;
  return BASE + (canAfford ? boost : 0);
}

// ═══════════════════════════════════════════════════════════
// Axis 3：强化打分
// ═══════════════════════════════════════════════════════════

/**
 * 强化决策与行动类型和速度解耦：
 *  - 攻击/守备：对手强化倾向高 → 我的点数性质价值升高
 *  - 闪避：对手攻击点数高 → 需提升闪避幅度来对抗（防“强突”）
 *  - 待命无需强化
 */
function _pickEnhance(snap, action, ai) {
  if (action === Action.STANDBY) return 0;

  // ─── 闪避强化分支：决定是否提升闪避幅度 ───
  if (action === Action.DODGE) {
    // 闪避幅度强化的价値：对手攻击倾向高时，提升幅度可防止“强突”
    let dodgeEnhWeight = snap.oppEnhanceTrend * 0.9;    // 对手倾向大力度则我需提升幅度
    dodgeEnhWeight += snap.oppAggression * 0.7;         // 对手进攻性高

    const dodgeEnhanceable = snap.aiStaminaRatio > 0.67;
    if (!dodgeEnhanceable) return 0;

    const dodgeEnhProb = Math.max(0, Math.min(0.85, 0.15 + dodgeEnhWeight * 0.4));
    return Math.random() < dodgeEnhProb ? 1 : 0;
  }

  // ─── 攻击/守备强化分支 ───
  // 对手越倾向于强化（高点数），我越需要提升点数来对抗
  let enhWeight = snap.oppEnhanceTrend * 0.8;

  // 对手进攻时我守备，对手点数更高的威胁驱动守备强化
  if (action === Action.GUARD) enhWeight += snap.oppAggression * 0.6;

  // 攻击时，对手气数压力高 → 强化有助于破势
  if (action === Action.ATTACK) enhWeight += (1 - snap.playerHpRatio) * 0.5;

  // 精力预算：需要给行动本身（1格）和已选加速留空间
  // 此处 speed 已在 Axis2 决定（通过行动 cost 预算），
  // 但强化轴不感知 speed 的具体值，只感知"剩余精力压力"
  const enhanceable = snap.aiStaminaRatio > 0.67; // 精力 >= 2/3（至少 2 格）
  if (!enhanceable) return 0;

  const enhProb = Math.max(0, Math.min(0.85, 0.2 + enhWeight * 0.35));
  return Math.random() < enhProb ? 1 : 0;
}

// ═══════════════════════════════════════════════════════════
// 工具：按权重随机选择
// ═══════════════════════════════════════════════════════════

/**
 * @param {Record<string, number>} weightMap  - { key: weight }，weight 自动 clamp 到 0
 * @returns {string}
 */
function _pickWeighted(weightMap) {
  const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
  if (entries.length === 0) return Object.keys(weightMap)[0]; // 兜底

  const total = entries.reduce((s, [, w]) => s + w, 0);
  let rand = Math.random() * total;

  for (const [key, w] of entries) {
    rand -= w;
    if (rand <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// ═══════════════════════════════════════════════════════════
// 历史记录类型说明（JSDoc）
// ═══════════════════════════════════════════════════════════

/**
 * @typedef {Object} HistoryEntry
 * 单回合的属性快照（只记录原始数值，不记录情形名称）。
 * 由引擎/外部调用方负责构建和传入，AI 只做读取。
 *
 * @property {string} opponentAction   - 对手上一回合的行动类型（Action 枚举）
 * @property {number} opponentSpeed    - 对手上一回合使用的速度值
 * @property {number} opponentEnhance  - 对手上一回合的强化次数
 * @property {number} opponentStamina  - 对手上一回合结算后的精力值
 */

// ═══════════════════════════════════════════════════════════
// AI 重新决策（已知对手意图时的完美信息决策）
// ═══════════════════════════════════════════════════════════

/**
 * AI 收到重新决策邀请时的调度器。
 *
 * AI 不总是选择重决策：
 *  - 30% 概率直接弃权（对当前选择有信心，或不值得改变）
 *  - 70% 概率利用已知信息重新决策，反应时间 0.3~1.5s（比正常决策更快）
 *
 * @param {{
 *   engineState:    () => string,
 *   getState:       () => { ai: PlayerState, player: PlayerState, revealedAction: ActionCtx },
 *   requestRedecide: (id: string) => void,
 *   declineRedecide: (id: string) => void,
 *   submitAction:   (id: string, dec: object) => void,
 *   setReady:       (id: string) => void,
 * }} ctx
 * @returns {{ cancel: () => void }}
 */
export function scheduleAIRedecide(ctx) {
  // 反应时间比正常快：已有信息，0.3~1.5s
  const delay = (300 + Math.random() * 1200);

  const handle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;

    const { ai, player, revealedAction } = ctx.getState();

    // 30% 直接弃权：AI 对已有决策有信心，或局势让改变无意义
    if (ai.stamina <= 0 || Math.random() < 0.30) {
      ctx.declineRedecide(PlayerId.P2);
      return;
    }

    const decision = buildRedecideDecision(ai, player, revealedAction);
    ctx.requestRedecide(PlayerId.P2);
    ctx.submitAction(PlayerId.P2, decision);
    ctx.setReady(PlayerId.P2);
  }, delay);

  return { cancel: () => clearTimeout(handle) };
}

/**
 * AI 重新决策核心：已知对手意图时的完美信息分轴决策。
 *
 * 架构原则（同 buildDecision）：
 *  - 不做情形配对（不是"对手攻击 → 我就守备"）
 *  - 对手的已知属性（行动性质、速度值、点数值）各作为独立的新轴
 *    影响对应的决策轴权重，最终由各轴叠加涌现出反制方向
 *
 * @param {import('./constants.js').PlayerState} ai
 * @param {import('./constants.js').PlayerState} player
 * @param {import('./constants.js').ActionCtx}   revealedAction - 对手已揭示的意图
 * @returns {Partial<import('./constants.js').ActionCtx>}
 */
export function buildRedecideDecision(ai, player, revealedAction) {
  if (ai.stamina <= 0) {
    return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
  }

  const snap = _snapshot(ai, player, []);
  const revealed = revealedAction ?? {
    action: Action.STANDBY, speed: DefaultStats.BASE_SPEED, enhance: 0, pts: 0,
  };

  // ── Axis 1：行动类型打分（完美信息版）─────────────────────────────
  const w = { attack: 1.0, guard: 1.0, dodge: 1.0 };

  // 基础情势权重（与正常决策相同，保持连续性）
  if (player.stamina <= 0) { w.attack += 8; w.guard *= 0.1; w.dodge *= 0.1; }
  const aiHpPressure = 1 - snap.aiHpRatio;
  w.guard += aiHpPressure * 2.0;
  w.dodge += aiHpPressure * 1.2;
  if (ai.stamina >= 2) w.attack += (1 - snap.playerHpRatio) * 2.5;

  // ── 已知对手意图的「进攻性」和「防御被动性」两个独立属性轴 ─────────
  //    不直接用情形名，用这两个连续值代替，各自独立影响不同决策轴
  const REVEAL_W = 5.0; // 完美信息的权重放大系数

  // 进攻性（对手意图对我的威胁程度，0~1 连续值）
  const attackNature = {
    [Action.ATTACK]: 1.0,   // 强威胁
    [Action.DODGE]: 0.2,   // 轻微威胁（对我的攻击会规避）
    [Action.GUARD]: -0.2,   // 反威胁（守备本身不主动攻我）
    [Action.STANDBY]: -0.5,   // 无威胁
  }[revealed.action] ?? 0;

  // 防御被动性（对手意图在多大程度上「等待被击」）
  const passiveNature = {
    [Action.STANDBY]: 1.2,   // 完全被动
    [Action.GUARD]: 1.0,   // 被动防守
    [Action.DODGE]: 0.4,   // 躲避中
    [Action.ATTACK]: -0.3,   // 主动进攻
  }[revealed.action] ?? 0;

  // 进攻性高 → 防御价值上升
  w.guard += attackNature * REVEAL_W * 1.3;
  w.dodge += attackNature * REVEAL_W * 0.8;
  w.attack -= attackNature * REVEAL_W * 0.4;

  // 防御被动性高 → 攻击价值上升
  w.attack += passiveNature * REVEAL_W * 1.5;
  w.guard -= passiveNature * REVEAL_W * 0.3;
  w.dodge -= passiveNature * REVEAL_W * 0.3;

  const action = _pickWeighted({
    [Action.ATTACK]: Math.max(0, w.attack),
    [Action.GUARD]: Math.max(0, w.guard),
    [Action.DODGE]: Math.max(0, w.dodge),
  });

  // ── Axis 2：速度轴（对手速度值作为独立轴影响我的速度决策）──────────
  const revealedSpeed = revealed.speed ?? DefaultStats.BASE_SPEED;
  let speedBoostWeight = 0;
  // 对手速度越高，速度性质的价值越高（对双方都是）
  speedBoostWeight += (revealedSpeed - DefaultStats.BASE_SPEED) * 1.5;
  // 我选闪避时，速度是核心（与行动无关的轴性质）
  if (action === Action.DODGE) speedBoostWeight += 1.5;

  // 上帝视角下的生存与击杀权重博弈
  speedBoostWeight += (snap.aiStaminaRatio - 0.9) * 4.0;
  const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
  speedBoostWeight += playerWeakness * 2.0;

  const availableForBoost = ai.stamina - 1;
  const boostProb = Math.max(0, Math.min(0.9, 0.25 + speedBoostWeight * 0.35));
  const boost = (availableForBoost > 0 && Math.random() < boostProb) ? 1 : 0;
  const speed = DefaultStats.BASE_SPEED + (ai.stamina >= 1 + boost ? boost : 0);

  // ── Axis 3：强化轴（对手点数值作为独立轴影响我的强化决策）──────────
  if (action === Action.STANDBY) {
    return { action, enhance: 0, speed };
  }

  const revealedPts = revealed.pts ?? (1 + (revealed.enhance ?? 0));
  let enhWeight = 0;
  // 对手点数越高，「我需要提升点数」的性质越强
  enhWeight += revealedPts * 0.5;

  // ── 生存法则：防抽干的平滑权重曲线 ──
  // 强化额外消耗 1 精力。为了防处决，非满状态大幅倒扣强化意愿
  enhWeight += (snap.aiStaminaRatio - 0.9) * 4.0;

  // 杀机对冲：对手越弱，这股保守防御的恐惧就越能被抵消，越敢于强化输出/防御
  const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
  enhWeight += playerWeakness * 2.5;

  const canEnhance = ai.stamina >= (1 + boost + 1);
  if (!canEnhance) return { action, enhance: 0, speed };

  const enhProb = Math.max(0, Math.min(0.85, 0.15 + enhWeight * 0.3));
  const enhance = Math.random() < enhProb ? 1 : 0;

  return { action, enhance, speed };
}

// ═══════════════════════════════════════════════════════════
// Axis 4：效果轴（AI 直接从效果库取用，不走装备期）
// ═══════════════════════════════════════════════════════════

/**
 * AI 效果选取：从该行动的效果库中取出所有可用效果，
 * 按 pts = 1 + enhance 个槽位填满，其余补 null。
 *
 * @param {string}  action  - Action 枚举值
 * @param {number}  enhance - 本回合强化次数
 * @param {import('../base/constants.js').PlayerState} ai
 * @returns {(string|null)[]} 长度为 EFFECT_SLOTS 的效果数组
 */
function _pickEffects(action, enhance, ai) {
  const EFFECT_SLOTS = 3;
  const slots = Math.min(1 + enhance, EFFECT_SLOTS);
  const inventory = (ai.effectInventory?.[action] ?? [])
    .filter(id => EffectDefs[id]?.applicableTo.includes(action));

  const result = Array(EFFECT_SLOTS).fill(null);
  for (let i = 0; i < slots && i < inventory.length; i++) {
    result[i] = inventory[i];
  }
  return result;
}
