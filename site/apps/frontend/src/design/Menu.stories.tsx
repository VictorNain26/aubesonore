import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { themeOptions } from '../shell/ThemeSwitch';
import { EXAMPLE_USER } from '../stories/components';
import { Button } from './Button';
import { Menu } from './Menu';
import * as m from '@/paraglide/messages.js';

/**
 * The account menu's parts (shell/SiteHeader.tsx), opened by each story's `play` as a click would;
 * the words read as the story renders.
 */
function Account({
  withHeader = false,
  withChoice = false,
  signOutDisabled = false,
  onSelect,
}: {
  withHeader?: boolean;
  withChoice?: boolean;
  signOutDisabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Menu
      trigger={<Button variant="ghost">{m.account_label()}</Button>}
      header={withHeader ? EXAMPLE_USER.email : undefined}
      {...(withChoice
        ? {
            choice: {
              label: m.theme_label(),
              value: 'system',
              options: themeOptions(),
              onChange: onSelect,
            },
          }
        : {})}
      items={[{ label: m.library_sign_out(), onSelect, disabled: signOutDisabled }]}
    />
  );
}

const meta = {
  title: 'Composants/Menu',
  component: Account,
  args: { onSelect: fn() },
  parameters: { layout: 'padded' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: m.account_label() }));
  },
} satisfies Meta<typeof Account>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UneAction: Story = { name: 'Une action' };

export const EnTeteEtChoix: Story = {
  name: 'Un en-tête et un choix',
  args: { withHeader: true, withChoice: true },
};

export const ActionDesactivee: Story = {
  name: 'Action désactivée',
  args: { signOutDisabled: true },
};
