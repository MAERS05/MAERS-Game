'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 疲兵（玩家专属攻击技能）
 * 攻击命中时，为对方附加1级[疲惫]（下回合开始后触发，精力消耗+1）。
 */
export const FatigueEffect = createSkillEffect({
  id: EffectId.FATIGUE,
  name: '疲兵',
  desc: '若攻击成功，为对方附加1级[疲惫]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中
    EffectLayer.queueEffect(opponent, EffectId.EXHAUSTED, {
      phaseEvent: 'TURN_START',
      source: 'skill:fatigue',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.EXHAUSTED);
  },
});
