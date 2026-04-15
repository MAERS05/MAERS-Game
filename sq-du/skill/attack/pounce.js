'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const PounceEffect = createSkillEffect({
  id: EffectId.POUNCE,
  name: '猛扑',
  desc: '行动期开始时，为自身附加1层[力量]并触发，行动期结束时，为自身附加1层[僵硬]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'ACTION_START', source: 'skill:pounce' });
    EffectLayer.queueEffect(state, EffectId.CLUMSY, { phaseEvent: 'TURN_START', source: 'skill:pounce' });
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
