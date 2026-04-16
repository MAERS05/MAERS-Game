'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';

/**
 * 强防（AI 专属守备技能）
 * 为自身附加2级[坚固]并在行动期开始后，行动期结束前生效。
 */
export const IronGuardEffect = createSkillEffect({
  id: EffectId.IRON_GUARD,
  name: '强防',
  desc: '为自身附加2级[坚固]并在行动期开始后，行动期结束前生效',
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    if (!ctx || ctx.action !== Action.GUARD) return ctx;
    // 2级坚固：直接增加守备点数 +2（行动期即时生效）
    return { ...ctx, pts: (ctx.pts || 0) + 2 };
  },
});
