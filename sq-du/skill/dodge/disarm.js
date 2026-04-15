'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const DisarmEffect = createSkillEffect({
  id: EffectId.DISARM,
  name: '解甲',
  desc: '在行动期开始后，行动期结束前为自身附加1级[侧身]并触发，随后为自身附加1级[碎甲]并在下一回合的回合开始后，装配期开始前触发',
  staminaCost: 0,
  applicableTo: [Action.DODGE],
  onPre(ctx, state) {
    // 侧身（本回合即时）：通过返回 pts+1 直接应用（不走 dodgeBoost 避免双重叠加）
    EffectLayer.markFlashEffect(state, EffectId.SIDE_STEP);
    // 碎甲（下回合延迟）：走队列
    EffectLayer.queueEffect(state, EffectId.CRACKED_ARMOR, { phaseEvent: 'TURN_START', source: 'skill:disarm' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
