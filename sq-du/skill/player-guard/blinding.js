'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 预备（玩家专属守备技能）
 * 若守备成功（未受伤），为自身附加1级[侧身]，在下回合的行动期开始后触发。
 */
export const BlindingEffect = createSkillEffect({
  id: EffectId.BLINDING,
  name: '预备',
  desc: '若守备成功，为自身附加1级[侧身]并在下回合的行动期开始后触发。',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.SIDE_STEP, {
      phaseEvent: 'ACTION_START',
      source: 'skill:blinding',
    });
    EffectLayer.markFlashEffect(owner, EffectId.SIDE_STEP);
  },
});
