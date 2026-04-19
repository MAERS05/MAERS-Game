'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 延付（玩家专属闪避技能）
 * 本回合不执行闪避，为自身附加1级[侧身]（闪避点数+1），持续2回合。
 */
export const DeferredEffect = createSkillEffect({
  id: EffectId.DEFERRED,
  name: '延付',
  desc: '本回合闪避不执行，为自身附加1级[侧身]并在接下来2回合内的回合开始后，回合结束前生效',
  applicableTo: [Action.DODGE, Action.PREPARE],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SIDE_STEP, {
      phaseEvent: 'TURN_START',
      duration: 2,
      source: 'skill:deferred',
    });
    // 转为蓄备：保留闪避的精力消耗，但本回合不执行闪避
    return { ...ctx, action: Action.PREPARE };
  },
});
