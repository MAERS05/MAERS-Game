'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const ChargeEffect = createSkillEffect({
  id: 'charge',
  name: '蓄力',
  desc: '本回合攻击不执行，为自身附加1级[力量]并在接下来2回合内的回合开始后，装配期开始前触发。',
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    // 力量（持续2回合）：走队列，duration=2 表示连续触发2个回合
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'TURN_START', duration: 2, source: 'skill:charge' });
    // 转为蓄备：保留攻击的精力消耗，但本回合不执行攻击
    return { ...ctx, action: Action.PREPARE };
  },
});
