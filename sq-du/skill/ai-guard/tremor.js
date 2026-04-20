'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 强震（AI 专属守备技能）
 * 若守备成功（未受伤），下回合开始后、回合结束前封锁对方闪避一号槽位。
 */
export const TremorEffect = createSkillEffect({
  id: EffectId.TREMOR,
  name: '强震',
  desc: '若守备成功，[封锁]对方闪避一号槽位并在下回合开始后，回合结束前生效。',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(opponent, EffectId.DODGE_SLOT0_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:tremor',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.DODGE_SLOT0_BLOCK);
  },
});
