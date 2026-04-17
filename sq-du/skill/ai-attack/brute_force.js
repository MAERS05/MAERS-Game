'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 蛮力（AI 专属攻击技能）
 * 为自身附加1级[力量]并在行动期开始后，行动期结束前触发。
 * 若攻击失败（对方守备或闪避成功），为自身附加1级[沉重]并在下回合开始后，结算期开始前生效。
 *
 * 设计意图：无条件增强当前攻击点数，但攻击落空时会被沉重惩罚降低动速。
 * 风险收益型技能——命中则纯赚力量，失手则下回合被减速。
 */
export const BruteForceEffect = createSkillEffect({
  id: EffectId.BRUTE_FORCE,
  name: '蛮力',
  desc: '为自身附加1级[力量]并在行动期开始后，行动期结束前触发，若攻击失败，为自身附加1级[沉重]并在下回合开始后，结算期开始前生效',
  applicableTo: [Action.ATTACK],
  triggerOnFail: true,  // 攻击失败时也触发 onPost

  // 前置效果：无条件附加力量（本回合 ACTION_START 生效）
  onPre(ctx, owner) {
    if (!ctx || !owner) return ctx;
    if (ctx.action !== Action.ATTACK) return ctx;

    // 力量：本回合 ACTION_START 时由 PowerEffect.apply() 执行
    EffectLayer.queueEffect(owner, 'power', { phaseEvent: 'ACTION_START', source: 'skill:brute_force' });
    return ctx;
  },

  // 后置效果：攻击失败时附加沉重
  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx) {
    if (!ctx || !owner || !oppCtx) return;
    if (ctx.action !== Action.ATTACK) return;

    // 攻击命中了 → 不惩罚
    if ((oppDmg || 0) > 0) return;

    // 攻击失败（对方守备或闪避成功）→ 附加沉重
    if (oppCtx.action === Action.GUARD || oppCtx.action === Action.DODGE) {
      EffectLayer.queueEffect(owner, 'heavy', { phaseEvent: 'TURN_START', source: 'skill:brute_force' });
    }
  },
});
