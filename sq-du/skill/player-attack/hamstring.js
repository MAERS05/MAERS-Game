'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 断筋（玩家专属攻击技能）
 * 攻击命中时，为对方附加1级[沉重]，持续2回合（动速-1）。
 */
export const HamstringEffect = createSkillEffect({
  id: EffectId.HAMSTRING,
  name: '断筋',
  desc: '若攻击成功，为对方附加1级[沉重]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中
    EffectLayer.queueEffect(opponent, EffectId.HEAVY, {
      phaseEvent: 'TURN_START',
      duration: 1,
      source: 'skill:hamstring',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.HEAVY);
  },
});
