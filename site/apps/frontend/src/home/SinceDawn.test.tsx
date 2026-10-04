// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SinceDawnView, type ThreadRow } from './SinceDawn';

function rows(count: number): ThreadRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    playedAt: Math.floor(new Date(2026, 9, 1, 17, 0).getTime() / 1000) - i * 240,
    title: `Titre ${i + 1}`,
    artist: `Artiste ${i + 1}`,
    art: null,
    isNow: i === 0,
    isKept: false,
    isKeeping: false,
  }));
}

describe('SinceDawnView', () => {
  it('shows ten tracks, then ten more on "Plus tôt dans la journée"', async () => {
    render(<SinceDawnView rows={rows(15)} status="ready" onToggleKeep={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'Plus tôt dans la journée' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(15);
    expect(
      screen.queryByRole('button', { name: 'Plus tôt dans la journée' })
    ).not.toBeInTheDocument();
  });

  it('marks the track on air', () => {
    render(<SinceDawnView rows={rows(2)} status="ready" onToggleKeep={vi.fn()} />);

    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent("● À l'antenne : 17:00");
    expect(second).not.toHaveTextContent('●');
  });

  it('keeps a track by its id', async () => {
    const onToggleKeep = vi.fn();
    render(<SinceDawnView rows={rows(3)} status="ready" onToggleKeep={onToggleKeep} />);

    await userEvent.click(screen.getByRole('button', { name: 'Garder « Titre 2 »' }));
    expect(onToggleKeep).toHaveBeenCalledWith(2);
  });

  it('tells apart an empty day from an unavailable history', () => {
    const { rerender } = render(<SinceDawnView rows={[]} status="ready" onToggleKeep={vi.fn()} />);
    expect(screen.getByText("Rien encore aujourd'hui.")).toBeInTheDocument();

    rerender(<SinceDawnView rows={[]} status="error" onToggleKeep={vi.fn()} />);
    expect(screen.getByText("Le fil est indisponible pour l'instant.")).toBeInTheDocument();
  });

  it('lets a track that joins the thread slide in, but not the ones already there', () => {
    const first = rows(3).map((r) => ({ ...r, id: r.id + 1 }));
    const { rerender } = render(
      <SinceDawnView rows={first} status="ready" onToggleKeep={vi.fn()} />
    );
    screen.getAllByRole('listitem').forEach((li) => expect(li).not.toHaveClass('thread-in'));

    rerender(<SinceDawnView rows={[...rows(1), ...first]} status="ready" onToggleKeep={vi.fn()} />);
    const [arrived, ...others] = screen.getAllByRole('listitem');
    expect(arrived).toHaveClass('thread-in');
    others.forEach((li) => expect(li).not.toHaveClass('thread-in'));
  });
});
