'use strict';

import { EngineEvent, PlayerId } from '../base/constants.js';
import { EffectHandlers } from '../base/effect-handlers.js';

export class EffectTimingLayer {
  static dispatch(phaseEvent, payload, players, engine) {
    const p1 = players?.[PlayerId.P1];
    const p2 = players?.[PlayerId.P2];
    if (!p1 || !p2) return;

    for (const player of [p1, p2]) {
      const opponent = player.id === PlayerId.P1 ? p2 : p1;
      const queue = Array.isArray(player.pendingEffects) ? player.pendingEffects : [];
      const remain = [];
      const ready = [];

      for (const entry of queue) {
        const readyAt = entry.readyAt || {};
        let expectedPhase = readyAt.phaseEvent;
        // 兼容硬编码的大写时机字符串 → EngineEvent 实际值
        if (expectedPhase === 'TURN_START') expectedPhase = EngineEvent.TURN_START_PHASE;
        else if (expectedPhase === 'ACTION_START') expectedPhase = EngineEvent.ACTION_START;
        else if (expectedPhase === 'ACTION_END') expectedPhase = EngineEvent.ACTION_END;
        else if (expectedPhase === 'EQUIP_START') expectedPhase = EngineEvent.EQUIP_START;
        else if (expectedPhase === 'DECISION_START') expectedPhase = EngineEvent.DECISION_START;

        const phaseOk = !expectedPhase || expectedPhase === phaseEvent;
        const turnOk = readyAt.turn == null || readyAt.turn <= (engine?.turn || 0);
        const ownerOk = !readyAt.ownerId || readyAt.ownerId === player.id;
        if (!phaseOk || !turnOk || !ownerOk) {
          remain.push(entry);
          continue;
        }

        ready.push(entry);
      }

      // 按 priority 升序排列：数值越大越晚触发（净化 priority=100 排最后）
      ready.sort((a, b) => (a.priority || 0) - (b.priority || 0));

      for (const entry of ready) {
        const handler = EffectHandlers[entry.effectId];
        if (handler?.onPhase) {
          handler.onPhase({
            phaseEvent,
            payload,
            effectId: entry.effectId,
            owner: player,
            opponent,
            engine,
            source: entry.source || 'pending',
          });
        }

        // ── 处理周期和持续时长，决定是否将其留在队列中 ──
        let shouldKeep = false;

        // 间歇触发（由于可能带 maxTriggers，所以优先判定）
        if (entry.interval != null && entry.interval > 0) {
          if (entry.maxTriggers != null && entry.maxTriggers > 0) {
            entry.maxTriggers -= 1;
            if (entry.maxTriggers > 0) shouldKeep = true;
          } else {
            // 永久间歇
            shouldKeep = true;
          }
          if (shouldKeep) {
            entry.readyAt.turn = (engine?.turn || 0) + entry.interval + 1;
          }
        }
        // 持续型触发
        else if (entry.duration != null && entry.duration > 0) {
          entry.duration -= 1;
          if (entry.duration > 0) {
            shouldKeep = true;
            // 持续型默认每回合触发（interval=1）
            entry.readyAt.turn = (engine?.turn || 0) + 1;
          }
        }

        if (shouldKeep) {
          remain.push(entry);
        }
      }

      player.pendingEffects = remain;
    }

    if (phaseEvent === EngineEvent.ACTION_START) return;
  }
}
