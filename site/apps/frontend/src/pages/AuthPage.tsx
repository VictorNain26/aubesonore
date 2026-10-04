import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import { usePlayer } from '../lib/player';
import type { SignInState } from '../lib/signIn';
import { takePendingKeep } from '../lib/pendingKeep';
import { SiteHeader } from '../home/SiteHeader';
import { SiteFooter } from '../home/SiteFooter';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../lib/api';
import { toast } from 'sonner';
import { toastError } from '../lib/appToast';
import { AuthView, type AuthMode } from '../design/organisms/AuthView';
import * as m from '@/paraglide/messages.js';

function validateEmailFormat(value: string): string | undefined {
  if (!value) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : m.auth_error_email_invalid();
}

function validatePasswordLength(value: string): string | undefined {
  if (!value) return undefined;
  return value.length >= 6 ? undefined : m.auth_error_password_length();
}

function validatePasswordMatch(password: string, confirm: string): string | undefined {
  if (!confirm) return undefined;
  return confirm === password ? undefined : m.auth_error_password_mismatch();
}

/**
 * Sign in, sign up, a forgotten password and a new one, on a page of the site (/connexion,
 * /en/sign-in, and Better Auth's /reset-password?token= link). Opened with a SignInState: its first
 * form, the track the listener wanted to keep, the page to go back to once signed in.
 */
export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const opened = (location.state ?? {}) as SignInState;
  const resetToken = location.pathname === '/reset-password' ? params.get('token') : null;
  const resetLinkInvalid = params.get('error') === 'INVALID_TOKEN';
  const defaultMode = opened.mode ?? 'signin';
  const keepTitle = opened.keepTitle;
  const backTo = opened.from ?? localizeHref('/');
  const isListening = usePlayer((s) => s.isPlaying);
  const [mode, setMode] = useState<AuthMode>(resetToken ? 'reset-password' : defaultMode);

  useEffect(() => {
    document.title = `${m.auth_signin_title()} · AubeSonore`;
    if (resetLinkInvalid) toastError(m.toast_reset_link_invalid());
  }, [resetLinkInvalid]);

  // Already signed in (back from Google, or the page reopened): nothing to do here.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && mode !== 'verification-sent') void navigate(backTo, { replace: true });
  }, [isAuthenticated, mode, backTo, navigate]);

  // Left without signing in: forget the track they wanted to keep. A redirect to Google unloads
  // the page without unmounting it, so the track survives the round trip.
  useEffect(
    () => () => {
      if (!useAuthStore.getState().isAuthenticated) takePendingKeep();
    },
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmRef = useRef<HTMLInputElement>(null);

  const setFieldError = (field: string, message: string | undefined) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) {
        next[field] = message;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setPasswordConfirm('');
    setName('');
    setShowPassword(false);
    setErrors({});
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    let firstInvalidRef: React.RefObject<HTMLInputElement | null> | null = null;

    if (mode !== 'reset-password') {
      const emailError = validateEmailFormat(email);
      if (emailError) {
        nextErrors.email = emailError;
        firstInvalidRef ??= emailRef;
      }
    }

    if (mode !== 'forgot') {
      const passwordError = validatePasswordLength(password);
      if (passwordError) {
        nextErrors.password = passwordError;
        firstInvalidRef ??= passwordRef;
      }
    }

    if (mode === 'reset-password') {
      const confirmError = validatePasswordMatch(password, passwordConfirm);
      if (confirmError) {
        nextErrors.passwordConfirm = confirmError;
        firstInvalidRef ??= passwordConfirmRef;
      }
    }

    setErrors(nextErrors);
    if (firstInvalidRef) {
      firstInvalidRef.current?.focus();
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email, password);
        toast.success(m.toast_signin_success());
        void navigate(backTo, { replace: true });
      } else if (mode === 'signup') {
        await signUp(email, password, name);
        // requireEmailVerification: true on the backend → show the verify
        // screen instead of toasting + closing. The session is created but
        // login won't fully work until the email is confirmed.
        setPendingEmail(email);
        resetForm();
        setMode('verification-sent');
      } else if (mode === 'forgot') {
        await authApi.forgetPassword(email);
        toast.success(m.toast_forgot_sent());
        setMode('signin');
      } else if (mode === 'reset-password' && resetToken) {
        await authApi.resetPassword(resetToken, password);
        toast.success(m.toast_password_reset());
        resetForm();
        setMode('signin');
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : m.error_generic());
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google') => {
    setIsLoading(true);
    try {
      // Back to the page the listener came from, not to the sign-in page.
      await authApi.signInWithProvider(provider, `${window.location.origin}${backTo}`);
      // On success the browser navigates to the provider; keep loading state.
    } catch (err) {
      toastError(err instanceof Error ? err.message : m.error_oauth_failed());
      setIsLoading(false);
    }
  };

  const switchTo = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  return (
    <>
      <SiteHeader />
      <AuthView
        keepTitle={keepTitle}
        isListening={isListening}
        mode={mode}
        isLoading={isLoading}
        email={email}
        password={password}
        passwordConfirm={passwordConfirm}
        name={name}
        showPassword={showPassword}
        pendingEmail={pendingEmail}
        errors={errors}
        emailRef={emailRef}
        passwordRef={passwordRef}
        passwordConfirmRef={passwordConfirmRef}
        onDone={() => void navigate(backTo, { replace: true })}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        onOAuthGoogle={() => void handleOAuth('google')}
        onToggleShowPassword={() => setShowPassword((s) => !s)}
        onNameChange={(value) => setName(value)}
        onEmailChange={(value) => {
          setEmail(value);
          if (errors.email) setFieldError('email', validateEmailFormat(value));
        }}
        onEmailBlur={() => setFieldError('email', validateEmailFormat(email))}
        onPasswordChange={(value) => {
          setPassword(value);
          if (errors.password) {
            setFieldError('password', validatePasswordLength(value));
          }
          if (errors.passwordConfirm) {
            setFieldError('passwordConfirm', validatePasswordMatch(value, passwordConfirm));
          }
        }}
        onPasswordBlur={() => setFieldError('password', validatePasswordLength(password))}
        onPasswordConfirmChange={(value) => {
          setPasswordConfirm(value);
          if (errors.passwordConfirm) {
            setFieldError('passwordConfirm', validatePasswordMatch(password, value));
          }
        }}
        onPasswordConfirmBlur={() =>
          setFieldError('passwordConfirm', validatePasswordMatch(password, passwordConfirm))
        }
        onSwitchMode={switchTo}
      />
      <SiteFooter />
    </>
  );
}
