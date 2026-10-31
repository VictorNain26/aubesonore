import type { Meta, StoryObj } from '@storybook/react-vite';
import { PASSWORD_MIN_LENGTH } from '@aubesonore/shared-types/auth';
import { fn } from 'storybook/test';
import { Button } from './Button';
import { EyeIcon } from './icons';
import { TextField } from './TextField';
import * as m from '@/paraglide/messages.js';

// The sign-in form's fields (auth/AuthView.tsx), their words read as the story renders.

interface FieldState {
  /** What is typed: the error message's own example address. */
  defaultValue?: string;
  invalid?: boolean;
  disabled?: boolean;
}

function Email({ defaultValue, invalid = false, disabled = false }: FieldState) {
  return (
    <TextField
      label={m.auth_email_label()}
      type="email"
      placeholder={m.auth_email_placeholder()}
      defaultValue={defaultValue}
      error={invalid ? m.auth_error_email_invalid() : undefined}
      disabled={disabled}
    />
  );
}

const meta = {
  title: 'Composants/TextField',
  component: Email,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-form">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Email>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vide: Story = { name: 'Vide' };

export const Rempli: Story = { name: 'Rempli', args: { defaultValue: 'vous@exemple.fr' } };

export const EnErreur: Story = {
  name: 'En erreur',
  args: { defaultValue: 'vous@exemple', invalid: true },
};

export const Desactive: Story = { name: 'Désactivé', args: { disabled: true } };

/** The new password: its length under it, the eye that shows it at its end. */
export const AideEtBouton: Story = {
  name: 'Avec une aide et un bouton',
  render: () => (
    <TextField
      label={m.auth_password_label()}
      description={m.auth_password_hint({ min: PASSWORD_MIN_LENGTH })}
      type="password"
      trailing={
        <Button variant="icon" onClick={fn()} aria-label={m.auth_password_show()}>
          <EyeIcon className="size-4" />
        </Button>
      }
    />
  ),
};
