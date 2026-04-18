'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 反噬（玩家专属守备技能）
 * 若守备成功（未受伤），为对方附加1级[萎靡]（精力恢复-1），下回合开始后触发。
 */
export const BacklashEffect = createSkillEffect({
  id: EffectId.BACKLASH,
  name: '反噬',
  desc: '若守备成功，为对方附加1级[萎靡]并在下回合开始后触发',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(opponent, EffectId.SLUGGISH, {
      phaseEvent: 'TURN_START',
      source: 'skill:backlash',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.SLUGGISH);
  },
});
