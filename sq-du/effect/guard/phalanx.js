/**
 * @file phalanx.js
 * @description 【步阵】守备效果
 *
 * 触发条件：前置（守备发动前）
 * 效果：本回合行动期开始守备点数 +1，下回合行动期开始闪避点数 -1（dodgeDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const PhalanxEffect = Object.freeze({
  id: EffectId.PHALANX,
  name: '步阵',
  desc: '本回合行动期开始守备点数 +1，下回合行动期开始闪避点数 -1',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    state.dodgeDebuff = (state.dodgeDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
