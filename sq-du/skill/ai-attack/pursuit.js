'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 追杀（AI 专属攻击技能）
 * 若攻击成功，为自身附加1级[轻盈]，下回合开始后、回合结束前生效（先手+1）。
 */
export const PursuitEffect = createSkillEffect({
  id: EffectId.PURSUIT,
  name: '追杀',
  desc: '若攻击成功，为自身附加1级[轻盈]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((oppDmg || 0) <= 0) return; // 攻击必须成功
    EffectLayer.queueEffect(owner, EffectId.LIGHT, {
      phaseEvent: 'TURN_START',
      source: 'skill:pursuit',
    });
    EffectLayer.markFlashEffect(owner, EffectId.LIGHT);
  },
});
