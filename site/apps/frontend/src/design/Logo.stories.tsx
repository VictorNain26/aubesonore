import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo } from './Logo';

/**
 * At the header's size (shell/SiteHeader.tsx). The intro plays once per page load, whichever logo
 * asks first: reload the story to see it again.
 */
const meta = {
  title: 'Composants/Logo',
  component: Logo,
  args: { className: 'text-mark h-[0.839em]' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuRepos: Story = { name: 'Au repos' };

export const Intro: Story = { name: 'Son intro', args: { intro: true } };
