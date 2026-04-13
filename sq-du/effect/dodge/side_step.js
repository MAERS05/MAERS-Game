/**
 * @file side_step.js
 * @description 【侧步】闪避效果
 *
 * 触发条件：前置（闪避发动前）
 * 效果：本回合闪避 +1 最终点数，下回合最终攻击点数-1（ptsDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const SideStepEffect = Object.freeze({
  id: EffectId.SIDE_STEP,
  name: '侧步',
  desc: '本回合闪避 +1 最终点数，下回合攻击 -1 最终点数',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    state.ptsDebuff = (state.ptsDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
