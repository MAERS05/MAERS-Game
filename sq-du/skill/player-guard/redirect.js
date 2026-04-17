'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const RedirectEffect = createSkillEffect({
  id: EffectId.REDIRECT,
  name: '化劲',
  desc: '若守备成功，为对方附加1级[虚弱]并在下一回合的回合开始后，装配期开始前触发',
  applicableTo: [Action.GUARD],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (ctx.action === Action.GUARD && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      EffectLayer.queueEffect(oppState, EffectId.WEAK, { phaseEvent: 'TURN_START', source: 'skill:redirect' });
    }
  },
});
