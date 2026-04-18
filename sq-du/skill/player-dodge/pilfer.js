'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 窃取（玩家专属闪避技能）
 * 若闪避成功（未受伤），下回合开始后、回合结束前禁用对方守备一号槽位。
 */
export const PilferEffect = createSkillEffect({
  id: EffectId.PILFER,
  name: '窃取',
  desc: '若闪避成功，下回合开始后，回合结束前禁用对方守备一号槽位',
  applicableTo: [Action.DODGE],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 闪避必须成功（未受伤）
    EffectLayer.queueEffect(opponent, EffectId.GUARD_SLOT0_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:pilfer',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.GUARD_SLOT0_BLOCK);
  },
});
