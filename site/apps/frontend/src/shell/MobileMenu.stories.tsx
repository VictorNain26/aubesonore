import type { Meta, StoryObj } from '@storybook/react-vite';
import { account } from '../stories/components';
import { MobileMenu } from './MobileMenu';
import * as m from '@/paraglide/messages.js';

/** The account store seeded by each story (stories/components.ts, `account`), reset after. */
const meta = {
  title: 'Coque/MobileMenu',
  component: MobileMenu,
  beforeEach: account('guest'),
  globals: { viewport: { value: 'w390' } },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MobileMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened as a tap on Menu would. */
const open: Story['play'] = async ({ canvas, userEvent }) => {
  await userEvent.click(await canvas.findByRole('button', { name: m.menu_open() }));
};

export const Ferme: Story = { name: 'Fermé' };

export const Invite: Story = { name: 'Ouvert, sans compte', play: open };

export const Connecte: Story = {
  name: 'Ouvert, connecté',
  beforeEach: account('signed-in'),
  play: open,
};
