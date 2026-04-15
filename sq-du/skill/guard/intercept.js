'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const InterceptEffect = createSkillEffect({
  id: EffectId.INTERCEPT,
  name: '截脉',
  desc: '若守备成功，为对方附加[禁锢]并在下一回合的装配期结束后，决策期开始前触发。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.GUARD) return;
    if ((selfDmg || 0) > 0) return;
    EffectLayer.queueEffect(opponent, EffectId.SHACKLED, { phaseEvent: 'EQUIP_END', source: 'skill:intercept' });
  },
});
