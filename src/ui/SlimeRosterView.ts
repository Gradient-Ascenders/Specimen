import type { SlimeHUDSnapshot } from '../slimes/SlimeHUDState.ts';
import type { SlimeRosterState } from '../slimes/SlimeManager.ts';
import type { SlimeId } from '../slimes/SlimeRoster.ts';

export interface SlimeRosterEntryView {
  readonly state: 'active' | 'switchable' | 'unavailable';
  readonly stateLabel: string;
  readonly controlLabel: string;
  readonly ariaLabel: string;
}

/**
 * Converts authoritative roster state into text-first UI language. Volt is
 * intentionally omitted from the playable HUD until it has a runtime body.
 */
export function getSlimeRosterEntryView(
  entry: SlimeRosterState,
  switchKeyLabel = 'Tab',
): SlimeRosterEntryView | undefined {
  if (!entry.betaPlayable) return undefined;

  const usable = entry.unlocked && entry.registered;
  if (entry.active && usable) {
    return {
      state: 'active',
      stateLabel: 'Active',
      controlLabel: '',
      ariaLabel: `${entry.displayName}: active, controlled body`,
    };
  }

  if (usable) {
    return {
      state: 'switchable',
      stateLabel: 'Ready',
      controlLabel: `${switchKeyLabel} to switch`,
      ariaLabel: `${entry.displayName}: inactive, available with ${switchKeyLabel}`,
    };
  }

  const reason = entry.unlocked ? 'unavailable' : 'locked';
  return {
    state: 'unavailable',
    stateLabel: reason === 'locked' ? 'Locked' : 'Unavailable',
    controlLabel: '',
    ariaLabel: `${entry.displayName}: ${reason}, unavailable`,
  };
}

export function formatPassiveInteractionStatus(
  snapshot: SlimeHUDSnapshot,
): string | undefined {
  const messages = snapshot.passiveInteractions
    .filter((interaction) => snapshot.activeSlimeId !== interaction.slimeId)
    .map((interaction) => {
      const entry = snapshot.roster.find(
        (candidate) => candidate.id === interaction.slimeId,
      );
      const name = entry?.displayName ?? interaction.slimeId;
      return `${name} holds the ${interaction.label} while inactive.`;
    });

  if (messages.length === 0) return undefined;
  return `${messages.join(' ')} Switching keeps it active.`;
}

export class SlimeSwitchFeedbackModel {
  private handledSequence = 0;
  private feedbackActiveSlimeId: SlimeId | undefined;
  private text = '';

  update(snapshot: SlimeHUDSnapshot): string {
    if (snapshot.resetSwitchFeedback) this.clearText();

    const event = snapshot.playerSwitchFeedback;

    if (event !== undefined && event.sequence > this.handledSequence) {
      this.handledSequence = event.sequence;
      this.feedbackActiveSlimeId = event.activeSlimeId;

      const previous = snapshot.roster.find(
        (entry) => entry.id === event.previousSlimeId,
      );
      const active = snapshot.roster.find(
        (entry) => entry.id === event.activeSlimeId,
      );
      this.text =
        previous !== undefined && active !== undefined
          ? `Switched to ${active.displayName}. ${previous.displayName} is inactive.`
          : '';
    } else if (
      this.feedbackActiveSlimeId !== undefined &&
      snapshot.activeSlimeId !== this.feedbackActiveSlimeId
    ) {
      this.clearText();
    }

    return this.text;
  }

  clear(): void {
    this.clearText();
  }

  private clearText(): void {
    this.feedbackActiveSlimeId = undefined;
    this.text = '';
  }
}
