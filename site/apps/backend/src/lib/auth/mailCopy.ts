import type { SiteLocale } from '@aubesonore/shared-types/client';

export type MailKind = 'verify' | 'reset';

export interface MailCopy {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  button: string;
  ignore: string;
  footer: string;
}

const FOOTER: Record<SiteLocale, string> = {
  fr: 'AubeSonore, webradio de découverte non commerciale · aubesonore.fr',
  en: 'AubeSonore, a non-commercial discovery web radio · aubesonore.fr',
};

const COPY: Record<MailKind, Record<SiteLocale, Omit<MailCopy, 'footer'>>> = {
  verify: {
    fr: {
      subject: 'Confirmez votre adresse e-mail',
      preheader: 'Un clic pour activer votre compte AubeSonore.',
      heading: 'Bienvenue à l’écoute.',
      body: 'Un clic sur le bouton active votre compte\u00a0: vos titres gardés vous attendront dans «\u00a0Mes titres\u00a0». Le lien est valable 24 heures.',
      button: 'Confirmer mon adresse',
      ignore: 'Vous n’avez pas créé de compte\u00a0? Ignorez cet e-mail, rien ne se passera.',
    },
    en: {
      subject: 'Confirm your email address',
      preheader: 'One click to activate your AubeSonore account.',
      heading: 'Welcome, listener.',
      body: 'One click on the button activates your account: your kept tracks will wait for you in “My tracks”. The link is valid for 24 hours.',
      button: 'Confirm my address',
      ignore: 'You didn’t create an account? Ignore this email, nothing will happen.',
    },
  },
  reset: {
    fr: {
      subject: 'Choisissez un nouveau mot de passe',
      preheader: 'Le lien pour choisir un nouveau mot de passe AubeSonore.',
      heading: 'Un nouveau mot de passe',
      body: 'Le bouton ouvre la page où choisir un nouveau mot de passe. Le lien est valable une heure.',
      button: 'Choisir un mot de passe',
      ignore:
        'Vous n’avez rien demandé\u00a0? Ignorez cet e-mail\u00a0: votre mot de passe ne change pas.',
    },
    en: {
      subject: 'Choose a new password',
      preheader: 'The link to choose a new AubeSonore password.',
      heading: 'A new password',
      body: 'The button opens the page where you choose a new password. The link is valid for one hour.',
      button: 'Choose a password',
      ignore: 'You didn’t ask for this? Ignore this email: your password stays the same.',
    },
  },
};

export function mailCopy(kind: MailKind, locale: SiteLocale): MailCopy {
  return { ...COPY[kind][locale], footer: FOOTER[locale] };
}
