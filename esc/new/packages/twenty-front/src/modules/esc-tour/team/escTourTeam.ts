import { useSyncExternalStore } from 'react';

/**
 * Which team's day the tour walks through (RM #22317). Sales and CS are the pilot — the
 * operator's choice on 2026-10-07; the other roles are #22319.
 *
 * WHY THE PERSON PICKS, AND NOT THEIR TWENTY ROLE
 *
 * Asked once, on the operator's decision (2026-10-08): it works whatever roles the
 * workspace has, and nobody had measured whether roles named Sales and CS exist on the live
 * CRM. A picker that is wrong costs one click to change; a role mapping that is wrong
 * silently shows somebody the other team's day.
 *
 * WHERE IT IS REMEMBERED
 *
 * localStorage, so the choice survives a refresh with no server at all, and the person's
 * progress row (`team`), so it follows them to another device — written by
 * `startEscTourServerProgress`, which subscribes here. The server copy is applied on load
 * only when this page has not chosen yet: a choice made in this tab is the newest there is.
 */
export type EscTourTeam = 'sales' | 'cs';

export const ESC_TOUR_TEAMS: { team: EscTourTeam; label: string }[] = [
  { team: 'sales', label: 'Sales' },
  { team: 'cs', label: 'Customer service' },
];

export const ESC_TOUR_TEAM_KEY = 'esc-tour.team';

export const isEscTourTeam = (value: unknown): value is EscTourTeam =>
  ESC_TOUR_TEAMS.some((entry) => entry.team === value);

const readStoredTeam = (): EscTourTeam | null => {
  try {
    const value = window.localStorage.getItem(ESC_TOUR_TEAM_KEY);

    return isEscTourTeam(value) ? value : null;
  } catch {
    return null;
  }
};

const writeStoredTeam = (team: EscTourTeam) => {
  try {
    window.localStorage.setItem(ESC_TOUR_TEAM_KEY, team);
  } catch {
    // A tour that forgets the team asks again next time. Nothing to report.
  }
};

let escTourTeam: EscTourTeam | null | undefined;
let hasChosenThisPage = false;

const escTourTeamListeners = new Set<(team: EscTourTeam) => void>();
const escTourTeamRenderListeners = new Set<() => void>();

export const getEscTourTeam = (): EscTourTeam | null => {
  if (escTourTeam === undefined) {
    escTourTeam = readStoredTeam();
  }

  return escTourTeam;
};

const applyEscTourTeam = (team: EscTourTeam) => {
  escTourTeam = team;
  writeStoredTeam(team);

  for (const listener of escTourTeamRenderListeners) {
    listener();
  }
};

/** The person chose. Recorded locally and told to the progress writer. */
export const chooseEscTourTeam = (team: EscTourTeam) => {
  hasChosenThisPage = true;
  applyEscTourTeam(team);

  for (const listener of escTourTeamListeners) {
    try {
      listener(team);
    } catch {
      // A recorder that throws must never take the tour down with it.
    }
  }
};

/** What the server remembers, from another device. Never overrides a choice made here. */
export const seedEscTourTeam = (team: unknown) => {
  if (hasChosenThisPage || !isEscTourTeam(team) || team === getEscTourTeam()) {
    return;
  }

  applyEscTourTeam(team);
};

/** Choices only — not seeds, which came FROM the server and must not be written back. */
export const subscribeToEscTourTeamChoice = (
  listener: (team: EscTourTeam) => void,
): (() => void) => {
  escTourTeamListeners.add(listener);

  return () => {
    escTourTeamListeners.delete(listener);
  };
};

const subscribeForRender = (listener: () => void): (() => void) => {
  escTourTeamRenderListeners.add(listener);

  return () => {
    escTourTeamRenderListeners.delete(listener);
  };
};

export const useEscTourTeam = (): EscTourTeam | null =>
  useSyncExternalStore(subscribeForRender, getEscTourTeam, getEscTourTeam);

export const resetEscTourTeam = () => {
  escTourTeam = undefined;
  hasChosenThisPage = false;
  escTourTeamListeners.clear();
  escTourTeamRenderListeners.clear();
};
