'use strict';

import { EngineEventToTimingKey, TriggerToPhaseKey } from '../timing-constants.js';

/**
 * 记录效果时期元数据到 owner._effectMeta，供 UI 读取。
 * first-writer-wins：同一个 effectId 在同一回合内只记录首次触发的时期。
 *
 * @param {Object} owner - 玩家状态对象
 * @param {string} id    - 效果 ID
 * @param {string} phaseEvent - EngineEvent 值（如 'turn_start_phase'）
 * @param {'trigger'|'phase'} displayMode - 显示模式
 */
export function recordEffectMeta(owner, id, phaseEvent, displayMode = 'trigger') {
  if (!owner || !id) return;
  if (!owner._effectMeta) owner._effectMeta = {};
  if (owner._effectMeta[id]) return;
  const rawKey = EngineEventToTimingKey[phaseEvent]
    || (typeof phaseEvent === 'string' ? phaseEvent.toUpperCase() : 'ACTION_START');
  owner._effectMeta[id] = displayMode === 'phase'
    ? (TriggerToPhaseKey[rawKey] || rawKey)
    : rawKey;
}

/**
 * 创建状态效果定义。
 *
 * @param {Object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {string} config.desc
 * @param {string[]} config.applicableTo
 * @param {Function} [config.apply] - 应用效果到 state 的函数
 * @param {Function} [config.onPhase] - 自定义阶段处理器（自定义时需手动调用 recordEffectMeta）
 * @param {'trigger'|'phase'} [config.timingDisplay='trigger']
 *   - 'trigger'：即时触发型，UI 显示 "X后触发"（如萎靡、治愈）
 *   - 'phase'：持续生效型，UI 显示 "X后，Y前生效"（如力量、轻盈）
 */
export function createStatusEffect({ id, name, desc, applicableTo, apply, onPhase, timingDisplay }) {
  const applyFn = apply || (() => {});
  const displayMode = timingDisplay || 'trigger';
  return Object.freeze({
    id,
    name,
    desc,
    applicableTo,
    timingDisplay: displayMode,
    onPhase: onPhase || (({ owner, phaseEvent }) => {
      if (owner) {
        applyFn(owner);
        recordEffectMeta(owner, id, phaseEvent, displayMode);
      }
    }),
    apply: applyFn,
  });
}
