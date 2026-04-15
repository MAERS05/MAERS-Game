'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const ObscureEffect = createSkillEffect({
  id: EffectId.OBSCURE,
  name: '障目',
  desc: '若攻击成功，为对方附加[蒙蔽]并在下一回合的装配期结束后，决策期开始前触发。',
  applicableTo: [Action.ATTACK],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.ATTACK) return;
    if ((oppDmg || 0) <= 0) return;
    EffectLayer.queueEffect(opponent, EffectId.BLINDED, { phaseEvent: 'EQUIP_END', source: 'skill:obscure' });
  },
});
