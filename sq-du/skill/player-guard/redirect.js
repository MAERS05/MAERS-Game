'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 化劲（玩家专属守备技能）
 * 在行动期开始后为自身附加1级[坚固]并触发，随后为自身附加1级[僵硬]并在下一回合的行动期开始后触发。
 * 若守备成功，为对方附加1级[虚弱]并在下一回合的行动期开始后触发。
 */
export const RedirectEffect = createSkillEffect({
  id: EffectId.REDIRECT,
  name: '化劲',
  desc: '在行动期开始后为自身附加1级[坚固]并触发，随后为自身附加1级[僵硬]并在下一回合的行动期开始后触发。若守备成功，为对方附加1级[虚弱]并在下一回合的行动期开始后触发。',
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    // 坚固（本回合即时）：通过返回 pts+1 直接应用
    EffectLayer.markFlashEffect(state, EffectId.SOLID);
    // 僵硬（下回合延迟）：走队列，闪避-1
    EffectLayer.queueEffect(state, EffectId.CLUMSY, { phaseEvent: 'ACTION_START', source: 'skill:redirect' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },

  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (!oppState) return;
    if ((dmgTaken || 0) > 0) return; // 守备必须成功（未受伤）
    // 虚弱（下回合延迟）：攻击点数-1
    EffectLayer.queueEffect(oppState, EffectId.WEAK, { phaseEvent: 'ACTION_START', source: 'skill:redirect' });
    EffectLayer.markFlashEffect(oppState, EffectId.WEAK);
  },
});
