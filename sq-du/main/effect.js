'use strict';

import {
  Action,
  Clash,
  DefaultStats,
  EFFECT_SLOTS,
  EffectDefs,
  EngineEvent,
  PlayerId,
  calcActionCost,
  readBonus,
} from '../base/constants.js';
import { EffectTimingLayer } from '../effect/timing.js';
import { EffectHandlers } from '../base/effect-handlers.js';
import { clampPts } from '../effect/function/overflow-manager.js';

export class EffectLayer {
  static canExposeOpponentRuntime(observer, opponent, unlocked = false) {
    // 仅在执行了洞察操作（unlocked=true）时实时暴露对方属性
    // 双方就绪后的资源更新由 forceP2Sync 控制时机（ACTION_END 而非 ACTION_START）
    return !!unlocked;
  }

  static rewriteRoundDraft({ p1Ctx, p2Ctx, p1State, p2State }) {
    const { p1CtxEff, p2CtxEff } = this.processPreEffects(
      p1Ctx,
      p2Ctx,
      p1State,
      p2State,
    );

    let finalP1Ctx = this._rewriteBlockedAction(p1CtxEff, p1State);
    let finalP2Ctx = this._rewriteBlockedAction(p2CtxEff, p2State);

    finalP1Ctx = this._rewriteBlockedSlots(finalP1Ctx, p1State);
    finalP2Ctx = this._rewriteBlockedSlots(finalP2Ctx, p2State);

    // 槽位封锁后重新收集有效触发列表（被封锁的效果不参与 onPost）
    const p1TriggeredEffects = this._collectTriggeredEffects(finalP1Ctx);
    const p2TriggeredEffects = this._collectTriggeredEffects(finalP2Ctx);

    const p1CostBase = calcActionCost(finalP1Ctx, p1State);
    const p2CostBase = calcActionCost(finalP2Ctx, p2State);

    finalP1Ctx.cost = Math.max(0, p1CostBase + (p1State.staminaDebuff || 0) - (p1State.staminaOverflow || 0));
    finalP2Ctx.cost = Math.max(0, p2CostBase + (p2State.staminaDebuff || 0) - (p2State.staminaOverflow || 0));
    finalP1Ctx.hpOverflow = p1State.hpOverflow || 0;
    finalP2Ctx.hpOverflow = p2State.hpOverflow || 0;
    finalP1Ctx.hpDebuff = p1State.hpDebuff || 0;
    finalP2Ctx.hpDebuff = p2State.hpDebuff || 0;

    return {
      p1Ctx: finalP1Ctx,
      p2Ctx: finalP2Ctx,
      p1State,
      p2State,
      p1TriggeredEffects,
      p2TriggeredEffects,
    };
  }

  static dispatchPhaseEffects(phaseEvent, payload, players, engine) {
    // 每回合开始时清除上回合残留的效果时期元数据
    if (phaseEvent === EngineEvent.TURN_START_PHASE) {
      if (players?.[PlayerId.P1]) players[PlayerId.P1]._effectMeta = {};
      if (players?.[PlayerId.P2]) players[PlayerId.P2]._effectMeta = {};
    }

    // 行动期开始：结算上回合遗留的 hpDrain（创伤扣血）
    if (phaseEvent === EngineEvent.ACTION_START) {
      const p1 = players?.[PlayerId.P1];
      const p2 = players?.[PlayerId.P2];
      if (p1) this._applyActionStartHpDrain(p1);
      if (p2) this._applyActionStartHpDrain(p2);
    }

    // 行动期结束后、结算期开始前：所有效果 n 值向 0 衰减 1
    // 注：蓄势/就绪精力恢复已移至 judge.js _buildResultObj 中统一结算
    if (phaseEvent === EngineEvent.ACTION_END) {
      const p1 = players?.[PlayerId.P1];
      const p2 = players?.[PlayerId.P2];
      if (p1) this.decayAllStatusEffects(p1);
      if (p2) this.decayAllStatusEffects(p2);
    }

    EffectTimingLayer.dispatch(phaseEvent, payload, players, engine);
  }

  static processPreEffects(p1Ctx, p2Ctx, p1State, p2State) {
    let cp1 = { ...p1Ctx };
    let cp2 = { ...p2Ctx };

    // ── 记录槽位点数（含行动期前加值，不含行动期内临时增益） ──
    // _slotPts 必须在 _collectTriggeredEffects 之前计算，
    // 否则 bonus 扩展的槽位的 onPre 钩子不会被触发
    const calcSlotPts = (ctx, state) => {
      if (!ctx || ctx.action === Action.STANDBY || ctx.action === Action.READY) return 0;
      let base = ctx.pts || 0;
      if (ctx.action === Action.ATTACK) base += readBonus(state.attackPtsBonus) + (state.permAttackPtsBonus || 0);
      else if (ctx.action === Action.GUARD) base += readBonus(state.guardPtsBonus) + (state.permGuardPtsBonus || 0);
      else if (ctx.action === Action.DODGE) base += readBonus(state.dodgePtsBonus) + (state.permDodgePtsBonus || 0);
      return Math.max(0, base);
    };
    cp1._slotPts = calcSlotPts(cp1, p1State);
    cp2._slotPts = calcSlotPts(cp2, p2State);

    // ── 调用技能 onPre 钩子（基于 _slotPts 决定哪些槽位触发）
    const p1RawTriggered = this._collectTriggeredEffects(cp1);
    for (const effectId of p1RawTriggered) {
      const handler = EffectHandlers[effectId];
      if (handler?.onPre) {
        const result = handler.onPre(cp1, p1State);
        if (result && typeof result === 'object') cp1 = { ...cp1, ...result };
      }
    }

    const p2RawTriggered = this._collectTriggeredEffects(cp2);
    for (const effectId of p2RawTriggered) {
      const handler = EffectHandlers[effectId];
      if (handler?.onPre) {
        const result = handler.onPre(cp2, p2State);
        if (result && typeof result === 'object') cp2 = { ...cp2, ...result };
      }
    }

    // ── 攻击点数：应用力量(chargeBoost)和虚弱(ptsDebuff)，含永久层 ──
    if (cp1.action === Action.ATTACK) {
      const raw = (cp1.pts || 0) + (p1State.chargeBoost || 0) + readBonus(p1State.attackPtsBonus)
        + (p1State.permAttackPtsBonus || 0) - (p1State.ptsDebuff || 0) - (p1State.permPtsDebuff || 0);
      cp1.pts = clampPts(raw, 'attackPtsOverflow', 'attackPtsUnderflow', p1State);
    }
    if (cp2.action === Action.ATTACK) {
      const raw = (cp2.pts || 0) + (p2State.chargeBoost || 0) + readBonus(p2State.attackPtsBonus)
        + (p2State.permAttackPtsBonus || 0) - (p2State.ptsDebuff || 0) - (p2State.permPtsDebuff || 0);
      cp2.pts = clampPts(raw, 'attackPtsOverflow', 'attackPtsUnderflow', p2State);
    }

    // ── 守备点数：应用坚固(guardBoost)和碎甲(guardDebuff)，含永久层 ──
    if (cp1.action === Action.GUARD) {
      const raw = (cp1.pts || 0) + (p1State.guardBoost || 0) + readBonus(p1State.guardPtsBonus)
        + (p1State.permGuardPtsBonus || 0) - (p1State.guardDebuff || 0) - (p1State.permGuardDebuff || 0);
      cp1.pts = clampPts(raw, 'guardPtsOverflow', 'guardPtsUnderflow', p1State);
    }
    if (cp2.action === Action.GUARD) {
      const raw = (cp2.pts || 0) + (p2State.guardBoost || 0) + readBonus(p2State.guardPtsBonus)
        + (p2State.permGuardPtsBonus || 0) - (p2State.guardDebuff || 0) - (p2State.permGuardDebuff || 0);
      cp2.pts = clampPts(raw, 'guardPtsOverflow', 'guardPtsUnderflow', p2State);
    }

    // ── 闪避点数：应用侧身(dodgeBoost)和僵硬(dodgeDebuff)，含永久层 ──
    if (cp1.action === Action.DODGE) {
      const raw = (cp1.pts || 0) + (p1State.dodgeBoost || 0) + readBonus(p1State.dodgePtsBonus)
        + (p1State.permDodgePtsBonus || 0) - (p1State.dodgeDebuff || 0) - (p1State.permDodgeDebuff || 0);
      cp1.pts = clampPts(raw, 'dodgePtsOverflow', 'dodgePtsUnderflow', p1State);
    }
    if (cp2.action === Action.DODGE) {
      const raw = (cp2.pts || 0) + (p2State.dodgeBoost || 0) + readBonus(p2State.dodgePtsBonus)
        + (p2State.permDodgePtsBonus || 0) - (p2State.dodgeDebuff || 0) - (p2State.permDodgeDebuff || 0);
      cp2.pts = clampPts(raw, 'dodgePtsOverflow', 'dodgePtsUnderflow', p2State);
    }

    // ── 先手：应用轻盈(agilityBoost)和沉重(agilityDebuff)，含永久层 ──
    const p1SpeedRaw = (cp1.speed || DefaultStats.BASE_SPEED) + (p1State.agilityBoost || 0) + readBonus(p1State.speedBonus)
      + (p1State.permAgilityBoost || 0) - (p1State.agilityDebuff || 0) - (p1State.permAgilityDebuff || 0);
    cp1.speed = clampPts(p1SpeedRaw, 'speedOverflow', 'speedUnderflow', p1State);

    const p2SpeedRaw = (cp2.speed || DefaultStats.BASE_SPEED) + (p2State.agilityBoost || 0) + readBonus(p2State.speedBonus)
      + (p2State.permAgilityBoost || 0) - (p2State.agilityDebuff || 0) - (p2State.permAgilityDebuff || 0);
    cp2.speed = clampPts(p2SpeedRaw, 'speedOverflow', 'speedUnderflow', p2State);

    // ── 蓄备类行动：强制先手归零，退还提速消耗的精力 ──
    // 技能 onPre 可能将任意行动转为 PREPARE（如蓄力、洁净、延付），
    // 此时玩家选择的先手提升无意义，需要退款。
    const refundSpeedStamina = (ctx, state) => {
      if (ctx.action !== Action.PREPARE) return;
      const spent = (ctx.speed || DefaultStats.BASE_SPEED) - DefaultStats.BASE_SPEED;
      if (spent > 0) {
        // 优先退 speedDiscountSpent，再退 stamina
        for (let i = 0; i < spent; i++) {
          if ((state.speedDiscountSpent || 0) > 0) {
            state.speedDiscountSpent--;
            state.staminaDiscount = (state.staminaDiscount || 0) + 1;
          } else {
            state.stamina = Math.min(DefaultStats.MAX_STAMINA, (state.stamina || 0) + 1);
          }
        }
      }
      ctx.speed = DefaultStats.BASE_SPEED;
    };
    refundSpeedStamina(cp1, p1State);
    refundSpeedStamina(cp2, p2State);


    // ── 消费本回合一次性 boost/debuff（已应用到 pts/speed，清零等待衰减填充下回合） ──
    p1State.chargeBoost = 0;
    p1State.guardBoost = 0;
    p1State.dodgeBoost = 0;
    p1State.agilityBoost = 0;
    p1State.directDamage = 0;

    p2State.chargeBoost = 0;
    p2State.guardBoost = 0;
    p2State.dodgeBoost = 0;
    p2State.agilityBoost = 0;
    p2State.directDamage = 0;

    return {
      p1CtxEff: cp1,
      p2CtxEff: cp2,
      p1TriggeredEffects: this._collectTriggeredEffects(cp1),
      p2TriggeredEffects: this._collectTriggeredEffects(cp2),
    };
  }

  /**
   * 统一效果衰减：行动期结束后、结算期开始前
   * 所有带 n 值的效果字段向 0 衰减 1，直到为 0 消失
   */
  static decayAllStatusEffects(state) {
    if (!state) return;
    // ── 纯数字衰减字段（N = 加量 = 倒计时） ──
    const simpleDecayFields = [
      'ptsDebuff', 'chargeBoost',
      'guardBoost', 'guardDebuff',
      'dodgeBoost', 'dodgeDebuff',
      'agilityBoost', 'agilityDebuff',
      'staminaPenalty', 'staminaDiscount',
      'insightDebuff',
      'restRecoverBonus', 'restRecoverPenalty',
      'healRecoverBonus', 'healRecoverPenalty',
    ];
    for (const field of simpleDecayFields) {
      const val = state[field] || 0;
      if (val > 0) state[field] = val - 1;
      else if (val < 0) state[field] = val + 1;
    }

    // ── bonus 衰减字段（支持纯数字 或 { value, turns } 对象） ──
    const bonusFields = ['attackPtsBonus', 'guardPtsBonus', 'dodgePtsBonus', 'speedBonus'];
    for (const field of bonusFields) {
      const raw = state[field];
      if (!raw) continue;
      if (typeof raw === 'object') {
        // 对象模式：衰减 turns，到期清零
        if (!isFinite(raw.turns)) continue;        // Infinity = 永久
        raw.turns--;
        if (raw.turns <= 0) state[field] = 0;
      } else {
        // 纯数字模式：同旧逻辑（N = 加量 = 倒计时）
        if (!isFinite(raw)) continue;              // Infinity = 永久
        if (raw > 0) state[field] = raw - 1;
        else if (raw < 0) state[field] = raw + 1;
      }
    }
  }

  static _rewriteBlockedAction(ctx, state) {
    if (!ctx || !state) return ctx;

    // ── 独立封锁字段：截脉封蓄势 / 禁愈封疗愈 ──
    if (ctx.action === Action.STANDBY && state.standbyBlocked) {
      return {
        ...ctx,
        action: Action.READY,
        enhance: 0,
        pts: 0,
        cost: 0,
        effects: Array(EFFECT_SLOTS).fill(null),
      };
    }
    if (ctx.action === Action.HEAL && state.healBlocked) {
      return {
        ...ctx,
        action: Action.READY,
        enhance: 0,
        pts: 0,
        cost: 0,
        effects: Array(EFFECT_SLOTS).fill(null),
      };
    }

    if (ctx.action === Action.STANDBY) return ctx;

    const blocked = Array.isArray(state.actionBlocked) ? state.actionBlocked : [];
    if (!blocked.includes(ctx.action)) return ctx;

    return {
      ...ctx,
      action: Action.STANDBY,
      enhance: 0,
      pts: 0,
      cost: 0,
      effects: Array(EFFECT_SLOTS).fill(null),
    };
  }

  static _rewriteBlockedSlots(ctx, state) {
    if (!ctx || !state) return ctx;
    if (ctx.action === Action.STANDBY) return ctx;

    const blockedByAction = state.slotBlocked?.[ctx.action];
    if (!Array.isArray(blockedByAction) || !Array.isArray(ctx.effects)) return ctx;

    const effects = [...ctx.effects];
    for (let i = 0; i < Math.min(EFFECT_SLOTS, effects.length, blockedByAction.length); i++) {
      if (blockedByAction[i]) effects[i] = null;
    }
    return { ...ctx, effects };
  }

  static _collectTriggeredEffects(ctx) {
    if (!ctx?.effects || ctx.action === Action.STANDBY) return [];

    // 使用 _slotPts（行动期前的点数）决定可触发槽位数，不受行动期内临时增益影响
    const pts = Math.max(0, ctx._slotPts ?? ctx.pts ?? 0);
    const validSlots = Math.min(EFFECT_SLOTS, pts);
    const triggered = [];

    for (let i = 0; i < validSlots; i++) {
      const effectId = ctx.effects[i];
      if (!effectId) continue;
      const def = EffectDefs[effectId];
      if (!def) continue;
      if (!def.applicableTo.includes(ctx.action)) continue;
      triggered.push(effectId);
    }

    return triggered;
  }

  static _getEffectivePts(ctx, playerState) {
    if (!ctx || ctx.action === Action.STANDBY || ctx.action === Action.READY) return 0;

    let pts = ctx.pts || 0;
    if (ctx.action === Action.ATTACK) {
      pts = pts + (playerState?.chargeBoost || 0) + readBonus(playerState?.attackPtsBonus) - (playerState?.ptsDebuff || 0);
    } else if (ctx.action === Action.GUARD) {
      pts = pts + (playerState?.guardBoost || 0) + readBonus(playerState?.guardPtsBonus) - (playerState?.guardDebuff || 0);
    } else if (ctx.action === Action.DODGE) {
      pts = pts + (playerState?.dodgeBoost || 0) + readBonus(playerState?.dodgePtsBonus) - (playerState?.dodgeDebuff || 0);
    }
    return Math.max(0, pts);
  }

  static _bridgeLegacyOnPre() { }

  static _bridgeLegacyOnPost() { }

  static _evaluateAttackOutcome(result, ownerId) {
    const clash = result?.clash;
    if (!clash) return { success: false, reason: 'no_clash' };

    const failByClash = new Set([
      Clash.MUTUAL_STANDBY,
      Clash.CONFRONT,
      Clash.STABILITY,
      Clash.RETREAT,
      Clash.PROBE,
      Clash.EVADE,
      Clash.DODGE_OUTMANEUVERED,
      Clash.MUTUAL_HIT,
      Clash.INSIGHT_CLASH,
      Clash.OTHER,
      Clash.FULLNESS,
    ]);

    if (failByClash.has(clash)) {
      return { success: false, reason: `blocked_by_clash:${clash}` };
    }

    const oppDmg = ownerId === PlayerId.P1 ? result.damageToP2 : result.damageToP1;
    if (oppDmg > 0) return { success: true, reason: 'damage_landed' };

    return { success: false, reason: 'no_final_damage' };
  }

  static _deriveTriggerFlags(result, ownerId, selfCtx, oppCtx, selfDmg, oppDmg) {
    const attack = this._evaluateAttackOutcome(result, ownerId);

    const dodgeSuccess =
      selfCtx?.action === Action.DODGE &&
      oppCtx?.action === Action.ATTACK &&
      selfDmg <= 0 &&
      result?.clash !== Clash.MUTUAL_HIT;

    // 闪避失败：对手确实发动了攻击，且自身受到了伤害
    const dodgeFail =
      selfCtx?.action === Action.DODGE &&
      oppCtx?.action === Action.ATTACK &&
      selfDmg > 0;

    const guardSuccess =
      selfCtx?.action === Action.GUARD &&
      oppCtx?.action === Action.ATTACK &&
      selfDmg <= 0 &&
      result?.clash !== Clash.MUTUAL_HIT;

    // 守备失败：对手确实发动了攻击，且自身受到了伤害
    const guardFail =
      selfCtx?.action === Action.GUARD &&
      oppCtx?.action === Action.ATTACK &&
      selfDmg > 0;

    return {
      attackSuccess: attack.success,
      attackFail: !attack.success && selfCtx?.action === Action.ATTACK,
      dodgeSuccess,
      dodgeFail,
      guardSuccess,
      guardFail,
    };
  }

  static canUseInsight(caster, target) {
    if (!caster || !target) return false;
    if (caster.insightBlocked) return false;
    if (caster.insightUsed) return false;
    if (caster.ready) return false;

    const need = 1 + (caster.staminaPenalty || 0) + (caster.insightDebuff || 0);
    if (need <= 0) return true;

    // discount（兴奋）在真实精力为 0 时失效
    const sta = caster.stamina || 0;
    const pocket = sta + (sta >= 1 ? (caster.staminaDiscount || 0) : 0);
    return pocket >= need;
  }

  static applyInsightCost(caster) {
    if (!caster) return;

    const insightCost = 1 + (caster.staminaPenalty || 0) + (caster.insightDebuff || 0);
    if (insightCost > 0) {
      for (let i = 0; i < insightCost; i++) {
        if ((caster.staminaDiscount || 0) > 0) {
          caster.staminaDiscount--;
        } else if ((caster.stamina || 0) > 0) {
          caster.stamina--;
        } else {
          caster.staminaDebuff = (caster.staminaDebuff || 0) + 1;
        }
      }
    } else if (insightCost < 0) {
      const refund = Math.abs(insightCost);
      for (let i = 0; i < refund; i++) {
        if ((caster.stamina || 0) < DefaultStats.MAX_STAMINA) {
          caster.stamina++;
        } else {
          caster.staminaOverflow = (caster.staminaOverflow || 0) + 1;
        }
      }
    }

    caster.insightDebuff = 0;
  }

  static canAdjustSpeed(player, delta) {
    if (!player || player.ready || player.speedAdjustBlocked) return false;
    if (delta > 0) {
      // discount（兴奋）在真实精力为 0 时失效
      const sta = player.stamina || 0;
      return (sta + (sta >= 1 ? (player.staminaDiscount || 0) : 0)) > 0;
    }
    if (delta < 0) {
      return (player.speed || DefaultStats.BASE_SPEED) > DefaultStats.BASE_SPEED;
    }
    return false;
  }

  static canRequestRedecide(player) {
    if (!player) return false;
    if (player.redecideBlocked) return false;
    if (!player.canRedecide) return false;
    if (player.didRedecide) return false;
    return true;
  }

  static rewriteTimeoutAction() {
    return {
      action: Action.READY,
      enhance: 0,
      speed: DefaultStats.BASE_SPEED,
      pts: 0,
      cost: 0,
      insightUsed: false,
      effects: Array(EFFECT_SLOTS).fill(null),
    };
  }

  static _applyActionStartRestRecovery(player) {
    const action = player?.actionCtx?.action;

    // 直接就绪和蓄势都恢复精力（蓄势的技能效果由 onPre 处理，恢复机制相同）
    if (action === Action.STANDBY || action === Action.READY) {
      const bonus = player?.restRecoverBonus || 0;
      const penalty = player?.restRecoverPenalty || 0;
      const recover = Math.max(0, 1 + bonus - penalty);
      const newStamina = (player.stamina || 0) + recover;

      if (newStamina > DefaultStats.MAX_STAMINA) {
        const overflow = newStamina - DefaultStats.MAX_STAMINA;
        player.staminaOverflow = (player.staminaOverflow || 0) + overflow;
        player.stamina = DefaultStats.MAX_STAMINA;
      } else {
        player.stamina = newStamina;
      }

      player.restRecoverBonus = 0;
      player.restRecoverPenalty = 0;
    }
  }

  static _applyActionStartHpDrain(player) {
    const drain = player?.hpDrain || 0;
    if (drain > 0) {
      player.hp = Math.max(0, (player.hp || 0) - drain);
      player.hpDrain = 0;
    }
  }

  static processPostEffects(p1CtxEff, p2CtxEff, p1State, p2State, p1TriggeredEffects, p2TriggeredEffects, p1DmgReceived, p2DmgReceived, result) {
    // 计算双方的攻击/守备/闪避是否成功（侥幸 MUTUAL_HIT 时全部为 false）
    const p1Flags = result ? this._deriveTriggerFlags(result, PlayerId.P1, p1CtxEff, p2CtxEff, p1DmgReceived, p2DmgReceived) : null;
    const p2Flags = result ? this._deriveTriggerFlags(result, PlayerId.P2, p2CtxEff, p1CtxEff, p2DmgReceived, p1DmgReceived) : null;
    const isMutualHit = result?.clash === Clash.MUTUAL_HIT;

    // P1 的技能 onPost 钩子
    for (const effectId of (p1TriggeredEffects || [])) {
      const handler = EffectHandlers[effectId];
      if (!handler?.onPost) continue;
      // 侥幸触发通道：仅限 triggerOnMutualHit 标记的技能
      if (isMutualHit) {
        if (!handler.triggerOnMutualHit) continue;
      } else if (p1Flags) {
        const act = p1CtxEff?.action;
        const isFail = handler.triggerOnFail;
        if (act === Action.ATTACK && (isFail ? !p1Flags.attackFail : !p1Flags.attackSuccess)) continue;
        if (act === Action.DODGE  && (isFail ? !p1Flags.dodgeFail  : !p1Flags.dodgeSuccess))  continue;
        if (act === Action.GUARD  && (isFail ? !p1Flags.guardFail  : !p1Flags.guardSuccess))  continue;
      }
      handler.onPost(p1CtxEff, p1State, p2State, p1DmgReceived, p2DmgReceived, p2CtxEff, result);
    }
    // P2 的技能 onPost 钩子
    for (const effectId of (p2TriggeredEffects || [])) {
      const handler = EffectHandlers[effectId];
      if (!handler?.onPost) continue;
      if (isMutualHit) {
        if (!handler.triggerOnMutualHit) continue;
      } else if (p2Flags) {
        const act = p2CtxEff?.action;
        const isFail = handler.triggerOnFail;
        if (act === Action.ATTACK && (isFail ? !p2Flags.attackFail : !p2Flags.attackSuccess)) continue;
        if (act === Action.DODGE  && (isFail ? !p2Flags.dodgeFail  : !p2Flags.dodgeSuccess))  continue;
        if (act === Action.GUARD  && (isFail ? !p2Flags.guardFail  : !p2Flags.guardSuccess))  continue;
      }
      handler.onPost(p2CtxEff, p2State, p1State, p2DmgReceived, p1DmgReceived, p1CtxEff, result);
    }
  }

  static _processPendingEffectQueue() { }

  static queueEffect(owner, effectId, options = {}) {
    if (!owner) return;

    owner.pendingEffects = Array.isArray(owner.pendingEffects) ? owner.pendingEffects : [];
    owner.pendingEffects.push({
      effectId,
      source: options.source || 'skill',
      priority: options.priority ?? 0,
      readyAt: {
        phaseEvent: options.phaseEvent || null,
        turn: options.turn ?? null,
        ownerId: options.ownerId || owner.id,
      },
      duration: options.duration ?? null,
      interval: options.interval ?? null,
      maxTriggers: options.maxTriggers ?? null,
    });
  }

  static queueDelayedEffect(owner, effectId, turnsLater = 0, phaseEvent = null, options = {}) {
    const turn = (options.baseTurn ?? options.turnBase ?? 0) + Math.max(0, turnsLater);
    this.queueEffect(owner, effectId, {
      ...options,
      phaseEvent,
      turn,
    });
  }

  static applyEffectImmediately(owner, effectId, context = {}) {
    if (!EffectDefs[effectId]) return false;
    this.queueEffect(owner, effectId, {
      ...context,
      phaseEvent: context.phaseEvent || EngineEvent.ACTION_START,
      source: context.source || 'direct',
    });
    return true;
  }

  /**
   * 标记一个即时触发的效果，供 UI 闪烁显示 ~1s。
   * 用于 onPre 中直接修改 state 而没有走 pendingEffects 队列的效果
   * （如血盾的创伤 hp--、弃身的创伤 hp--），
   * 让玩家能通过图标感知到"有效果触发了"。
   */
  static markFlashEffect(owner, effectId) {
    if (!owner) return;
    owner._flashEffects = Array.isArray(owner._flashEffects) ? owner._flashEffects : [];
    owner._flashEffects.push(effectId);
  }
}
