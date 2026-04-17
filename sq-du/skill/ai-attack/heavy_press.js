'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 猛压（AI 专属攻击技能）
 * 若对方守备成功，为自身附加1级[力量]并在下回合的行动期开始后，行动期结束前生效。
 *
 * 触发条件：AI 发动攻击但因对方守备而未命中（oppDmg <= 0 且对方为守备行动）。
 * 效果：为自身队列1级 power（力量），下回合 ACTION_START 时触发。
 */
export const HeavyPressEffect = createSkillEffect({
  id: EffectId.HEAVY_PRESS,
  name: '猛压',
  desc: '若对方守备成功，为自身附加1级[力量]并在下回合的行动期开始后，行动期结束前生效',
  applicableTo: [Action.ATTACK],
  triggerOnFail: true,  // 标记：攻击失败时也触发 onPost

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx) {
    if (!ctx || !owner || !oppCtx) return;
    if (ctx.action !== Action.ATTACK) return;
    // 仅当对方守备且自己未造成伤害时触发
    if (oppCtx.action !== Action.GUARD) return;
    if ((oppDmg || 0) > 0) return; // 攻击命中了则不触发

    // 力量：走时机系统，下回合 ACTION_START 由 PowerEffect.apply() 执行
    EffectLayer.queueEffect(owner, 'power', { phaseEvent: 'ACTION_START', source: 'skill:heavy_press' });
  },
});
