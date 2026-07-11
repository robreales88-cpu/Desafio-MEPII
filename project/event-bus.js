/**
 * EventBus — lightweight pub/sub for decoupled communication
 * between ChallengeEngine, modules, and the UI layer.
 *
 * Standard events emitted by the engine:
 *   microretoStarted  | timerTick | timerExpired
 *   answerPhaseStarted | questionReady
 *   feedbackReady | microretoComplete | microretoAbandoned
 *   xpEarned | badgeUnlocked | levelUp | tabSwitchDetected | engineError
 */
(function () {
  'use strict';

  class EventBus {
    constructor() {
      this._handlers = {};
    }

    /** Subscribe to an event. Returns `this` for chaining. */
    on(event, handler) {
      if (!this._handlers[event]) this._handlers[event] = [];
      this._handlers[event].push(handler);
      return this;
    }

    /** Unsubscribe a specific handler. */
    off(event, handler) {
      if (!this._handlers[event]) return this;
      this._handlers[event] = this._handlers[event].filter(h => h !== handler);
      return this;
    }

    /** Emit an event with optional data payload. */
    emit(event, data) {
      (this._handlers[event] || []).forEach(h => {
        try { h(data); } catch (e) { console.warn('[EventBus]', event, e); }
      });
      return this;
    }

    /** Remove all handlers for one event, or all events if no arg. */
    clear(event) {
      if (event) delete this._handlers[event];
      else this._handlers = {};
      return this;
    }
  }

  window.EventBus = EventBus;
  // Shared singleton for the platform
  window.platformBus = new EventBus();
})();
