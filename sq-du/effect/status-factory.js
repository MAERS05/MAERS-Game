'use strict';

export function createStatusEffect({ id, name, desc, applicableTo, apply, onPhase }) {
  const finalApply = apply || (() => {});
  return Object.freeze({
    id,
    name,
    desc,
    applicableTo,
    apply: finalApply,
    onPhase: onPhase || ((args) => {
      if (args && args.owner) {
        finalApply(args.owner);
      }
    }),
  });
}
