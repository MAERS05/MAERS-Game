/**
 * @file ai-base.js
 * @description 博弈战斗系统 — AI 基础逻辑层
 *
 * 负责时机调度、基础盘面属性的打分评估。
 * 本层只产出分维度（行动、速度、强化）的打分结果，最终的聚合校验由 ai-judge 层处理。
 */

'use strict';

import { Action, DefaultStats, EngineState, PlayerId } from '../base/constants.js';
import { AIJudgeLayer } from './ai-judge.js';

// ═══════════════════════════════════════════════════════════
// 时机调度（引擎调用）
// ═══════════════════════════════════════════════════════════

/**
 * 为 AI 安排异步决策并在合适时机提交行动。
 */
export function scheduleAI(ctx) {
  const { ai, player } = ctx.getState();
  const history = ctx.getHistory ? ctx.getHistory() : [];
  const snap = AIBaseLogic.snapshot(ai, player, history);

    const wantInsight = ctx.useInsight && !ai.insightUsed && ai.stamina >= 1 && (
      (ai.stamina >= 2 && snap.playerHpRatio > 0.5 && Math.random() < 0.20) ||
      (snap.aiHpRatio <= 0.33 && Math.random() < 0.40)
    );

    if (wantInsight) {
      const insightDelay = (2 + Math.random() * 6) * 1000;
      const insightHandle = setTimeout(() => {
        if (ctx.engineState() !== EngineState.TICKING) return;
        const currentState = ctx.getState().ai;
        if (currentState.stamina >= 1 && !currentState.ready) {
          ctx.useInsight(PlayerId.P2, PlayerId.P1);
        }
      }, insightDelay);

      const fallbackDelay = (22 + Math.random() * 6) * 1000;
      const fallbackHandle = setTimeout(() => {
        if (ctx.engineState() !== EngineState.TICKING) return;
        const currentAi = ctx.getState().ai;
        if (currentAi.ready) return;
        
        const decision = AIJudgeLayer.buildDecision(currentAi, ctx.getState().player, ctx.getHistory ? ctx.getHistory() : []);
        ctx.submitAction(PlayerId.P2, decision);
        ctx.setReady(PlayerId.P2);
      }, fallbackDelay);

      return { cancel: () => { clearTimeout(insightHandle); clearTimeout(fallbackHandle); } };
    }

    const early = () => Math.min(Math.random(), Math.random());
    const r = Math.random();
    const delay = r < 0.60
      ? (5 + early() * 15) * 1000
      : r < 0.90
        ? (20 + early() * 10) * 1000
        : (30 + early() * 10) * 1000;

    const handle = setTimeout(() => {
      if (ctx.engineState() !== EngineState.TICKING) return;

      const currentAi = ctx.getState().ai;
      const decision = AIJudgeLayer.buildDecision(currentAi, ctx.getState().player, history);
      ctx.submitAction(PlayerId.P2, decision);
      ctx.setReady(PlayerId.P2);
    }, delay);

    return { cancel: () => clearTimeout(handle) };
  }

  /**
   * AI 重新决策调度器。
   */
export function scheduleAIRedecide(ctx) {
    const delay = (300 + Math.random() * 1200);

    const handle = setTimeout(() => {
      if (ctx.engineState() !== EngineState.TICKING) return;

      const { ai, player, revealedAction } = ctx.getState();

      const rdMinCost = Math.max(0, 1 + (ai.staminaPenalty || 0) - (ai.staminaDiscount || 0));
      if (ai.stamina < rdMinCost || Math.random() < 0.30) {
        ctx.declineRedecide(PlayerId.P2);
        return;
      }

      const decision = AIJudgeLayer.buildRedecideDecision(ai, player, revealedAction);
      ctx.requestRedecide(PlayerId.P2);
      ctx.submitAction(PlayerId.P2, decision);
      ctx.setReady(PlayerId.P2);
    }, delay);

    return { cancel: () => clearTimeout(handle) };
  }

export class AIBaseLogic {
  // ═══════════════════════════════════════════════════════════
  // Axis 0：情势快照
  // ═══════════════════════════════════════════════════════════

  static snapshot(ai, player, history) {
    const MAX_STAMINA = DefaultStats.MAX_STAMINA;
    const MAX_HP = DefaultStats.MAX_HP;

    const recent = history.slice(-3);
    const oppSpeedTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentSpeed ?? DefaultStats.BASE_SPEED), 0) / recent.length
      : DefaultStats.BASE_SPEED;
    const oppEnhanceTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentEnhance ?? 0), 0) / recent.length
      : 0;
    const oppStaminaTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentStamina ?? DefaultStats.MAX_STAMINA), 0) / recent.length
      : DefaultStats.MAX_STAMINA;
    const oppAggression = recent.length
      ? recent.filter(h => h.opponentAction === Action.ATTACK).length / recent.length
      : 0.33;
    const lastAction = recent.length ? recent[recent.length - 1].opponentAction : null;
    const sameActionStreak = (() => {
      if (!lastAction) return 0;
      let streak = 0;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].opponentAction !== lastAction) break;
        streak += 1;
      }
      return streak;
    })();

    return {
      aiHpRatio: ai.hp / MAX_HP,
      playerHpRatio: player.hp / MAX_HP,
      aiStaminaRatio: ai.stamina / MAX_STAMINA,
      playerStaminaRatio: player.stamina / MAX_STAMINA,
      oppSpeedTrend,
      oppEnhanceTrend,
      oppStaminaTrend,
      oppAggression,
      oppLastAction: lastAction,
      oppActionStreak: sameActionStreak,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 1：行动类型打分
  // ═══════════════════════════════════════════════════════════

  static pickAction(snap, ai) {
    const w = { attack: 1.0, guard: 1.0, dodge: 1.0, standby: 0.2 };

    if (snap.playerStaminaRatio <= 0) {
      w.attack += 9;
      w.guard *= 0.1;
      w.dodge *= 0.1;
      w.standby *= 0.05;
    }

    const aiHpPressure = 1 - snap.aiHpRatio;
    w.guard += aiHpPressure * 2.5;
    w.dodge += aiHpPressure * 1.5;
    w.attack -= aiHpPressure * 0.5;

    const aiEffectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
    const playerHpPressure = 1 - snap.playerHpRatio;
    if (aiEffectiveStamina >= 2) {
      w.attack += playerHpPressure * 3.0;
    }

    w.guard += snap.oppAggression * 1.5;
    w.dodge += snap.oppAggression * 1.0;
    w.attack -= snap.oppAggression * 0.5;

    // 这里不再减去 penalty/discount，因为在 validBudget 里会统一基于 effectiveStamina 裁剪
    const aiCostEstimate = 1; 
    const aiRemainingStamina = aiEffectiveStamina - aiCostEstimate;
    
    if (aiRemainingStamina <= 0) {
      w.guard += 1.6;
      w.attack -= 0.8;
      w.dodge -= 0.3;
      w.standby += 3.2;
    }

    // 低精力时更倾向待命回血，避免连续空转到被处决线
    if (aiEffectiveStamina <= 1 && snap.playerStaminaRatio > 0) {
      w.standby += 2.8;
      w.attack -= 0.6;
    }
    if (aiEffectiveStamina <= 2 && snap.playerHpRatio > 0.35) {
      w.standby += 1.6;
      w.attack -= 0.4;
      w.dodge -= 0.2;
    }
    if (snap.aiHpRatio <= 0.4 && aiEffectiveStamina <= 2) {
      w.standby += 1.2;
    }
    // 对手也低精力时，适度降低待命倾向，避免双方空转
    if (snap.oppStaminaTrend <= 1.0 && aiEffectiveStamina >= 1) {
      w.attack += 0.8;
      w.standby -= 0.5;
    }
    // 对手濒危时减少保守倾向，避免错失斩杀窗口
    if (snap.playerHpRatio <= 0.25 && aiEffectiveStamina >= 2) {
      w.standby *= 0.35;
    }

    // 对连续重复行为做针对性反制，降低“木桩”体验
    if (snap.oppActionStreak >= 2) {
      if (snap.oppLastAction === Action.ATTACK) {
        w.guard += 1.8;
        w.dodge += 1.0;
      } else if (snap.oppLastAction === Action.GUARD) {
        w.attack += 1.5;
        w.standby -= 0.2;
      } else if (snap.oppLastAction === Action.DODGE) {
        w.guard += 0.8;
        w.attack += 0.8;
      } else if (snap.oppLastAction === Action.STANDBY) {
        w.attack += 2.2;
        w.standby *= 0.5;
      }
    }

    // 斩杀窗口：对手血量/精力双低时主动出击
    if (snap.playerHpRatio <= 0.18 && snap.playerStaminaRatio <= 0.34 && aiEffectiveStamina >= 2) {
      w.attack += 2.8;
      w.standby *= 0.4;
      w.guard *= 0.8;
    }

    // 濒危保命：己方低血且对手攻击倾向明显时更谨慎
    if (snap.aiHpRatio <= 0.25 && snap.oppAggression >= 0.5) {
      w.guard += 1.6;
      w.dodge += 1.2;
      w.attack -= 0.8;
    }

    return this.pickWeighted({
      [Action.ATTACK]: w.attack,
      [Action.GUARD]: w.guard,
      [Action.DODGE]: w.dodge,
      [Action.STANDBY]: w.standby,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 2：速度打分
  // ═══════════════════════════════════════════════════════════

  static pickSpeed(snap, action, ai) {
    const BASE = DefaultStats.BASE_SPEED;

    if (action === Action.STANDBY) return BASE;

    const aiDiscount = ai.staminaDiscount || 0;
    const aiPenalty = ai.staminaPenalty || 0;
    const effectiveBaseCost = Math.max(0, 1 + aiPenalty - aiDiscount);

    let speedBoostWeight = 0;

    speedBoostWeight += (snap.oppSpeedTrend - BASE) * 0.8;
    speedBoostWeight += snap.oppAggression * 0.5;
    speedBoostWeight += (snap.aiStaminaRatio - 0.9) * 4.0;
    const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
    speedBoostWeight += playerWeakness * 2.0;

    if (action === Action.DODGE) speedBoostWeight += snap.oppAggression * 1.2;
    if (snap.playerHpRatio <= 0.25 && action === Action.ATTACK) speedBoostWeight += 0.8;
    if (snap.aiHpRatio <= 0.3 && action !== Action.ATTACK) speedBoostWeight += 0.4;
    if (snap.oppActionStreak >= 2 && snap.oppLastAction === Action.ATTACK && action === Action.DODGE) {
      speedBoostWeight += 0.7;
    }

    const aiEffectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
    const availableForBoost = aiEffectiveStamina - effectiveBaseCost;
    if (availableForBoost <= 0) return BASE;

    if (availableForBoost <= 1 && snap.playerHpRatio > 0.4) return BASE;
    const staminaConserve = Math.max(0.45, Math.min(1.0, snap.aiStaminaRatio + 0.15));
    const boostProb = Math.max(0, Math.min(0.75, (0.16 + speedBoostWeight * 0.22) * staminaConserve));
    const boost = Math.random() < boostProb ? 1 : 0;

    return BASE + boost;
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 3：强化打分
  // ═══════════════════════════════════════════════════════════

  static pickEnhance(snap, action, ai) {
    if (action === Action.STANDBY) return 0;

    const aiDiscount = ai.staminaDiscount || 0;
    const aiPenalty = ai.staminaPenalty || 0;
    const effectiveBaseCost = Math.max(0, 1 + aiPenalty - aiDiscount);

    if (action === Action.DODGE) {
      let dodgeEnhWeight = snap.oppEnhanceTrend * 0.9;
      dodgeEnhWeight += snap.oppAggression * 0.7;

      const aiEffectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
      const dodgeEnhanceable = aiEffectiveStamina >= effectiveBaseCost + 1;
      if (!dodgeEnhanceable) return 0;

      if (snap.aiStaminaRatio < 0.45 && snap.playerHpRatio > 0.4) return 0;
      const staminaConserve = Math.max(0.45, Math.min(1.0, snap.aiStaminaRatio + 0.15));
      const dodgeEnhProb = Math.max(0, Math.min(0.75, (0.10 + dodgeEnhWeight * 0.28) * staminaConserve));
      return Math.random() < dodgeEnhProb ? 1 : 0;
    }

    let enhWeight = snap.oppEnhanceTrend * 0.8;
    if (action === Action.GUARD) enhWeight += snap.oppAggression * 0.6;
    if (action === Action.ATTACK) enhWeight += (1 - snap.playerHpRatio) * 0.5;
    if (action === Action.ATTACK && snap.playerHpRatio <= 0.25) enhWeight += 0.7;
    if (action === Action.GUARD && snap.oppActionStreak >= 2 && snap.oppLastAction === Action.ATTACK) {
      enhWeight += 0.4;
    }

    const aiEffectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
    const enhanceable = aiEffectiveStamina >= effectiveBaseCost + 1;
    if (!enhanceable) return 0;

    if (snap.aiStaminaRatio < 0.45 && snap.playerHpRatio > 0.35) return 0;
    const staminaConserve = Math.max(0.45, Math.min(1.0, snap.aiStaminaRatio + 0.15));
    const enhProb = Math.max(0, Math.min(0.75, (0.14 + enhWeight * 0.26) * staminaConserve));
    return Math.random() < enhProb ? 1 : 0;
  }

  // ═══════════════════════════════════════════════════════════
  // 工具：按权重随机选择
  // ═══════════════════════════════════════════════════════════

  static pickWeighted(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    if (entries.length === 0) return Object.keys(weightMap)[0];

    const total = entries.reduce((s, [, w]) => s + w, 0);
    let rand = Math.random() * total;

    for (const [key, w] of entries) {
      rand -= w;
      if (rand <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}
