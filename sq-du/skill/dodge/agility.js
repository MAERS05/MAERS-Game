'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const AgilityEffect = createSkillEffect({
  id: EffectId.AGILITY,
  name: '灵巧',
  desc: '若闪避成功，为自身附加1级[轻盈]并在下一回合的回合开始后，装配期开始前触发。',
  applicableTo: [Action.DODGE],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (ctx.action === Action.DODGE && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      EffectLayer.queueEffect(selfState, EffectId.LIGHT, { phaseEvent: 'TURN_START', source: 'skill:agility' });
    }
  },
});
