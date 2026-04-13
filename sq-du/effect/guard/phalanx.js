/**
 * @file phalanx.js
 * @description 【步阵】守备效果
 *
 * 触发条件：前置（守备发动前）
 * 效果：本回合守备 +1 最终点数，下回合最终闪避点数-1（dodgeDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const PhalanxEffect = Object.freeze({
  id: EffectId.PHALANX,
  name: '步阵',
  desc: '本回合守备 +1 最终点数，下回合闪避 -1 最终点数',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    state.dodgeDebuff = (state.dodgeDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
