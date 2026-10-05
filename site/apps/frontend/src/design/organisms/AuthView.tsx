import type { RefObject } from 'react';
import { ArrowLeft, Eye, EyeOff, Heart, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../atoms/Button';
import { TextField } from '../atoms/TextField';
import * as m from '@/paraglide/messages.js';

export type AuthMode =
  | 'signin'
  | 'signup'
  | 'forgot'
  | 'reset-sent'
  | 'verification-sent'
  | 'reset-password';

export interface AuthViewProps {
  /** Title the listener tried to keep: the sign-in heading names it. */
  keepTitle?: string | undefined;
  /** The stream plays: warn that the Google redirect stops it. */
  isListening: boolean;
  /** Flux courant : détermine titre, champs affichés et libellé du bouton. */
  mode: AuthMode;
  /** Désactive les actions et affiche le spinner du bouton de soumission. */
  isLoading: boolean;
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  /** Bascule les champs mot de passe entre `text` et `password`. */
  showPassword: boolean;
  /** E-mail shown once a message is sent (account to confirm, password to choose). */
  pendingEmail: string;
  /** Erreurs de validation par champ (`email`, `password`, `passwordConfirm`). */
  errors: Record<string, string>;
  emailRef: RefObject<HTMLInputElement | null>;
  passwordRef: RefObject<HTMLInputElement | null>;
  passwordConfirmRef: RefObject<HTMLInputElement | null>;
  /** The listener is done (« J'ai compris » after signing up): back to where they came from. */
  onDone: () => void;
  /** Soumission du formulaire (le conteneur gère `preventDefault`). */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** Connexion OAuth Google. */
  onOAuthGoogle: () => void;
  onToggleShowPassword: () => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onEmailBlur: () => void;
  onPasswordChange: (value: string) => void;
  onPasswordBlur: () => void;
  onPasswordConfirmChange: (value: string) => void;
  onPasswordConfirmBlur: () => void;
  /** Change de flux (bascule connexion/inscription, mot de passe oublié, retour). */
  onSwitchMode: (next: AuthMode) => void;
}

// ─────────────────────────────────────────────
// Brand SVGs — official logos kept inline so we don't import a logo lib
// ─────────────────────────────────────────────

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.87 0-5.3-1.94-6.16-4.55H2.18v2.85A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.08A6.6 6.6 0 0 1 5.5 12c0-.72.12-1.42.34-2.08V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.85Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.85C6.7 7.32 9.13 5.38 12 5.38Z"
      />
    </svg>
  );
}

const TEXT_LINK_CLASSES =
  'ease-out-quart focus-visible:outline-accent inline-flex min-h-11 items-center rounded-sm underline decoration-1 underline-offset-4 transition-opacity duration-150 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70';

const BACK_LINK_CLASSES =
  'text-ui text-text-muted ease-out-quart hover:text-text focus-visible:outline-accent -ml-1 inline-flex min-h-11 items-center gap-2 self-start rounded-sm px-1 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70';

/** What an account brings: beside the form on wide screens, under it on a phone. */
function AuthPitch({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-6 md:gap-8', className)}>
      <p className="text-section md:text-hero max-w-hero m-0 text-balance">
        {m.auth_aside_title()}
      </p>
      <ul className="text-intro text-text-muted max-w-aside m-0 flex list-none flex-col gap-4 p-0">
        <li className="flex items-start gap-3.5">
          <Heart className="text-text mt-1 size-5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          {m.auth_aside_library()}
        </li>
        <li className="flex items-start gap-3.5">
          <ListOrdered
            className="text-text mt-1 size-5 shrink-0"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          {m.auth_aside_ranking()}
        </li>
      </ul>
    </div>
  );
}

/** An e-mail is on its way (account to confirm, password to choose): where, and what next. */
function MailSentBody({
  lead,
  email,
  rest,
  hint,
  action,
  onAction,
}: {
  lead: string;
  email: string;
  rest: string;
  hint: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="max-w-form flex flex-col gap-6">
      <p className="text-intro text-text-muted m-0">
        {lead} <span className="text-text font-medium wrap-break-word">{email}</span>. {rest}
      </p>
      <p className="text-ui text-text-muted m-0 font-normal">{hint}</p>
      <Button onClick={onAction} className="h-14 w-full justify-center">
        {action}
      </Button>
    </div>
  );
}

/**
 * The sign-in page's body, filling the screen between header and footer: what an account brings on
 * one half, the current flow on the other (fields by mode, or the e-mail that was sent). The flow
 * fades in at each change. The `AuthPage` container holds the state, the validation and every
 * Better Auth call.
 */
export function AuthView({
  keepTitle,
  isListening,
  mode,
  isLoading,
  email,
  password,
  passwordConfirm,
  name,
  showPassword,
  pendingEmail,
  errors,
  emailRef,
  passwordRef,
  passwordConfirmRef,
  onDone,
  onSubmit,
  onOAuthGoogle,
  onToggleShowPassword,
  onNameChange,
  onEmailChange,
  onEmailBlur,
  onPasswordChange,
  onPasswordBlur,
  onPasswordConfirmChange,
  onPasswordConfirmBlur,
  onSwitchMode,
}: AuthViewProps) {
  const headerCopy = {
    signin: {
      title: keepTitle ? m.auth_keep_title({ title: keepTitle }) : m.auth_signin_title(),
      desc: null,
    },
    signup: { title: m.auth_signup_title(), desc: null },
    forgot: { title: m.auth_forgot_title(), desc: m.auth_forgot_desc() },
    'reset-sent': { title: m.auth_verification_title(), desc: null },
    'verification-sent': { title: m.auth_verification_title(), desc: null },
    'reset-password': { title: m.auth_new_password(), desc: null },
  }[mode];
  const withAccountChoice = mode === 'signin' || mode === 'signup';
  const withBack = mode === 'forgot' || mode === 'reset-password';

  const passwordToggle = (
    <Button
      type="button"
      variant="icon"
      onClick={onToggleShowPassword}
      aria-label={showPassword ? m.auth_password_hide() : m.auth_password_show()}
      aria-pressed={showPassword}
    >
      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </Button>
  );

  return (
    <main id="main" className="px-page flex flex-1 items-center py-10">
      <div className="grid w-full gap-14 md:grid-cols-2 md:items-center md:gap-0">
        <AuthPitch className="hidden md:flex md:pr-16 lg:pr-24" />

        <div className="md:border-border md:border-l md:pl-16 lg:pl-24">
          <div key={mode} className="panel-in flex flex-col gap-8">
            <div className="max-w-aside flex flex-col gap-3">
              {withBack ? (
                <button
                  type="button"
                  onClick={() => onSwitchMode('signin')}
                  className={BACK_LINK_CLASSES}
                >
                  <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  {m.auth_back_to_signin()}
                </button>
              ) : null}
              <h1 className="text-section m-0 text-balance">{headerCopy.title}</h1>
              {headerCopy.desc ? (
                <p className="text-intro text-text-muted m-0">{headerCopy.desc}</p>
              ) : null}
            </div>

            {mode === 'verification-sent' ? (
              <MailSentBody
                lead={m.auth_verification_sent_to()}
                email={pendingEmail}
                rest={m.auth_verification_click_link()}
                hint={m.auth_verification_spam_hint()}
                action={m.auth_verification_dismiss()}
                onAction={onDone}
              />
            ) : mode === 'reset-sent' ? (
              <MailSentBody
                lead={m.auth_reset_sent_to()}
                email={pendingEmail}
                rest={m.auth_reset_sent_rest()}
                hint={m.auth_reset_sent_hint()}
                action={m.auth_back_to_signin()}
                onAction={() => onSwitchMode('signin')}
              />
            ) : (
              <form onSubmit={onSubmit} className="max-w-form flex flex-col gap-8">
                {withAccountChoice ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={onOAuthGoogle}
                        disabled={isLoading}
                        className="border-accent h-13 w-full justify-center gap-2.5 border hover:bg-transparent hover:opacity-80"
                      >
                        <GoogleLogo className="size-4.5" />
                        {m.auth_oauth_google()}
                      </Button>
                      {isListening ? (
                        <p className="text-caption text-text-muted m-0">{m.auth_google_stops()}</p>
                      ) : null}
                    </div>
                    <div className="text-ui text-text-muted flex items-center gap-4 font-normal">
                      <span className="border-border flex-1 border-t" />
                      {m.auth_or()}
                      <span className="border-border flex-1 border-t" />
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-5">
                  {mode === 'signup' && (
                    <TextField
                      id="name"
                      label={m.auth_name_label()}
                      type="text"
                      placeholder={m.auth_name_placeholder()}
                      value={name}
                      onChange={(e) => onNameChange(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  )}

                  {mode !== 'reset-password' && (
                    <TextField
                      id="email"
                      ref={emailRef}
                      label={m.auth_email_label()}
                      type="email"
                      placeholder={m.auth_email_placeholder()}
                      value={email}
                      onChange={(e) => onEmailChange(e.target.value)}
                      onBlur={onEmailBlur}
                      required
                      autoComplete="email"
                      error={errors.email}
                    />
                  )}

                  {mode !== 'forgot' && (
                    <div className="flex flex-col gap-1">
                      <TextField
                        id="password"
                        ref={passwordRef}
                        label={m.auth_password_label()}
                        description={mode === 'signin' ? undefined : m.auth_password_hint()}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => onPasswordChange(e.target.value)}
                        onBlur={onPasswordBlur}
                        required
                        minLength={6}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        error={errors.password}
                        trailing={passwordToggle}
                      />
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => onSwitchMode('forgot')}
                          className={cn(TEXT_LINK_CLASSES, 'text-ui self-end font-normal')}
                        >
                          {m.auth_forgot_link()}
                        </button>
                      )}
                    </div>
                  )}

                  {mode === 'reset-password' && (
                    <TextField
                      id="password-confirm"
                      ref={passwordConfirmRef}
                      label={m.auth_password_confirm_label()}
                      type={showPassword ? 'text' : 'password'}
                      value={passwordConfirm}
                      onChange={(e) => onPasswordConfirmChange(e.target.value)}
                      onBlur={onPasswordConfirmBlur}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      error={errors.passwordConfirm}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <Button type="submit" loading={isLoading} className="h-14 w-full justify-center">
                    {isLoading
                      ? m.auth_loading()
                      : mode === 'signin'
                        ? m.auth_submit_signin()
                        : mode === 'signup'
                          ? m.auth_submit_signup()
                          : mode === 'forgot'
                            ? m.auth_submit_forgot()
                            : m.auth_submit_reset()}
                  </Button>
                  {mode === 'signup' && (
                    <p className="text-caption text-text-muted m-0">
                      {m.auth_privacy_notice()}{' '}
                      <a
                        href={m.legal_href()}
                        className={cn(TEXT_LINK_CLASSES, 'text-text min-h-0')}
                      >
                        {m.auth_privacy_link()}
                      </a>
                      .
                    </p>
                  )}
                </div>

                {withAccountChoice ? (
                  <p className="border-border text-ui text-text-muted m-0 border-t pt-5 font-normal">
                    {mode === 'signin' ? m.auth_no_account() : m.auth_have_account()}{' '}
                    <button
                      type="button"
                      onClick={() => onSwitchMode(mode === 'signin' ? 'signup' : 'signin')}
                      className={cn(TEXT_LINK_CLASSES, 'text-text font-semibold')}
                    >
                      {mode === 'signin' ? m.auth_create_account() : m.auth_submit_signin()}
                    </button>
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>

        {withAccountChoice ? (
          <AuthPitch className="border-border border-t pt-10 md:hidden" />
        ) : null}
      </div>
    </main>
  );
}
