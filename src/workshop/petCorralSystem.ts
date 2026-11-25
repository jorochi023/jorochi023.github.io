// Orchard Produce & 5-Slot Monster Pet Corral (`PetRecord[5]` in `include/common/saved_game.h`).

import { setEncyclopediaBit } from '../core/savedGame.ts';
import { createBaseStats } from '../core/savedGame.ts';
import type { FieldStatKey, PetRecord, SavedGameState } from '../core/types.ts';

export interface OrchardProduceDef {
  id: string;
  name: string;
  lomEquivalent: string;
  color: string;
  statBoost: FieldStatKey;
  powerGain: number;
  hpGain: number;
  price: number;
  desc: string;
}

export const ORCHARD_PRODUCE: OrchardProduceDef[] = [
  { id: 'mangga_araw', name: 'Mangga ng Araw', lomEquivalent: 'Sunberry / Bellgrapes', color: '#f59e0b', statBoost: 'pwr', powerGain: 4, hpGain: 8, price: 35, desc: 'Golden mango ripening on Tala days. Raises Pet Power & PWR.' },
  { id: 'buko_buwan', name: 'Buko ng Buwan', lomEquivalent: 'Moonberry / Loquat', color: '#60a5fa', statBoost: 'mgc', powerGain: 2, hpGain: 14, price: 35, desc: 'Cool lunar coconut water. Raises Pet Vitality & MGC.' },
  { id: 'lansones_diwata', name: 'Lansones ng Diwata', lomEquivalent: 'Gold Clover / Applesocks', color: '#fde047', statBoost: 'lck', powerGain: 3, hpGain: 6, price: 40, desc: 'Sweet forest cluster boosting Pet Luck & Synchro aura.' },
  { id: 'saging_kapre', name: 'Saging Saba Titan', lomEquivalent: 'Boink / Cabbadillo', color: '#a3e635', statBoost: 'def', powerGain: 3, hpGain: 16, price: 45, desc: 'Hearty highland plantain fortifying Pet Defense & Stun.' },
  { id: 'ube_laho', name: 'Ube Halaya Spirit', lomEquivalent: ' Lilipods / Rocket Papaya', color: '#c084fc', statBoost: 'spr', powerGain: 5, hpGain: 10, price: 55, desc: 'Rich violet yam delicacy surging Pet Spirit & Attack Speed.' },
];

const SPECIES_SYNCHRO: Record<PetRecord['species'], { ability: string; desc: string; defaultName: string }> = {
  sarimanok: { ability: 'Golden Plume Luck', desc: '+15% Critical Rate & Pilak Find', defaultName: 'Sarimanok' },
  diwata: { ability: 'Balete Healing Mist', desc: 'Regenerates Hero HP slowly over time', defaultName: 'Diwata Wisp' },
  tiyanak: { ability: 'Feral Ambush', desc: '+18% Backstab & Stun Damage', defaultName: 'Tiyanak Imp' },
  tikbalang: { ability: 'Gale Hoof Stride', desc: '+15% Movement Speed & Dash Distance', defaultName: 'Tikbalang Colt' },
  bakunawa: { ability: 'Sovereign Eclipse Tide', desc: '+20% Special Technique & Magic Power', defaultName: 'Bakunawa Wyrmling' },
};

export function stepOrchardPetHatching(save: SavedGameState, ticks = 1): string[] {
  const events: string[] = [];
  for (let i = 0; i < save.pets.length; i++) {
    const pet = save.pets[i];
    if (!pet.inUse) continue;
    if (pet.isEgg) {
      pet.hatchCounter = Math.max(0, pet.hatchCounter - ticks);
      if (pet.hatchCounter === 0) {
        pet.isEgg = false;
        const meta = SPECIES_SYNCHRO[pet.species];
        pet.name = meta.defaultName;
        pet.companionAbility = meta.ability;
        pet.synchroDesc = meta.desc;
        pet.level = 1;
        pet.maxHp = pet.species === 'bakunawa' ? 110 : 75;
        pet.hp = pet.maxHp;
        pet.power = pet.species === 'bakunawa' ? 26 : 18;
        setEncyclopediaBit(save, 50 + i);
        events.push(`${pet.name} hatched in the Monster Corral!`);
      }
    } else if (pet.grazing) {
      pet.experience += 20 * ticks;
      if (pet.experience >= pet.level * 60) {
        pet.experience = 0;
        pet.level += 1;
        pet.power += 3;
        pet.maxHp += 12;
        pet.hp = pet.maxHp;
        events.push(`${pet.name} grew to Lv.${pet.level} while grazing!`);
      }
    }
  }
  return events;
}

export function feedProduceToPet(
  save: SavedGameState,
  petIndex: number,
  produceId: string
): { ok: boolean; message: string } {
  const pet = save.pets[petIndex];
  const prod = ORCHARD_PRODUCE.find((p) => p.id === produceId);
  if (!pet || !pet.inUse || pet.isEgg || !prod) {
    return { ok: false, message: 'Select a hatched Pet and valid Orchard fruit.' };
  }

  pet.power += prod.powerGain;
  pet.maxHp += prod.hpGain;
  pet.hp = pet.maxHp;
  pet.stats[prod.statBoost].base = Math.min(99, pet.stats[prod.statBoost].base + 2);
  pet.stats[prod.statBoost].effective = pet.stats[prod.statBoost].base;
  pet.salePrice += 25;

  if (save.joinedPet === petIndex && save.characters[2]?.characterType === 'pet') {
    save.characters[2].power = pet.power;
    save.characters[2].maxHp = pet.maxHp;
    save.characters[2].hp = pet.hp;
  }

  return { ok: true, message: `${pet.name} savored ${prod.name}! (+${prod.powerGain} PWR, +${prod.hpGain} HP)` };
}

export function assignCompanionToParty(
  save: SavedGameState,
  kind: 'pet' | 'golem' | 'none',
  index = 0
): boolean {
  if (kind === 'none') {
    save.joinedPet = -1;
    save.joinedGolem = -1;
    save.characters[2] = null;
    return true;
  }

  if (kind === 'pet') {
    const pet = save.pets[index];
    if (!pet || !pet.inUse || pet.isEgg) return false;
    pet.grazing = false;
    save.joinedPet = index;
    save.joinedGolem = -1;
    save.characters[2] = {
      name: pet.name,
      characterType: 'pet',
      padControlled: false,
      actorSpriteKey: pet.species,
      level: pet.level,
      experience: pet.experience,
      hp: pet.hp,
      maxHp: pet.maxHp,
      power: pet.power,
      equipmentTotals: [8, 8, 8, 10],
      stats: JSON.parse(JSON.stringify(pet.stats)),
      statusImmunities: 0,
      weaponFlags: 0,
      elementResistances: 0,
      companionAbility: pet.companionAbility,
      equippedAbilities: ['dash', 'defend'],
      equippedSkills: ['pet_strike', 'none', 'none', 'none'],
      equipment: { weapon: null, headgear: null, armor: null, gloves: null, boots: null },
      instruments: [],
    };
    return true;
  }

  const golem = save.golemRecords[index];
  if (!golem || !golem.inUse) return false;
  save.joinedGolem = index;
  save.joinedPet = -1;
  save.characters[2] = {
    name: golem.name,
    characterType: 'golem',
    padControlled: false,
    actorSpriteKey: 'golem',
    level: Math.max(1, save.characters[0].level),
    experience: 0,
    hp: golem.hp,
    maxHp: golem.maxHp,
    power: golem.power,
    equipmentTotals: [...golem.equipmentTotals],
    stats: createBaseStats(14, 18),
    statusImmunities: 1,
    weaponFlags: 0,
    elementResistances: 0,
    companionAbility: golem.companionAbility,
    equippedAbilities: ['defend', 'grapple'],
    equippedSkills: ['golem_logic', 'none', 'none', 'none'],
    equipment: { weapon: null, headgear: null, armor: null, gloves: null, boots: null },
    instruments: [],
  };
  return true;
}
