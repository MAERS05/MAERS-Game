'use strict';

export const EffectTiming = Object.freeze({
  TURN_START:       'TURN_START',
  ACTION_START:     'ACTION_START',
  ACTION_END:       'ACTION_END',
  RESOLVE_END:      'RESOLVE_END',
  TURN_END:         'TURN_END',
  DECISION_START:   'DECISION_START',
  DECISION_END:     'DECISION_END',
  EQUIP_START:      'EQUIP_START',
  EQUIP_END:        'EQUIP_END',
  EXPOSE_START:     'EXPOSE_START',
  EXPOSE_END:       'EXPOSE_END',
  REDECIDE_START:   'REDECIDE_START',
  REDECIDE_END:     'REDECIDE_END',
  SETTLE_START:     'SETTLE_START',
  SETTLE_END:       'SETTLE_END',
});

/** 时机常量 → 中文显示标签 */
export const EffectTimingLabel = Object.freeze({
  TURN_START:       '本回合开始时触发',
  ACTION_START:     '行动期开始时触发',
  ACTION_END:       '行动期结束时触发',
  RESOLVE_END:      '结算期结束时触发',
  TURN_END:         '本回合结束时触发',
  DECISION_START:   '决策期开始时触发',
  DECISION_END:     '决策期结束时触发',
  EQUIP_START:      '装配期开始时触发',
  EQUIP_END:        '装配期结束时触发',
  EXPOSE_START:     '暴露期开始时触发',
  EXPOSE_END:       '暴露期结束时触发',
  REDECIDE_START:   '重筹期开始时触发',
  REDECIDE_END:     '重筹期结束时触发',
  SETTLE_START:     '结算期开始时触发',
  SETTLE_END:       '结算期结束时触发',
});
