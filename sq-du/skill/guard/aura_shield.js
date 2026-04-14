'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const AuraShieldEffect = createSkillEffect({
  id: EffectId.AURA_SHIELD,
  name: '御气',
  desc: '行动期开始时，为自身附加1层[创伤]并触发，随后为自身附加1层[坚固]并触发。',
  applicableTo: [Action.GUARD],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.WOUNDED, { phaseEvent: 'ACTION_START', source: 'skill:aura_shield' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
