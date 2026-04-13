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
  const getHistoryNow = () => (ctx.getHistory ? ctx.getHistory() : []);
  const snap = AIBaseLogic.snapshot(ai, player, getHistoryNow());

  // 洞察决策：仅在有效精力足够且场面有意义时发起
  const aiEffective = AIBaseLogic.getEffectiveStamina(ai);
  const wantInsight = ctx.useInsight && !ai.insightUsed && aiEffective >= 2 && (
    // 对手处于行动阶段且精力允许：低血量时优先获取对手情报
    (snap.playerHpRatio > 0.5 && Math.random() < 0.18) ||
    // 自身濒危时大概率发起洞察，争取先手
    (snap.aiHpRatio <= 0.35 && Math.random() < 0.50) ||
    // 对手精力低时尝试洞察以确认是否可处决
    (snap.playerStaminaRatio <= 0.25 && Math.random() < 0.35)
  );

  if (wantInsight) {
    const insightDelay = (2 + Math.random() * 5) * 1000;
    const insightHandle = setTimeout(() => {
      if (ctx.engineState() !== EngineState.TICKING) return;
      const currentAi = ctx.getState().ai;
      // 再次校验有效精力（行动间精力可能已被消耗）
      if (AIBaseLogic.getEffectiveStamina(currentAi) >= 1 && !currentAi.ready) {
        ctx.useInsight(PlayerId.P2, PlayerId.P1);
      }
    }, insightDelay);

    const fallbackDelay = (22 + Math.random() * 6) * 1000;
    const fallbackHandle = setTimeout(() => {
      if (ctx.engineState() !== EngineState.TICKING) return;
      const currentAi = ctx.getState().ai;
      if (currentAi.ready) return;
      const decision = AIJudgeLayer.buildDecision(currentAi, ctx.getState().player, getHistoryNow());
      ctx.submitAction(PlayerId.P2, decision);
      ctx.setReady(PlayerId.P2);
    }, fallbackDelay);

    return { cancel: () => { clearTimeout(insightHandle); clearTimeout(fallbackHandle); } };
  }

  // 普通决策：60% 快速出招（5-20s），30% 拖延（20-30s），10% 压线（30-40s）
  const r = Math.random();
  const early = () => Math.min(Math.random(), Math.random()); // 偏向早期
  const delay = r < 0.60
    ? (5 + early() * 15) * 1000
    : r < 0.90
      ? (20 + early() * 10) * 1000
      : (30 + early() * 10) * 1000;

  const handle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;
    const currentAi = ctx.getState().ai;
    const decision = AIJudgeLayer.buildDecision(currentAi, ctx.getState().player, getHistoryNow());
    ctx.submitAction(PlayerId.P2, decision);
    ctx.setReady(PlayerId.P2);
  }, delay);

  return { cancel: () => clearTimeout(handle) };
}

/**
 * AI 重新决策调度器（已知对手底牌时触发）。
 */
export function scheduleAIRedecide(ctx) {
  // 快速反应：洞察揭露后 300-1500ms 内给出判断
  const delay = (300 + Math.random() * 1200);

  const handle = setTimeout(() => {
    if (ctx.engineState() !== EngineState.TICKING) return;

    const { ai, player, revealedAction } = ctx.getState();
    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);

    // 无精力时必须弃权（无法行动）
    if (effectiveStamina <= 0) {
      ctx.declineRedecide(PlayerId.P2);
      return;
    }

    // 智能判断：是否值得重决策？
    // - 对手出攻击且 AI 目前没守备/闪避意图时，倾向重决策
    // - 对手出待命/守备时，己方已有攻击意图则无需改变
    const revealed = revealedAction;
    const opponentAttacking = revealed?.action === Action.ATTACK;
    const opponentPassive = revealed?.action === Action.STANDBY || revealed?.action === Action.GUARD;
    const aiKillWindow = player.stamina <= 0 || (player.hp <= 2 && player.stamina <= 1);

    // 斩杀窗口：一定重决策抢攻
    if (aiKillWindow && effectiveStamina >= 1) {
      const decision = AIJudgeLayer.buildRedecideDecision(ai, player, revealed, ctx.getHistory ? ctx.getHistory() : []);
      ctx.requestRedecide(PlayerId.P2);
      ctx.submitAction(PlayerId.P2, decision);
      ctx.setReady(PlayerId.P2);
      return;
    }

    // 对手出攻击时倾向重决策以应对（概率随自身危险度上升）
    if (opponentAttacking) {
      const dangerProb = 0.55 + (1 - (ai.hp / DefaultStats.MAX_HP)) * 0.35;
      if (Math.random() < dangerProb) {
        const decision = AIJudgeLayer.buildRedecideDecision(ai, player, revealed, ctx.getHistory ? ctx.getHistory() : []);
        ctx.requestRedecide(PlayerId.P2);
        ctx.submitAction(PlayerId.P2, decision);
        ctx.setReady(PlayerId.P2);
        return;
      }
    }

    // 对手出被动（待命/守备）时：若有攻击机会则重决策进攻
    if (opponentPassive && effectiveStamina >= 2) {
      if (Math.random() < 0.50) {
        const decision = AIJudgeLayer.buildRedecideDecision(ai, player, revealed, ctx.getHistory ? ctx.getHistory() : []);
        ctx.requestRedecide(PlayerId.P2);
        ctx.submitAction(PlayerId.P2, decision);
        ctx.setReady(PlayerId.P2);
        return;
      }
    }

    // 其余情况：弃权
    ctx.declineRedecide(PlayerId.P2);
  }, delay);

  return { cancel: () => clearTimeout(handle) };
}

export class AIBaseLogic {
  static TUNING = {
    staminaConserveFloor: 0.40,
    staminaConserveBias:  0.12,
    maxProcProb:          0.78,
    lowHpLine:            0.30,
    executeHpLine:        0.20,
    decisiveLead:         1.20,
    decisiveCriticalLead: 0.80,
  };

  static clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  static getEffectiveStamina(actor) {
    return actor.stamina + (actor.staminaDiscount || 0) - (actor.staminaPenalty || 0);
  }

  static getStaminaConserve(aiStaminaRatio) {
    return Math.max(
      this.TUNING.staminaConserveFloor,
      Math.min(1.0, aiStaminaRatio + this.TUNING.staminaConserveBias),
    );
  }

  static buildIndicators(snap, aiEffectiveStamina) {
    const aiDanger        = this.clamp01((0.4 - snap.aiHpRatio) / 0.4);
    const playerExposed   = this.clamp01((0.35 - snap.playerHpRatio) / 0.35);
    const killWindow      = (
      snap.playerHpRatio <= this.TUNING.executeHpLine &&
      snap.playerStaminaRatio <= 0.34 &&
      aiEffectiveStamina >= 2
    ) ? 1 : 0;
    // 洞察到对手精力耗尽时也算特殊斩杀机会
    const executeWindow   = snap.playerStaminaRatio <= 0 ? 1 : 0;
    const antiAttackNeed  = this.clamp01((snap.oppAggression - 0.45) / 0.55);

    return { aiDanger, playerExposed, killWindow, executeWindow, antiAttackNeed };
  }

  static pickTopAction(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    if (entries.length === 0) return Object.keys(weightMap)[0];
    entries.sort((a, b) => b[1] - a[1]);
    return { top: entries[0], second: entries[1] ?? [entries[0][0], 0] };
  }

  static pickSmartAction(weightMap, indicators) {
    const { top, second } = this.pickTopAction(weightMap);
    const lead     = top[1] - second[1];
    const critical = indicators.killWindow > 0 || indicators.executeWindow > 0 || indicators.aiDanger >= 0.55;
    const threshold = critical ? this.TUNING.decisiveCriticalLead : this.TUNING.decisiveLead;
    if (lead >= threshold) return top[0];
    return this.pickWeighted(weightMap);
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 0：情势快照
  // ═══════════════════════════════════════════════════════════

  static snapshot(ai, player, history) {
    const MAX_STAMINA = DefaultStats.MAX_STAMINA;
    const MAX_HP      = DefaultStats.MAX_HP;

    const recent = history.slice(-4); // 多看一回合历史
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

    // 连击链检测
    const sameActionStreak = (() => {
      if (!lastAction) return 0;
      let streak = 0;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].opponentAction !== lastAction) break;
        streak += 1;
      }
      return streak;
    })();

    // 对手上一回合精力（用于判断是否能再次行动）
    const lastOppStamina = recent.length ? recent[recent.length - 1].opponentStamina : DefaultStats.MAX_STAMINA;

    return {
      aiHpRatio:          this.clamp01(ai.hp / MAX_HP),
      playerHpRatio:      this.clamp01(player.hp / MAX_HP),
      aiStaminaRatio:     this.clamp01(ai.stamina / MAX_STAMINA),
      // 使用真实精力值（整数），而非比率，用于精确判断处决条件
      playerStamina:      player.stamina,
      playerStaminaRatio: this.clamp01(player.stamina / MAX_STAMINA),
      oppSpeedTrend,
      oppEnhanceTrend,
      oppStaminaTrend,
      lastOppStamina,
      oppAggression,
      oppLastAction:    lastAction,
      oppActionStreak:  sameActionStreak,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 1：行动类型打分
  // ═══════════════════════════════════════════════════════════

  static pickAction(snap, ai) {
    const w = { attack: 1.0, guard: 1.0, dodge: 1.0, standby: 0.2 };

    // ── 处决机会：对手精力实际耗尽（使用精确整数判断），猛攻！──
    if (snap.playerStamina <= 0) {
      w.attack += 10;
      w.guard  *= 0.05;
      w.dodge  *= 0.05;
      w.standby *= 0.02;
    }

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);

    // ── 自身血量压力 ────────────────────────────────
    const aiHpPressure = 1 - snap.aiHpRatio;
    w.guard  += aiHpPressure * 2.5;
    w.dodge  += aiHpPressure * 1.5;
    w.attack -= aiHpPressure * 0.5;

    // ── 对手血量压力（有精力时主动进攻）──────────────
    const playerHpPressure = 1 - snap.playerHpRatio;
    if (aiEffectiveStamina >= 2) {
      w.attack += playerHpPressure * 3.5;
    }

    // ── 对手攻击倾向（对应防守倾向）──────────────────
    w.guard  += snap.oppAggression * 1.5;
    w.dodge  += snap.oppAggression * 1.0;
    w.attack -= snap.oppAggression * 0.5;

    // ── 精力管控 ───────────────────────────────────
    const aiRemainingStamina = aiEffectiveStamina - 1; // 行动后剩余

    if (aiRemainingStamina <= 0) {
      // 精力行动后归零：大幅提高待命倾向，避免送头
      w.guard   += 1.2;
      w.attack  -= 0.8;
      w.dodge   -= 0.3;
      w.standby += 3.2;
    }

    if (aiEffectiveStamina <= 1 && snap.playerStamina > 0) {
      // 只有1点有效精力且对手活着：偏向保守
      w.standby += 3.0;
      w.attack  -= 0.8;
    }

    if (aiEffectiveStamina <= 2 && snap.playerHpRatio > 0.35) {
      w.standby += 1.4;
      w.attack  -= 0.4;
      w.dodge   -= 0.2;
    }

    if (snap.aiHpRatio <= 0.4 && aiEffectiveStamina <= 2) {
      w.standby += 1.2;
    }

    // ── 对手低精力时减少保守，抓住换气机会 ─────────
    if (snap.lastOppStamina <= 1 && aiEffectiveStamina >= 1) {
      w.attack  += 1.2;
      w.standby -= 0.6;
    } else if (snap.oppStaminaTrend <= 1.5 && aiEffectiveStamina >= 1) {
      w.attack  += 0.6;
      w.standby -= 0.3;
    }

    // ── 对手濒危时不允许保守 ────────────────────────
    if (snap.playerHpRatio <= this.TUNING.lowHpLine && aiEffectiveStamina >= 2) {
      w.standby *= 0.25;
      w.attack  += 1.0;
    }

    // ── 连击反制（对手重复行为时针对性反应）─────────
    if (snap.oppActionStreak >= 2) {
      if (snap.oppLastAction === Action.ATTACK) {
        w.guard  += 2.0;
        w.dodge  += 1.2;
        w.attack -= 0.5;
      } else if (snap.oppLastAction === Action.GUARD) {
        w.attack  += 2.0;
        w.standby -= 0.3;
      } else if (snap.oppLastAction === Action.DODGE) {
        // 对手连续闪避：等待或守备，减少浪费攻击
        w.guard  += 1.0;
        w.standby += 0.6;
        w.attack -= 0.3;
      } else if (snap.oppLastAction === Action.STANDBY) {
        // 对手连续蓄势：果断进攻
        w.attack  += 3.0;
        w.standby *= 0.3;
      }
    }

    // ── 斩杀窗口 ──────────────────────────────────
    if (indicators.killWindow > 0) {
      w.attack  += 3.5;
      w.standby *= 0.3;
      w.guard   *= 0.7;
    }

    // ── executeWindow（对手精力耗尽特殊窗口）──────
    if (indicators.executeWindow > 0) {
      w.attack  += 6.0;
      w.standby *= 0.1;
      w.guard   *= 0.2;
      w.dodge   *= 0.2;
    }

    // ── 濒危保命 ───────────────────────────────────
    w.guard  += indicators.aiDanger * indicators.antiAttackNeed * 1.8;
    w.dodge  += indicators.aiDanger * indicators.antiAttackNeed * 1.2;
    w.attack -= indicators.aiDanger * indicators.antiAttackNeed * 1.0;

    const weightMap = {
      [Action.ATTACK]:  w.attack,
      [Action.GUARD]:   w.guard,
      [Action.DODGE]:   w.dodge,
      [Action.STANDBY]: w.standby,
    };
    return this.pickSmartAction(weightMap, indicators);
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 2：速度打分
  // ═══════════════════════════════════════════════════════════

  static pickSpeed(snap, action, ai) {
    const BASE = DefaultStats.BASE_SPEED;

    if (action === Action.STANDBY) return BASE;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);

    // 行动后剩余有效精力（不含速度加速消耗）
    const availableForBoost = aiEffectiveStamina - 1;
    if (availableForBoost <= 0) return BASE;

    let speedBoostWeight = 0;

    // 对手速度趋势：跟上或超越
    speedBoostWeight += (snap.oppSpeedTrend - BASE) * 1.0;
    // 对手攻击频率高时闪避/守备需要足够快
    speedBoostWeight += snap.oppAggression * 0.5;
    // 自身精力充足时可以加速
    speedBoostWeight += (snap.aiStaminaRatio - 0.9) * 4.0;
    // 对手处于劣势时适度加速
    const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
    speedBoostWeight += playerWeakness * 2.0;

    // 特定行动加成
    if (action === Action.DODGE) speedBoostWeight += snap.oppAggression * 1.5;
    if (snap.playerHpRatio <= this.TUNING.lowHpLine && action === Action.ATTACK) speedBoostWeight += 1.0;
    if (snap.aiHpRatio <= 0.3 && action !== Action.ATTACK) speedBoostWeight += 0.5;
    if (action === Action.ATTACK && snap.oppLastAction === Action.ATTACK && snap.oppActionStreak >= 2) {
      // 对手连续攻击时不应该正面拼速度，守备更重要
      speedBoostWeight -= 0.5;
    }
    // 连续闪避的对手需要更高速才能追上
    if (action === Action.ATTACK && snap.oppLastAction === Action.DODGE && snap.oppActionStreak >= 2) {
      speedBoostWeight += 0.8;
    }

    // 精力紧张时（仅剩1点可用于加速）且对手健康，谨慎加速
    if (availableForBoost <= 1 && snap.playerHpRatio > 0.45) return BASE;

    speedBoostWeight += indicators.killWindow * 0.8;
    speedBoostWeight += indicators.executeWindow * 1.2;

    const staminaConserve = this.getStaminaConserve(snap.aiStaminaRatio);
    const boostProb = Math.max(0, Math.min(this.TUNING.maxProcProb, (0.16 + speedBoostWeight * 0.22) * staminaConserve));
    const boost = Math.random() < boostProb ? 1 : 0;

    return BASE + boost;
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 3：强化打分
  // ═══════════════════════════════════════════════════════════

  static pickEnhance(snap, action, ai) {
    if (action === Action.STANDBY) return 0;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);

    // 必须有精力余量才能强化
    const enhanceable = aiEffectiveStamina >= 2; // 基础1 + 强化1
    if (!enhanceable) return 0;

    if (action === Action.DODGE) {
      let dodgeEnhWeight = snap.oppEnhanceTrend * 0.9;
      dodgeEnhWeight += snap.oppAggression * 0.8;
      // 对手连续攻击且强化时加强闪避
      if (snap.oppLastAction === Action.ATTACK && snap.oppActionStreak >= 2) dodgeEnhWeight += 0.5;

      if (snap.aiStaminaRatio < 0.40 && snap.playerHpRatio > 0.4) return 0;
      const staminaConserve = this.getStaminaConserve(snap.aiStaminaRatio);
      const dodgeEnhProb = Math.max(0, Math.min(this.TUNING.maxProcProb, (0.10 + dodgeEnhWeight * 0.28) * staminaConserve));
      return Math.random() < dodgeEnhProb ? 1 : 0;
    }

    let enhWeight = snap.oppEnhanceTrend * 0.8;
    if (action === Action.GUARD) {
      enhWeight += snap.oppAggression * 0.7;
      if (snap.oppActionStreak >= 2 && snap.oppLastAction === Action.ATTACK) enhWeight += 0.6;
    }
    if (action === Action.ATTACK) {
      enhWeight += (1 - snap.playerHpRatio) * 0.6;
      if (snap.playerHpRatio <= this.TUNING.lowHpLine) enhWeight += 1.0;
    }
    enhWeight += indicators.playerExposed * 0.4;
    enhWeight += indicators.killWindow    * 0.6;
    enhWeight += indicators.executeWindow * 1.0;

    if (snap.aiStaminaRatio < 0.40 && snap.playerHpRatio > 0.35) return 0;
    const staminaConserve = this.getStaminaConserve(snap.aiStaminaRatio);
    const enhProb = Math.max(0, Math.min(this.TUNING.maxProcProb, (0.14 + enhWeight * 0.26) * staminaConserve));
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
