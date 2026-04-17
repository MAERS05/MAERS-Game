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
  // 先记录 onPre 前的 hp/stamina，用于计算 delta
  const preP1Hp = p1State.hp, preP1Stamina = p1State.stamina;
  const preP2Hp = p2State.hp, preP2Stamina = p2State.stamina;

  const rewritten = EffectLayer.rewriteRoundDraft({ p1Ctx, p2Ctx, p1State, p2State });
  const {
    p1Ctx: p1CtxEff,
    p2Ctx: p2CtxEff,
    p1TriggeredEffects,
    p2TriggeredEffects,
  } = rewritten;

  // ── 1.2 捕获 onPre 即时效果的变化量 ─────────
  // 只记录 delta，engine 在 ACTION_START 用 delta 修正玩家实际状态
  // （避免绝对值覆盖时把退回的精力值误写入）
  const immediateState = {
    p1: {
      hpDelta: p1State.hp - preP1Hp,
      staminaDelta: p1State.stamina - preP1Stamina,
      _flashEffects: Array.isArray(p1State._flashEffects) ? [...p1State._flashEffects] : [],
    },
    p2: {
      hpDelta: p2State.hp - preP2Hp,
      staminaDelta: p2State.stamina - preP2Stamina,
      _flashEffects: Array.isArray(p2State._flashEffects) ? [...p2State._flashEffects] : [],
    },
  };

  // ── 1.5 快照本回合真实精力（前置处理后，后置处理前尚未污染）─────────
  // 处决检测基于真实精力（stamina），而非有效精力（含 penalty/discount）。
  // staminaPenalty 仅增加行动成本，不代表"精力耗尽"；
  // 玩家仍可执行零成本行为（蓄势/就绪/疗愈），不应因临时惩罚被判处决。
  const p1EntryEffective = p1State.stamina;
  const p2EntryEffective = p2State.stamina;

  // ── 2. 裁判层：构建物理时间轴并推演博弈结果 ─────────
  const { bs, derived } = JudgeLayer.evaluateTimeline(p1CtxEff, p2CtxEff, p1State, p2State, p1EntryEffective, p2EntryEffective);

  // ── 3. 延迟后置处理：不再在此处执行 onPost ──────────
  // onPost 效果（基于攻击/守备/闪避成功结果触发）需要延迟到 ACTION_END 后执行，
  // 否则 UI 会在行动期开始时就暴露本回合结果。
  // 将所需数据打包到 result 中，由 engine 在 ACTION_END 后调用。

  // ── 4. 裁判层（最终裁定）：集成最终损伤、扣减/回复精力、整理账单并封装传出 ─────────
  const result = JudgeLayer.buildFinalResult(
    turn, p1CtxEff, p2CtxEff, p1State, p2State,
    derived, false, p1TriggeredEffects, p2TriggeredEffects,
    p1EntryEffective, p2EntryEffective
  );

  // 附带 onPre 即时状态（engine 在 ACTION_START 消费）
  result._immediateState = immediateState;

  // 附带后置处理所需数据（engine 将在 ACTION_END 后消费）
  result._postEffectData = {
    p1CtxEff, p2CtxEff,
    p1TriggeredEffects, p2TriggeredEffects,
    p1DmgReceived: bs[PlayerId.P1].dmgReceived,
    p2DmgReceived: bs[PlayerId.P2].dmgReceived,
  };

  return result;
}

