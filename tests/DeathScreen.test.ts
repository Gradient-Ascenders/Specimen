import assert from 'node:assert/strict';
import test from 'node:test';

import { DeathScreen } from '../src/ui/DeathScreen.ts';

class FakeClassList {
  private readonly values = new Set<string>();

  add(value: string): void {
    this.values.add(value);
  }

  remove(value: string): void {
    this.values.delete(value);
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  private readonly retryButton: FakeButton | undefined;
  hidden = false;
  inert = false;
  innerHTML = '';
  removed = false;

  constructor(retryButton?: FakeButton) {
    this.retryButton = retryButton;
  }

  get offsetWidth(): number {
    return 0;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string): FakeButton | null {
    return selector === '.death-retry' ? this.retryButton ?? null : null;
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeButton extends FakeElement {
  private clickListener: (() => void) | null = null;
  focused = false;

  addEventListener(type: string, listener: () => void): void {
    if (type === 'click') this.clickListener = listener;
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'click' && this.clickListener === listener) {
      this.clickListener = null;
    }
  }

  focus(): void {
    this.focused = true;
  }

  click(): void {
    this.clickListener?.();
  }
}

test('death screen disables background interaction and restores it on hide', () => {
  const originalDocument = globalThis.document;
  const retryButton = new FakeButton();
  const dialog = new FakeElement(retryButton);
  const fakeDocument = {
    createElement: () => dialog,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  });

  try {
    const canvas = new FakeElement();
    const debugPanel = new FakeElement();
    let retries = 0;
    const screen = new DeathScreen({
      onRetry: () => {
        retries += 1;
      },
      backgroundElements: [
        canvas as unknown as HTMLElement,
        debugPanel as unknown as HTMLElement,
      ],
    });

    assert.match(dialog.innerHTML, /brand\/specimen-mark-simple\.svg/);
    assert.match(dialog.innerHTML, /alt=""/);

    screen.show();
    assert.equal(dialog.hidden, false);
    assert.equal(dialog.getAttribute('aria-hidden'), 'false');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.classList.contains('is-visible'), true);
    assert.equal(retryButton.focused, true);
    assert.equal(canvas.inert, true);
    assert.equal(debugPanel.inert, true);

    retryButton.click();
    assert.equal(retries, 1);

    screen.hide();
    assert.equal(dialog.hidden, true);
    assert.equal(dialog.getAttribute('aria-hidden'), 'true');
    assert.equal(canvas.inert, false);
    assert.equal(debugPanel.inert, false);

    screen.show();
    screen.dispose();
    assert.equal(canvas.inert, false);
    assert.equal(debugPanel.inert, false);
    assert.equal(dialog.removed, true);
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }
});
