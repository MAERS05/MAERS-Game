import { Action, EFFECT_SLOTS, EffectDefs } from '../base/constants.js';
import { EffectHandlers } from '../base/effect-handlers.js';

export class EffectLayer {
  /**
   * 应用跨回合状态并结算当前回合的 Pre 效果
   */
  static processPreEffects(p1Ctx, p2Ctx, p1State, p2State) {
    let cp1 = { ...p1Ctx };
    let cp2 = { ...p2Ctx };

    // ── 蓄力跨回合增益 ─────────────────
    if (cp1.action === Action.ATTACK && p1State.chargeBoost) {
      cp1.pts += p1State.chargeBoost;
    }
    if (cp2.action === Action.ATTACK && p2State.chargeBoost) {
      cp2.pts += p2State.chargeBoost;
    }

    // ── 卸力跨回合补丁（ptsDebuff）─────────────────────────────
    if (cp1.action === Action.ATTACK && p1State.ptsDebuff) {
      cp1.pts = Math.max(0, cp1.pts - p1State.ptsDebuff);
    }
    if (cp2.action === Action.ATTACK && p2State.ptsDebuff) {
      cp2.pts = Math.max(0, cp2.pts - p2State.ptsDebuff);
    }

    // ── 固守跨回合增益/衰减 ──────────────────────────────
    if (cp1.action === Action.GUARD) {
      cp1.pts = Math.max(0, cp1.pts + (p1State.guardBoost || 0) - (p1State.guardDebuff || 0));
    }
    if (cp2.action === Action.GUARD) {
      cp2.pts = Math.max(0, cp2.pts + (p2State.guardBoost || 0) - (p2State.guardDebuff || 0));
    }

    // ── 闪避跨回合增幅 / 衰减 ───────────────────────────────
    if (cp1.action === Action.DODGE) {
      cp1.pts = Math.max(0, cp1.pts + (p1State.dodgeBoost || 0) - (p1State.dodgeDebuff || 0));
    }
    if (cp2.action === Action.DODGE) {
      cp2.pts = Math.max(0, cp2.pts + (p2State.dodgeBoost || 0) - (p2State.dodgeDebuff || 0));
    }

    // ── 灵巧跨回合速度增益 ────────────────────────────
    if (p1State.agilityBoost) cp1.speed += p1State.agilityBoost;
    if (p2State.agilityBoost) cp2.speed += p2State.agilityBoost;

    // ==== 先消耗旧 hpDrain（上回合疟伤状态）====
    if (p1State.hpDrain) p1State.hp = Math.max(0, p1State.hp - p1State.hpDrain);
    if (p2State.hpDrain) p2State.hp = Math.max(0, p2State.hp - p2State.hpDrain);

    // ==== 消耗所有旧状态 ====
    p1State.chargeBoost = 0; p1State.ptsDebuff = 0; p1State.guardBoost = 0; p1State.guardDebuff = 0;
    p1State.dodgeBoost = 0; p1State.dodgeDebuff = 0; p1State.staminaPenalty = 0; p1State.staminaDiscount = 0; p1State.hpDrain = 0; p1State.agilityBoost = 0; p1State.directDamage = 0;

    p2State.chargeBoost = 0; p2State.ptsDebuff = 0; p2State.guardBoost = 0; p2State.guardDebuff = 0;
    p2State.dodgeBoost = 0; p2State.dodgeDebuff = 0; p2State.staminaPenalty = 0; p2State.staminaDiscount = 0; p2State.hpDrain = 0; p2State.agilityBoost = 0; p2State.directDamage = 0;

    // ── 顺位失效 + 前置修正 ────────────
    const res1 = this._applyEffects(cp1, p1State, cp2);
    const res2 = this._applyEffects(cp2, p2State, res1.ctx);

    return {
      p1CtxEff: res1.ctx,
      p2CtxEff: res2.ctx,
      p1TriggeredEffects: res1.triggered,
      p2TriggeredEffects: res2.triggered
    };
  }

  static _applyEffects(ctx, state, oppCtxEff = null) {
    if (!ctx.effects || ctx.action === Action.STANDBY) {
      return { ctx, triggered: [] };
    }
    const validSlots = Math.min(ctx.pts, EFFECT_SLOTS);
    const triggered = [];
    let patchedCtx = { ...ctx };

    for (let i = 0; i < validSlots; i++) {
      const effectId = ctx.effects[i];
      if (!effectId) continue;
      const def = EffectDefs[effectId];
      if (!def) continue;
      if (!def.applicableTo.includes(ctx.action)) continue;

      triggered.push(effectId);
      const handler = EffectHandlers[effectId];
      if (handler?.onPre) {
        patchedCtx = handler.onPre(patchedCtx, state) ?? patchedCtx;
      }
    }
    return { ctx: patchedCtx, triggered };
  }

  static processPostEffects(p1CtxEff, p2CtxEff, p1State, p2State, p1Triggered, p2Triggered, p1DmgTaken, p2DmgTaken) {
    for (const effectId of p1Triggered) {
      const handler = EffectHandlers[effectId];
      if (handler?.onPost) handler.onPost(p1CtxEff, p1State, p2State, p1DmgTaken, p2DmgTaken, p2CtxEff);
    }
    for (const effectId of p2Triggered) {
      const handler = EffectHandlers[effectId];
      if (handler?.onPost) handler.onPost(p2CtxEff, p2State, p1State, p2DmgTaken, p1DmgTaken, p1CtxEff);
    }
  }
}
