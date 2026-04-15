'use strict';

import { Action, DefaultStats, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const AbandonEffect = createSkillEffect({
  id: EffectId.ABANDON,
  name: '弃身',
  desc: '在行动期开始后，行动期结束前为自身附加1级[创伤]并触发，随后为自身附加1级[侧身]并触发',
  applicableTo: [Action.DODGE],
  onPre(ctx, state) {
    // 创伤（本回合即时）：直接扣命数
    if ((state.hp || 0) > 0) {
      state.hp--;
    } else {
      state.hpUnderflow = (state.hpUnderflow || 0) + 1;
    }
    EffectLayer.markFlashEffect(state, EffectId.WOUNDED);
    // 侧身（本回合即时）：直接加闪避点数
    state.dodgeBoost = (state.dodgeBoost || 0) + 1;
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
