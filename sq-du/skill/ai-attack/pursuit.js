'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 追击（AI 专属攻击技能）
 * 若对方闪避成功，为自身附加1级[轻盈]并在下回合开始后，结算期开始前生效。
 *
 * 触发条件：AI 发动攻击但因对方闪避而未命中（oppDmg <= 0 且对方为闪避行动）。
 * 效果：为自身队列1级 light（轻盈），下回合 TURN_START 时触发。
 */
export const PursuitEffect = createSkillEffect({
  id: EffectId.PURSUIT,
  name: '追击',
  desc: '若对方闪避成功，为自身附加1级[轻盈]并在下回合开始后，结算期开始前生效',
  applicableTo: [Action.ATTACK],
  triggerOnFail: true,  // 标记：攻击失败时也触发 onPost

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx) {
    if (!ctx || !owner || !oppCtx) return;
    if (ctx.action !== Action.ATTACK) return;
    // 仅当对方闪避且自己未造成伤害时触发
    if (oppCtx.action !== Action.DODGE) return;
    if ((oppDmg || 0) > 0) return; // 攻击命中了则不触发

    // 轻盈：走时机系统，下回合 TURN_START 由 LightEffect.apply() 执行
    EffectLayer.queueEffect(owner, 'light', { phaseEvent: 'TURN_START', source: 'skill:pursuit' });
  },
});
