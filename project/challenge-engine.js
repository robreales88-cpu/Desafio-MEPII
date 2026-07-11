/**
 * ChallengeEngine — universal runtime for all challenge types.
 *
 * Responsibilities:
 *   • Load challenge data from challenge-bank/weekNN.json
 *   • Dispatch the correct module plugin based on challenge type
 *   • Own and broadcast the countdown timer
 *   • Validate answers via the active module
 *   • Calculate XP (base + speed bonus + perfect bonus)
 *   • Track per-session statistics
 *   • Emit all game events through EventBus
 *   • Persist results to localStorage
 *
 * ── Module interface ──────────────────────────────────────────
 * Every module MUST expose:
 *   {string}  type                        unique type key
 *   load(config, lang)                    initialise with JSON config
 *   getMemoryItems(lang)  → []            (memory type only)
 *   getQuestion(idx, lang) → {text,options,context}
 *   validateAnswer(answer,idx,lang,tLeft,mr) → {correct,xp}
 *   getFeedback(idx, lang) → {skill,explanation}
 *   finish()                              cleanup
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  class ChallengeEngine {
    constructor(bus) {
      /** @type {EventBus} */
      this.bus = bus || window.platformBus || new window.EventBus();
      /** @type {Object.<string, Object>} registered module plugins */
      this._modules = {};
      /** internal mutable session state */
      this._s = null;
      this._timer = null;
    }

    // ── Module registry ────────────────────────────────────────

    /** Register a module plugin. Call before starting any challenge. */
    registerModule(mod) {
      if (!mod || !mod.type) { console.warn('[Engine] registerModule: missing type'); return; }
      this._modules[mod.type] = mod;
    }

    /** Register many modules at once. */
    registerModules(mods) {
      mods.forEach(m => this.registerModule(m));
    }

    // ── Data loading ───────────────────────────────────────────

    /**
     * Fetch and return parsed JSON for a given week.
     * @param {number} weekNum 1-based
     * @returns {Promise<Object>}
     */
    async loadChallenge(weekNum) {
      const pad = String(weekNum).padStart(2, '0');
      const url = `./challenge-bank/week${pad}.json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`[Engine] Cannot load ${url} (${resp.status})`);
      return resp.json();
    }

    // ── Microreto lifecycle ────────────────────────────────────

    /**
     * Initialise and start a microreto.
     * @param {Object} challengeData  parsed week JSON
     * @param {number} mrIdx          0-based microreto index
     * @param {string} lang           'es' | 'en'
     */
    startMicroreto(challengeData, mrIdx, lang) {
      this._clearTimer();

      const mr = challengeData.microretos[mrIdx];
      if (!mr) { this._error('Microreto not found', { mrIdx }); return; }

      // Prefer exact type, fall back to generic multiple_choice
      const mod = this._modules[mr.type] || this._modules['multiple_choice'];
      if (!mod) { this._error(`Module '${mr.type}' not registered`); return; }

      const isMemory = mr.type === 'memory';
      this._s = {
        challengeData,
        mr,
        mrIdx,
        lang,
        mod,
        phase: isMemory ? 'memorize' : 'answer',
        timeLeft: isMemory ? (mr.memorizeTime || 10) : (mr.answerTime || 20),
        questionIdx: 0,
        answers: [],        // { answer, correct, xp, qIdx }
        totalXP: 0,
        startedAt: Date.now(),
        tabSwitches: 0,
      };

      mod.load(mr, lang);

      this.bus.emit('microretoStarted', {
        mr,
        mrIdx,
        phase: this._s.phase,
        totalQuestions: mr.questions.length,
      });

      this._startTimer(this._s.timeLeft, this._s.phase);
    }

    /** Call when memorize phase timer ends → transition to first question. */
    transitionToAnswer() {
      if (!this._s) return;
      this._clearTimer();
      this._s.phase = 'answer';
      this._s.questionIdx = 0;

      const q = this._s.mod.getQuestion(0, this._s.lang);
      this._startTimer(this._s.mr.answerTime || 20, 'answer');

      this.bus.emit('answerPhaseStarted', { question: q, questionIdx: 0 });
    }

    /**
     * Submit the player's answer for the current question.
     * Stops the timer, validates, and emits feedbackReady.
     * @param {string|Object} answer  raw answer value (string or {es,en})
     */
    submitAnswer(answer) {
      if (!this._s || this._s.phase !== 'answer') return;
      this._clearTimer();

      const { mr, mod, lang, timeLeft, questionIdx } = this._s;
      const result = mod.validateAnswer(answer, questionIdx, lang, timeLeft, mr);
      const feedback = mod.getFeedback(questionIdx, lang);

      this._s.answers.push({ answer, correct: result.correct, xp: result.xp, qIdx: questionIdx });
      this._s.totalXP += result.xp;
      this._s.phase = 'feedback';

      this.bus.emit('feedbackReady', {
        correct: result.correct,
        xp: result.xp,
        feedback,
        questionIdx,
        hasNext: questionIdx < mr.questions.length - 1,
      });
    }

    /** Advance to the next question (called after player reads feedback). */
    nextQuestion() {
      if (!this._s) return;
      const next = this._s.questionIdx + 1;
      const { mr, mod, lang } = this._s;
      if (next >= mr.questions.length) return; // should not happen; use finishMicroreto

      this._s.questionIdx = next;
      this._s.phase = 'answer';
      const q = mod.getQuestion(next, lang);
      this._startTimer(mr.answerTime || 20, 'answer');

      this.bus.emit('questionReady', { question: q, questionIdx: next });
    }

    /**
     * Complete the microreto, calculate final XP, persist stats, emit events.
     * @returns {Object} stats snapshot
     */
    finishMicroreto() {
      this._clearTimer();
      if (!this._s) return null;

      const { mr, answers, totalXP, startedAt, tabSwitches, mrIdx, challengeData } = this._s;
      const correct = answers.filter(a => a.correct).length;
      const allCorrect = answers.length > 0 && correct === answers.length;
      const perfectBonus = allCorrect ? (mr.xp?.perfectBonus || 50) : 0;
      const finalXP = totalXP + perfectBonus;

      const stats = {
        mrId: mr.id,
        weekNum: challengeData.week,
        mrIdx,
        correct,
        wrong: answers.length - correct,
        total: answers.length,
        accuracy: answers.length ? Math.round((correct / answers.length) * 100) : 0,
        baseXP: totalXP,
        bonusXP: perfectBonus,
        finalXP,
        allCorrect,
        timeUsed: Math.round((Date.now() - startedAt) / 1000),
        tabSwitches,
        completedAt: new Date().toISOString(),
      };

      this.bus.emit('microretoComplete', stats);
      this._s.mod.finish();
      return stats;
    }

    /** Abandon the active microreto (counts as a used attempt). */
    abandon() {
      this._clearTimer();
      if (this._s) this._s.mod.finish();
      this.bus.emit('microretoAbandoned', { mrIdx: this._s?.mrIdx });
      this._s = null;
    }

    /** Record a tab-switch event during an active challenge. */
    registerTabSwitch() {
      if (!this._s) return;
      this._s.tabSwitches++;
      this.bus.emit('tabSwitchDetected', { count: this._s.tabSwitches, mrIdx: this._s.mrIdx });
    }

    // ── Convenience accessors (safe when _s is null) ──────────

    getPhase()          { return this._s?.phase || 'idle'; }
    getTimeLeft()       { return this._s?.timeLeft || 0; }
    getQuestionIdx()    { return this._s?.questionIdx || 0; }
    getTotalQuestions() { return this._s?.mr?.questions?.length || 0; }
    getSessionXP()      { return this._s?.totalXP || 0; }
    getAnswers()        { return this._s?.answers || []; }
    isActive()          { return !!this._s; }

    /** Returns memory items for the current microreto (memory type only). */
    getMemoryItems(lang) {
      if (!this._s) return [];
      return this._s.mod.getMemoryItems
        ? this._s.mod.getMemoryItems(lang || this._s.lang)
        : [];
    }

    /** Returns the current question object. */
    getCurrentQuestion(lang) {
      if (!this._s) return null;
      return this._s.mod.getQuestion(this._s.questionIdx, lang || this._s.lang);
    }

    // ── XP calculation (also used by modules) ────────────────

    static calcXP(correct, timeLeft, maxTime, xpConfig) {
      if (!correct) return 0;
      const base     = xpConfig?.base     || 50;
      const speedMax = xpConfig?.speedMax || 30;
      const ratio    = maxTime > 0 ? timeLeft / maxTime : 0;
      return base + Math.round(ratio * speedMax);
    }

    // ── Internal helpers ──────────────────────────────────────

    _startTimer(duration, phase) {
      this._clearTimer();
      if (this._s) this._s.timeLeft = duration;

      this._timer = setInterval(() => {
        if (!this._s) { this._clearTimer(); return; }
        this._s.timeLeft = Math.max(0, this._s.timeLeft - 1);
        this.bus.emit('timerTick', { timeLeft: this._s.timeLeft, phase });
        if (this._s.timeLeft <= 0) {
          this._clearTimer();
          this.bus.emit('timerExpired', { phase });
        }
      }, 1000);
    }

    _clearTimer() {
      clearInterval(this._timer);
      this._timer = null;
    }

    _error(message, extra = {}) {
      console.error('[Engine]', message, extra);
      this.bus.emit('engineError', { message, ...extra });
    }
  }

  window.ChallengeEngine = ChallengeEngine;
})();
