import { describe, it, expect, spyOn, afterEach } from 'bun:test';
// Real Wikidata and Commons answers (2026-10-11): Can's photo, its author a
// plain name; Stereolab's, its author a Flickr link; Neu!, no image.
import imageinfoCan from './__fixtures__/commons-imageinfo-can.json';
import imageinfoStereolab from './__fixtures__/commons-imageinfo-stereolab.json';
import p18Can from './__fixtures__/wikidata-p18-can.json';
import p18None from './__fixtures__/wikidata-p18-none.json';

const { getPhoto, plainText, commonsCache } = await import('./commonsService');

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore?.();
  commonsCache.dispose();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

/** Answers each upstream with its fixture, and records what was asked. */
function serve(wikidata: unknown, commons: unknown) {
  return spyOn(globalThis, 'fetch').mockImplementation(((input: string) => {
    if (input.startsWith(WIKIDATA)) return Promise.resolve(json(wikidata));
    if (input.startsWith(COMMONS)) return Promise.resolve(json(commons));
    return Promise.resolve(json({}, 404));
  }) as typeof fetch);
}

describe('getPhoto', () => {
  it("gives the item's photo with what its licence asks to credit", async () => {
    const fetchSpy = serve(p18Can, imageinfoCan);

    const photo = await getPhoto('Q170132');

    if (photo.status !== 'found') throw new Error(`expected a photo, got ${photo.status}`);
    expect(photo.value.url).toContain('upload.wikimedia.org/wikipedia/commons/6/61/Can_1972');
    expect([photo.value.width, photo.value.height]).toEqual([1280, 850]);
    expect(photo.value.credit).toEqual({
      author: 'Heinrich Klaffs',
      licence: 'CC BY-SA 2.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      source:
        'https://commons.wikimedia.org/wiki/File:Can_1972_(Heinrich_Klaffs_Collection_102).jpg',
    });
    const commonsUrl = fetchSpy.mock.calls.map(([url]) => url as string)[1];
    // A standard width: Wikimedia serves no other to a hotlink.
    expect(commonsUrl).toContain('iiurlwidth=1280');
    expect(commonsUrl).toContain(
      encodeURIComponent('File:Can 1972 (Heinrich Klaffs Collection 102).jpg')
    );
  });

  it('names the author in words when Commons gives a link to their page', async () => {
    serve(p18Can, imageinfoStereolab);

    const photo = await getPhoto('Q334652');

    expect(photo.status === 'found' && photo.value.credit.author).toBe(
      'Greg Neate from Sussex, UK'
    );
  });

  it('knows no photo for an item without an image, and asks Commons nothing', async () => {
    const fetchSpy = serve(p18None, imageinfoCan);

    expect(await getPhoto('Q181874')).toEqual({ status: 'none' });
    expect(await getPhoto('Q181874')).toEqual({ status: 'none' });
    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it('never takes a deprecated image, and prefers the preferred one', async () => {
    const statement = (file: string, rank: string) => ({
      rank,
      mainsnak: { datavalue: { value: file } },
    });
    const fetchSpy = serve(
      {
        claims: {
          P18: [
            statement('Old.jpg', 'deprecated'),
            statement('Normal.jpg', 'normal'),
            statement('Best.jpg', 'preferred'),
          ],
        },
      },
      imageinfoCan
    );

    await getPhoto('Q1');

    expect(fetchSpy.mock.calls[1]?.[0]).toContain(encodeURIComponent('File:Best.jpg'));
  });

  it('links a licence only on its own site: the file page that names it is open to anyone', async () => {
    const page = imageinfoCan.query.pages[0]!;
    const info = page.imageinfo[0]!;
    const licensedAt = (value: string) => ({
      query: {
        pages: [
          {
            ...page,
            imageinfo: [{ ...info, extmetadata: { ...info.extmetadata, LicenseUrl: { value } } }],
          },
        ],
      },
    });

    serve(p18Can, licensedAt('https://evil.example/licence'));
    const elsewhere = await getPhoto('Q170132');
    expect(elsewhere.status === 'found' && elsewhere.value.credit).toMatchObject({
      licence: 'CC BY-SA 2.0',
      licenceUrl: null,
    });

    commonsCache.dispose();
    serve(p18Can, licensedAt('//creativecommons.org/licenses/by-sa/2.0/'));
    const protocolRelative = await getPhoto('Q170132');
    expect(protocolRelative.status === 'found' && protocolRelative.value.credit.licenceUrl).toBe(
      'https://creativecommons.org/licenses/by-sa/2.0/'
    );
  });

  it('shows no photo it could not credit', async () => {
    const page = imageinfoCan.query.pages[0]!;
    const info = page.imageinfo[0]!;
    serve(p18Can, {
      query: {
        pages: [
          { ...page, imageinfo: [{ ...info, extmetadata: { Artist: info.extmetadata.Artist } }] },
        ],
      },
    });

    expect(await getPhoto('Q170132')).toEqual({ status: 'none' });
  });

  it('retries after a failure, never stored as "no photo"', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 503));

    expect(await getPhoto('Q170132')).toEqual({ status: 'failed' });
    expect(await getPhoto('Q170132')).toEqual({ status: 'failed' });
    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});

describe('plainText', () => {
  it('keeps the words of an HTML author, entities decoded', () => {
    expect(plainText('<a href="//commons.wikimedia.org/wiki/User:X">X</a> &amp; Y&#39;s')).toBe(
      "X & Y's"
    );
    expect(plainText('Bj&#xF6;rk&nbsp;Gu&eth;mundsd&#243;ttir')).toBe('Björk Gu&eth;mundsdóttir');
  });

  it('drops a character reference Unicode does not have, rather than fail', () => {
    expect(plainText('A&#1114112;B&#x110000;C')).toBe('ABC');
  });
});
