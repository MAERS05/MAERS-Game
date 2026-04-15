'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const RecklessEffect = createSkillEffect({
  id: EffectId.RECKLESS,
  name: '舍身',
  desc: '行动期开始时，为自身附加1层[力量]，为自身附加1层[碎甲]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'ACTION_START', source: 'skill:reckless' });
    EffectLayer.queueEffect(state, EffectId.CRACKED_ARMOR, { phaseEvent: 'TURN_START', source: 'skill:reckless' });
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
