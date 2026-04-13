/**
 * @file extreme.js
 * @description 【极限】闪避效果
 *
 * 触发条件：前置（闪避发动前）
 * 效果：消耗自身 1 点气数，本回合闪避速度 +1。
 * 对标攻击的【破限】——面对快攻时强行将闪避速度拉到攻击之上，进入规避判定区。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const ExtremeEffect = Object.freeze({
  id: EffectId.EXTREME,
  name: '极限',
  desc: '消耗自身 1 点气数，本回合闪避 +1 速度',
  applicableTo: [Action.DODGE],

  /**
   * 前置钩子：闪避发动前调用，提升速度并扣除自身气数。
   * @param {object} ctx   - 当前 ActionCtx（只读，返回新副本）
   * @param {object} state - 使用方的 PlayerState
   * @returns {object}     - 修改后的 ctx 副本
   */
  onPre(ctx, state) {
    state.hp = Math.max(0, state.hp - 1);
    return { ...ctx, speed: ctx.speed + 1 };
  },
});
