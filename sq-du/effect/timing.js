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

      for (const entry of queue) {
        const readyAt = entry.readyAt || {};
        let expectedPhase = readyAt.phaseEvent;
        // 兼容硬编码的大写时机字符串 → EngineEvent 实际值
        if (expectedPhase === 'TURN_START') expectedPhase = EngineEvent.TURN_START_PHASE;
        else if (expectedPhase === 'ACTION_START') expectedPhase = EngineEvent.ACTION_START;
        else if (expectedPhase === 'ACTION_END') expectedPhase = EngineEvent.ACTION_END;
        else if (expectedPhase === 'RESOLVE_END') expectedPhase = EngineEvent.RESOLVE_END;
        else if (expectedPhase === 'TURN_END') expectedPhase = EngineEvent.TURN_END_PHASE;
        else if (expectedPhase === 'EQUIP_START') expectedPhase = EngineEvent.EQUIP_START;
        else if (expectedPhase === 'EQUIP_END') expectedPhase = EngineEvent.EQUIP_END;
        else if (expectedPhase === 'DECISION_START') expectedPhase = EngineEvent.DECISION_START;
        else if (expectedPhase === 'DECISION_END') expectedPhase = EngineEvent.DECISION_END;

        const phaseOk = !expectedPhase || expectedPhase === phaseEvent;
        const turnOk = readyAt.turn == null || readyAt.turn <= (engine?.turn || 0);
        const ownerOk = !readyAt.ownerId || readyAt.ownerId === player.id;
        if (!phaseOk || !turnOk || !ownerOk) {
          remain.push(entry);
          continue;
        }

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
      }

      player.pendingEffects = remain;
    }

    if (phaseEvent === EngineEvent.ACTION_START) return;
  }
}
