import { useShallow } from 'zustand/react/shallow';
import { isAirPlaySupported } from '../lib/cast/airplay';
import { useAirPlayStore } from '../stores/airplayStore';
import { useCastStore } from '../stores/castStore';

export interface Diffusion {
  kind: 'airplay' | 'chromecast';
  /** A device to cast to is on the network: the button opens the picker, not the help. */
  found: boolean;
  /** The device the stream plays on, while it does. */
  device: string | null;
  connecting: boolean;
  onOpen: () => void;
}

/**
 * How this browser casts: AirPlay in Safari, Chromecast in Chromium, nothing elsewhere (null),
 * where the button is not shown since it could lead nowhere.
 */
export function useDiffusion(): Diffusion | null {
  const airPlay = useAirPlayStore(
    useShallow((s) => ({ available: s.available, isActive: s.isActive, open: s.openPicker }))
  );
  const chromecast = useCastStore(
    useShallow((s) => ({
      supported: s.supported,
      available: s.available,
      connecting: s.connecting,
      deviceName: s.deviceName,
      open: s.openPicker,
    }))
  );

  if (chromecast.supported) {
    return {
      kind: 'chromecast',
      found: chromecast.available,
      device: chromecast.deviceName,
      connecting: chromecast.connecting,
      onOpen: chromecast.open,
    };
  }
  if (typeof window !== 'undefined' && isAirPlaySupported()) {
    return {
      kind: 'airplay',
      found: airPlay.available,
      device: airPlay.isActive ? 'AirPlay' : null,
      connecting: false,
      onOpen: airPlay.open,
    };
  }
  return null;
}
