'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const LightfootEffect = createSkillEffect({
  id: EffectId.LIGHTFOOT,
  name: '轻身',
  desc: '在行动期开始后，行动期结束前为自身附加1级[侧身]并触发，随后为自身附加1级[虚弱]并在下一回合的回合开始后，装配期开始前触发',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    // 侧身（本回合即时）：通过返回 pts+1 直接应用（不走 dodgeBoost 避免双重叠加）
    EffectLayer.markFlashEffect(state, EffectId.SIDE_STEP);
    return { ...ctx, pts: ctx.pts + 1 };
  },

  onPost(_ctx, state) {
    // 虚弱（下回合延迟）：走队列
    EffectLayer.queueDelayedEffect(state, EffectId.WEAK, 1, 'TURN_START', { source: 'skill:lightfoot' });
  },
});
