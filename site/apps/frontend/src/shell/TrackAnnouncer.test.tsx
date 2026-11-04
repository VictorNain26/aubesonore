// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackAnnouncer } from './TrackAnnouncer';

const mimoun = { id: 1, title: 'Mimoun', artist: 'Mickey 3D' };
const respire = { id: 2, title: 'Respire', artist: 'Mickey 3D' };

describe('TrackAnnouncer', () => {
  it('says nothing when the station corrects the title of the same play', () => {
    const { rerender } = render(<TrackAnnouncer track={mimoun} />);
    rerender(<TrackAnnouncer track={{ ...mimoun, title: 'Mimoun (Remastered)' }} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces the next track to screen readers, not the one the page opened on', () => {
    const { rerender } = render(<TrackAnnouncer track={mimoun} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    rerender(<TrackAnnouncer track={respire} />);
    expect(region.textContent).toBe('En direct\u00a0: Respire, Mickey 3D');
  });

  it('waits for a first track when the page opens before the live answers', () => {
    const { rerender } = render(<TrackAnnouncer track={null} />);
    rerender(<TrackAnnouncer track={mimoun} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    rerender(<TrackAnnouncer track={respire} />);
    expect(screen.getByRole('status').textContent).toBe('En direct\u00a0: Respire, Mickey 3D');
  });

  it('says nothing new while off air, and the track again when it comes back', () => {
    const { rerender } = render(<TrackAnnouncer track={mimoun} />);
    rerender(<TrackAnnouncer track={respire} />);
    rerender(<TrackAnnouncer track={null} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    rerender(<TrackAnnouncer track={mimoun} />);
    expect(screen.getByRole('status').textContent).toBe('En direct\u00a0: Mimoun, Mickey 3D');
  });
});
