/**
 * @file side_step.js
 * @description 【侧步】闪避效果
 *
 * 触发条件：前置（闪避发动前）
 * 效果：本回合闪避威力+1，下回合最终攻击威力-1（ptsDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const SideStepEffect = Object.freeze({
  id: EffectId.SIDE_STEP,
  name: '侧步',
  desc: '本回合闪避 +1 幅度，下回合攻击 -1 点数',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    state.ptsDebuff = (state.ptsDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
