/**
 * @file effect-handlers.js
 * @description 效果钩子注册表
 *
 * 将所有效果模块文件汇总为一张 EffectId → handler 的映射表。
 * resolver.js 通过此表做动态 hook 分派，不在底层文件里硬编码任何效果逻辑。
 *
 * 新增效果步骤：
 *   1. 在对应行动目录创建效果文件（effect/attack|guard|dodge/xxx.js）
 *   2. 在 constants.js EffectId / EffectDefs 注册 ID 和元数据
 *   3. 在此文件 import 并加入 EffectHandlers
 */

'use strict';

import { EffectId } from './constants.js';

// ── 攻击类效果 ──
import { WoundEffect } from '../effect/attack/wound.js';
import { BreakQiEffect } from '../effect/attack/break_qi.js';
import { BreakLimitEffect } from '../effect/attack/break_limit.js';
import { ChargeEffect } from '../effect/attack/charge.js';

// ── 守备类效果 ──
import { ReboundEffect } from '../effect/guard/rebound.js';

// ── 闪避类效果 ──
import { AgilityEffect } from '../effect/dodge/agility.js';

/**
 * 效果处理器映射表（EffectId → handler）
 *
 * 每个 handler 可实现以下可选钩子：
 *   onPre(ctx, state)  → 返回修改后的 ctx 副本（前置效果，在时间轴执行前触发）
 *   onHit(ctx)         → void（后置命中效果，在时间轴命中结算后触发）
 */
export const EffectHandlers = Object.freeze({
  [EffectId.WOUND]:       WoundEffect,
  [EffectId.BREAK_QI]:    BreakQiEffect,
  [EffectId.BREAK_LIMIT]: BreakLimitEffect,
  [EffectId.CHARGE]:      ChargeEffect,
  [EffectId.REBOUND]:     ReboundEffect,
  [EffectId.AGILITY]:     AgilityEffect,
});
