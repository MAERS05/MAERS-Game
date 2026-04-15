'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const PounceEffect = createSkillEffect({
  id: EffectId.POUNCE,
  name: '猛扑',
  desc: '在行动期开始后，行动期结束前为自身附加1级[力量]并触发，随后为自身附加1级[僵硬]并在下一回合的行动期开始后，行动期结束前触发',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'ACTION_START', source: 'skill:pounce' });
    EffectLayer.queueEffect(state, EffectId.CLUMSY, { phaseEvent: 'ACTION_START', source: 'skill:pounce' });
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
