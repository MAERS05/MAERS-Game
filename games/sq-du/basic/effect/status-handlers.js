/**
 * @file status-handlers.js
 * @description 类型通用的状态效果处理器表（StatusId → handler）。
 *
 * 力量/虚弱/坚固/萎靡等状态效果由类型通用层提供，各游戏在自己的 effect-handlers.js 中
 * 展开本表，再追加游戏专属技能，避免每个游戏重复登记通用状态。
 */

import { SluggishEffect, RejuvenatedEffect, ExhaustedEffect, ExcitedEffect } from './function/energy.js';
import { HeavyEffect, LightEffect, ShackledEffect, InsightfulEffect, DullEffect, BlindedEffect } from './function/combat-status.js';
import { FortifiedEffect, WoundedEffect } from './function/combat-identity.js';
import { PowerEffect, WeakEffect, BrokenBladeEffect } from './function/attack-status.js';
import { SolidEffect, CrackedArmorEffect, BrokenArmorEffect } from './function/defense-status.js';
import { SideStepEffect, ClumsyEffect, ShackledDodgeEffect } from './function/dodge-status.js';
import { MeridianBlockEffect, HealBlockEffect, AttackEnhanceEffect, AttackSlot0BlockEffect, AttackSlot1BlockEffect, GuardSlot0BlockEffect, GuardSlot2BlockEffect, DodgeSlot0BlockEffect, GuardEnhanceEffect, DodgeEnhanceEffect, PurifyEffect } from './function/utility-status.js';

export const StatusHandlers = {
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
  solid: SolidEffect,
  cracked_armor: CrackedArmorEffect,
  broken_armor: BrokenArmorEffect,
  side_step: SideStepEffect,
  clumsy: ClumsyEffect,
  shackled_dodge: ShackledDodgeEffect,
  meridian_block: MeridianBlockEffect,
  heal_block: HealBlockEffect,
  attack_enhance: AttackEnhanceEffect,
  attack_slot0_block: AttackSlot0BlockEffect,
  attack_slot1_block: AttackSlot1BlockEffect,
  guard_slot0_block: GuardSlot0BlockEffect,
  guard_slot2_block: GuardSlot2BlockEffect,
  dodge_slot0_block: DodgeSlot0BlockEffect,
  guard_enhance: GuardEnhanceEffect,
  dodge_enhance: DodgeEnhanceEffect,
  purify: PurifyEffect,
};
