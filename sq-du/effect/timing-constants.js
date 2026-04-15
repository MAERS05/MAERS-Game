'use strict';

export const EffectTiming = Object.freeze({
  TURN_START: 'TURN_START',
  ACTION_START: 'ACTION_START',
  ACTION_END: 'ACTION_END',
  RESOLVE_END: 'RESOLVE_END',
  TURN_END: 'TURN_END',
  DECISION_START: 'DECISION_START',
  DECISION_END: 'DECISION_END',
  EQUIP_START: 'EQUIP_START',
  EQUIP_END: 'EQUIP_END',
  EXPOSE_START: 'EXPOSE_START',
  EXPOSE_END: 'EXPOSE_END',
  REDECIDE_START: 'REDECIDE_START',
  REDECIDE_END: 'REDECIDE_END',
  SETTLE_START: 'SETTLE_START',
  SETTLE_END: 'SETTLE_END',
});

/** 时机常量 → 中文显示标签 */
export const EffectTimingLabel = Object.freeze({
  TURN_START: '回合开始后，装配期开始前',
  EQUIP_START: '装配期开始后，装配期结束前',
  EQUIP_END: '装配期结束后，决策期开始前',
  DECISION_START: '决策期开始后，决策期结束前',
  DECISION_END: '决策期结束后，行动期开始前',
  ACTION_START: '行动期开始后，行动期结束前',
  ACTION_END: '行动期结束后，结算期开始前',
  RESOLVE_END: '结算期结束后，回合结束前',
  TURN_END: '回合结束后，下回合开始前',
  EXPOSE_START: '暴露期开始后，暴露期结束前',
  EXPOSE_END: '暴露期结束后，行动期开始前',
  REDECIDE_START: '重筹期开始后，重筹期结束前',
  REDECIDE_END: '重筹期结束后，行动期开始前',
  SETTLE_START: '结算期开始后，结算期结束前',
  SETTLE_END: '结算期结束后，下一回合开始前',
});
