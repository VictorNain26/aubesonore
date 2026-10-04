// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type AudioListener = (e?: Event) => void;

class MockAudio {
  src = '';
  paused = true;
  volume = 1;
  preload = 'none';
  crossOrigin = 'anonymous';
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  setAttribute = vi.fn();
  private listeners: Record<string, AudioListener[]> = {};
  addEventListener = vi.fn((event: string, cb: AudioListener) => {
    (this.listeners[event] ??= []).push(cb);
  });
  emit(event: string) {
    (this.listeners[event] ?? []).forEach((cb) => cb());
  }
}

class MockAudioContext {
  state: AudioContextState = 'running';
  destination = {};
  analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 64,
    connect: vi.fn(),
    getByteFrequencyData: vi.fn(),
  };
  sourceNode = { connect: vi.fn() };
  currentTime = 0;
  gain = {
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  createGain = vi.fn(() => this.gain);
  createAnalyser = vi.fn(() => this.analyser);
  createMediaElementSource = vi.fn(() => this.sourceNode);
  resume = vi.fn().mockResolvedValue(undefined);
}

let mockAudioInstance: MockAudio;

beforeEach(() => {
  vi.resetModules();
  mockAudioInstance = new MockAudio();
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function () {
      return mockAudioInstance;
    })
  );
  vi.stubGlobal(
    'AudioContext',
    vi.fn().mockImplementation(function () {
      return new MockAudioContext();
    })
  );
  // Default to a non-iOS environment; iOS-specific tests re-stub this.
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126',
    maxTouchPoints: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('player store', () => {
  it('sets isPlaying true on successful play()', async () => {
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    expect(usePlayer.getState().isPlaying).toBe(true);
    expect(usePlayer.getState().playError).toBeNull();
  });

  it('play() routes audio through a Web Audio analyser on non-iOS platforms', async () => {
    // The antenna waveform reads real frequency data from this graph.
    const AudioContextSpy = vi.fn().mockImplementation(function () {
      return new MockAudioContext();
    });
    vi.stubGlobal('AudioContext', AudioContextSpy);
    const { usePlayer, getAnalyser } = await import('./player');
    await usePlayer.getState().play();
    expect(usePlayer.getState().isPlaying).toBe(true);
    expect(AudioContextSpy).toHaveBeenCalledOnce();
    const analyser = getAnalyser();
    expect(analyser).not.toBeNull();
    expect(analyser?.fftSize).toBe(512);
  });

  it('play() never routes audio through Web Audio on iOS (keeps lock-screen playback alive)', async () => {
    // Regression guard for the locked-screen silence bug: routing the stream
    // through createMediaElementSource makes the AudioContext the sole output,
    // and iOS suspends it seconds after lock (WebKit #231105). On iOS the
    // player must stay on the bare <audio> element.
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    });
    const AudioContextSpy = vi.fn().mockImplementation(function () {
      return new MockAudioContext();
    });
    vi.stubGlobal('AudioContext', AudioContextSpy);
    const { usePlayer, getAnalyser } = await import('./player');
    await usePlayer.getState().play();
    expect(usePlayer.getState().isPlaying).toBe(true);
    expect(AudioContextSpy).not.toHaveBeenCalled();
    expect(getAnalyser()).toBeNull();
  });

  it('detects iPadOS (Macintosh UA with touch) as iOS', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    });
    const AudioContextSpy = vi.fn().mockImplementation(function () {
      return new MockAudioContext();
    });
    vi.stubGlobal('AudioContext', AudioContextSpy);
    const { usePlayer, getAnalyser } = await import('./player');
    await usePlayer.getState().play();
    expect(AudioContextSpy).not.toHaveBeenCalled();
    expect(getAnalyser()).toBeNull();
  });

  it('does NOT set playError on AbortError (double-click race)', async () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    mockAudioInstance.play.mockRejectedValueOnce(abort);
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    expect(usePlayer.getState().isPlaying).toBe(false);
    expect(usePlayer.getState().playError).toBeNull();
  });

  it('sets playError on network failure', async () => {
    mockAudioInstance.play.mockRejectedValueOnce(new Error('Network down'));
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    const err = usePlayer.getState().playError;
    expect(err?.message).toContain('Network down');
  });

  it('is connecting between the click and the first sound', async () => {
    let resolvePlay: () => void = () => {};
    mockAudioInstance.play.mockReturnValueOnce(new Promise<void>((r) => (resolvePlay = r)));
    const { usePlayer } = await import('./player');

    const playing = usePlayer.getState().play();
    expect(usePlayer.getState().isConnecting).toBe(true);
    expect(usePlayer.getState().isPlaying).toBe(false);

    resolvePlay();
    await playing;
    expect(usePlayer.getState().isConnecting).toBe(false);
    expect(usePlayer.getState().isPlaying).toBe(true);
  });

  it('toggle() while connecting cancels, and the late resolve does not start playing', async () => {
    let resolvePlay: () => void = () => {};
    mockAudioInstance.play.mockReturnValueOnce(new Promise<void>((r) => (resolvePlay = r)));
    const { usePlayer } = await import('./player');

    usePlayer.getState().toggle();
    expect(usePlayer.getState().isConnecting).toBe(true);
    usePlayer.getState().toggle();
    expect(usePlayer.getState().isConnecting).toBe(false);

    resolvePlay();
    await Promise.resolve();
    await Promise.resolve();
    expect(usePlayer.getState().isPlaying).toBe(false);
  });

  it('stop() clears isPlaying and playError', async () => {
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    usePlayer.getState().stop();
    expect(usePlayer.getState().isPlaying).toBe(false);
    expect(usePlayer.getState().playError).toBeNull();
  });

  it('fades the sound in on play, and out before cutting the stream on stop', async () => {
    const context = new MockAudioContext();
    vi.stubGlobal(
      'AudioContext',
      vi.fn().mockImplementation(function () {
        return context;
      })
    );
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.6);

    usePlayer.getState().stop();
    expect(usePlayer.getState().isPlaying).toBe(false);
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.4);
    expect(mockAudioInstance.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(mockAudioInstance.pause).toHaveBeenCalledOnce();
    expect(mockAudioInstance.src).toBe('');
  });

  it('keeps the stream when play comes back during the fade-out', async () => {
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    usePlayer.getState().stop();
    await usePlayer.getState().play();
    vi.advanceTimersByTime(400);
    expect(mockAudioInstance.pause).not.toHaveBeenCalled();
    expect(usePlayer.getState().isPlaying).toBe(true);
  });

  it('setVolume clamps to [0, 1]', async () => {
    const { usePlayer } = await import('./player');
    usePlayer.getState().setVolume(1.5);
    expect(usePlayer.getState().volume).toBe(1);
    usePlayer.getState().setVolume(-0.5);
    expect(usePlayer.getState().volume).toBe(0);
  });

  it('toggleMute restores the pre-mute volume', async () => {
    const { usePlayer } = await import('./player');
    usePlayer.getState().setVolume(0.4);
    usePlayer.getState().toggleMute();
    expect(usePlayer.getState().volume).toBe(0);
    usePlayer.getState().toggleMute();
    expect(usePlayer.getState().volume).toBe(0.4);
  });

  it('toggleMute falls back to 0.5 when the pre-mute volume was 0', async () => {
    const { usePlayer } = await import('./player');
    usePlayer.getState().setVolume(0);
    expect(usePlayer.getState().isMuted).toBe(true);
    usePlayer.getState().toggleMute();
    expect(usePlayer.getState().volume).toBe(0.5);
    expect(usePlayer.getState().isMuted).toBe(false);
  });

  it('dragging the slider up after a mute clears isMuted', async () => {
    const { usePlayer } = await import('./player');
    usePlayer.getState().setVolume(0.8);
    usePlayer.getState().toggleMute();
    usePlayer.getState().setVolume(0.5);
    expect(usePlayer.getState().isMuted).toBe(false);
    expect(usePlayer.getState().volume).toBe(0.5);
  });

  it('keeps the last audible level for the next visit, never a mute', async () => {
    const { usePlayer } = await import('./player');
    usePlayer.getState().setVolume(0.6);
    usePlayer.getState().toggleMute();
    expect(usePlayer.getState().volume).toBe(0);

    usePlayer.getState().restoreVolume();
    expect(usePlayer.getState().volume).toBe(0.6);
    expect(usePlayer.getState().isMuted).toBe(false);
  });

  it('starts at full volume over a 0 an older version saved', async () => {
    localStorage.setItem('aubesonore_volume', '0');
    const { usePlayer } = await import('./player');
    usePlayer.getState().restoreVolume();
    expect(usePlayer.getState().volume).toBe(1);
  });
});

describe('player resilience (stream auto-recovery)', () => {
  it("reconnects when the live stream emits 'ended'", async () => {
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    const callsBefore = mockAudioInstance.play.mock.calls.length;
    mockAudioInstance.emit('ended');
    // First backoff slot is 500ms
    await vi.advanceTimersByTimeAsync(600);
    expect(mockAudioInstance.play.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("reconnects when the audio element emits 'error'", async () => {
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    const callsBefore = mockAudioInstance.play.mock.calls.length;
    mockAudioInstance.emit('error');
    await vi.advanceTimersByTimeAsync(600);
    expect(mockAudioInstance.play.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("forces reconnect after sustained 'waiting' (>1.5s without 'playing')", async () => {
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    const callsBefore = mockAudioInstance.play.mock.calls.length;
    mockAudioInstance.emit('waiting');
    // Grace period 1.5s + first backoff 500ms = 2s
    await vi.advanceTimersByTimeAsync(2_100);
    expect(mockAudioInstance.play.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("does NOT reconnect if 'playing' fires before the stall timer", async () => {
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    const callsBefore = mockAudioInstance.play.mock.calls.length;
    mockAudioInstance.emit('waiting');
    await vi.advanceTimersByTimeAsync(500); // mid-grace
    mockAudioInstance.emit('playing'); // buffer refilled
    await vi.advanceTimersByTimeAsync(3_000); // way past where reconnect would have fired
    expect(mockAudioInstance.play.mock.calls.length).toBe(callsBefore);
  });

  it('stop() cancels pending auto-recovery', async () => {
    vi.useFakeTimers();
    const { usePlayer } = await import('./player');
    await usePlayer.getState().play();
    const callsBefore = mockAudioInstance.play.mock.calls.length;
    mockAudioInstance.emit('ended');
    usePlayer.getState().stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockAudioInstance.play.mock.calls.length).toBe(callsBefore);
  });
});
