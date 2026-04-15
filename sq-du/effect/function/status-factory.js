'use strict';

export function createStatusEffect({ id, name, desc, applicableTo, apply, onPhase }) {
  const applyFn = apply || (() => {});
  return Object.freeze({
    id,
    name,
    desc,
    applicableTo,
    onPhase: onPhase || (({ owner }) => {
      if (owner) applyFn(owner);
    }),
    apply: applyFn,
  });
}
