import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRef } from 'react';
import { fn } from 'storybook/test';
import { PASSWORD_MIN_LENGTH } from '@aubesonore/shared-types/auth';
import { toastError } from '../lib/appToast';
import { Layout } from '../shell/Layout';
import { ACCOUNT } from '../stories/account';
import { TRACKS } from '../stories/fixtures';
import { AuthView } from './AuthView';
import * as m from '@/paraglide/messages.js';

const meta = {
  title: 'Pages/Compte',
  component: AuthView,
  args: {
    mode: 'signin',
    isLoading: false,
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    showPassword: false,
    pendingEmail: '',
    errors: {},
    emailRef: createRef(),
    passwordRef: createRef(),
    passwordConfirmRef: createRef(),
    onDone: fn(),
    onSubmit: fn(),
    onOAuthGoogle: fn(),
    onToggleShowPassword: fn(),
    onNameChange: fn(),
    onEmailChange: fn(),
    onEmailBlur: fn(),
    onPasswordChange: fn(),
    onPasswordBlur: fn(),
    onPasswordConfirmChange: fn(),
    onPasswordConfirmBlur: fn(),
    onSwitchMode: fn(),
  },
} satisfies Meta<typeof AuthView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A password as long as the API asks, shown as dots. */
const PASSWORD = 'a'.repeat(PASSWORD_MIN_LENGTH);

export const Connexion: Story = { name: 'Connexion' };

export const PourGarder: Story = {
  name: 'Connexion pour garder un titre',
  args: { keepTitle: TRACKS.growlers.title },
};

export const ConnexionEnCours: Story = {
  name: 'Connexion en cours',
  args: { email: ACCOUNT.email, password: PASSWORD, isLoading: true },
};

// The field errors are AuthPage's checks, made as the listener leaves a field or sends the form.
export const EmailInvalide: Story = {
  name: 'Adresse e-mail invalide',
  args: { email: 'camille@example' },
  render: (args) => <AuthView {...args} errors={{ email: m.auth_error_email_invalid() }} />,
};

export const Inscription: Story = { name: 'Inscription', args: { mode: 'signup' } };

export const MotDePasseTropCourt: Story = {
  name: 'Mot de passe trop court',
  args: { mode: 'signup', name: ACCOUNT.name, email: ACCOUNT.email, password: 'aube' },
  render: (args) => (
    <AuthView
      {...args}
      errors={{ password: m.auth_error_password_length({ min: PASSWORD_MIN_LENGTH }) }}
    />
  ),
};

export const MotDePasseAffiche: Story = {
  name: 'Mot de passe affiché',
  args: {
    mode: 'signup',
    name: ACCOUNT.name,
    email: ACCOUNT.email,
    password: 'aube-sonore',
    showPassword: true,
  },
};

export const CompteAConfirmer: Story = {
  name: 'Compte à confirmer',
  args: { mode: 'verification-sent', pendingEmail: ACCOUNT.email },
};

export const MotDePasseOublie: Story = {
  name: 'Mot de passe oublié',
  args: { mode: 'forgot', email: ACCOUNT.email },
};

export const LienEnvoye: Story = {
  name: 'Lien de réinitialisation envoyé',
  args: { mode: 'reset-sent', pendingEmail: ACCOUNT.email },
};

export const NouveauMotDePasse: Story = {
  name: 'Nouveau mot de passe',
  args: { mode: 'reset-password' },
};

export const MotsDePasseDifferents: Story = {
  name: 'Mots de passe différents',
  args: { mode: 'reset-password', password: PASSWORD, passwordConfirm: `${PASSWORD}b` },
  render: (args) => (
    <AuthView {...args} errors={{ passwordConfirm: m.auth_error_password_mismatch() }} />
  ),
};

/**
 * What the server answers comes as a toast over the page (lib/api.ts turns Better Auth's codes
 * into these messages, AuthPage shows them with toastError): the site's Layout holds the toaster.
 * The toast leaves after its 8 seconds, as on the site; the toolbar's « Reload story » shows it
 * again.
 */
function answered(message: () => string): Pick<Story, 'decorators' | 'play'> {
  return {
    decorators: [
      (Story) => (
        <Layout>
          <Story />
        </Layout>
      ),
    ],
    play: () => toastError(message()),
  };
}

export const IdentifiantsIncorrects: Story = {
  name: 'Serveur : identifiants incorrects',
  args: { email: ACCOUNT.email, password: PASSWORD },
  ...answered(m.auth_error_credentials),
};

export const AdresseNonConfirmee: Story = {
  name: 'Serveur : adresse pas encore confirmée',
  args: { email: ACCOUNT.email, password: PASSWORD },
  ...answered(m.auth_error_not_verified),
};

export const CompteExistant: Story = {
  name: 'Serveur : un compte existe déjà',
  args: { mode: 'signup', name: ACCOUNT.name, email: ACCOUNT.email, password: PASSWORD },
  ...answered(m.auth_error_exists),
};

export const TropDeTentatives: Story = {
  name: 'Serveur : trop de tentatives',
  args: { email: ACCOUNT.email, password: PASSWORD },
  ...answered(m.auth_error_rate_limited),
};

export const LienExpire: Story = {
  name: 'Serveur : lien expiré au nouveau mot de passe',
  args: { mode: 'reset-password', password: PASSWORD, passwordConfirm: PASSWORD },
  ...answered(m.error_link_invalid),
};

/** Better Auth's link sent back with ?error=INVALID_TOKEN: the sign-in form, and why. */
export const LienInvalide: Story = {
  name: 'Lien de réinitialisation invalide',
  ...answered(m.toast_reset_link_invalid),
};
