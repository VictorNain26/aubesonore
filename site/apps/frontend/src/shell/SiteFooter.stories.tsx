import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SiteFooterView } from './SiteFooter';

const meta = {
  title: 'Coque/SiteFooter',
  component: SiteFooterView,
  args: {
    locale: 'fr',
    languageHrefs: { fr: '/', en: '/en/' },
    onLocaleChange: fn(),
    theme: 'system',
    onThemeChange: fn(),
    onInstall: null,
  },
} satisfies Meta<typeof SiteFooterView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnFrancais: Story = { name: 'En français' };

/** The page in English, through the toolbar's « Langue » too. */
export const EnAnglais: Story = {
  name: 'En anglais',
  args: { locale: 'en' },
  globals: { locale: 'en' },
};

/** The browser can install the site (its install prompt came): the footer offers it. */
export const Installable: Story = { name: 'Installable', args: { onInstall: fn() } };

/** The night chosen, the page drawn in it through the toolbar's « Ciel » too. */
export const Nuit: Story = {
  name: 'La nuit choisie',
  args: { theme: 'dark' },
  globals: { theme: 'dark' },
};

export const Telephone: Story = {
  name: 'Téléphone',
  globals: { viewport: { value: 'w390' } },
};
