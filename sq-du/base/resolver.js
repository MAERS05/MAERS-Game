/**
 * @file resolver.js
 * @description 博弈战斗系统 — 行为结算判定器（基于效果层和裁判层的核心总线）
 *
 * 职责：
 *  协调 EffectLayer 和 JudgeLayer，将原始回合流按以下时序进行推进：
 *  1. 识破短路判定
 *  2. EffectLayer（前置处理）：整合跨回合状态、进行状态结转衰减、计算主动效果加成
 *  3. JudgeLayer（物理引擎时间轴推演）：建立带动速的事件流日志并形成情形判定（如对峙、破势）
 *  4. EffectLayer（后置处理）：接受推演得到的伤害快照去触发受到伤害或战斗结束时的被动机制
 *  5. JudgeLayer（最终成单）：将推演与受击后再次修正的快照封包为 ResolveResult 返回给外侧状态机
 */

'use strict';

import { Clash, PlayerId } from './constants.js';
import { EffectLayer } from '../main/effect.js';
import { JudgeLayer } from '../main/judge.js';

/**
 * 解算一个回合的战斗结果（通过效果层与裁判层的联动管道）
 *
 * @param {import('./constants.js').ActionCtx}    p1Ctx
 * @param {import('./constants.js').ActionCtx}    p2Ctx
 * @param {import('./constants.js').PlayerState}  p1State
 * @param {import('./constants.js').PlayerState}  p2State
 * @param {boolean} bothInsighted
 * @param {number}  turn
 * @returns {import('./constants.js').ResolveResult}
 */
export function resolve(p1Ctx, p2Ctx, p1State, p2State, bothInsighted, turn) {
  // ── 0. 识破判定（双方均洞察 → 直接结束，零伤害）─────────
  if (bothInsighted) {
    return JudgeLayer.buildFinalResult(
      turn, p1Ctx, p2Ctx, p1State, p2State,
      null, true, [], [], 0, 0
    );
  }

  // ── 1. 基础层提交 draft，效果层统一改写后回传 ─────────
  const rewritten = EffectLayer.rewriteRoundDraft({ p1Ctx, p2Ctx, p1State, p2State });
  const {
    p1Ctx: p1CtxEff,
    p2Ctx: p2CtxEff,
    p1TriggeredEffects,
    p2TriggeredEffects,
  } = rewritten;

  // ── 1.5 快照本回合有效精力（前置处理后 discount/penalty 已确定，后置处理前尚未污染）─────────
  // 处决检测必须用这一帧的数值，避免 onPost 写入的"下回合修正"干扰判断
  const p1EntryEffective = p1State.stamina + (p1State.staminaDiscount || 0) - (p1State.staminaPenalty || 0);
  const p2EntryEffective = p2State.stamina + (p2State.staminaDiscount || 0) - (p2State.staminaPenalty || 0);

  // ── 2. 裁判层：构建物理时间轴并推演博弈结果 ─────────
  const { bs, derived } = JudgeLayer.evaluateTimeline(p1CtxEff, p2CtxEff, p1State, p2State, p1EntryEffective, p2EntryEffective);

  // ── 3. 效果层（后置处理）：执行基于伤害或博弈结果的效果（如荆棘、受击增益）─────────
  EffectLayer.processPostEffects(
    p1CtxEff, p2CtxEff, p1State, p2State, 
    p1TriggeredEffects, p2TriggeredEffects,
    bs[PlayerId.P1].dmgReceived,
    bs[PlayerId.P2].dmgReceived
  );

  // ── 4. 裁判层（最终裁定）：集成最终损伤、扣减/回复精力、整理账单并封装传出 ─────────
  return JudgeLayer.buildFinalResult(
    turn, p1CtxEff, p2CtxEff, p1State, p2State,
    derived, false, p1TriggeredEffects, p2TriggeredEffects,
    p1EntryEffective, p2EntryEffective
  );
}

