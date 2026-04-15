'use strict';

import { Action, DefaultStats, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const BloodShieldEffect = createSkillEffect({
  id: EffectId.BLOOD_SHIELD,
  name: '血盾',
  desc: '在行动期开始后，行动期结束前为自身附加1级[创伤]并触发，随后为自身附加1级[坚固]并触发。',
  applicableTo: [Action.GUARD],
  onPre(ctx, state) {
    // 创伤（本回合即时）：直接扣命数
    if ((state.hp || 0) > 0) {
      state.hp--;
    } else {
      state.hpUnderflow = (state.hpUnderflow || 0) + 1;
    }
    EffectLayer.markFlashEffect(state, EffectId.WOUNDED);
    // 坚固（本回合即时）：直接加守备点数（通过 pts+1 体现）
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
