/**
 * @file deflect.js
 * @description 【卸力】守备效果
 *
 * 触发条件：后置（结算后）
 * 效果：守备成功防挡攻击（本回合受到 0 伤害）时，对手下回合攻击 -1 最终点数。
 *
 * 实现要点：
 *   - onPost(ctx, selfState, oppState, dmgTaken) 被 resolver 在时间轴结算后调用
 *   - 仅当使用方 action === GUARD 且 dmgTaken === 0 时生效（即守备成功拦截了攻击）
 *   - 对 oppState.ptsDebuff +1，由 engine 同步到对手下回合状态
 *   - resolver 在下回合 resolve() 开头消耗 ptsDebuff 并重置
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const DeflectEffect = Object.freeze({
  id: EffectId.DEFLECT,
  name: '卸力',
  desc: '守备成功防挡来袭时，对手下回合攻击 -1 最终点数',
  applicableTo: [Action.GUARD],

  /**
   * 后置钩子：时间轴结算完毕后调用。
   * @param {object} ctx       - 使用方的效果修正后 ActionCtx
   * @param {object} selfState - 使用方 PlayerState（可写）
   * @param {object} oppState  - 对手 PlayerState（可写）
   * @param {number} dmgTaken  - 本回合使用方受到的总伤害次数
   * @param {number} oppDmgTaken - 对方受到的伤害次数
   * @param {object} oppCtx    - 对方的效果修正后 ActionCtx
   */
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (ctx.action === Action.GUARD && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      oppState.ptsDebuff = (oppState.ptsDebuff || 0) + 1;
    }
  },
});
