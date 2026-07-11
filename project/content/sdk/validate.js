#!/usr/bin/env node
/**
 * Content SDK — Validator
 *
 * Checks a challenge-week JSON file (or a folder of them) BEFORE it gets
 * loaded into Author Studio / challenge-bank/. Zero dependencies — plain
 * Node, matching the rest of this project's "no build step" architecture.
 *
 * Usage:
 *   node content/sdk/validate.js <file-or-folder> [<file-or-folder> ...]
 *   node content/sdk/validate.js --help
 *
 * Exit code is 1 if any file has errors, 0 otherwise (warnings do not fail
 * the run — useful for a CI step or a pre-commit hook without being noisy
 * on legitimately partial example/template files).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CONTENT_ROOT = path.join(__dirname, '..'); // content/sdk/.. == content/

// Types actually registered today (modules/memory.js + modules/multiple_choice.js's
// makeModule() aliases). Anything else still runs — the engine silently falls back
// to generic multiple choice — so an unrecognized type is a WARNING, not an ERROR.
const KNOWN_TYPES = [
  'memory', 'logic', 'analogy', 'classification', 'case_analysis', 'observation',
  'interpretation', 'protocol_review', 'reasoning', 'pattern', 'association',
  'escape_room', 'visual_search', 'reaction', 'instrument_selection',
  'verbal_fluency', 'multiple_choice',
];
const DIFFICULTIES = ['basic', 'intermediate', 'advanced'];

const RANGES = {
  answerTime: [5, 120],
  memorizeTime: [5, 30],
  maxAttempts: [1, 5],
  'xp.base': [1, 200],
  'xp.speedMax': [0, 100],
  'xp.perfectBonus': [0, 200],
  'xp.challengeComplete': [0, 200],
};

function collectFiles(inputPaths) {
  const files = [];
  function walk(p) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(p)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        walk(path.join(p, entry));
      }
    } else if (stat.isFile() && p.endsWith('.json')) {
      files.push(p);
    }
  }
  inputPaths.forEach(walk);
  return files;
}

function isTemplateFile(filePath, doc) {
  return !!doc._templateInfo || /\.template\.json$/.test(filePath);
}

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function checkRange(value, range, label, errors) {
  if (value == null) return; // presence is checked separately
  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push({ level: 'error', msg: `${label}: debe ser un número (tipo incorrecto: ${typeof value})` });
    return;
  }
  const [min, max] = range;
  if (value < min || value > max) {
    errors.push({ level: 'warn', msg: `${label}: valor ${value} fuera del rango esperado [${min}, ${max}]` });
  }
}

function findMediaRefs(node, refs) {
  if (node == null) return;
  if (Array.isArray(node)) { node.forEach(n => findMediaRefs(n, refs)); return; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'svgRef' || k === 'imageRef') && typeof v === 'string' && v.trim()) refs.push(v.trim());
      else findMediaRefs(v, refs);
    }
  }
}

// Options can be a plain string ("Opción A") or a bilingual object
// ({es:"...", en:"..."}) — both shapes are real and already handled elsewhere
// in the platform (DESAFIO.dc.html's answer rendering, Author Studio's editor).
function optionText(o, lang) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  if (typeof o === 'object') return o[lang] || '';
  return '';
}

function validateQuestion(q, idx, ctx, errors, isTemplate) {
  const where = `${ctx} > pregunta[${idx}]`;
  if (!q || typeof q !== 'object') { errors.push({ level: 'error', msg: `${where}: no es un objeto` }); return; }
  if (!isTemplate && !q.id) errors.push({ level: 'error', msg: `${where}: falta "id"` });
  if (!isTemplate && !q.textEs) errors.push({ level: 'error', msg: `${where}: falta "textEs"` });
  if (!Array.isArray(q.options)) { errors.push({ level: 'error', msg: `${where}: "options" debe ser un arreglo` }); return; }
  if (!isTemplate && q.options.filter(o => optionText(o, 'es').trim() || optionText(o, 'en').trim()).length < 2) {
    errors.push({ level: 'error', msg: `${where}: se requieren al menos 2 opciones no vacías` });
  }
  const seen = new Set();
  q.options.forEach(o => {
    const key = optionText(o, 'es').trim() || optionText(o, 'en').trim();
    if (key && seen.has(key)) errors.push({ level: 'warn', msg: `${where}: opción duplicada "${key}"` });
    if (key) seen.add(key);
  });
  if (!isTemplate) {
    if (!q.correctEs) errors.push({ level: 'error', msg: `${where}: falta "correctEs"` });
    else if (!q.options.some(o => optionText(o, 'es') === q.correctEs || optionText(o, 'en') === q.correctEs)) {
      errors.push({ level: 'error', msg: `${where}: "correctEs" ("${q.correctEs}") no coincide con ninguna de las "options" — respuesta inexistente` });
    }
    if (q.correctEn && !q.options.some(o => optionText(o, 'en') === q.correctEn || optionText(o, 'es') === q.correctEn)) {
      errors.push({ level: 'error', msg: `${where}: "correctEn" ("${q.correctEn}") no coincide con ninguna de las "options" — respuesta inexistente` });
    }
    if (!q.explanEs) errors.push({ level: 'error', msg: `${where}: falta "explanEs" (retroalimentación obligatoria)` });
    if (!q.skillEs) errors.push({ level: 'warn', msg: `${where}: falta "skillEs" (qué habilidad entrena esta pregunta)` });
  }
}

function validateMicroreto(mr, idx, weekLabel, errors, isTemplate) {
  const where = `${weekLabel} > microreto[${idx}]`;
  if (!mr || typeof mr !== 'object') { errors.push({ level: 'error', msg: `${where}: no es un objeto` }); return; }

  if (!isTemplate && !mr.id) errors.push({ level: 'error', msg: `${where}: falta "id"` });
  if (!mr.type) errors.push({ level: 'error', msg: `${where}: falta "type"` });
  else if (!KNOWN_TYPES.includes(mr.type)) {
    errors.push({ level: 'warn', msg: `${where}: type "${mr.type}" no está registrado por ningún módulo hoy — se ejecutará como opción múltiple genérica (fallback silencioso del motor)` });
  }
  if (!isTemplate && !mr.titleEs) errors.push({ level: 'error', msg: `${where}: falta "titleEs"` });
  if (mr.difficulty && !DIFFICULTIES.includes(mr.difficulty)) {
    errors.push({ level: 'error', msg: `${where}: "difficulty" inválida ("${mr.difficulty}") — debe ser una de: ${DIFFICULTIES.join(', ')}` });
  } else if (!mr.difficulty) {
    errors.push({ level: 'error', msg: `${where}: falta "difficulty"` });
  }

  checkRange(mr.answerTime, RANGES.answerTime, `${where} > answerTime`, errors);
  if (mr.type === 'memory') checkRange(mr.memorizeTime, RANGES.memorizeTime, `${where} > memorizeTime`, errors);
  if (!isTemplate && mr.answerTime == null) errors.push({ level: 'error', msg: `${where}: falta "answerTime"` });
  if (!isTemplate && mr.type === 'memory' && mr.memorizeTime == null) errors.push({ level: 'error', msg: `${where}: falta "memorizeTime" (obligatorio para type "memory")` });

  checkRange(mr.maxAttempts, RANGES.maxAttempts, `${where} > maxAttempts`, errors);
  if (mr.maxAttempts != null && mr.maxAttempts !== 3) {
    errors.push({ level: 'warn', msg: `${where}: maxAttempts=${mr.maxAttempts} (la regla del producto especifica 3 — confirma que el cambio es intencional)` });
  }

  if (!mr.xp || typeof mr.xp !== 'object') {
    errors.push({ level: 'error', msg: `${where}: falta el objeto "xp"` });
  } else {
    ['base', 'speedMax', 'perfectBonus', 'challengeComplete'].forEach(k => {
      checkRange(get(mr, `xp.${k}`), RANGES[`xp.${k}`], `${where} > xp.${k}`, errors);
      if (!isTemplate && mr.xp[k] == null) errors.push({ level: 'error', msg: `${where}: falta "xp.${k}"` });
    });
  }

  if (mr.type === 'memory' && !isTemplate) {
    if (!Array.isArray(mr.items) || !mr.items.length) {
      errors.push({ level: 'error', msg: `${where}: type "memory" requiere "items" no vacío` });
    }
  }

  if (!Array.isArray(mr.questions)) {
    errors.push({ level: 'error', msg: `${where}: falta "questions" (arreglo) — es lo que el motor ejecuta hoy, sin importar el componente visual` });
  } else {
    if (!isTemplate && !mr.questions.length) errors.push({ level: 'error', msg: `${where}: "questions" está vacío` });
    const qIds = new Set();
    mr.questions.forEach((q, i) => {
      validateQuestion(q, i, where, errors, isTemplate);
      if (q && q.id) {
        if (qIds.has(q.id)) errors.push({ level: 'error', msg: `${where}: id de pregunta duplicado "${q.id}"` });
        qIds.add(q.id);
      }
    });
  }

  if (mr.variants != null) {
    if (!Array.isArray(mr.variants)) {
      errors.push({ level: 'error', msg: `${where}: "variants" debe ser un arreglo` });
    } else {
      const vIds = new Set();
      mr.variants.forEach((v, vi) => {
        if (v && v.id) {
          if (vIds.has(v.id)) errors.push({ level: 'error', msg: `${where}: id de variante duplicado "${v.id}"` });
          vIds.add(v.id);
        }
        if (v && Array.isArray(v.questions)) {
          v.questions.forEach((q, qi) => validateQuestion(q, qi, `${where} > variante[${vi}]`, errors, isTemplate));
        }
      });
    }
  }
}

function validateFile(filePath) {
  const errors = [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return [{ level: 'error', msg: `No se pudo leer el archivo: ${e.message}` }];
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    return [{ level: 'error', msg: `JSON inválido: ${e.message}` }];
  }

  const isTemplate = isTemplateFile(filePath, doc);
  const weekLabel = doc.week != null ? `semana ${doc.week}` : path.basename(filePath);

  if (!isTemplate) {
    if (doc.week == null) errors.push({ level: 'error', msg: 'falta "week"' });
    else if (typeof doc.week !== 'number') errors.push({ level: 'error', msg: '"week" debe ser numérico' });
    if (!doc.titleEs) errors.push({ level: 'error', msg: 'falta "titleEs"' });
    if (!doc.skillEs) errors.push({ level: 'error', msg: 'falta "skillEs"' });
  }

  if (!Array.isArray(doc.microretos)) {
    errors.push({ level: 'error', msg: 'falta "microretos" (arreglo)' });
  } else {
    if (doc.microretos.length !== 3) {
      errors.push({ level: 'warn', msg: `se esperaban 3 microretos por semana, se encontraron ${doc.microretos.length} (normal en plantillas/ejemplos individuales)` });
    }
    const mrIds = new Set();
    doc.microretos.forEach((mr, i) => {
      validateMicroreto(mr, i, weekLabel, errors, isTemplate);
      if (mr && mr.id) {
        if (mrIds.has(mr.id)) errors.push({ level: 'error', msg: `id de microreto duplicado "${mr.id}"` });
        mrIds.add(mr.id);
      }
    });
  }

  // Media references must exist on disk (imágenes/SVG faltantes).
  const refs = [];
  findMediaRefs(doc, refs);
  refs.forEach(ref => {
    const resolved = path.join(CONTENT_ROOT, ref);
    if (!fs.existsSync(resolved)) {
      errors.push({ level: 'error', msg: `referencia de media no encontrada: "${ref}" (se buscó en ${path.relative(process.cwd(), resolved)})` });
    }
  });

  return errors;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log([
      'Content SDK — Validator',
      '',
      'Uso:',
      '  node content/sdk/validate.js <archivo-o-carpeta> [<archivo-o-carpeta> ...]',
      '',
      'Ejemplos:',
      '  node content/sdk/validate.js content/examples/analogies/avanzado.json',
      '  node content/sdk/validate.js challenge-bank/week05.json',
      '  node content/sdk/validate.js content/examples/',
      '',
      'Sale con código 1 si algún archivo tiene errores; las advertencias no fallan la ejecución.',
    ].join('\n'));
    process.exit(0);
  }

  let files;
  try {
    files = collectFiles(args);
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }

  if (!files.length) {
    console.log('No se encontraron archivos .json en las rutas indicadas.');
    process.exit(0);
  }

  let totalErrors = 0, totalWarnings = 0;
  files.sort().forEach(f => {
    const rel = path.relative(process.cwd(), f);
    const results = validateFile(f);
    const errs = results.filter(r => r.level === 'error');
    const warns = results.filter(r => r.level === 'warn');
    totalErrors += errs.length;
    totalWarnings += warns.length;

    if (!results.length) {
      console.log(`✓ ${rel}`);
      return;
    }
    console.log(`${errs.length ? '✖' : '⚠'} ${rel}`);
    errs.forEach(e => console.log(`   ERROR   ${e.msg}`));
    warns.forEach(w => console.log(`   AVISO   ${w.msg}`));
  });

  console.log('');
  console.log(`${files.length} archivo(s) revisado(s) · ${totalErrors} error(es) · ${totalWarnings} advertencia(s)`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
