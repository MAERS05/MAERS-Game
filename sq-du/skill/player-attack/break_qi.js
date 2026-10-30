'use strict';

import { Action, DefaultStats, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const BreakQiEffect = createSkillEffect({
  id: EffectId.BREAK_QI,
  name: '泣命',
  desc: '在行动期开始后为自身附加1级[创伤]并触发，随后为自身附加1级[力量]并触发。若攻击成功，为自身附加1级[治愈]并在本回合行动期结束后触发。',
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    // 创伤（本回合即时）：直接扣命数
    if ((state.hp || 0) > 0) {
      state.hp--;
    } else {
      state.hpUnderflow = (state.hpUnderflow || 0) + 1;
    }
    EffectLayer.markFlashEffect(state, EffectId.WOUNDED);
    // 力量（本回合即时）：通过返回 pts+1 直接应用（不走 chargeBoost 避免双重叠加）
    EffectLayer.markFlashEffect(state, EffectId.POWER);
    return { ...ctx, pts: ctx.pts + 1 };
  },
  onPost(ctx, selfState, oppState, selfDmgReceived, oppDmgReceived, oppCtx) {
    // 攻击成功后（processPostEffects 已做成功判断），附加1级治愈
    // 在行动期结束后、结算期开始前触发
    EffectLayer.queueEffect(selfState, EffectId.FORTIFIED, {});
    EffectLayer.markFlashEffect(selfState, EffectId.FORTIFIED);
  },
});
