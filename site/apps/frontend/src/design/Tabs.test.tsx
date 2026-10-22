// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from './Tabs';

const TABS = [
  { id: 'a', label: 'Même son', panel: <p>Cassius</p> },
  { id: 'b', label: 'Écoutés ensemble', panel: <p>Justice</p> },
  { id: 'c', label: 'Filiation', panel: <p>Pharrell</p> },
];

function Holder() {
  const [selected, setSelected] = useState('a');
  return <Tabs label="Artistes proches" tabs={TABS} selected={selected} onSelect={setSelected} />;
}

describe('Tabs', () => {
  it('shows the selected panel, labelled by its tab, the others hidden', () => {
    render(<Holder />);

    expect(screen.getByRole('tablist', { name: 'Artistes proches' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Même son' })).toHaveTextContent('Cassius');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    // The hidden panels stay in the page, with their links.
    expect(screen.getByText('Justice')).not.toBeVisible();
  });

  it('puts one tab in the Tab order and moves between them with the arrows, Home and End', async () => {
    const user = userEvent.setup();
    render(<Holder />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Même son' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Écoutés ensemble' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Écoutés ensemble' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Justice');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Filiation' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Même son' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Filiation' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Même son' })).toHaveFocus();

    // Tab leaves the tabs for the panel.
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('opens a panel on a click', async () => {
    const user = userEvent.setup();
    render(<Holder />);

    await user.click(screen.getByRole('tab', { name: 'Filiation' }));

    expect(screen.getByRole('tabpanel', { name: 'Filiation' })).toHaveTextContent('Pharrell');
  });
});
