'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const SideStepEffect = createSkillEffect({
  id: EffectId.SIDE_STEP,
  name: '侧步',
  desc: '行动期开始时，为自己附加1层[侧身]并触发，行动期结束时，为自己附加1层[虚弱]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SIDE_STEP_STATE, { phaseEvent: 'ACTION_START', source: 'skill:side_step' });
    state.ptsDebuff = (state.ptsDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
