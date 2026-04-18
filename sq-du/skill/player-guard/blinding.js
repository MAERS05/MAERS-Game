'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 盲目（玩家专属守备技能）
 * 若守备成功（未受伤），为对方附加[蒙蔽]，下回合开始后、回合结束前生效（禁止洞察）。
 */
export const BlindingEffect = createSkillEffect({
  id: EffectId.BLINDING,
  name: '盲目',
  desc: '若守备成功，为对方附加[蒙蔽]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(opponent, EffectId.BLINDED, {
      phaseEvent: 'TURN_START',
      source: 'skill:blinding',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.BLINDED);
  },
});
