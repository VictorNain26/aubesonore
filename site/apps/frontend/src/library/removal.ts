import { create } from 'zustand';
import { toast } from 'sonner';
import { toastError } from '../lib/appToast';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import * as m from '@/paraglide/messages.js';

const UNDO_MS = 5000;

/** The kept tracks hidden while their removal can still be undone. */
export const useRemovingTracks = create<{ ids: ReadonlySet<string> }>(() => ({ ids: new Set() }));

function setRemoving(id: string, on: boolean): void {
  useRemovingTracks.setState(({ ids }) => {
    const next = new Set(ids);
    if (on) next.add(id);
    else next.delete(id);
    return { ids: next };
  });
}

function commit(id: string): void {
  if (!useRemovingTracks.getState().ids.has(id)) return;
  setRemoving(id, false);
  void useLikedTracksStore
    .getState()
    .unlikeTrack(id)
    .then((removed) => {
      if (!removed) toastError(m.library_remove_failed());
    });
}

/**
 * Hides the track at once and removes it when the toast closes on its own or is swiped away;
 * its Annuler brings it back. The toast outlives the page, so leaving it keeps the removal.
 */
export function removeKeptTrack(id: string, title: string): void {
  setRemoving(id, true);
  toast(m.library_removed({ title }), {
    duration: UNDO_MS,
    action: { label: m.liked_track_undo(), onClick: () => setRemoving(id, false) },
    onAutoClose: () => commit(id),
    onDismiss: () => commit(id),
  });
}

// Closing the tab within the undo window still removes: the request is sent with keepalive.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const id of useRemovingTracks.getState().ids) commit(id);
  });
}
