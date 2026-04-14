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
} from '../base/constants.js';
import { EffectTimingLayer } from '../effect/timing.js';
import { EffectHandlers } from '../base/effect-handlers.js';

export class EffectLayer {
  static canExposeOpponentRuntime(observer, opponent, unlocked = false) {
    // 只要执行了洞察操作（unlocked=true），或者双方都已就绪进入了不可逆的行动期，就应当实时同步所有属性
    return !!unlocked || (!!observer.ready && !!opponent.ready);
  }

  static rewriteRoundDraft({ p1Ctx, p2Ctx, p1State, p2State }) {
    const { p1CtxEff, p2CtxEff, p1TriggeredEffects, p2TriggeredEffects } = this.processPreEffects(
      p1Ctx,
      p2Ctx,
      p1State,
      p2State,
    );

    let finalP1Ctx = this._rewriteBlockedAction(p1CtxEff, p1State);
    let finalP2Ctx = this._rewriteBlockedAction(p2CtxEff, p2State);

    finalP1Ctx = this._rewriteBlockedSlots(finalP1Ctx, p1State);
    finalP2Ctx = this._rewriteBlockedSlots(finalP2Ctx, p2State);

    const p1CostBase = finalP1Ctx.cost ?? calcActionCost(finalP1Ctx, p1State);
    const p2CostBase = finalP2Ctx.cost ?? calcActionCost(finalP2Ctx, p2State);

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
    // 行动期开始：先结算上回合遗留的 hpDrain（创伤）和蓄气回复
    if (phaseEvent === EngineEvent.ACTION_START) {
      const p1 = players?.[PlayerId.P1];
      const p2 = players?.[PlayerId.P2];
      if (p1) {
        this._applyActionStartRestRecovery(p1);
        this._applyActionStartHpDrain(p1);
      }
      if (p2) {
        this._applyActionStartRestRecovery(p2);
        this._applyActionStartHpDrain(p2);
      }
    }
    EffectTimingLayer.dispatch(phaseEvent, payload, players, engine);
  }

  static processPreEffects(p1Ctx, p2Ctx, p1State, p2State) {
    let cp1 = { ...p1Ctx };
    let cp2 = { ...p2Ctx };

    // ── 调用技能 onPre 钩子（基于玩家原始提交的 pts 决定哪些槽位触发）
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

    if (cp1.action === Action.ATTACK && p1State.chargeBoost) {
      cp1.pts += p1State.chargeBoost;
    }
    if (cp2.action === Action.ATTACK && p2State.chargeBoost) {
      cp2.pts += p2State.chargeBoost;
    }

    if (cp1.action === Action.ATTACK) {
      const raw = (cp1.pts || 0) - (p1State.ptsDebuff || 0);
      cp1.pts = Math.max(0, raw);
      p1State.ptsDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p1State.ptsDebuff = Math.max(0, (p1State.ptsDebuff || 0) - 1);
    }

    if (cp2.action === Action.ATTACK) {
      const raw = (cp2.pts || 0) - (p2State.ptsDebuff || 0);
      cp2.pts = Math.max(0, raw);
      p2State.ptsDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p2State.ptsDebuff = Math.max(0, (p2State.ptsDebuff || 0) - 1);
    }

    if (cp1.action === Action.GUARD) {
      const raw = (cp1.pts || 0) + (p1State.guardBoost || 0) - (p1State.guardDebuff || 0);
      cp1.pts = Math.max(0, raw);
      p1State.guardDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p1State.guardDebuff = Math.max(0, (p1State.guardDebuff || 0) - 1);
    }

    if (cp2.action === Action.GUARD) {
      const raw = (cp2.pts || 0) + (p2State.guardBoost || 0) - (p2State.guardDebuff || 0);
      cp2.pts = Math.max(0, raw);
      p2State.guardDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p2State.guardDebuff = Math.max(0, (p2State.guardDebuff || 0) - 1);
    }

    if (cp1.action === Action.DODGE) {
      const raw = (cp1.pts || 0) + (p1State.dodgeBoost || 0) - (p1State.dodgeDebuff || 0);
      cp1.pts = Math.max(0, raw);
      p1State.dodgeDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p1State.dodgeDebuff = Math.max(0, (p1State.dodgeDebuff || 0) - 1);
    }

    if (cp2.action === Action.DODGE) {
      const raw = (cp2.pts || 0) + (p2State.dodgeBoost || 0) - (p2State.dodgeDebuff || 0);
      cp2.pts = Math.max(0, raw);
      p2State.dodgeDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p2State.dodgeDebuff = Math.max(0, (p2State.dodgeDebuff || 0) - 1);
    }

    const p1SpeedRaw = (cp1.speed || DefaultStats.BASE_SPEED) + (p1State.agilityBoost || 0) - (p1State.agilityDebuff || 0);
    cp1.speed = Math.max(0, p1SpeedRaw);
    p1State.agilityDebuff = p1SpeedRaw < 0 ? Math.abs(p1SpeedRaw) : 0;

    const p2SpeedRaw = (cp2.speed || DefaultStats.BASE_SPEED) + (p2State.agilityBoost || 0) - (p2State.agilityDebuff || 0);
    cp2.speed = Math.max(0, p2SpeedRaw);
    p2State.agilityDebuff = p2SpeedRaw < 0 ? Math.abs(p2SpeedRaw) : 0;

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

  static _rewriteBlockedAction(ctx, state) {
    if (!ctx || !state) return ctx;
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

    const pts = Math.max(0, ctx.pts || 0);
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
    if (!ctx || ctx.action === Action.STANDBY) return 0;

    let pts = ctx.pts || 0;
    if (ctx.action === Action.ATTACK) {
      pts = pts + (playerState?.chargeBoost || 0) - (playerState?.ptsDebuff || 0);
    } else if (ctx.action === Action.GUARD) {
      pts = pts + (playerState?.guardBoost || 0) - (playerState?.guardDebuff || 0);
    } else if (ctx.action === Action.DODGE) {
      pts = pts + (playerState?.dodgeBoost || 0) - (playerState?.dodgeDebuff || 0);
    }
    return Math.max(0, pts);
  }

  static _bridgeLegacyOnPre() {}

  static _bridgeLegacyOnPost() {}

  static _evaluateAttackOutcome(result, ownerId) {
    const clash = result?.clash;
    if (!clash) return { success: false, reason: 'no_clash' };

    const failByClash = new Set([
      Clash.MUTUAL_STANDBY,
      Clash.CONFRONT,
      Clash.ACCUMULATE,
      Clash.RETREAT,
      Clash.PROBE,
      Clash.EVADE,
      Clash.DODGE_OUTMANEUVERED,
      Clash.MUTUAL_HIT,
      Clash.INSIGHT_CLASH,
      Clash.WASTED_ACTION,
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

    const guardSuccess =
      selfCtx?.action === Action.GUARD &&
      oppCtx?.action === Action.ATTACK &&
      selfDmg <= 0 &&
      result?.clash !== Clash.MUTUAL_HIT;

    return {
      attackSuccess: attack.success,
      dodgeSuccess,
      guardSuccess,
    };
  }

  static canUseInsight(caster, target) {
    if (!caster || !target) return false;
    if (caster.insightBlocked) return false;
    if (caster.insightUsed) return false;
    if (caster.ready) return false;

    const need = 1 + (caster.staminaPenalty || 0) + (caster.insightDebuff || 0);
    if (need <= 0) return true;

    const pocket = (caster.stamina || 0) + (caster.staminaDiscount || 0);
    return pocket > 0;
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
      return ((player.stamina || 0) + (player.staminaDiscount || 0)) > 0;
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
      action: Action.STANDBY,
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
    const isCharge = !!player?.actionCtx?.isCharge;

    if (action === Action.STANDBY && !isCharge) {
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

  static processPostEffects(p1CtxEff, p2CtxEff, p1State, p2State, p1TriggeredEffects, p2TriggeredEffects, p1DmgReceived, p2DmgReceived) {
    // P1 的技能 onPost 钩子（以自身视角：selfCtx, selfState, oppState, selfDmg, oppDmg, oppCtx）
    for (const effectId of (p1TriggeredEffects || [])) {
      const handler = EffectHandlers[effectId];
      if (handler?.onPost) {
        handler.onPost(p1CtxEff, p1State, p2State, p1DmgReceived, p2DmgReceived, p2CtxEff);
      }
    }
    // P2 的技能 onPost 钩子
    for (const effectId of (p2TriggeredEffects || [])) {
      const handler = EffectHandlers[effectId];
      if (handler?.onPost) {
        handler.onPost(p2CtxEff, p2State, p1State, p2DmgReceived, p1DmgReceived, p1CtxEff);
      }
    }
  }

  static _processPendingEffectQueue() {}

  static queueEffect(owner, effectId, options = {}) {
    if (!owner) return;

    owner.pendingEffects = Array.isArray(owner.pendingEffects) ? owner.pendingEffects : [];
    owner.pendingEffects.push({
      effectId,
      source: options.source || 'skill',
      readyAt: {
        phaseEvent: options.phaseEvent || null,
        turn: options.turn ?? null,
        ownerId: options.ownerId || owner.id,
      },
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
}
