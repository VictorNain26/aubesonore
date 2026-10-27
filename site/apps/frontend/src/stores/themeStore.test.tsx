// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { readThemeChoice, THEME_KEY } from '../design/theme';
import {
  chooseTheme,
  colorScheme,
  onColorSchemeChange,
  themeChoice,
  useThemeChoice,
} from './themeStore';

const root = document.documentElement;

/** The device's setting, dark or not, and a way to turn it as the system would. */
function deviceDark(initially: boolean) {
  const query = {
    matches: initially,
    listeners: new Set<() => void>(),
    addEventListener: (_: string, listener: () => void) => query.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => query.listeners.delete(listener),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => {
    expect(media).toBe('(prefers-color-scheme: dark)');
    return query as unknown as MediaQueryList;
  });
  return {
    turn(dark: boolean) {
      query.matches = dark;
      for (const listener of query.listeners) listener();
    },
    listening: () => query.listeners.size,
  };
}

beforeEach(() => {
  localStorage.removeItem(THEME_KEY);
  delete root.dataset.theme;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('chooseTheme', () => {
  it('follows the system until the listener chooses', () => {
    expect(themeChoice()).toBe('system');
  });

  it('remembers a forced theme on the device and draws the page in it', () => {
    chooseTheme('dark');
    expect(themeChoice()).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(readThemeChoice(THEME_KEY)).toBe('dark');

    chooseTheme('light');
    expect(themeChoice()).toBe('light');
    expect(readThemeChoice(THEME_KEY)).toBe('light');
  });

  it('forgets the choice when the listener goes back to the system', () => {
    chooseTheme('dark');
    chooseTheme('system');
    expect(themeChoice()).toBe('system');
    expect(root).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('still draws the page in the choice when the storage refuses it', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    expect(() => chooseTheme('dark')).not.toThrow();
    expect(themeChoice()).toBe('dark');
  });
});

describe('colorScheme', () => {
  it('is the device’s while the listener follows the system', () => {
    const device = deviceDark(false);
    expect(colorScheme()).toBe('light');
    device.turn(true);
    expect(colorScheme()).toBe('dark');
  });

  it('is the forced theme, whatever the device says', () => {
    deviceDark(true);
    chooseTheme('light');
    expect(colorScheme()).toBe('light');
    deviceDark(false);
    chooseTheme('dark');
    expect(colorScheme()).toBe('dark');
  });
});

describe('onColorSchemeChange', () => {
  it('tells when the device turns, while the listener follows the system', () => {
    const device = deviceDark(false);
    const changed = vi.fn();
    onColorSchemeChange(changed);
    device.turn(true);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('tells when the listener’s choice turns the page, and only then', () => {
    deviceDark(false);
    const changed = vi.fn();
    onColorSchemeChange(changed);
    chooseTheme('light');
    expect(changed).not.toHaveBeenCalled();
    chooseTheme('dark');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('says nothing when the device turns under a forced theme', () => {
    const device = deviceDark(false);
    chooseTheme('light');
    const changed = vi.fn();
    onColorSchemeChange(changed);
    device.turn(true);
    expect(changed).not.toHaveBeenCalled();
  });

  it('stops listening once let go', () => {
    const device = deviceDark(false);
    const changed = vi.fn();
    const stop = onColorSchemeChange(changed);
    stop();
    expect(device.listening()).toBe(0);
    chooseTheme('dark');
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('useThemeChoice', () => {
  it('redraws a component with the listener’s choice', () => {
    function Shown() {
      return <p>{useThemeChoice()}</p>;
    }
    render(<Shown />);
    expect(screen.getByText('system')).toBeInTheDocument();
    act(() => chooseTheme('dark'));
    expect(screen.getByText('dark')).toBeInTheDocument();
  });
});
