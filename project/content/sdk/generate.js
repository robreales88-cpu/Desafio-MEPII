#!/usr/bin/env node
/**
 * Content SDK — Generator
 *
 * Turns an empty component template into a fresh, ready-to-fill JSON file with
 * its structural identifiers stamped in (week number, microreto id). It never
 * writes questions, answers, competencies, or any other pedagogical content —
 * only scaffolding. That part is the content team's job; see
 * /content/docs/CONTENT_GUIDE.md.
 *
 * Usage:
 *   node content/sdk/generate.js --component analogies --week 7 --microreto 2
 *   node content/sdk/generate.js --component matrix --week 3 --microreto 1 --out content/borradores/w3m1.json
 *   node content/sdk/generate.js --list
 *   node content/sdk/generate.js --help
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TPL_DIR = path.join(__dirname, '..', 'plantillas');

function listComponents() {
  return fs.readdirSync(TPL_DIR)
    .filter(f => f.endsWith('.template.json'))
    .map(f => f.replace(/\.template\.json$/, ''))
    .sort();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; }
    else { out[key] = next; i++; }
  }
  return out;
}

function printHelp() {
  console.log([
    'Content SDK — Generator',
    '',
    'Genera un archivo base (estructura vacía) a partir de una plantilla de componente.',
    'No genera preguntas, respuestas ni ningún contenido pedagógico — solo identificadores.',
    '',
    'Uso:',
    '  node content/sdk/generate.js --component <nombre> --week <1-18> --microreto <1-3> [--out <ruta>] [--force]',
    '  node content/sdk/generate.js --list',
    '',
    'Componentes disponibles:',
    '  ' + listComponents().join(', '),
    '',
    'Ejemplo:',
    '  node content/sdk/generate.js --component analogies --week 7 --microreto 2 --out content/borradores/w7m2.json',
    '',
    'Sin --out, el JSON generado se imprime en la salida estándar.',
    'Con --out, si el archivo ya existe se rehúsa a sobrescribirlo salvo que agregues --force.',
  ].join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || Object.keys(args).length === 0) { printHelp(); process.exit(0); }
  if (args.list) { listComponents().forEach(c => console.log(c)); process.exit(0); }

  const { component, week, microreto, out, force } = args;

  if (!component) { console.error('✖ Falta --component. Usa --list para ver las opciones.'); process.exit(1); }
  const available = listComponents();
  if (!available.includes(component)) {
    console.error(`✖ Componente desconocido: "${component}". Disponibles: ${available.join(', ')}`);
    process.exit(1);
  }

  const weekNum = parseInt(week, 10);
  if (!week || Number.isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
    console.error('✖ --week debe ser un número entre 1 y 18.');
    process.exit(1);
  }
  const mrNum = parseInt(microreto, 10);
  if (!microreto || Number.isNaN(mrNum) || mrNum < 1 || mrNum > 3) {
    console.error('✖ --microreto debe ser un número entre 1 y 3 (cada semana tiene exactamente 3 microretos).');
    process.exit(1);
  }

  const tplPath = path.join(TPL_DIR, `${component}.template.json`);
  const doc = JSON.parse(fs.readFileSync(tplPath, 'utf-8'));

  // Stamp structural identifiers only — every content field stays exactly as
  // empty as it was in the template.
  doc.week = weekNum;
  const mrId = `w${weekNum}m${mrNum}`;
  doc.microretos[0].id = mrId;
  (doc.microretos[0].questions || []).forEach((q, i) => { q.id = `q${i + 1}`; });

  doc._templateInfo = {
    ...doc._templateInfo,
    generatedFrom: `${component}.template.json`,
    generatedAt: new Date().toISOString(),
    note: (
      'Generado por content/sdk/generate.js. Estructura lista, contenido vacío — ' +
      'complétalo siguiendo /content/docs/CONTENT_GUIDE.md y valida con ' +
      'content/sdk/validate.js antes de cargarlo en Author Studio.'
    ),
  };

  const json = JSON.stringify(doc, null, 2) + '\n';

  if (!out) { console.log(json); process.exit(0); }

  if (fs.existsSync(out) && !force) {
    console.error(`✖ ${out} ya existe. Usa --force si quieres sobrescribirlo.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json, 'utf-8');
  console.log(`✓ Generado: ${out} (microreto ${mrId}, componente "${component}")`);
  console.log(`  Siguiente paso: completar contenido y correr  node content/sdk/validate.js ${out}`);
}

main();
