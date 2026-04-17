'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 迅防（AI 专属守备技能）
 * 为自身附加1级[轻盈]并在行动期开始后，行动期结束前生效。
 *
 * 设计意图：守备的同时获得动速加成，让 AI 下回合拥有速度优势。
 */
export const IronGuardEffect = createSkillEffect({
  id: EffectId.IRON_GUARD,
  name: '迅防',
  desc: '为自身附加1级[轻盈]并在行动期开始后，行动期结束前生效',
  applicableTo: [Action.GUARD],

  onPre(ctx, owner) {
    if (!ctx || ctx.action !== Action.GUARD) return ctx;

    // 轻盈：本回合 ACTION_START 时由 LightEffect.apply() 执行
    EffectLayer.queueEffect(owner, 'light', { phaseEvent: 'ACTION_START', source: 'skill:iron_guard' });
    return ctx;
  },
});
