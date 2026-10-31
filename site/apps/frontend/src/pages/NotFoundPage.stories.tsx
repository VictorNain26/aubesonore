import type { Meta, StoryObj } from '@storybook/react-vite';
import { signedOut } from '../stories/account';
import { NotFoundPage } from './NotFoundPage';

const meta = {
  title: 'Pages/404',
  component: NotFoundPage,
  beforeEach: signedOut,
} satisfies Meta<typeof NotFoundPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Introuvable: Story = { name: 'Page introuvable' };
