/**
 * @file ai-scheduler.js
 * @description 博弈战斗系统 — AI 时机调度层（纯 I/O，无计算逻辑）
 *
 * 职责：
 *  - 决定 AI 何时提交行动（setTimeout 机制）
 *  - 决定 AI 是否/何时发起洞察（智能局面感知）
 *  - 决定 AI 在重决策时是否修改指令
 *
 * 本层不包含任何打分或策略计算，全部委托给 AIJudgeLayer。
 */

'use strict';

import { Action, DefaultStats, EngineState, PlayerId } from '../base/constants.js';
import { AIBaseLogic } from './ai-base.js';
import { AIJudgeLayer } from './ai-judge.js';

// ═══════════════════════════════════════════════════════════
// 公开调度接口（被 engine.js 调用）
// ═══════════════════════════════════════════════════════════

/**
 * 普通决策调度：在合适时机提交 AI 行动。
 */
export function scheduleAI(ctx) {
  const { ai, player } = ctx.getState();
  const getHistory = () => (ctx.getHistory ? ctx.getHistory() : []);
  const snap = AIBaseLogic.snapshot(ai, player, getHistory());

  // ── 洞察决策：局面感知驱动，非纯随机 ─────────
  const aiEffective = AIBaseLogic.getEffectiveStamina(ai);
  if (ctx.useInsight && !ai.insightUsed && _shouldUseInsight(snap, ai, aiEffective)) {
    return _scheduleWithInsight(ctx, snap, aiEffective, getHistory);
  }

  // ── 普通决策：60% 快速 / 30% 中速 / 10% 压线 ──
  const delay = _pickDelay();
  const handle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;
    const currentAi = ctx.getState().ai;
    const decision  = AIJudgeLayer.buildDecision(currentAi, ctx.getState().player, getHistory());
    ctx.submitAction(PlayerId.P2, decision);
    ctx.setReady(PlayerId.P2);
  }, delay);

  return { cancel: () => clearTimeout(handle) };
}

/**
 * 重决策调度：已知对手底牌时，决定是否修改指令。
 */
export function scheduleAIRedecide(ctx) {
  // 快速反应（300-1500ms），模拟"看到底牌后迅速判断"
  const delay = 300 + Math.random() * 1200;

  const handle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;

    const { ai, player, revealedAction } = ctx.getState();
    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);
    const getHistory = () => (ctx.getHistory ? ctx.getHistory() : []);

    // 无精力：无法行动，必须弃权
    if (effectiveStamina <= 0) {
      ctx.declineRedecide(PlayerId.P2);
      return;
    }

    const decision = _evaluateRedecide(ai, player, revealedAction, effectiveStamina, getHistory);

    if (decision === null) {
      ctx.declineRedecide(PlayerId.P2);
    } else {
      ctx.requestRedecide(PlayerId.P2);
      ctx.submitAction(PlayerId.P2, decision);
      ctx.setReady(PlayerId.P2);
    }
  }, delay);

  return { cancel: () => clearTimeout(handle) };
}

// ═══════════════════════════════════════════════════════════
// 内部辅助：洞察感知评分
// ═══════════════════════════════════════════════════════════

/**
 * 局面感知驱动的洞察决策。
 * 非随机——基于以下维度评分：
 *  1. 自身危险程度（低血量时信息越重要）
 *  2. 对手威胁积累（高精力 + 高攻击倾向 = 可能有大招）
 *  3. 对手行为突变（连击链断裂 = 战术切换，需要情报）
 *  4. 斩杀确认（对手濒危时确认是否能处决）
 *  5. 精力冗余（自身精力充足时洞察成本低）
 */
function _shouldUseInsight(snap, ai, aiEffective) {
  if (aiEffective < 2) return false; // 需至少留 1 精力给行动

  let score = 0;

  // 自身危险：越接近死亡，情报越值钱
  const dangerRatio = Math.max(0, (0.4 - snap.aiHpRatio) / 0.4);
  score += dangerRatio * 3.0; // 0.4 HP 以下线性增加，最高 3.0

  // 对手威胁态势：高精力 + 近期频繁攻击 = 大招风险
  const oppThreat = snap.oppStaminaTrend * snap.oppAggression;
  score += oppThreat * 0.6;

  // 对手行为突变：连击链断裂意味着战术切换，需要情报
  if (snap.oppActionStreak <= 1) score += 0.8;

  // 斩杀确认：对手濒危时用情报锁定而非盲攻
  if (snap.playerHpRatio <= 0.25 && aiEffective >= 3) score += 1.5;

  // 精力冗余：自身精力越多，洞察成本越低
  score += (snap.aiStaminaRatio - snap.playerStaminaRatio) * 0.8;

  // 对手几乎无精力：不构成威胁，洞察价值低
  if (snap.playerStaminaRatio <= 0.15) score -= 1.5;

  // 阈值：分数不足时不洞察（避免无意义消耗）
  const BASE_THRESHOLD = 1.8;
  if (score < BASE_THRESHOLD) return false;

  // 分数转化为概率（最高 65%，避免 AI 失去不确定性）
  const prob = Math.min(0.65, (score - BASE_THRESHOLD) / 4.0 + 0.15);
  return Math.random() < prob;
}

/**
 * 带洞察的行动调度：先发洞察，异步等待结果后提交行动。
 */
function _scheduleWithInsight(ctx, snap, aiEffective, getHistory) {
  // 洞察时机：2-8s，模拟"观察一会儿再出手"
  const insightDelay = (2 + Math.random() * 6) * 1000;

  const insightHandle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;
    const currentAi = ctx.getState().ai;
    if (AIBaseLogic.getEffectiveStamina(currentAi) >= 1 && !currentAi.ready) {
      ctx.useInsight(PlayerId.P2, PlayerId.P1);
    }
  }, insightDelay);

  // 兜底：最晚在 22-28s 时强制提交行动（防止超时）
  const fallbackDelay = (22 + Math.random() * 6) * 1000;
  const fallbackHandle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;
    const currentAi = ctx.getState().ai;
    if (currentAi.ready) return;
    const decision = AIJudgeLayer.buildDecision(currentAi, ctx.getState().player, getHistory());
    ctx.submitAction(PlayerId.P2, decision);
    ctx.setReady(PlayerId.P2);
  }, fallbackDelay);

  return { cancel: () => { clearTimeout(insightHandle); clearTimeout(fallbackHandle); } };
}

/**
 * 重决策评估：返回修改后的决策，或 null 表示弃权。
 */
function _evaluateRedecide(ai, player, revealedAction, effectiveStamina, getHistory) {
  const revealed = revealedAction;
  const snap = AIBaseLogic.snapshot(ai, player, getHistory());
  const indicators = AIBaseLogic.buildIndicators(snap, effectiveStamina);

  // ── 斩杀窗口：绝对不弃权 ────────────────────
  if ((indicators.killWindow > 0 || indicators.executeWindow > 0) && effectiveStamina >= 1) {
    return AIJudgeLayer.buildRedecideDecision(ai, player, revealed, getHistory());
  }

  // ── 对手出攻击：威胁度驱动是否重决策 ──────────
  if (revealed?.action === Action.ATTACK) {
    // 危险程度越高，越倾向重决策防守
    const dangerFactor = 0.50 + indicators.aiDanger * 0.40;
    if (Math.random() < dangerFactor) {
      return AIJudgeLayer.buildRedecideDecision(ai, player, revealed, getHistory());
    }
    return null;
  }

  // ── 对手出被动（待命/守备）：进攻机会评估 ─────
  if (revealed?.action === Action.STANDBY && effectiveStamina >= 1) {
    // 待命是最好的攻击机会，高概率进攻
    if (Math.random() < 0.70) {
      return AIJudgeLayer.buildRedecideDecision(ai, player, revealed, getHistory());
    }
    return null;
  }

  if (revealed?.action === Action.GUARD && effectiveStamina >= 2) {
    // 守备时：只有精力充足（可强化破防）才值得改动
    if (Math.random() < 0.45) {
      return AIJudgeLayer.buildRedecideDecision(ai, player, revealed, getHistory());
    }
    return null;
  }

  // ── 对手出闪避：攻击大概率被闪开，通常弃权 ────
  if (revealed?.action === Action.DODGE) {
    // 有足够精力加速超越时，小概率尝试
    if (effectiveStamina >= 2 && Math.random() < 0.30) {
      return AIJudgeLayer.buildRedecideDecision(ai, player, revealed, getHistory());
    }
    return null;
  }

  return null;
}

/**
 * 行动延迟分布：60% 快速 / 30% 中速 / 10% 压线
 */
function _pickDelay() {
  const r = Math.random();
  const early = () => Math.min(Math.random(), Math.random()); // 偏向早段
  return r < 0.60
    ? (5  + early() * 15) * 1000
    : r < 0.90
      ? (20 + early() * 10) * 1000
      : (30 + early() * 10) * 1000;
}
