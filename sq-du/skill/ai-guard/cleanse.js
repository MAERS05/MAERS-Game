'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 洁净（AI 专属守备技能）
 * 本回合不执行守备，下回合开始后为自身附加[净化]并清除部分负面效果。
 */
export const InvigorateEffect = createSkillEffect({
  id: EffectId.INVIGORATE,
  name: '洁净',
  desc: '本回合不执行守备，为自身附加[净化]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    // 净化（下回合开始触发）：清除自身部分负面效果
    EffectLayer.queueEffect(state, EffectId.PURIFY, {
      phaseEvent: 'TURN_START',
      source: 'skill:cleanse',
    });
    // 转为蓄备：保留守备的精力消耗，但本回合不执行守备
    return { ...ctx, action: Action.PREPARE };
  },
});
