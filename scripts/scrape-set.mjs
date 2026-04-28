/**
 * scrape-set.mjs
 *
 * Scraper genérico para cualquier set de Pokémon TCG Pocket desde pocket.limitlesstcg.com
 *
 * Uso:
 *   node scripts/scrape-set.mjs --set B3 --name "Pulsing Aura (B3)" --pack "Mega Lucario" --file b3-pulsing-aura
 *   node scripts/scrape-set.mjs --set A4b --name "Deluxe Pack EX (A4b)" --pack none --file a4b-deluxe-pack-ex
 *
 * Opciones:
 *   --set          Código del set en el sitio (ej: B3, A4b, P-A)        [requerido]
 *   --name         Nombre completo del set (ej: "Pulsing Aura (B3)")    [requerido]
 *   --pack         Nombre del pack (ej: "Mega Lucario"), o "none"        [requerido]
 *   --file         Nombre del archivo de salida sin extensión            [requerido]
 *   --update-index Actualiza automáticamente cards/en/index.js          [opcional]
 *
 * Genera:
 *   cards/en/{file}.json   → todas las cartas del set con sus datos y efectos
 */

import { readFileSync, writeFileSync } from 'fs';
import { load } from 'cheerio';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── CLI Args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[key] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true;
    }
  }
  return result;
}

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://pocket.limitlesstcg.com';
const DELAY_MS = 1500;

// ─── Energy Symbol Map ─────────────────────────────────────────────────────────

const ENERGY_MAP = {
  G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning',
  P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal',
  C: 'Colorless', N: 'Dragon', Y: 'Fairy',
};

function parseCost(symbolText) {
  if (!symbolText || symbolText.trim() === '0') return [];
  return symbolText.trim().split('').map(c => ENERGY_MAP[c] ?? c);
}

// ─── ID Normalization ──────────────────────────────────────────────────────────

/**
 * Convierte "B3 #7" → "b3-007", "P-A #1" → "p-a-001", etc.
 */
function normalizeId(rawId) {
  const trimmed = rawId.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9\-]*)\s+#(\d+)$/);
  if (!match) {
    console.warn(`  ⚠ ID no parseado: "${trimmed}"`);
    return trimmed.toLowerCase().replace(/\s+#\s*/g, '-');
  }
  const [, setCode, num] = match;
  return `${setCode.toLowerCase()}-${num.padStart(3, '0')}`;
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
  return res.text();
}

// ─── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parsea un ataque desde su contenedor .card-text-attack
 */
function parseAttack($, attackEl) {
  const $atk = $(attackEl);

  // Clonar el nodo de info para extraer el símbolo sin modificar el DOM original
  const $info = $atk.find('.card-text-attack-info').first().clone();
  const symbolText = $info.find('.ptcg-symbol').first().text().trim();
  const cost = parseCost(symbolText);
  $info.find('.ptcg-symbol').remove();

  // El texto restante es "Nombre Daño" (ej: "Vine Whip 80", "Spore", "Leaf Blade 70+")
  const remaining = $info.text().replace(/\s+/g, ' ').trim();
  const damageMatch = remaining.match(/^(.*?)\s+(\d+[+x]?)\s*$/);
  const name   = damageMatch ? damageMatch[1].trim() : remaining;
  const damage = damageMatch ? damageMatch[2]        : '';

  const effectText = $atk.find('.card-text-attack-effect').text().replace(/\s+/g, ' ').trim();

  const attack = { name, damage, cost };
  if (effectText) attack.effect = effectText;
  return attack;
}

/**
 * Parsea una página HTML con modo text (display:text) y devuelve un array de cartas.
 */
function parsePage(html, setName, packValue) {
  const $ = load(html);
  const cards = [];

  // En modo text, los contenedores son .card; en compact son .card-classic.
  // Buscamos ambos para mayor robustez.
  const containers = $('.card, .card-classic');

  containers.each((_, cardEl) => {
    const $card = $(cardEl);

    // ── ID ──
    const idRaw = $card.find('.card-set-info').first().text().trim();
    if (!idRaw) return;
    const id = normalizeId(idRaw);

    // ── Nombre ──
    const name = $card.find('.card-text-name').first().text().trim();
    if (!name) return;

    // ── Título: elemento + HP ──
    const titleText = $card.find('.card-text-title').first().text().replace(/\s+/g, ' ').trim();
    // "Tangela - Grass - 80 HP"  o  "Professor's Research" (sin elemento/HP)
    const hpMatch = titleText.match(/-\s*([A-Za-z]+)\s*-\s*(\d+)\s*HP/);
    const element = hpMatch ? hpMatch[1] : null;
    const health  = hpMatch ? parseInt(hpMatch[2], 10) : null;

    // ── Tipo / subtipo / evolvesFrom ──
    const typeRaw = $card.find('.card-text-type').first().text().replace(/\s+/g, ' ').trim();
    // Ejemplos: "Pokémon - Basic", "Pokémon - Stage 1 - Evolves from Tangela", "Trainer - Supporter"
    const typeMatch = typeRaw.match(/^(Pok[eé]mon|Trainer)\s*-\s*(.+?)(?:\s*-\s*Evolves from\s+(.+))?$/i);

    let type = 'Pokemon';
    let subtype = '';
    let evolvesFrom = null;

    if (typeMatch) {
      type = typeMatch[1].toLowerCase().startsWith('p') ? 'Pokemon' : 'Trainer';
      subtype = typeMatch[2].trim();
      evolvesFrom = typeMatch[3] ? typeMatch[3].trim() : null;
    }

    // ── Ataques ──
    const attacks = [];
    $card.find('.card-text-attack').each((_, attackEl) => {
      attacks.push(parseAttack($, attackEl));
    });

    // ── Habilidades ──
    const abilities = [];
    $card.find('.card-text-ability').each((_, abilEl) => {
      const $abil = $(abilEl);
      const abilName = $abil.find('.card-text-ability-info').text()
        .replace(/^\s*Ability:\s*/i, '').replace(/\s+/g, ' ').trim();
      const abilEffect = $abil.find('.card-text-ability-effect').text()
        .replace(/\s+/g, ' ').trim();
      abilities.push({ name: abilName, effect: abilEffect });
    });

    // ── Weakness / Retreat ──
    let weakness = null;
    let retreatCost = null;
    $card.find('.card-text-wrr').each((_, wrrEl) => {
      // Saltar la sección de regla ex/Mega
      if ($(wrrEl).hasClass('card-text-mega-rule')) return;
      const text = $(wrrEl).text();
      const wMatch = text.match(/Weakness:\s*([^\n<,]+)/);
      const rMatch = text.match(/Retreat:\s*(\d+)/);
      if (wMatch) {
        const w = wMatch[1].trim();
        weakness = (w === 'none' || w === '') ? null : w;
      }
      if (rMatch) retreatCost = parseInt(rMatch[1], 10);
    });

    // ── Efecto para Trainer cards ──
    let trainerEffect = null;
    if (type === 'Trainer') {
      const effectParts = [];
      $card.find('.card-text-section').each((_, sec) => {
        const $sec = $(sec);
        // Saltar secciones que ya tienen título, tipo, ataques, habilidades o WRR
        if ($sec.find(
          '.card-text-title, .card-text-type, .card-text-attack, .card-text-ability, .card-text-wrr'
        ).length > 0) return;
        const text = $sec.text().replace(/\s+/g, ' ').trim();
        if (text) effectParts.push(text);
      });
      trainerEffect = effectParts.join('\n').trim() || null;
    }

    // ── Construir objeto de carta ──
    const card = {
      id,
      name,
      element,
      type,
      subtype,
      health,
      set: setName,
      pack: (packValue && packValue !== 'none') ? packValue : null,
      attacks,
      retreatCost,
      weakness,
      abilities,
      evolvesFrom,
      rarity: null, // No disponible en la página de lista
    };

    if (trainerEffect) card.effect = trainerEffect;

    cards.push(card);
  });

  return cards;
}

// ─── Paginación ────────────────────────────────────────────────────────────────

function getTotalCount(html) {
  const m = html.match(/(\d+)\s+unique\s+cards?\s+found/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Devuelve la URL de la siguiente página usando los atributos data-target de la paginación.
 * El sitio usa JS para navegar, pero los targets numéricos están en los <li data-target="N">.
 */
function getNextPageUrl(html, baseSearchUrl, currentPage) {
  const $ = load(html);
  const maxPage = parseInt($('.pagination').attr('data-max') ?? '1', 10);
  const nextPage = currentPage + 1;
  if (nextPage > maxPage) return null;
  // Agregar &page=N a la URL base
  const url = new URL(baseSearchUrl);
  url.searchParams.set('page', String(nextPage));
  return url.toString();
}

// ─── Update index.js ──────────────────────────────────────────────────────────

/**
 * Convierte "b3-pulsing-aura" → "b3PulsingAura"
 */
function filenameToCamelCase(filename) {
  return filename
    .split('-')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function updateIndex(filename) {
  const indexPath = path.join(ROOT, 'cards', 'en', 'index.js');
  let content = readFileSync(indexPath, 'utf-8');
  const varName = filenameToCamelCase(filename);

  // Comprobar si ya existe
  if (content.includes(`'./${filename}.json'`)) {
    console.log(`  ℹ index.js ya incluye '${filename}.json', no se modifica.`);
    return;
  }

  // Insertar require: buscar la última línea que empieza con "const " seguida de require
  const requireLine = `const ${varName} = require('./${filename}.json');`;
  content = content.replace(
    /(const \w+ = require\('[^']+'\);)(\r?\n\r?\nmodule\.exports)/,
    `$1\n${requireLine}$2`
  );

  // Insertar en module.exports: reemplazar el último identificador antes de "};"
  // El patrón busca la última entrada (sin coma) y le agrega coma + nueva entrada
  content = content.replace(
    /(\s+)(\w+)(\r?\n)(};)/,
    `$1$2,$1${varName}$3$4`
  );

  writeFileSync(indexPath, content, 'utf-8');
  console.log(`  ✅ index.js actualizado: agregado '${varName}'`);
}


// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const SET_CODE    = args.set;
  const SET_NAME    = args.name;
  const PACK_NAME   = args.pack;
  const FILE_NAME   = args.file;
  const UPDATE_IDX  = args.updateIndex === true;

  // Validar argumentos requeridos
  if (!SET_CODE || !SET_NAME || !PACK_NAME || !FILE_NAME) {
    console.error('❌ Faltan argumentos requeridos.');
    console.error('Uso: node scripts/scrape-set.mjs --set B3 --name "Pulsing Aura (B3)" --pack "Mega Lucario" --file b3-pulsing-aura [--update-index]');
    process.exit(1);
  }

  console.log(`\n🔍 Scraper genérico de sets – pocket.limitlesstcg.com`);
  console.log(`   Set:   ${SET_CODE} → ${SET_NAME}`);
  console.log(`   Pack:  ${PACK_NAME}`);
  console.log(`   Salida: cards/en/${FILE_NAME}.json\n`);

  // URL base con display=text para obtener el texto completo de las cartas
  const SEARCH_URL = `${BASE_URL}/cards/?q=!set:${SET_CODE}+display:text+unique:cards&show=all`;

  const allCards = [];
  let url = SEARCH_URL;
  let page = 1;

  while (url) {
    console.log(`📄 Página ${page}: ${url}`);
    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      console.error(`  ✗ Error al obtener la página: ${err.message}`);
      break;
    }

    if (page === 1) {
      const total = getTotalCount(html);
      if (total) console.log(`  Sitio reporta ${total} cartas únicas en el set`);
    }

    const pageCards = parsePage(html, SET_NAME, PACK_NAME);
    console.log(`  → ${pageCards.length} cartas parseadas`);

    if (pageCards.length === 0) {
      // Guardar HTML de debug
      const dbgPath = path.join(__dirname, `debug_${SET_CODE}_page${page}.html`);
      writeFileSync(dbgPath, html);
      console.log(`  ⚠ Sin resultados. HTML de debug guardado en ${path.basename(dbgPath)}`);
      break;
    }

    allCards.push(...pageCards);

    const nextUrl = getNextPageUrl(html, SEARCH_URL, page);
    if (nextUrl && nextUrl !== url) {
      url = nextUrl;
      page++;
      console.log(`  Esperando ${DELAY_MS}ms...`);
      await sleep(DELAY_MS);
    } else {
      url = null;
    }
  }

  // Deduplicar por id (por si acaso hay solapamiento entre páginas)
  const seen = new Map();
  for (const card of allCards) {
    if (!seen.has(card.id)) seen.set(card.id, card);
  }
  const unique = [...seen.values()];

  console.log(`\n✅ Total cartas: ${unique.length}`);

  // Estadísticas
  const pokeCount    = unique.filter(c => c.type === 'Pokemon').length;
  const trainerCount = unique.filter(c => c.type === 'Trainer').length;
  const withEffect   = unique.filter(c => c.effect).length;
  console.log(`   Pokémon:  ${pokeCount}`);
  console.log(`   Trainers: ${trainerCount} (${withEffect} con efecto)`);

  // Guardar JSON
  const outPath = path.join(ROOT, 'cards', 'en', `${FILE_NAME}.json`);
  writeFileSync(outPath, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`\n💾 Guardado: ${outPath}`);

  // Actualizar index.js si se solicitó
  if (UPDATE_IDX) {
    console.log('\n📝 Actualizando cards/en/index.js...');
    updateIndex(FILE_NAME);
  } else {
    console.log(`\n💡 Para actualizar el índice, agrega --update-index al comando.`);
  }

  // Muestra de trainers con efecto
  const sampleTrainers = unique.filter(c => c.type === 'Trainer' && c.effect).slice(0, 3);
  if (sampleTrainers.length > 0) {
    console.log('\n📋 Muestra de Trainer cards:');
    sampleTrainers.forEach(c =>
      console.log(`   [${c.id}] ${c.name} (${c.subtype}): "${c.effect?.slice(0, 70)}..."`)
    );
  }

  console.log('\n🎉 Listo!');
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
