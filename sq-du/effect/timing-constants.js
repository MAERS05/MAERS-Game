'use strict';

export const EffectTiming = Object.freeze({
  TURN_START: 'TURN_START',
  EQUIP_START: 'EQUIP_START',
  DECISION_START: 'DECISION_START',
  EXPOSE_START: 'EXPOSE_START',
  REDECIDE_START: 'REDECIDE_START',
  ACTION_START: 'ACTION_START',
  ACTION_END: 'ACTION_END',
});

/** 时期常量 → 中文显示标签（大小写统一查表） */
export const EffectTimingLabel = Object.freeze({
  // 触发类（即时生效，一句话）
  TURN_START: '回合开始后触发',
  EQUIP_START: '装配期开始后触发',
  DECISION_START: '决策期开始后触发',
  EXPOSE_START: '暴露期开始后触发',
  REDECIDE_START: '重筹期开始后触发',
  ACTION_START: '行动期开始后触发',
  ACTION_END: '行动期结束后触发',
  // 生效类（持续到某阶段结束，两句话）
  TURN_PHASE: '回合开始后，回合结束前生效',
  EQUIP_PHASE: '装配期开始后，装配期结束前生效',
  DECISION_PHASE: '决策期开始后，决策期结束前生效',
  EXPOSE_PHASE: '暴露期开始后，暴露期结束前生效',
  REDECIDE_PHASE: '重筹期开始后，重筹期结束前生效',
});

/** EngineEvent 值 → EffectTimingLabel 键（反向映射） */
export const EngineEventToTimingKey = Object.freeze({
  'turn_start_phase': 'TURN_START',
  'equip_start': 'EQUIP_START',
  'decision_start': 'DECISION_START',
  'expose_start': 'EXPOSE_START',
  'redecide_start': 'REDECIDE_START',
  'action_start': 'ACTION_START',
  'action_end': 'ACTION_END',
});

/** 触发键 → 生效键（trigger → phase 映射，用于持续型效果的时期显示） */
export const TriggerToPhaseKey = Object.freeze({
  'TURN_START': 'TURN_PHASE',
  'EQUIP_START': 'EQUIP_PHASE',
  'DECISION_START': 'DECISION_PHASE',
  'EXPOSE_START': 'EXPOSE_PHASE',
  'REDECIDE_START': 'REDECIDE_PHASE',
});
