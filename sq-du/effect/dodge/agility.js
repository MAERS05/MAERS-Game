/**
 * @file agility.js
 * @description 【灵巧】闪避效果
 *
 * 触发条件：闪避成功（规避、虚步情形）
 * 效果：闪避方下回合速度 +1，无需额外消耗精力。
 *       增益仅持续 1 回合，下回合结算完成后速度恢复正常。
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
  desc: '闪避成功后下回合速度 +1（无需消耗精力）',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  /**
   * 后置钩子：闪避成功（未受全额伤害）时调用，为闪避方标记下回合速度加成。
   */
  onPost(ctx, selfState, oppState, dmgTaken) {
    if (ctx.action === Action.DODGE && dmgTaken === 0) {
      selfState.agilityBoost = (selfState.agilityBoost || 0) + 1;
    }
  },
});
