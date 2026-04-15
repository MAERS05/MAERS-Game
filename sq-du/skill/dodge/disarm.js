'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const DisarmEffect = createSkillEffect({
  id: EffectId.DISARM,
  name: '解甲',
  desc: '行动期开始时，为自身附加1层[侧身]并触发，行动期结束后，为自身附加1层[碎甲]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.DODGE],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SIDE_STEP_STATE, { phaseEvent: 'ACTION_START', source: 'skill:disarm' });
    EffectLayer.queueEffect(state, EffectId.CRACKED_ARMOR, { phaseEvent: 'TURN_START', source: 'skill:disarm' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
