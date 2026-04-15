/**
 * @file ai-base.js
 * @description 博弈战斗系统 — AI 基础打分层（纯计算，无副作用）
 *
 * 职责：
 *  - 局面快照（snapshot）：将当前双方状态转换为打分维度
 *  - 行动打分（pickAction）：基于快照权重决定最优行动类型
 *  - 动速打分（pickSpeed）：基于快照权重决定是否提速
 *  - 强化打分（pickEnhance）：基于快照权重决定是否强化
 *
 * 本层不包含任何 I/O（setTimeout/useInsight 等），
 * 所有副作用由 ai-scheduler.js 处理。
 */

'use strict';

import { Action, DefaultStats } from '../base/constants.js';

export class AIBaseLogic {
  static TUNING = {
    staminaConserveFloor:  0.40,
    staminaConserveBias:   0.12,
    maxProcProb:           0.78,
    lowHpLine:             0.30,
    executeHpLine:         0.20,
    decisiveLead:          1.20,
    decisiveCriticalLead:  0.80,
  };

  static clamp01(v) { return Math.max(0, Math.min(1, v)); }

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
    const aiDanger      = this.clamp01((0.4  - snap.aiHpRatio)     / 0.4);
    const playerExposed = this.clamp01((0.35 - snap.playerHpRatio) / 0.35);
    const killWindow    = (
      snap.playerHpRatio    <= this.TUNING.executeHpLine &&
      snap.playerStaminaRatio <= 0.34 &&
      aiEffectiveStamina >= 2
    ) ? 1 : 0;
    // 使用有效精力（含 penalty/discount 修正）判定处决窗口，而非原始精力
    const executeWindow   = (snap.playerEffectiveStamina ?? snap.playerStamina) <= 0 ? 1 : 0;
    const antiAttackNeed  = this.clamp01((snap.oppAggression - 0.45) / 0.55);

    return { aiDanger, playerExposed, killWindow, executeWindow, antiAttackNeed };
  }

  static _buildTransitionModel(history, lastAction) {
    const fallback = { [Action.ATTACK]: 0.34, [Action.GUARD]: 0.33, [Action.DODGE]: 0.33, [Action.STANDBY]: 0.0 };
    if (!history || history.length < 2 || !lastAction) return fallback;

    let total = 0;
    const counts = { [Action.ATTACK]: 0, [Action.GUARD]: 0, [Action.DODGE]: 0, [Action.STANDBY]: 0 };
    for (let i = 1; i < history.length; i++) {
       if (history[i - 1].opponentAction === lastAction && counts[history[i].opponentAction] !== undefined) {
           counts[history[i].opponentAction]++;
           total++;
       }
    }
    if (total === 0) return fallback;

    // 引入平滑拉平样本极值，避免因只出现过1次导致预测出现 100% 概率
    const smoothedTotal = total + 2; 
    return {
       [Action.ATTACK]: (counts[Action.ATTACK] + 0.68) / smoothedTotal,
       [Action.GUARD]:  (counts[Action.GUARD]  + 0.66) / smoothedTotal,
       [Action.DODGE]:  (counts[Action.DODGE]  + 0.66) / smoothedTotal,
       [Action.STANDBY]: counts[Action.STANDBY] / smoothedTotal
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 0：情势快照
  // ═══════════════════════════════════════════════════════════

  static snapshot(ai, player, history) {
    const MAX_STAMINA = DefaultStats.MAX_STAMINA;
    const MAX_HP      = DefaultStats.MAX_HP;

    const recent = history.slice(-4);
    const oppSpeedTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentSpeed  ?? DefaultStats.BASE_SPEED), 0) / recent.length
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
    const lastAction    = recent.length ? recent[recent.length - 1].opponentAction : null;
    const lastOppStamina = recent.length
      ? recent[recent.length - 1].opponentStamina ?? DefaultStats.MAX_STAMINA
      : DefaultStats.MAX_STAMINA;

    const sameActionStreak = (() => {
      if (!lastAction) return 0;
      let streak = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].opponentAction !== lastAction) break;
        streak++;
      }
      return streak;
    })();

    return {
      aiHpRatio:          this.clamp01(ai.hp     / MAX_HP),
      playerHpRatio:      this.clamp01(player.hp / MAX_HP),
      aiStaminaRatio:     this.clamp01(ai.stamina     / MAX_STAMINA),
      playerStamina:      player.stamina,  // 精确整数，用于处决判断
      playerStaminaRatio: this.clamp01(player.stamina / MAX_STAMINA),
      // 对手有效精力（含 penalty/discount 修正），用于处决窗口和精确威胁评估
      playerEffectiveStamina: Math.max(0, player.stamina + (player.staminaDiscount || 0) - (player.staminaPenalty || 0)),
      // 对手当前点数减益状态（用于进攻时机评估）
      playerPtsDebuff:   player.ptsDebuff   || 0,
      playerDodgeDebuff: player.dodgeDebuff || 0,
      playerGuardDebuff: player.guardDebuff || 0,
      oppSpeedTrend,
      oppEnhanceTrend,
      oppStaminaTrend,
      lastOppStamina,
      oppAggression,
      oppLastAction:   lastAction,
      oppActionStreak: sameActionStreak,
      predictNext:     this._buildTransitionModel(history, lastAction),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 1：行动类型打分（盲决策）
  // ═══════════════════════════════════════════════════════════

  static pickAction(snap, ai) {
    const w = { attack: 1.0, guard: 1.0, dodge: 1.0, standby: 0.2 };

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);

    // ── 处决窗口（对手精力耗尽）：果断出击 ──────
    if (indicators.executeWindow > 0) {
      w.attack  += 10.0;
      w.guard   *= 0.05;
      w.dodge   *= 0.05;
      w.standby *= 0.02;
    }

    // ── 斩杀窗口（对手血量+精力双低）────────────
    if (indicators.killWindow > 0) {
      w.attack  += 3.5;
      w.standby *= 0.25;
      w.guard   *= 0.70;
    }

    // ── 对手点数减益时进攻机会更大 ───────────────
    if (snap.playerPtsDebuff > 0) {
      // 对手攻击点数被压低，守备可扛住同时反打更划算
      w.attack += 0.8; w.guard -= 0.2;
    }
    if (snap.playerDodgeDebuff > 0) {
      // 对手闪避点数被压低，攻击命中率提高
      w.attack += 0.6;
    }

    // ── 自身血量压力 ─────────────────────────────
    const aiHpPressure = 1 - snap.aiHpRatio;
    w.guard  += aiHpPressure * 2.5;
    w.dodge  += aiHpPressure * 1.5;
    w.attack -= aiHpPressure * 0.5;

    // ── 对手血量压力（有精力时主动进攻）──────────
    if (aiEffectiveStamina >= 2) {
      w.attack += (1 - snap.playerHpRatio) * 3.5;
    }

    // ── 对手攻击倾向（对应防守）───────────────────
    w.guard  += snap.oppAggression * 1.5;
    w.dodge  += snap.oppAggression * 1.0;
    w.attack -= snap.oppAggression * 0.5;

    // ── 精力管控 ─────────────────────────────────
    const aiRemainingStamina = aiEffectiveStamina - 1;

    if (aiRemainingStamina <= 0) {
      w.guard   += 1.2;
      w.attack  -= 0.8;
      w.dodge   -= 0.3;
      w.standby += 3.2;
    }
    if (aiEffectiveStamina <= 1 && snap.playerStamina > 0) {
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

    // ── 对手低精力时抓住换气机会 ──────────────────
    if (snap.lastOppStamina <= 1 && aiEffectiveStamina >= 1) {
      w.attack  += 1.2;
      w.standby -= 0.6;
    } else if (snap.oppStaminaTrend <= 1.5 && aiEffectiveStamina >= 1) {
      w.attack  += 0.6;
      w.standby -= 0.3;
    }

    // ── 对手濒危时不允许保守 ─────────────────────
    if (snap.playerHpRatio <= this.TUNING.lowHpLine && aiEffectiveStamina >= 2) {
      w.standby *= 0.25;
      w.attack  += 1.0;
    }

    // ── 马尔可夫链行为预测驱动 ───────────────────────────
    const { attack: pAtk, guard: pGrd, dodge: pDodge, standby: pStb } = snap.predictNext;

    // 预测高度连击/攻击倾向时，规避并防守
    if (pAtk > 0.45) {
      w.guard  += pAtk * 2.5; 
      w.dodge  += pAtk * 1.5; 
      w.attack -= pAtk * 1.0;
    }
    // 预测对手龟缩防守时，攒气或者强攻（精力充足时）
    if (pGrd > 0.45) {
      if (aiEffectiveStamina >= 3) { w.attack += pGrd * 2.5; }
      else { w.standby += pGrd * 2.5; w.attack -= pGrd * 0.5; }
    }
    // 预测对手灵活闪避时，避免盲目攻击导致精疲力竭，倾向防守或保留精力
    if (pDodge > 0.45) {
      w.standby += pDodge * 1.5;
      w.guard   += pDodge * 1.0;
      w.attack  -= pDodge * 1.5;
    }

    // ── 濒危保命 ─────────────────────────────────
    w.guard  += indicators.aiDanger * indicators.antiAttackNeed * 1.8;
    w.dodge  += indicators.aiDanger * indicators.antiAttackNeed * 1.2;
    w.attack -= indicators.aiDanger * indicators.antiAttackNeed * 1.0;

    // ── 行动禁用：被效果封禁的行动权重归零 ──────────
    const blocked = Array.isArray(ai.actionBlocked) ? ai.actionBlocked : [];
    if (blocked.includes(Action.ATTACK))  w.attack  = -Infinity;
    if (blocked.includes(Action.GUARD))   w.guard   = -Infinity;
    if (blocked.includes(Action.DODGE))   w.dodge   = -Infinity;
    if (blocked.includes(Action.STANDBY)) w.standby = -Infinity;

    const weightMap = {
      [Action.ATTACK]:  w.attack,
      [Action.GUARD]:   w.guard,
      [Action.DODGE]:   w.dodge,
      [Action.STANDBY]: w.standby,
    };
    return this.pickSmartAction(weightMap, indicators);
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 2：动速打分
  // ═══════════════════════════════════════════════════════════

  static pickSpeed(snap, action, ai) {
    const BASE = DefaultStats.BASE_SPEED;
    if (action === Action.STANDBY) return BASE;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const availableForBoost  = aiEffectiveStamina - 1;

    if (availableForBoost <= 0) return BASE; // 精力不足以提速

    const { attack: pAtk, guard: pGrd, dodge: pDodge } = snap.predictNext;

    // 绝杀窗口无条件提速确保先手致命一击
    const killWindow    = (snap.playerHpRatio <= this.TUNING.executeHpLine && snap.playerStaminaRatio <= 0.34 && aiEffectiveStamina >= 2) ? 1 : 0;
    const executeWindow = (snap.playerEffectiveStamina ?? snap.playerStamina) <= 0 ? 1 : 0;
    if ((killWindow || executeWindow) && availableForBoost >= 1 && action === Action.ATTACK) {
      return BASE + 1;
    }

    // 动态博弈：预期对手闪避，我方攻击 -> 必须提速以咬住并超越闪避速度
    if (action === Action.ATTACK && pDodge > 0.40 && availableForBoost >= 1) {
      return BASE + 1;
    }

    // 动态博弈：预期对手攻击，且对手有提速习惯，我方防御/闪避 -> 提速先手部署防线
    if ((action === Action.GUARD || action === Action.DODGE) && pAtk > 0.45 && snap.oppSpeedTrend > DefaultStats.BASE_SPEED + 0.3) {
      if (availableForBoost >= 1) return BASE + 1;
    }

    // 血线告急时的特殊本能反应保命提速
    if (snap.aiHpRatio <= 0.3 && action !== Action.ATTACK && pAtk > 0.35 && availableForBoost >= 1) {
      return BASE + 1;
    }

    // 若无关键的竞速必要，保守留存精力
    return BASE;
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 3：强化打分
  // ═══════════════════════════════════════════════════════════

  static pickEnhance(snap, action, ai) {
    if (action === Action.STANDBY) return 0;
    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    if (aiEffectiveStamina < 2) return 0; // 精力不足以强化

    const { attack: pAtk, guard: pGrd, dodge: pDodge } = snap.predictNext;

    // 绝杀斩杀阶段：无脑拉满伤害
    const killWindow    = (snap.playerHpRatio <= this.TUNING.executeHpLine && snap.playerStaminaRatio <= 0.34 && aiEffectiveStamina >= 2) ? 1 : 0;
    const executeWindow = (snap.playerEffectiveStamina ?? snap.playerStamina) <= 0 ? 1 : 0;
    if ((killWindow || executeWindow) && action === Action.ATTACK) {
      return 1;
    }

    // 攻击 vs 高概率防守：若预测对手守备大概率发生，必须强化使得攻击点数预期 > 1 打穿守备
    if (action === Action.ATTACK && pGrd > 0.40) {
      // 检查我们自身是否有点数惩罚，有的话更需补正。若血量不足则不盲目强攻破防
      if (snap.aiStaminaRatio > 0.35) return 1;
    }

    // 守备/闪避 vs 强力攻击：若预测对手大概率攻击，且对手有强化习惯（增加攻击点数），我方不强化将被贯穿
    if ((action === Action.GUARD || action === Action.DODGE) && pAtk > 0.45 && snap.oppEnhanceTrend >= 0.2) {
       // 对手有交强化的趋势，我方面对攻击时强化点数来硬抗/躲避
       if (snap.aiStaminaRatio >= 0.35 || snap.aiHpRatio <= 0.3) return 1;
    }

    // 对手极大破绽（比如刚刚精力竭力过）：重拳出击
    if (action === Action.ATTACK && snap.lastOppStamina <= 1 && pAtk < 0.2) {
       return 1;
    }

    return 0; // 无明显差值获胜收益，保留精力
  }

  // ═══════════════════════════════════════════════════════════
  // 决策选取工具
  // ═══════════════════════════════════════════════════════════

  static pickTopAction(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    if (entries.length === 0) return { top: [Object.keys(weightMap)[0], 0], second: [Object.keys(weightMap)[0], 0] };
    entries.sort((a, b) => b[1] - a[1]);
    return { top: entries[0], second: entries[1] ?? [entries[0][0], 0] };
  }

  /**
   * 智能行动选取：优势明显时确定性选择，否则加权随机。
   * critical 状态下阈值降低（斩杀/生死关头更果断）。
   */
  static pickSmartAction(weightMap, indicators) {
    const { top, second } = this.pickTopAction(weightMap);
    const lead     = top[1] - second[1];
    const critical = indicators.killWindow > 0 || indicators.executeWindow > 0 || indicators.aiDanger >= 0.55;
    const threshold = critical ? this.TUNING.decisiveCriticalLead : this.TUNING.decisiveLead;
    if (lead >= threshold) return top[0];
    return this.pickWeighted(weightMap);
  }

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
