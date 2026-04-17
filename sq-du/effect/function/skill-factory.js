'use strict';

import { EffectLayer } from '../../main/effect.js';

export function createSkillEffect({ id, name, desc, applicableTo, timing = null, triggerOnFail = false, onPre, onPost, onPhase }) {
  return Object.freeze({
    id,
    name,
    desc,
    applicableTo,
    timing,
    triggerOnFail,
    onPre: onPre || (() => {}),
    onPost: onPost || (() => {}),
    onPhase: onPhase || ((ctx, owner, opponent, meta = {}) => {
      const target = meta.target === 'opponent' ? opponent : owner;
      if (!target) return;
      if (meta.effectId) {
        EffectLayer.queueEffect(target, meta.effectId, meta.queue || {});
      }
    }),
  });
}
