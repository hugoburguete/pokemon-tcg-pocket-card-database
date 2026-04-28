const fs = require('fs');
const cards = require('./cards/en/index.js');

// ─── Aplicar efectos de trainer cards ─────────────────────────────────────────
// Cargar los efectos scrapeados de pocket.limitlesstcg.com
// (generado por: node scripts/scrape-trainer-effects.mjs)
const trainerEffects = require('./scripts/trainer_effects_missing.json');

// Crear índice por id para lookup O(1)
const effectById = new Map(trainerEffects.map(c => [c.id, c.effect]));

let trainersUpdated = 0;
let trainersSkipped = 0;

// Iterar sobre cada set y cada carta para aplicar efectos a trainers
for (const [setKey, setCards] of Object.entries(cards)) {
  if (!Array.isArray(setCards)) continue;

  for (const card of setCards) {
    if (card.type !== 'Trainer') continue;

    // Si la carta ya tiene efecto (ej: scrapeada con scrape-set.mjs), no sobreescribir
    if (card.effect && card.effect.trim()) {
      trainersUpdated++;
      continue;
    }

    const effect = effectById.get(card.id);
    if (effect && effect.trim()) {
      card.effect = effect.trim();
      trainersUpdated++;
    } else {
      trainersSkipped++;
    }
  }
}

console.log(`✅ Efectos aplicados: ${trainersUpdated} trainer cards con efecto`);
if (trainersSkipped > 0) {
  console.log(`⚠  Sin efecto encontrado: ${trainersSkipped} trainer cards (IDs no encontrados en trainer_effects_missing.json)`);
}

// ─── Guardar todo en cards_en.json ────────────────────────────────────────────
fs.writeFileSync('cards_en.json', JSON.stringify(cards, null, 2), 'utf-8');

console.log('¡Éxito! Todos los archivos de cards/en/index.js fueron unidos en "cards_en.json"');