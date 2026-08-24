/**
 * worker/src/generic-agent/agent-state-machine.ts
 *
 * AgentStateMachine — formal state machine for the browser agent workflow.
 *
 * The agent always knows its current state. Transitions are validated
 * against a legal transition map. Invalid transitions are logged but
 * do not crash the workflow — they are clamped to the nearest valid state.
 *
 * Terminal / blocked states (LOGIN_REQUIRED, CAPTCHA_REQUIRED, etc.) cannot
 * transition out automatically — they require human intervention.
 */

import { AgentState } from './types';

// ─── Legal transition map ─────────────────────────────────────────────────────

/**
 * Maps each state to the set of states it can legally transition to.
 * Blocked/terminal states have no outgoing transitions (empty set).
 */
const LEGAL_TRANSITIONS: Readonly<Record<AgentState, ReadonlySet<AgentState>>> = {
  [AgentState.INITIALIZING]: new Set([
    AgentState.JOB_PAGE,
    AgentState.APPLICATION_FORM,
    AgentState.LOGIN_REQUIRED,
    AgentState.CAPTCHA_REQUIRED,
    AgentState.BOT_CHALLENGE,
    AgentState.JOB_EXPIRED,
    AgentState.ERROR,
    AgentState.UNKNOWN,
  ]),
  [AgentState.JOB_PAGE]: new Set([
    AgentState.IDENTIFYING_APPLICATION_TRIGGER,
    AgentState.COOKIE_CONSENT,
    AgentState.APPLICATION_FORM,
    AgentState.LOGIN_REQUIRED,
    AgentState.CAPTCHA_REQUIRED,
    AgentState.BOT_CHALLENGE,
    AgentState.JOB_EXPIRED,
    AgentState.ERROR,
    AgentState.UNKNOWN,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.IDENTIFYING_APPLICATION_TRIGGER]: new Set([
    AgentState.CLICKING_APPLICATION_TRIGGER,
    AgentState.COOKIE_CONSENT,
    AgentState.APPLICATION_FORM,
    AgentState.LOGIN_REQUIRED,
    AgentState.CAPTCHA_REQUIRED,
    AgentState.BOT_CHALLENGE,
    AgentState.ERROR,
    AgentState.UNKNOWN,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.CLICKING_APPLICATION_TRIGGER]: new Set([
    AgentState.APPLICATION_FORM,
    AgentState.INTERSTITIAL,
    AgentState.IDENTIFYING_APPLICATION_TRIGGER, // retry after failed click
    AgentState.COOKIE_CONSENT,
    AgentState.LOGIN_REQUIRED,
    AgentState.CAPTCHA_REQUIRED,
    AgentState.BOT_CHALLENGE,
    AgentState.ERROR,
    AgentState.UNKNOWN,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.INTERSTITIAL]: new Set([
    AgentState.APPLICATION_FORM,
    AgentState.IDENTIFYING_APPLICATION_TRIGGER,
    AgentState.COOKIE_CONSENT,
    AgentState.LOGIN_REQUIRED,
    AgentState.CAPTCHA_REQUIRED,
    AgentState.BOT_CHALLENGE,
    AgentState.ERROR,
    AgentState.UNKNOWN,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.COOKIE_CONSENT]: new Set([
    AgentState.JOB_PAGE,
    AgentState.IDENTIFYING_APPLICATION_TRIGGER,
    AgentState.APPLICATION_FORM,
    AgentState.ERROR,
  ]),
  [AgentState.APPLICATION_FORM]: new Set([
    AgentState.FORM_STEP,
    AgentState.FORM_VALIDATION,
    AgentState.REVIEW,
    AgentState.SUBMITTING,
    AgentState.COMPLETED,
    AgentState.LOGIN_REQUIRED,
    AgentState.CAPTCHA_REQUIRED,
    AgentState.ERROR,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.FORM_STEP]: new Set([
    AgentState.FORM_STEP,    // multi-step
    AgentState.FORM_VALIDATION,
    AgentState.APPLICATION_FORM,
    AgentState.REVIEW,
    AgentState.SUBMITTING,
    AgentState.COMPLETED,
    AgentState.ERROR,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.FORM_VALIDATION]: new Set([
    AgentState.FORM_STEP,
    AgentState.REVIEW,
    AgentState.SUBMITTING,
    AgentState.ERROR,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.REVIEW]: new Set([
    AgentState.SUBMITTING,
    AgentState.FORM_STEP,
    AgentState.ERROR,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.SUBMITTING]: new Set([
    AgentState.COMPLETED,
    AgentState.FORM_VALIDATION,
    AgentState.ERROR,
    AgentState.MANUAL_INTERVENTION,
  ]),
  // Terminal states — no outgoing transitions
  [AgentState.COMPLETED]: new Set<AgentState>(),
  [AgentState.LOGIN_REQUIRED]: new Set<AgentState>(),
  [AgentState.MFA_REQUIRED]: new Set<AgentState>(),
  [AgentState.CAPTCHA_REQUIRED]: new Set<AgentState>(),
  [AgentState.BOT_CHALLENGE]: new Set<AgentState>(),
  [AgentState.JOB_EXPIRED]: new Set<AgentState>(),
  [AgentState.ERROR]: new Set<AgentState>(),
  [AgentState.UNKNOWN]: new Set([
    AgentState.JOB_PAGE,
    AgentState.IDENTIFYING_APPLICATION_TRIGGER,
    AgentState.APPLICATION_FORM,
    AgentState.MANUAL_INTERVENTION,
  ]),
  [AgentState.MANUAL_INTERVENTION]: new Set<AgentState>(),
};

// ─── Blocked / terminal states ────────────────────────────────────────────────

export const TERMINAL_STATES = new Set<AgentState>([
  AgentState.COMPLETED,
  AgentState.LOGIN_REQUIRED,
  AgentState.MFA_REQUIRED,
  AgentState.CAPTCHA_REQUIRED,
  AgentState.BOT_CHALLENGE,
  AgentState.JOB_EXPIRED,
  AgentState.ERROR,
  AgentState.MANUAL_INTERVENTION,
]);

// ─── State Machine ────────────────────────────────────────────────────────────

export interface StateTransitionEvent {
  from: AgentState;
  to: AgentState;
  timestamp: string;
  url: string;
  reason: string;
  valid: boolean;
}

export class AgentStateMachine {
  private _current: AgentState;
  private _previous: AgentState;
  private _history: StateTransitionEvent[] = [];

  constructor(initialState: AgentState = AgentState.INITIALIZING) {
    this._current = initialState;
    this._previous = initialState;
  }

  get current(): AgentState {
    return this._current;
  }

  get previous(): AgentState {
    return this._previous;
  }

  get history(): ReadonlyArray<StateTransitionEvent> {
    return this._history;
  }

  /** Whether the current state is terminal (no further automatic transitions). */
  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this._current);
  }

  /**
   * Attempt a state transition.
   * Returns true if the transition is valid and was applied.
   * Returns false and emits a warning if the transition is invalid
   * (the current state remains unchanged for invalid transitions).
   */
  transition(to: AgentState, url: string, reason: string): boolean {
    const legalTargets = LEGAL_TRANSITIONS[this._current];
    const valid = legalTargets.has(to);

    const event: StateTransitionEvent = {
      from: this._current,
      to,
      timestamp: new Date().toISOString(),
      url,
      reason,
      valid,
    };
    this._history.push(event);

    if (!valid) {
      console.warn(
        `[AgentStateMachine] Invalid transition: ${this._current} → ${to} (${reason}). ` +
        `Legal targets: [${Array.from(legalTargets).join(', ')}]. State unchanged.`
      );
      return false;
    }

    this._previous = this._current;
    this._current = to;
    return true;
  }

  /**
   * Force a transition regardless of validity.
   * Use only for error recovery and terminal state enforcement.
   */
  forceTransition(to: AgentState, url: string, reason: string): void {
    const event: StateTransitionEvent = {
      from: this._current,
      to,
      timestamp: new Date().toISOString(),
      url,
      reason,
      valid: true, // forced
    };
    this._history.push(event);
    this._previous = this._current;
    this._current = to;
  }

  /**
   * Classify a page analysis result into an AgentState.
   * Used after DOM/AXTree analysis to determine next state.
   */
  static classifyFromPageAnalysis(analysis: {
    classification: string;
    securityBlocker?: { type: string } | null;
    formPresence?: { hasForm: boolean };
  }): AgentState {
    if (analysis.securityBlocker) {
      const t = analysis.securityBlocker.type;
      if (t === 'CAPTCHA') return AgentState.CAPTCHA_REQUIRED;
      if (t === 'BOT_CHALLENGE') return AgentState.BOT_CHALLENGE;
      if (t === 'AUTHENTICATION_REQUIRED') return AgentState.LOGIN_REQUIRED;
    }

    switch (analysis.classification) {
      case 'APPLICATION_FORM':
      case 'APPLICATION_CONTINUATION':
        return AgentState.APPLICATION_FORM;
      case 'JOB_DETAIL_PAGE':
      case 'APPLICATION_START_PAGE':
        return AgentState.JOB_PAGE;
      case 'CAPTCHA_CHALLENGE':
        return AgentState.CAPTCHA_REQUIRED;
      case 'BOT_CHALLENGE':
        return AgentState.BOT_CHALLENGE;
      case 'AUTHENTICATION_REQUIRED':
        return AgentState.LOGIN_REQUIRED;
      case 'JOB_CLOSED':
        return AgentState.JOB_EXPIRED;
      case 'ERROR_PAGE':
        return AgentState.ERROR;
      default:
        return AgentState.UNKNOWN;
    }
  }

  /**
   * Summary string for logging.
   */
  toString(): string {
    return `[${this._previous} → ${this._current}]`;
  }
}
