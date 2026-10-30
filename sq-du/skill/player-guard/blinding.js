'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 预备（玩家专属守备技能）
 * 若守备成功（未受伤），封锁对方攻击一号槽位，在下回合开始后触发。
 */
export const BlindingEffect = createSkillEffect({
  id: EffectId.BLINDING,
  name: '震荡',
  desc: '若守备成功，[封锁]对方闪避一号槽位，攻击二号槽位和守备三号槽位并在下回合开始后，回合结束前生效。',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    const opts = { phaseEvent: 'TURN_START', source: 'skill:blinding' };
    
    // 闪避一号槽位
    EffectLayer.queueEffect(opponent, EffectId.DODGE_SLOT0_BLOCK, opts);
    EffectLayer.markFlashEffect(opponent, EffectId.DODGE_SLOT0_BLOCK);
    
    // 攻击二号槽位
    EffectLayer.queueEffect(opponent, EffectId.ATTACK_SLOT1_BLOCK, opts);
    EffectLayer.markFlashEffect(opponent, EffectId.ATTACK_SLOT1_BLOCK);
    
    // 守备三号槽位
    EffectLayer.queueEffect(opponent, EffectId.GUARD_SLOT2_BLOCK, opts);
    EffectLayer.markFlashEffect(opponent, EffectId.GUARD_SLOT2_BLOCK);
  },
});
