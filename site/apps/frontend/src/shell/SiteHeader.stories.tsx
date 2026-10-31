import type { Meta, StoryObj } from '@storybook/react-vite';
import { account } from '../stories/components';
import { SiteHeader } from './SiteHeader';
import * as m from '@/paraglide/messages.js';

/** The account store seeded by each story (stories/components.ts, `account`), reset after. */
const meta = {
  title: 'Coque/SiteHeader',
  component: SiteHeader,
  beforeEach: account('guest'),
} satisfies Meta<typeof SiteHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Invite: Story = { name: 'Sans compte' };

export const Connecte: Story = { name: 'Connecté', beforeEach: account('signed-in') };

/** The session still being read: a blank in the account's place. */
export const Chargement: Story = { name: 'Session en lecture', beforeEach: account('loading') };

export const MenuDuCompte: Story = {
  name: 'Connecté, le menu du compte ouvert',
  beforeEach: account('signed-in'),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: m.account_label() }));
  },
};

/** The home page's header: the station's line beside the name, as the page's heading. */
export const Accueil: Story = { name: 'Accueil', args: { tagline: true } };

/** The pages in a menu (Coque/MobileMenu). */
export const Telephone: Story = {
  name: 'Téléphone',
  args: { tagline: true },
  globals: { viewport: { value: 'w390' } },
};
