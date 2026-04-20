'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const SteadyEffect = createSkillEffect({
  id: EffectId.STEADY,
  name: '反冲',
  desc: '若守备成功，[封锁]对方守备一号槽位并在下回合开始后，回合结束前生效。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 必须守备成功（未受伤）
    EffectLayer.queueEffect(opponent, EffectId.GUARD_SLOT0_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:steady',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.GUARD_SLOT0_BLOCK);
  },
});
