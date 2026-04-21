'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 筹算（AI 专属守备技能）
 * 若守备成功（未受伤），为自身附加1级[侧身]，在接下来两回合的行动期开始后触发（闪避点数+1）。
 */
export const SteadyEffect = createSkillEffect({
  id: EffectId.STEADY,
  name: '筹算',
  desc: '若守备成功，为自身附加1级[侧身]并在接下来两回合的行动期开始后触发。',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.SIDE_STEP, {
      phaseEvent: 'ACTION_START',
      duration: 2,
      source: 'skill:steady',
    });
    EffectLayer.markFlashEffect(owner, EffectId.SIDE_STEP);
  },
});
