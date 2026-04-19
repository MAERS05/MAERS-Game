'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 封脉（共享攻击技能）
 * 若攻击成功，为对方附加[截脉]并在下回合开始后，回合结束前生效。
 */
export const ParalyzeEffect = createSkillEffect({
  id: EffectId.PARALYZE,
  name: '封脉',
  desc: '若攻击成功，为对方附加[截脉]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 攻击必须成功
    EffectLayer.queueEffect(opponent, EffectId.MERIDIAN_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:seal_vein',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.MERIDIAN_BLOCK);
  },
});
