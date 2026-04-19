'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const ChargeEffect = createSkillEffect({
  id: 'charge',
  name: '蓄力',
  desc: '本回合攻击不执行，为自身附加1级[力量]并每隔一回合触发一次，共两次。',
  applicableTo: [Action.ATTACK, Action.PREPARE],
  onPre(ctx, state) {
    // 力量（每隔一回合触发，共2次）：interval=1 表示跳过1回合后再次触发
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'ACTION_START', interval: 1, maxTriggers: 2, source: 'skill:charge' });
    // 转为蓄备：保留攻击的精力消耗，但本回合不执行攻击
    return { ...ctx, action: Action.PREPARE };
  },
});
