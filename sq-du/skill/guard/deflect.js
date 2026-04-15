'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const DeflectEffect = createSkillEffect({
  id: EffectId.DEFLECT,
  name: '卸力',
  desc: '行动期结束时，若守备成功，为对方附加1层[虚弱]并在下一回合开始时触发',
  applicableTo: [Action.GUARD],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (ctx.action === Action.GUARD && dmgTaken === 0 && oppCtx && oppCtx.action === Action.ATTACK) {
      EffectLayer.queueEffect(oppState, EffectId.WEAK, { phaseEvent: 'TURN_START', source: 'skill:deflect' });
    }
  },
});
