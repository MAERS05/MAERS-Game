'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const Lure = createSkillEffect({
  id: EffectId.LURE,
  name: '引诱',
  desc: '若闪避成功，为对方附加[废甲]和[锁链]并在下一回合的装配期结束后，决策期开始前触发。',
  applicableTo: [Action.DODGE],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.DODGE) return;
    if ((selfDmg || 0) > 0) return;
    EffectLayer.queueEffect(opponent, EffectId.BROKEN_ARMOR, { phaseEvent: 'EQUIP_END', source: 'skill:lure' });
    EffectLayer.queueEffect(opponent, EffectId.SHACKLED_DODGE, { phaseEvent: 'EQUIP_END', source: 'skill:lure' });
  },
});
