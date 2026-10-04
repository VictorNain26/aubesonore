import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareTrack, getRadioShareUrl } from './shareTrack';
import { API_BASE_URL } from '../utils/config';

const input = {
  title: 'Balance Act',
  artist: 'Psychic Lines',
  url: 'https://aubesonore.fr',
};

afterEach(() => vi.unstubAllGlobals());

describe('shareTrack', () => {
  it('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await expect(shareTrack(input)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'AubeSonore',
      text: '« Balance Act », Psychic Lines, entendu sur AubeSonore',
      url: 'https://aubesonore.fr',
    });
  });

  it('falls back to clipboard when share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareTrack(input)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(
      '« Balance Act », Psychic Lines, entendu sur AubeSonore https://aubesonore.fr'
    );
  });

  it('treats user-cancelled share as shared (no fallback)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    await expect(shareTrack(input)).resolves.toBe('shared');
  });
});

describe('getRadioShareUrl', () => {
  it('builds the /t share URL with artist and title params', () => {
    expect(getRadioShareUrl('Balance Act', 'Psychic Lines')).toBe(
      `${API_BASE_URL}/t?artist=Psychic%20Lines&title=Balance%20Act`
    );
  });

  it('encodes slashes in the artist name', () => {
    expect(getRadioShareUrl('Back in Black', 'AC/DC')).toBe(
      `${API_BASE_URL}/t?artist=AC%2FDC&title=Back%20in%20Black`
    );
  });

  it('encodes spaces in both params', () => {
    expect(getRadioShareUrl('La Vie En Rose', 'Édith Piaf')).toBe(
      `${API_BASE_URL}/t?artist=${encodeURIComponent('Édith Piaf')}&title=La%20Vie%20En%20Rose`
    );
  });
});
