/**
 * @file afterimage.js
 * @description 【残影】闪避效果
 *
 * 触发条件：前置（闪避发动前）
 * 效果：消耗自身 1 点命数，本回合行动期开始闪避点数 +1。
 * 在同速对决时，用命数强行拉高点数拿到虚步判定，以此躲开高点数攻击。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const AfterimageEffect = Object.freeze({
  id: EffectId.AFTERIMAGE,
  name: '残影',
  desc: '消耗自身 1 点命数，本回合行动期开始闪避点数 +1',
  applicableTo: [Action.DODGE],

  /**
   * 前置钩子：闪避发动前调用，提升点数并扣除自身命数。
   * @param {object} ctx   - 当前 ActionCtx（只读，返回新副本）
   * @param {object} state - 使用方的 PlayerState
   * @returns {object}     - 修改后的 ctx 副本
   */
  onPre(ctx, state) {
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
