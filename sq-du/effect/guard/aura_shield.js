/**
 * @file aura_shield.js
 * @description 【御气】守备效果
 *
 * 触发条件：前置（守备发动前）
 * 效果：消耗自身 1 点命数，本回合行动期开始守备点数 +1。
 * 对标攻击的【泣命】，以牺牲命数换取更高的防御厚度。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const AuraShieldEffect = Object.freeze({
  id: EffectId.AURA_SHIELD,
  name: '御气',
  desc: '消耗自身 1 点命数，本回合行动期开始守备点数 +1',
  applicableTo: [Action.GUARD],

  /**
   * 前置钩子：守备发动前调用，提升点数并扣除自身命数。
   * @param {object} ctx   - 当前 ActionCtx（只读，返回新副本）
   * @param {object} state - 使用方的 PlayerState
   * @returns {object}     - 修改后的 ctx 副本
   */
  onPre(ctx, state) {
    state.hp = Math.max(0, state.hp - 1);
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
