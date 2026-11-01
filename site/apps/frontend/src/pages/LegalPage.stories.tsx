import type { Meta, StoryObj } from '@storybook/react-vite';
import { signedOut } from '../stories/account';
import { LegalPage } from './LegalPage';

const meta = {
  title: 'Pages/Mentions légales',
  component: LegalPage,
  beforeEach: signedOut,
} satisfies Meta<typeof LegalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LaPage: Story = { name: 'La page' };
