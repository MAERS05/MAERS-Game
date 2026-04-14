/**
 * @file charge.js
 * @description 【蓄力】其它类效果
 *
 * 触发条件：攻击前（前置效果）
 * 效果：本回合攻击不执行（转为待命），下回合攻击 +1 点数。
 *
 * 实现要点：
 *   - onPre：将 ctx.action 设为 STANDBY，标记 isCharge: true（供 resolver 识别为"其它"情形）
 *   - 同时在 state.chargeBoost 累加 1，供下回合 resolve() 基础设施消耗
 *   - 下回合 chargeBoost 的应用位于 resolver.resolve() 顶部的跨回合增益块（基础设施）
 *   - engine._applyResolveResult 负责将 newState.chargeBoost 写回玩家状态
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const ChargeEffect = Object.freeze({
  id: EffectId.CHARGE,
  name: '蓄力',
  desc: '本回合攻击不执行，下回合行动期开始攻击点数 +1',
  applicableTo: [Action.ATTACK],

  /**
   * 前置钩子：将本回合攻击压制，并为下回合储蓄点数增益。
   * @param {object} ctx   - 当前行动上下文（只读，返回新副本）
   * @param {object} state - 使用方的 PlayerState（直接写入，由 engine 同步）
   * @returns {object}     - 修改后的 ctx 副本（action 强制为 STANDBY）
   */
  onPre(ctx, state) {
    state.chargeBoost = (state.chargeBoost || 0) + 1;
    return { ...ctx, action: Action.STANDBY, isCharge: true };
  },
});
