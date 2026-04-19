'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 定身（玩家专属攻击技能）
 * 若攻击成功，为对方附加[禁锢]并在下回合开始后，回合结束前生效。
 */
export const FatigueEffect = createSkillEffect({
  id: EffectId.FATIGUE,
  name: '定身',
  desc: '若攻击成功，为对方附加[禁锢]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中
    EffectLayer.queueEffect(opponent, EffectId.SHACKLED, {
      phaseEvent: 'TURN_START',
      source: 'skill:immobilize',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.SHACKLED);
  },
});
