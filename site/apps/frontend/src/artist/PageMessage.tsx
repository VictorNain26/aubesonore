import { Link } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../home/SiteHeader';
import { BACK_TO_LIVE } from '../home/styles';

/** A page's whole answer when it has nothing else to show: a title, a sentence, the way back. */
export function PageMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="lift-in px-page flex flex-1 flex-col justify-center gap-3 py-16">
      <h1 className="text-hero m-0">{title}</h1>
      <p className="text-intro text-text-muted max-w-blurb m-0">{body}</p>
      <p className="m-0 mt-6">
        <Link to={localizeHref('/')} className={BACK_TO_LIVE}>
          {m.artist_back()}
        </Link>
      </p>
    </div>
  );
}

/**
 * A page whose code failed to load. Kept apart from the artist page, which App renders it for:
 * importing that page here would pull Musilogy into the main chunk.
 */
export function PageError() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <SiteHeader />
      <PageMessage title={m.artist_error_title()} body={m.artist_error_body()} />
    </main>
  );
}
