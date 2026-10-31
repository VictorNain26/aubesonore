import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from './Button';
import { EyeIcon } from './icons';
import * as m from '@/paraglide/messages.js';

// The words are read as the story renders (render), so that they follow the toolbar's « Langue ».

const meta = {
  title: 'Composants/Button',
  component: Button,
  args: { variant: 'primary', onClick: fn() },
  render: (args) => <Button {...args}>{m.auth_submit_signin()}</Button>,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Principal: Story = { name: 'Principal' };

export const Discret: Story = {
  name: 'Discret',
  args: { variant: 'ghost' },
  render: (args) => <Button {...args}>{m.auth_oauth_google()}</Button>,
};

/** The password field's eye (auth/AuthView.tsx): a 44 px square named by its label. */
export const Icone: Story = {
  name: 'Icône',
  args: { variant: 'icon' },
  render: (args) => (
    <Button {...args} aria-label={m.auth_password_show()}>
      <EyeIcon className="size-4" />
    </Button>
  ),
};

export const EnCours: Story = {
  name: 'En cours',
  args: { loading: true },
  render: (args) => <Button {...args}>{m.loading()}</Button>,
};

export const Desactive: Story = { name: 'Désactivé', args: { disabled: true } };
