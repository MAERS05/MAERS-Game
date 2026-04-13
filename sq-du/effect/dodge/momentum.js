/**
 * @file momentum.js
 * @description 【借势】闪避效果
 *
 * 触发条件：后置（结算后）
 * 效果：闪避成功且本回合未受到伤害时，恢复 1 点精力。
 *
 * 实现要点：
 *   - onPost(ctx, selfState, oppState, dmgTaken) 被 resolver 在时间轴结算后调用
 *   - 条件：ctx.action === DODGE 且 dmgTaken === 0（确实成功躲避了攻击）
 *   - 对 selfState.staminaBonus +1，在同回合 _buildResult 中将其加进精力结算
 *   - staminaBonus 为一次性字段，engine 同步时不需持久化（每回合初始化为 0）
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const MomentumEffect = Object.freeze({
  id: EffectId.MOMENTUM,
  name: '借势',
  desc: '闪避成功且未受到伤害时，恢复 1 点精力',
  applicableTo: [Action.DODGE],

  /**
   * 后置钩子：时间轴结算完毕后调用。
   * @param {object} ctx       - 使用方的效果修正后 ActionCtx
   * @param {object} selfState - 使用方 PlayerState（可写）
   * @param {object} oppState  - 对手 PlayerState（可写）
   * @param {number} dmgTaken  - 本回合使用方受到的总伤害次数
   * @param {number} oppDmgTaken - 对手受到的伤害次数
   * @param {object} oppCtx    - 对方的效果修正后 ActionCtx
   */
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (ctx.action === Action.DODGE && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      selfState.staminaBonus = (selfState.staminaBonus || 0) + 1;
    }
  },
});
