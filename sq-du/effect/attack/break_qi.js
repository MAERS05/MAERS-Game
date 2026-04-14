/**
 * @file break_qi.js
 * @description 【泣命】攻击效果
 *
 * 触发条件：攻击前（前置效果）
 * 效果：消耗自身 1 点命数，本回合行动期开始攻击点数 +1。
 *
 * 实现要点：
 *   - onPre：修改 ctx.pts +1，扣除 state.hp -1
 *   - 自伤在效果阶段立即结算，不进时间轴
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const BreakQiEffect = Object.freeze({
  id: EffectId.BREAK_QI,
  name: '泣命',
  desc: '消耗自身 1 点命数，本回合行动期开始攻击点数 +1',
  applicableTo: [Action.ATTACK],

  /**
   * 前置钩子：攻击发动前调用，提升点数并扣除自身命数。
   * @param {object} ctx   - 当前行动上下文（只读，返回新副本）
   * @param {object} state - 使用方的 PlayerState（直接写入，由 engine 同步）
   * @returns {object}     - 修改后的 ctx 副本
   */
  onPre(ctx, state) {
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
