'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const SideStepEffect = createSkillEffect({
  id: EffectId.BODY_SIDE,
  name: '倾身',
  desc: '在行动期开始后，行动期结束前为自身附加1级[侧身]并触发，随后为自身附加1级[虚弱]并在下一回合的回合开始后，装配期开始前触发',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    // 1. 行动期开始时：附加[侧身]（效果本身提供 +1 闪避点数）
    EffectLayer.queueEffect(state, EffectId.SIDE_STEP, { phaseEvent: 'ACTION_START', source: 'skill:body_side' });
    // 为了 UI 和裁判层能在这一帧就看到变化，我们在 context 中直接加 1
    return { ...ctx, pts: ctx.pts + 1 };
  },

  onPost(_ctx, state) {
    // 2. 行动期结束时：为下一回合附加[虚弱]（点数-1）
    EffectLayer.queueDelayedEffect(state, EffectId.WEAK, 1, 'TURN_START', { source: 'skill:step_side' });
  },
});
