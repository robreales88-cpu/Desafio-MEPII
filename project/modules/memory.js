/**
 * MemoryModule — Visual memory challenge plugin.
 *
 * Flow:  memorize (grid shown) → answer (3 questions) → feedback per question
 *
 * JSON keys used:
 *   mr.items[]         { name, categoryEs, categoryEn, initials, colorKey }
 *   mr.questions[]     { textEs, textEn, options[], correctEs, correctEn,
 *                        skillEs, skillEn, explanEs, explanEn }
 *   mr.memorizeTime    seconds to show grid
 *   mr.answerTime      seconds per question
 *   mr.xp              { base, speedMax, perfectBonus }
 */
(function () {
  'use strict';

  const COLOR_KEYS = {
    purple: { cardBg:'rgba(124,58,237,0.1)',  cardBorder:'rgba(124,58,237,0.28)', iconBg:'rgba(124,58,237,0.18)', iconC:'#a855f7', catBg:'rgba(124,58,237,0.14)', catC:'#a855f7' },
    cyan:   { cardBg:'rgba(6,182,212,0.08)',  cardBorder:'rgba(6,182,212,0.25)',  iconBg:'rgba(6,182,212,0.14)',  iconC:'#06b6d4', catBg:'rgba(6,182,212,0.12)',   catC:'#06b6d4' },
    amber:  { cardBg:'rgba(245,158,11,0.08)', cardBorder:'rgba(245,158,11,0.25)', iconBg:'rgba(245,158,11,0.14)', iconC:'#f59e0b', catBg:'rgba(245,158,11,0.12)',  catC:'#f59e0b' },
    green:  { cardBg:'rgba(16,185,129,0.08)', cardBorder:'rgba(16,185,129,0.25)', iconBg:'rgba(16,185,129,0.14)', iconC:'#10b981', catBg:'rgba(16,185,129,0.12)',  catC:'#10b981' },
    red:    { cardBg:'rgba(244,63,94,0.08)',  cardBorder:'rgba(244,63,94,0.25)',  iconBg:'rgba(244,63,94,0.14)',  iconC:'#f43f5e', catBg:'rgba(244,63,94,0.12)',   catC:'#f43f5e' },
    blue:   { cardBg:'rgba(59,130,246,0.08)', cardBorder:'rgba(59,130,246,0.25)', iconBg:'rgba(59,130,246,0.14)', iconC:'#3b82f6', catBg:'rgba(59,130,246,0.12)',  catC:'#3b82f6' },
  };

  const MemoryModule = {
    type: 'memory',
    _config: null,
    _lang: 'es',

    load(config, lang) {
      this._config = config;
      this._lang   = lang || 'es';
    },

    /** Return styled item array for the memorize grid. */
    getMemoryItems(lang) {
      const l = lang || this._lang;
      return (this._config?.items || []).map(item => {
        const ck = COLOR_KEYS[item.colorKey] || COLOR_KEYS.purple;
        return {
          name:        item.name,
          initials:    item.initials || item.name.substring(0, 2).toUpperCase(),
          cat:         l === 'es' ? item.categoryEs : item.categoryEn,
          cardBg:      ck.cardBg,
          cardBorder:  ck.cardBorder,
          iconBg:      ck.iconBg,
          iconC:       ck.iconC,
          catBg:       ck.catBg,
          catC:        ck.catC,
        };
      });
    },

    /** Return question data for the answer phase. */
    getQuestion(idx, lang) {
      const l = lang || this._lang;
      const q = this._config?.questions?.[idx];
      if (!q) return null;
      return {
        text:    l === 'es' ? q.textEs : q.textEn,
        options: (q.options || []).map(o => typeof o === 'object' ? (l === 'es' ? o.es : o.en) : o),
        idx,
      };
    },

    validateAnswer(answer, idx, lang, timeLeft, mr) {
      const l = lang || this._lang;
      const q = this._config?.questions?.[idx];
      if (!q) return { correct: false, xp: 0 };

      const correctEs = typeof q.correctEs === 'object' ? q.correctEs.es : q.correctEs;
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

  window.MemoryModule = MemoryModule;
})();
