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

import { EffectId } from './constants.js';

// ── 攻击类效果 ──
import { WoundEffect } from '../effect/attack/wound.js';
import { BreakQiEffect } from '../effect/attack/break_qi.js';
import { BreakLimitEffect } from '../effect/attack/break_limit.js';
import { ChargeEffect } from '../effect/attack/charge.js';
import { PounceEffect } from '../effect/attack/pounce.js';
import { RecklessEffect } from '../effect/attack/reckless.js';
import { EnergizeEffect } from '../effect/attack/energize.js';

// ── 守备类效果 ──
import { ReboundEffect } from '../effect/guard/rebound.js';
import { AuraShieldEffect } from '../effect/guard/aura_shield.js';
import { DeflectEffect } from '../effect/guard/deflect.js';
import { EntrenchEffect } from '../effect/guard/entrench.js';
import { IronWallEffect } from '../effect/guard/iron_wall.js';
import { PhalanxEffect } from '../effect/guard/phalanx.js';
import { InspireEffect } from '../effect/guard/inspire.js';

// ── 闪避类效果 ──
import { AgilityEffect } from '../effect/dodge/agility.js';
import { AfterimageEffect } from '../effect/dodge/afterimage.js';
import { ExtremeEffect } from '../effect/dodge/extreme.js';
import { MomentumEffect } from '../effect/dodge/momentum.js';
import { SideStepEffect } from '../effect/dodge/side_step.js';
import { DisarmEffect } from '../effect/dodge/disarm.js';
import { DepressEffect } from '../effect/dodge/depress.js';

/**
 * 效果处理器映射表（EffectId → handler）
 *
 * 每个 handler 可实现以下可选钩子：
 *   onPre(ctx, state)                          → 返回修改后的 ctx 副本（前置效果）
 *   onPost(ctx, selfState, oppState, dmgTaken) → void（后置效果，时间轴结算后触发）
 */
export const EffectHandlers = Object.freeze({
  [EffectId.WOUND]:       WoundEffect,
  [EffectId.BREAK_QI]:    BreakQiEffect,
  [EffectId.BREAK_LIMIT]: BreakLimitEffect,
  [EffectId.CHARGE]:      ChargeEffect,
  [EffectId.REBOUND]:     ReboundEffect,
  [EffectId.AURA_SHIELD]: AuraShieldEffect,
  [EffectId.DEFLECT]:     DeflectEffect,
  [EffectId.ENTRENCH]:    EntrenchEffect,
  [EffectId.AGILITY]:     AgilityEffect,
  [EffectId.AFTERIMAGE]:  AfterimageEffect,
  [EffectId.EXTREME]:     ExtremeEffect,
  [EffectId.MOMENTUM]:    MomentumEffect,
  [EffectId.SIDE_STEP]:   SideStepEffect,
  [EffectId.DISARM]:      DisarmEffect,
  [EffectId.IRON_WALL]:   IronWallEffect,
  [EffectId.PHALANX]:     PhalanxEffect,
  [EffectId.POUNCE]:      PounceEffect,
  [EffectId.RECKLESS]:    RecklessEffect,
  [EffectId.INSPIRE]:     InspireEffect,
  [EffectId.DEPRESS]:     DepressEffect,
  [EffectId.ENERGIZE]:    EnergizeEffect,
});
