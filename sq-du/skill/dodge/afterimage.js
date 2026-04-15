'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const AfterimageEffect = createSkillEffect({
  id: EffectId.AFTERIMAGE,
  name: '残影',
  desc: '在行动期开始后，行动期结束前为自身附加1级[创伤]并触发，随后为自身附加1级[侧身]并触发',
  applicableTo: [Action.DODGE],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.WOUNDED, { phaseEvent: 'ACTION_START', source: 'skill:afterimage' });
    EffectLayer.queueEffect(state, EffectId.SIDE_STEP_STATE, { phaseEvent: 'ACTION_START', source: 'skill:afterimage' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
