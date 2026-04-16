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

/** 时期常量 → 中文显示标签 */
export const EffectTimingLabel = Object.freeze({
  // ── EffectTiming 大写键（技能 queueEffect 使用） ──
  TURN_PHASE: '回合开始后，结算期开始前',
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
  // ── EngineEvent 小写键（溢出管道使用） ──
  turn_start_phase: '回合开始后，装配期开始前',
  equip_start: '装配期开始后，装配期结束前',
  equip_end: '装配期结束后，决策期开始前',
  decision_start: '决策期开始后，决策期结束前',
  decision_end: '决策期结束后，行动期开始前',
  action_start: '行动期开始后，行动期结束前',
  action_end: '行动期结束后，结算期开始前',
  resolve_end: '结算期结束后，回合结束前',
  turn_end_phase: '回合结束后，下回合开始前',
  expose_start: '暴露期开始后，暴露期结束前',
  expose_end: '暴露期结束后，行动期开始前',
  redecide_start: '重筹期开始后，重筹期结束前',
  redecide_end: '重筹期结束后，行动期开始前',
});
