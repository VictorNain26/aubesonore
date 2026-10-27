// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitch, ThemeSwitchView } from './ThemeSwitch';
import { chooseTheme } from '../stores/themeStore';

afterEach(() => {
  act(() => chooseTheme('system'));
});

describe('ThemeSwitchView', () => {
  it('offers the three themes as one choice, the current one checked', () => {
    render(<ThemeSwitchView choice="light" onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: 'Thème' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value'))
    ).toEqual(['system', 'light', 'dark']);
    for (const name of ['Système', 'Clair', 'Sombre'])
      expect(within(group).getByRole('radio', { name })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Clair' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Système' })).not.toBeChecked();
  });

  it('tells the theme the listener picks, with a click or the arrow keys', async () => {
    const onChange = vi.fn();
    render(<ThemeSwitchView choice="system" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Sombre' }));
    expect(onChange).toHaveBeenLastCalledWith('dark');

    onChange.mockClear();
    screen.getByRole('radio', { name: 'Système' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('light');
  });
});

describe('ThemeSwitch', () => {
  it('shows one choice in every place it stands, each a group of its own', async () => {
    render(
      <>
        <ThemeSwitch />
        <ThemeSwitch />
      </>
    );
    const [footer, menu] = screen.getAllByRole('radiogroup', { name: 'Thème' });
    await userEvent.click(within(footer!).getByRole('radio', { name: 'Sombre' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(within(menu!).getByRole('radio', { name: 'Sombre' })).toBeChecked();
    // Each its own group of radios: the second one checked does not uncheck the first.
    expect(within(footer!).getByRole('radio', { name: 'Sombre' })).toBeChecked();
  });
});
