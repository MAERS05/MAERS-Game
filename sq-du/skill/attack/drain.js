'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const DrainEffect = createSkillEffect({
  id: EffectId.DRAIN,
  name: '汲取',
  desc: '若攻击成功，为对方附加1级[萎靡]并在下一回合的回合开始后，装配期开始前触发',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.ATTACK) return;
    if ((oppDmg || 0) <= 0) return;

    EffectLayer.queueEffect(opponent, EffectId.SLUGGISH, { phaseEvent: 'TURN_START', source: 'skill:drain' });
  },
});
