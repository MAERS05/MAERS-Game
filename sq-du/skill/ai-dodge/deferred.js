'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 延付（AI 专属闪避技能）
 * 本回合不执行闪避，为自身附加1级[坚固]，在接下来两回合的行动期开始后触发（守备点数+1）。
 */
export const DeferredEffect = createSkillEffect({
  id: EffectId.DEFERRED,
  name: '延付',
  desc: '本回合闪避不执行，为自身附加1级[坚固]并在接下来两回合内的行动期开始后触发。',
  applicableTo: [Action.DODGE, Action.PREPARE],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SOLID, {
      phaseEvent: 'ACTION_START',
      duration: 2,
      source: 'skill:deferred',
    });
    EffectLayer.markFlashEffect(state, EffectId.SOLID);
    // 转为蓄备：保留闪避的精力消耗，但本回合不执行闪避
    return { ...ctx, action: Action.PREPARE };
  },
});

