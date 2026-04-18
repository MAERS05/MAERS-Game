'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 振神（AI 专属守备技能）
 * 守备成功（未受伤）时，为自身附加1级[振奋]，下回合开始后触发（精力消耗-1）。
 */
export const InvigorateEffect = createSkillEffect({
  id: EffectId.INVIGORATE,
  name: '振神',
  desc: '若守备成功，为自身附加1级[振奋]并在下回合开始后触发',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.EXCITED, {
      phaseEvent: 'TURN_START',
      source: 'skill:invigorate',
    });
    EffectLayer.markFlashEffect(owner, EffectId.EXCITED);
  },
});
