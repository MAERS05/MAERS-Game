/**
 * @file entrench.js
 * @description 【固守】守备效果
 *
 * 触发条件：后置（结算后）
 * 效果：本回合未受到伤害，下回合守备 +1 最终点数。
 *
 * 实现要点：
 *   - onPost(ctx, selfState, oppState, dmgTaken) 被 resolver 在时间轴结算后调用
 *   - 仅当 dmgTaken === 0 时生效（无论对手是否发起了攻击）
 *   - 对 selfState.guardBoost +1，由 engine 同步，resolver 下回合消耗
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const EntrenchEffect = Object.freeze({
  id: EffectId.ENTRENCH,
  name: '固守',
  desc: '本回合未受到伤害，下回合守备 +1 最终点数',
  applicableTo: [Action.GUARD],

  /**
   * 后置钩子：时间轴结算完毕后调用。
   * @param {object} ctx       - 使用方的效果修正后 ActionCtx
   * @param {object} selfState - 使用方 PlayerState（可写）
   * @param {object} oppState  - 对手 PlayerState（可写）
   * @param {number} dmgTaken  - 本回合使用方受到的总伤害次数
   */
  onPost(ctx, selfState, oppState, dmgTaken) {
    if (dmgTaken === 0) {
      selfState.guardBoost = (selfState.guardBoost || 0) + 1;
    }
  },
});
