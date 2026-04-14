'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const MomentumEffect = createSkillEffect({
  id: EffectId.MOMENTUM,
  name: '借势',
  desc: '行动期结束时，若闪避成功，为自身附加1层[振奋]并在下一回合开始时触发',
  applicableTo: [Action.DODGE],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (ctx.action === Action.DODGE && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      EffectLayer.queueEffect(selfState, EffectId.REJUVENATED, { phaseEvent: 'TURN_START', source: 'skill:momentum' });
    }
  },
});
