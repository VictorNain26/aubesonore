import type { ArtistFacts } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';

/** The words for an artist's kind; a character, an "other" or no type has none. */
export const KIND_LABELS: Record<NonNullable<ArtistFacts['kind']>, () => string> = {
  person: () => m.artist_kind_person(),
  group: () => m.artist_kind_group(),
  orchestra: () => m.artist_kind_orchestra(),
  choir: () => m.artist_kind_choir(),
};
