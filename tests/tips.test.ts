import { describe, expect, it, vi } from 'vitest';
import { installTip, tips } from '../src/app/tips';

describe('tips', () => {
  it('starts with installing when the browser offers it, with an Install button', () => {
    const install = vi.fn();
    const list = tips({ mod: '⌘', touch: false, installed: false, install });
    expect(list[0]!.id).toBe('install');
    list[0]!.action!.run();
    expect(install).toHaveBeenCalled();
  });

  it('skips installing once installed, or where it is not possible', () => {
    expect(
      installTip({ mod: '⌘', touch: false, installed: true, install: () => {} }),
    ).toBeUndefined();
    // Node's user agent is neither iOS, Android nor Safari, and there is no prompt.
    expect(installTip({ mod: '⌘', touch: false, installed: false })).toBeUndefined();
  });

  it('words tips for touch screens and keyboards', () => {
    const touch = tips({ mod: '⌘', touch: true, installed: true });
    const desk = tips({ mod: 'Ctrl', touch: false, installed: true });
    expect(touch[0]!.text).toMatch(/^Tap ⌘ in the top bar/);
    expect(desk[0]!.text).toMatch(/^Press CtrlK|^Press Ctrl/);
    expect(touch.some((t) => t.id === 'shortcuts')).toBe(false);
    expect(desk.some((t) => t.id === 'shortcuts')).toBe(true);
  });
});
