import { create } from 'zustand';
import {
  isAirPlaySupported,
  showAirPlayPicker,
  onAirPlayAvailabilityChanged,
  onAirPlayConnectionChanged,
} from '../lib/cast/airplay';
import { getAudioElement } from '../lib/player';

interface AirPlayStore {
  /** Set by initialize, in an effect: the server, and the first render, know no browser. */
  supported: boolean;
  available: boolean;
  isActive: boolean;
  initialize: () => void;
  openPicker: () => void;
}

let initialized = false;

export const useAirPlayStore = create<AirPlayStore>((set) => ({
  supported: false,
  available: false,
  isActive: false,
  initialize: () => {
    if (initialized || !isAirPlaySupported()) return;
    initialized = true;
    set({ supported: true });
    const audio = getAudioElement();
    onAirPlayAvailabilityChanged(audio, (available) => set({ available }));
    onAirPlayConnectionChanged(audio, (isWireless) => set({ isActive: isWireless }));
  },
  openPicker: () => {
    showAirPlayPicker(getAudioElement());
  },
}));
