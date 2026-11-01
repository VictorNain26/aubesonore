import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ThemeSwitchView } from './ThemeSwitch';

/** Each choice paired with the toolbar's « Ciel », so the page is drawn in it. */
const meta = {
  title: 'Coque/ThemeSwitch',
  component: ThemeSwitchView,
  args: { choice: 'system', onChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ThemeSwitchView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Systeme: Story = { name: 'Système', globals: { theme: 'system' } };

export const Jour: Story = { name: 'Jour', args: { choice: 'light' }, globals: { theme: 'light' } };

export const Nuit: Story = { name: 'Nuit', args: { choice: 'dark' }, globals: { theme: 'dark' } };
