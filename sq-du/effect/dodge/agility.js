/**
 * @file agility.js
 * @description 【灵巧】闪避效果
 *
 * 触发条件：闪避成功（规避、虚步情形）
 * 效果：闪避方下回合动速 +1，无需额外消耗精力。
 *       增益仅持续 1 回合，下回合结算完成后动速恢复正常。
 * 精力消耗：0（随闪避行动基础精力一并支付）
 *
 * 实现要点：
 *   - onEvade：在 EVADE / DODGE_OUTMANEUVERED 事件后调用，
 *              向 nextState[dodgerId] 写入 agilityBoost: 1
 *   - engine.js 在构建下回合 ActionCtx 时，将 agilityBoost 加入 speed
 *   - 每回合结算完成后 engine 清除 agilityBoost 标记
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const AgilityEffect = Object.freeze({
  id: EffectId.AGILITY,
  name: '灵巧',
  desc: '闪避成功后下回合动速 +1',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

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
    if (ctx.action === Action.DODGE && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      selfState.agilityBoost = (selfState.agilityBoost || 0) + 1;
    }
  },
});
