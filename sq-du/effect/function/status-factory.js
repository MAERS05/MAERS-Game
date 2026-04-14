'use strict';

export function createStatusEffect({ id, name, desc, applicableTo, apply, onPhase }) {
  return Object.freeze({
    id,
    name,
    desc,
    applicableTo,
    onPhase: onPhase || (() => {}),
    apply: apply || (() => {}),
  });
}
