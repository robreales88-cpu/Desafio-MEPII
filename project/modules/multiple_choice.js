/**
 * MultipleChoiceModule — Generic MC plugin.
 *
 * Handles: logic, analogy, classification, case_analysis, observation,
 *          interpretation, protocol_review, reasoning, pattern,
 *          association, escape_room, visual_search, reaction,
 *          instrument_selection, verbal_fluency — and any future type
 *          whose questions are multiple-choice.
 *
 * JSON keys used:
 *   mr.questions[]  { textEs, textEn, contextEs?, contextEn?,
 *                     options[], correctEs, correctEn,
 *                     skillEs, skillEn, explanEs, explanEn }
 *   mr.answerTime   seconds per question
 *   mr.xp           { base, speedMax, perfectBonus }
 */
(function () {
  'use strict';

  function makeModule(typeName) {
    return {
      type: typeName,
      _config: null,
      _lang: 'es',

      load(config, lang) {
        this._config = config;
        this._lang   = lang || 'es';
      },

      /** Memory modules expose getMemoryItems; MC modules don't need it. */
      getMemoryItems() { return []; },

      getQuestion(idx, lang) {
        const l = lang || this._lang;
        const q = this._config?.questions?.[idx];
        if (!q) return null;
        return {
          text:    l === 'es' ? q.textEs    : q.textEn,
          context: l === 'es' ? (q.contextEs || null) : (q.contextEn || null),
          options: (q.options || []).map(o => typeof o === 'object' ? (l === 'es' ? o.es : o.en) : o),
          idx,
        };
      },

      validateAnswer(answer, idx, lang, timeLeft, mr) {
        const l   = lang || this._lang;
        const q   = this._config?.questions?.[idx];
        if (!q) return { correct: false, xp: 0 };

        const correctEs = typeof q.correctEs === 'object' ? q.correctEs.es : (q.correctEs || '');
        const correctEn = typeof q.correctEn === 'object' ? q.correctEn.en : (q.correctEn || correctEs);
        const ansText   = typeof answer === 'object' ? (l === 'es' ? answer.es : answer.en) : String(answer);

        const correct = ansText === correctEs || ansText === correctEn;
        const xp = ChallengeEngine.calcXP(correct, timeLeft, mr.answerTime || 20, mr.xp);
        return { correct, xp };
      },

      getFeedback(idx, lang) {
        const l = lang || this._lang;
        const q = this._config?.questions?.[idx];
        if (!q) return { skill: '', explanation: '' };
        return {
          skill:       l === 'es' ? (q.skillEs  || '') : (q.skillEn  || ''),
          explanation: l === 'es' ? (q.explanEs || '') : (q.explanEn || ''),
        };
      },

      finish() { this._config = null; },
    };
  }

  // All MC-based challenge types share the same behaviour
  const MC_TYPES = [
    'multiple_choice', 'logic', 'analogy', 'classification',
    'case_analysis', 'observation', 'interpretation', 'protocol_review',
    'reasoning', 'pattern', 'association', 'escape_room',
    'visual_search', 'reaction', 'instrument_selection', 'verbal_fluency',
  ];

  MC_TYPES.forEach(type => {
    const mod = makeModule(type);
    // PascalCase window export, e.g. window.CaseAnalysisModule
    const exportName = type
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') + 'Module';
    window[exportName] = mod;
  });

  // Canonical alias
  window.MultipleChoiceModule = window.MultipleChoiceModule;
})();
