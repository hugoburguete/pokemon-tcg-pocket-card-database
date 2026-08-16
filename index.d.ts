type Attack = {
  name: string;
  damage: string;
  cost: string[];
  effect?: string;
};

type Ability = {
  name: string;
  effect: string;
};

type Card = {
  id: string;
  name: string;
  element: string | null;
  type: 'Pokemon' | 'Trainer';
  subtype: string;
  health: number | null;
  set: string;
  pack: string | null;
  rarity: string | null;
  retreatCost: number | null;
  weakness: string | null;
  evolvesFrom: string | null;
  attacks: Attack[];
  abilities: Ability[];
};

export declare const en: {
  promoA: Card[];
  promoB: Card[];
  geneticApex: Card[];
  mythicalIsland: Card[];
  spaceTimeSmackdown: Card[];
  triumphantLight: Card[];
  shiningRevelry: Card[];
  celestialGuardians: Card[];
  extradimensionalCrisis: Card[];
  eeveeGrove: Card[];
  wisdomOfSeaAndSky: Card[];
  secludedSprings: Card[];
  deluxePackEx: Card[];
  megaRising: Card[];
  crimsonBlaze: Card[];
  fantasticalParade: Card[];
  paldeanWonders: Card[];
  megaShine: Card[];
  pulsingAura: Card[];
  paradoxDrive: Card[];
  everydayWonders: Card[];
  rulerOfTheSkies: Card[];
};

export declare const fr: {
  puissanceGenetique: Card[];
  ileFabuleuse: Card[];
  chocSpatioTemporel: Card[];
  lumiereTriomphale: Card[];
  rejouissancesRayonnantes: Card[];
  gardiensAstraux: Card[];
  criseInterdimensionnelle: Card[];
  clairiereDevoli: Card[];
  sagesseEntreCielEtMer: Card[];
  sourceSecrete: Card[];
  boosterDeLuxeEx: Card[];
  megaAscension: Card[];
  embrasementEcarlate: Card[];
  paradeOnirique: Card[];
  megaRayonnement: Card[];
};
