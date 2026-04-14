/**
 * @file effect-handlers.js
 * @description 效果钩子注册表
 *
 * 将所有效果模块文件汇总为一张 EffectId → handler 的映射表。
 * resolver.js 通过此表做动态 hook 分派，不在底层文件里硬编码任何效果逻辑。
 *
 * 新增效果步骤：
 *   1. 在对应行动目录创建效果文件（skill/attack|guard|dodge/xxx.js）
 *   2. 在 constants.js EffectId / EffectDefs 注册 ID 和元数据
 *   3. 在此文件 import 并加入 EffectHandlers
 */

import { EffectId } from './constants.js';
import { SluggishEffect, RejuvenatedEffect, ExhaustedEffect, ExcitedEffect } from '../effect/energy.js';
import { HeavyEffect, LightEffect, ShackledEffect, InsightfulEffect, DullEffect, BlindedEffect } from '../effect/combat-status.js';
import { FortifiedEffect, WoundedEffect } from '../effect/combat-identity.js';
import { PowerEffect, WeakEffect, BrokenBladeEffect, ChainlockEffect } from '../effect/attack-status.js';
import { SolidEffect, CrackedArmorEffect, BrokenArmorEffect } from '../effect/defense-status.js';
import { SideStepEffect, ClumsyEffect, ShackledDodgeEffect } from '../effect/dodge-status.js';

// ── 攻击类效果 ──
import { WoundEffect } from '../skill/attack/wound.js';
import { BreakQiEffect } from '../skill/attack/break_qi.js';
import { ChargeEffect } from '../skill/attack/charge.js';
import { PounceEffect } from '../skill/attack/pounce.js';
import { RecklessEffect } from '../skill/attack/reckless.js';
import { EnergizeEffect } from '../skill/attack/energize.js';
import { Absorb } from '../skill/attack/absorb.js';
import { ChainLock } from '../skill/attack/chainlock.js';
import { Monblinding } from '../skill/attack/monblinding.js';

// ── 守备类效果 ──
import { AuraShieldEffect } from '../skill/guard/aura_shield.js';
import { DeflectEffect } from '../skill/guard/deflect.js';
import { EntrenchEffect } from '../skill/guard/entrench.js';
import { IronWallEffect } from '../skill/guard/iron_wall.js';
import { PhalanxEffect } from '../skill/guard/phalanx.js';
import { InspireEffect } from '../skill/guard/inspire.js';
import { Paralysis } from '../skill/guard/paralysis.js';
import { Restore } from '../skill/guard/restore.js';
import { Shatter } from '../skill/guard/shatter.js';

// ── 闪避类效果 ──
import { AgilityEffect } from '../skill/dodge/agility.js';
import { AfterimageEffect } from '../skill/dodge/afterimage.js';
import { MomentumEffect } from '../skill/dodge/momentum.js';
import { SideStepEffect as BodySideEffect } from '../skill/dodge/body-side.js';
import { DisarmEffect } from '../skill/dodge/disarm.js';
import { DepressEffect } from '../skill/dodge/depress.js';
import { Hide } from '../skill/dodge/hide.js';
import { Lure } from '../skill/dodge/lure.js';
import { SeeThrough } from '../skill/dodge/see-through.js';

/**
 * 效果处理器映射表（EffectId → handler）
 *
 * 每个 handler 可实现以下可选钩子：
 *   onPre(ctx, state)                          → 返回修改后的 ctx 副本（前置效果）
 *   onPost(ctx, selfState, oppState, dmgTaken) → void（后置效果，时间轴结算后触发）
 *   onPhase(args)                              → void（阶段接口触发时机）
 */
const RawEffectHandlers = {
  [EffectId.WOUND]: WoundEffect,
  [EffectId.BREAK_QI]: BreakQiEffect,
  [EffectId.CHARGE]: ChargeEffect,
  [EffectId.AURA_SHIELD]: AuraShieldEffect,
  [EffectId.DEFLECT]: DeflectEffect,
  [EffectId.ENTRENCH]: EntrenchEffect,
  [EffectId.AGILITY]: AgilityEffect,
  [EffectId.AFTERIMAGE]: AfterimageEffect,
  [EffectId.MOMENTUM]: MomentumEffect,
  [EffectId.BODY_SIDE]: BodySideEffect,
  [EffectId.DISARM]: DisarmEffect,
  [EffectId.IRON_WALL]: IronWallEffect,
  [EffectId.PHALANX]: PhalanxEffect,
  [EffectId.POUNCE]: PounceEffect,
  [EffectId.RECKLESS]: RecklessEffect,
  [EffectId.INSPIRE]: InspireEffect,
  [EffectId.DEPRESS]: DepressEffect,
  [EffectId.ENERGIZE]: EnergizeEffect,
  [EffectId.ABSORB]: Absorb,
  [EffectId.CHAINLOCK]: ChainLock,
  [EffectId.MONBLINDING]: Monblinding,
  [EffectId.PARALYSIS]: Paralysis,
  [EffectId.RESTORE]: Restore,
  [EffectId.SHATTER]: Shatter,
  [EffectId.HIDE]: Hide,
  [EffectId.LURE]: Lure,
  [EffectId.SEE_THROUGH]: SeeThrough,
  sluggish: SluggishEffect,
  rejuvenated: RejuvenatedEffect,
  exhausted: ExhaustedEffect,
  excited: ExcitedEffect,
  heavy: HeavyEffect,
  light: LightEffect,
  shackled: ShackledEffect,
  insightful: InsightfulEffect,
  dull: DullEffect,
  blinded: BlindedEffect,
  fortified: FortifiedEffect,
  wounded: WoundedEffect,
  weak: WeakEffect,
  power: PowerEffect,
  broken_blade: BrokenBladeEffect,
  chainlock_state: ChainlockEffect,
  solid: SolidEffect,
  cracked_armor: CrackedArmorEffect,
  broken_armor: BrokenArmorEffect,
  side_step: SideStepEffect,
  clumsy: ClumsyEffect,
  shackled_dodge: ShackledDodgeEffect,
};

/**
 * 统一补全 onPhase，实际分发由 main/effect.js 负责（职责收敛）。
 */
export const EffectHandlers = Object.freeze(
  Object.fromEntries(
    Object.entries(RawEffectHandlers).map(([id, handler]) => [
      id,
      Object.freeze({
        ...handler,
        onPhase: handler?.onPhase || (() => { }),
      }),
    ])
  )
);
