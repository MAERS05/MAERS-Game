'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const BreakQiEffect = createSkillEffect({
  id: EffectId.BREAK_QI,
  name: '泣命',
  desc: '行动期开始时，为自身附加1层[创伤]并触发，随后为自身附加1层[力量]并触发效果。',
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.WOUNDED, { phaseEvent: 'ACTION_START', source: 'skill:break_qi' });
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'ACTION_START', source: 'skill:break_qi' });
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
