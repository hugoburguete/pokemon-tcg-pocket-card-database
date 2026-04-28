/**
 * scrape-trainer-effects.mjs
 *
 * Scrapea pocket.limitlesstcg.com para obtener TODAS las trainer cards
 * con sus efectos y genera dos archivos JSON en el mismo directorio:
 *
 * trainer_effects_all.json     → todas las trainers scrapeadas del sitio
 * trainer_effects_missing.json → solo las que no tienen efecto en cards_en.json
 *
 * Estructura de cada objeto:
 *   { "id": "b2b-065", "name": "Nasty Notice", "effect": "Your opponent discards..." }
 *
 * Uso: node scripts/scrape-trainer-effects.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { load } from 'cheerio';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://pocket.limitlesstcg.com';

/**
 * URL de búsqueda.
 * - q contiene: type:trainer display:text sort:set unique:cards
 *   (display:text se pone DENTRO de q para que el sitio lo aplique)
 * - perPage=250 intenta traer el máximo por página
 */
const SEARCH_URL =
  `${BASE_URL}/cards/?q=type%3Atrainer+display%3Atext+sort%3Aset+unique%3Acards&show=all`;

const DELAY_MS = 1200; // cortesía entre requests (ms)
const OUTPUT_ALL = path.join(__dirname, 'trainer_effects_all.json');
const OUTPUT_MISSING = path.join(__dirname, 'trainer_effects_missing.json');

// ─── Normalización de IDs ──────────────────────────────────────────────────────

/**
 * Convierte el ID del sitio al formato de nuestra DB.
 *
 * El sitio usa mayúsculas y espacio antes del número:
 *   "B2b #65"  → "b2b-065"
 *   "A1 #216"  → "a1-216"
 *   "P-A #1"   → "p-a-001"
 *   "A2a #117" → "a2a-117"
 *   "B1 #213"  → "b1-213"
 *
 * Nuestra DB usa minúsculas + guion + número con al menos 3 dígitos.
 * Excepto los promos (p-a-001) que ya tienen 3 dígitos.
 */
function normalizeId(rawId) {
  const trimmed = rawId.trim();
  // Formato: "XYZ #NNN" donde XYZ puede incluir guiones (ej: P-A)
  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9\-]*)\s+#(\d+)$/);
  if (!match) {
    console.warn(`  ⚠ ID no parseado: "${trimmed}"`);
    return trimmed.toLowerCase().replace(/\s+#\s*/g, '-');
  }
  const [, setCode, num] = match;
  return `${setCode.toLowerCase()}-${num.padStart(3, '0')}`;
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(url) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
  return res.text();
}

// ─── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parsea la vista "Text only" de limitlesstcg.
 *
 * Estructura HTML real (confirmada por inspección del DOM):
 *
 *   <div class="card">                      ← contenedor de cada carta
 *     <div class="card-text">               ← texto de la carta
 *       <div class="card-text-section">     ← sección con título
 *         <p class="card-text-title">
 *           <span class="card-text-name">
 *             <a href="/cards/B2b/65">Nasty Notice</a>
 *           </span>
 *         </p>
 *         <p class="card-text-type">Trainer - Item</p>
 *       </div>
 *       <div class="card-text-section">     ← sección con el efecto
 *         Your opponent discards cards...
 *       </div>
 *     </div>
 *     <div class="card-set-info">B2b #65</div>  ← SIBLING de .card-text
 *   </div>
 */
function parsePage(html) {
  const $ = load(html);
  const cards = [];

  // Iterar sobre el contenedor .card (que agrupa .card-text + .card-set-info)
  $('.card').each((_, cardEl) => {
    const $card = $(cardEl);

    // Nombre
    const name = $card.find('.card-text-name').first().text().trim();

    // ID raw: hermano de .card-text dentro de .card
    const idRaw = $card.find('.card-set-info').first().text().trim();

    if (!name || !idRaw) return;

    // Efecto: todas las .card-text-section que NO tienen título/tipo
    const effectParts = [];
    $card.find('.card-text-section').each((_, sec) => {
      const $sec = $(sec);
      if ($sec.find('.card-text-title, .card-text-type').length > 0) return;
      const text = $sec.text().trim();
      if (text) effectParts.push(text);
    });

    const effect = effectParts.join('\n').trim();

    cards.push({
      id: normalizeId(idRaw),
      name,
      effect,
      _rawId: idRaw,
    });
  });

  return cards;
}

// ─── Paginación ────────────────────────────────────────────────────────────────

/** Total de cartas según el sitio (ej: "125 unique cards found") */
function getTotalCount(html) {
  const match = html.match(/(\d+)\s+unique\s+cards?\s+found/i);
  return match ? parseInt(match[1], 10) : null;
}

/** URL de la siguiente página o null si no existe */
function getNextPageUrl(html) {
  const $ = load(html);

  // Buscar links de paginación "Next" / ">" / rel=next
  const candidates = [
    $('a[rel="next"]').attr('href'),
    $('link[rel="next"]').attr('href'),
    // Paginación típica del sitio: buscar el link activo y tomar el siguiente
    (() => {
      let next = null;
      $('.pagination a, [class*="pagination"] a').each((_, el) => {
        const txt = $(el).text().trim();
        if (txt === '›' || txt === '>' || txt.toLowerCase() === 'next' || txt === '→') {
          next = $(el).attr('href');
        }
      });
      return next;
    })(),
  ];

  const href = candidates.find(Boolean);
  if (!href) return null;
  return href.startsWith('http') ? href : `${BASE_URL}${href}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Scraper de Trainer Cards – pocket.limitlesstcg.com\n');

  // 1. Leer DB local
  console.log('📂 Leyendo cards_en.json...');
  const db = JSON.parse(readFileSync(path.join(ROOT, 'cards_en.json'), 'utf-8'));

  let allDbCards = [];
  for (const cards of Object.values(db)) {
    if (Array.isArray(cards)) allDbCards = allDbCards.concat(cards);
  }

  const trainerCards = allDbCards.filter(c => c.type === 'Trainer');
  const missingEffectIds = new Set(
    trainerCards
      .filter(c => !c.effect || c.effect.trim() === '')
      .map(c => c.id)
  );

  console.log(`  Total trainers en DB:    ${trainerCards.length}`);
  console.log(`  Con efecto faltante:     ${missingEffectIds.size}\n`);

  // 2. Scrape paginado
  const allScraped = [];
  let url = SEARCH_URL;
  let page = 1;

  while (url) {
    console.log(`📄 Página ${page}: ${url}`);
    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      console.error(`  ✗ Error fetching: ${err.message}`);
      break;
    }

    if (page === 1) {
      const total = getTotalCount(html);
      if (total) console.log(`  Sitio reporta ${total} cartas únicas`);
    }

    const cards = parsePage(html);
    console.log(`  → ${cards.length} cartas parseadas`);

    if (cards.length === 0) {
      const dbgPath = path.join(__dirname, `debug_page_${page}.html`);
      writeFileSync(dbgPath, html);
      console.log(`  ⚠ Sin resultados. HTML guardado en ${path.basename(dbgPath)}`);
      break;
    }

    allScraped.push(...cards);

    const nextUrl = getNextPageUrl(html);
    if (nextUrl && nextUrl !== url) {
      url = nextUrl;
      page++;
      console.log(`  Esperando ${DELAY_MS}ms...`);
      await sleep(DELAY_MS);
    } else {
      url = null;
    }
  }

  console.log(`\n✅ Total scrapeado: ${allScraped.length} cartas`);

  // 3. Deduplicar por id
  const seen = new Map();
  for (const card of allScraped) {
    if (!seen.has(card.id)) seen.set(card.id, card);
  }
  const unique = [...seen.values()];
  console.log(`   Únicas (sin duplicados): ${unique.length}`);

  // 4. Preparar outputs
  // Indexar scrape por nombre (lowercase) para matching con nuestra DB
  const scrapedByName = new Map(unique.map(c => [c.name.toLowerCase(), c]));

  // Para el output completo: todas las trainers scrapeadas
  const allOutput = unique.map(({ id, name, effect }) => ({ id, name, effect }));

  // Para el output de "faltantes": todas las trainer cards de nuestra DB
  // que no tienen efecto, matcheando por ID o por nombre
  const missingOutput = [];
  for (const cardId of missingEffectIds) {
    // Intentar match por ID directo primero
    const byId = unique.find(c => c.id === cardId);
    if (byId) {
      missingOutput.push({ id: cardId, name: byId.name, effect: byId.effect });
      continue;
    }

    // Si no matchea por ID, buscar por nombre (cartas en múltiples sets)
    const dbCard = trainerCards.find(c => c.id === cardId);
    if (dbCard) {
      const byName = scrapedByName.get(dbCard.name.toLowerCase());
      if (byName) {
        missingOutput.push({ id: cardId, name: dbCard.name, effect: byName.effect });
        continue;
      }
    }

    // No encontrado ni por ID ni por nombre
    missingOutput.push({ id: cardId, name: dbCard?.name ?? cardId, effect: '' });
  }

  // Ordenar por id
  missingOutput.sort((a, b) => a.id.localeCompare(b.id));

  // 5. Guardar JSONs
  console.log('');
  writeFileSync(OUTPUT_ALL, JSON.stringify(allOutput, null, 2), 'utf-8');
  console.log(`💾 ${path.basename(OUTPUT_ALL)} → ${allOutput.length} cartas totales`);

  writeFileSync(OUTPUT_MISSING, JSON.stringify(missingOutput, null, 2), 'utf-8');
  console.log(`💾 ${path.basename(OUTPUT_MISSING)} → ${missingOutput.length} con efecto faltante en DB`);

  // 6. Reporte de cobertura
  const withEffect = missingOutput.filter(c => c.effect && c.effect.trim());
  const trulyMissing = missingOutput.filter(c => !c.effect || !c.effect.trim());

  const scrapedIds = new Set(unique.map(c => c.id));
  const matchedByName = [...missingEffectIds].filter(id => !scrapedIds.has(id) &&
    missingOutput.find(c => c.id === id && c.effect));

  console.log(`\n📊 Cobertura:`);
  console.log(`   ${withEffect.length}/${missingOutput.length} cartas con efecto encontrado`);
  if (matchedByName.length > 0) {
    console.log(`   ${matchedByName.length} matcheadas por nombre (misma carta en múltiples sets)`);
  }
  if (trulyMissing.length > 0) {
    console.log(`\n⚠ ${trulyMissing.length} cartas SIN efecto (no encontradas en el sitio):`);
    trulyMissing.forEach(c => console.log(`   - ${c.id} | ${c.name}`));
  }

  // 7. Muestra
  if (allOutput.length > 0) {
    console.log('\n📋 Muestra (5 cartas scrapeadas):');
    allOutput
      .filter(c => c.effect)
      .slice(0, 5)
      .forEach(c =>
        console.log(`   [${c.id}] ${c.name}: "${c.effect.replace(/\n/g, ' ').slice(0, 70)}..."`)
      );
  }

  console.log('\n🎉 Listo!');
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
