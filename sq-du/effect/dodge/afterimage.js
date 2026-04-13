/**
 * @file afterimage.js
 * @description 【残影】闪避效果
 *
 * 触发条件：前置（闪避发动前）
 * 效果：消耗自身 1 点气数，本回合闪避 +1 最终点数。
 * 在同速对决时，用气数强行拉高幅度拿到虚步判定，以此躲开高点数攻击。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const AfterimageEffect = Object.freeze({
  id: EffectId.AFTERIMAGE,
  name: '残影',
  desc: '消耗自身 1 点气数，本回合闪避 +1 最终点数',
  applicableTo: [Action.DODGE],

  /**
   * 前置钩子：闪避发动前调用，提升幅度并扣除自身气数。
   * @param {object} ctx   - 当前 ActionCtx（只读，返回新副本）
   * @param {object} state - 使用方的 PlayerState
   * @returns {object}     - 修改后的 ctx 副本
   */
  onPre(ctx, state) {
    state.hp = Math.max(0, state.hp - 1);
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
