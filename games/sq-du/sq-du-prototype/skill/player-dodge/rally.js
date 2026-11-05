'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../../basic/effect/function/skill-factory.js';
import { EffectLayer } from '../../../basic/main/effect.js';

/**
 * 振势（玩家专属闪避技能）
 * 若闪避成功，为自身附加1级[振奋]并在下回合开始后触发（恢复1点真实精力）。
 */
export const PilferEffect = createSkillEffect({
  id: EffectId.PILFER,
  name: '振势',
  desc: '若闪避成功，为自身附加1级[振奋]并在下回合开始后触发。',
  applicableTo: [Action.DODGE],

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx, result) {
    if (!owner) return;
    if ((selfDmg || 0) > 0) return; // 闪避必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.REJUVENATED, {
      phaseEvent: 'TURN_START',
      turn: (result?.turn ?? 0) + 1,
      source: 'skill:rally',
    });
    EffectLayer.markFlashEffect(owner, EffectId.REJUVENATED);
  },
});
