/**
 * @file disarm.js
 * @description 【解甲】闪避效果
 *
 * 触发条件：前置（闪避发动前）
 * 效果：本回合闪避威力+1，下回合最终守备威力-1（guardDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const DisarmEffect = Object.freeze({
  id: EffectId.DISARM,
  name: '解甲',
  desc: '本回合闪避 +1 幅度，下回合守备 -1 点数',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    state.guardDebuff = (state.guardDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
