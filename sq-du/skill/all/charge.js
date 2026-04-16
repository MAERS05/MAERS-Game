'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const ChargeEffect = createSkillEffect({
  id: 'charge',
  name: '蓄力',
  desc: '本回合攻击不执行，为自身附加1级[力量]并在下一回合的回合开始后，装配期开始前触发。',
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    // 力量（下回合延迟）：走队列
    EffectLayer.queueEffect(state, EffectId.POWER, { phaseEvent: 'TURN_START', source: 'skill:charge' });
    // 转为待命（蓄力标记保留，精力仍按攻击消耗结算）
    return { ...ctx, action: Action.STANDBY, isCharge: true };
  },
});
