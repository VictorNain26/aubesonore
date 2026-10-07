import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import { Elysia, t } from 'elysia';
import { logger } from './logger';
import { requestLog } from './requestLog';

const app = new Elysia()
  .use(requestLog)
  .get('/ok', () => ({ ok: true }))
  .get('/artist/:slug', ({ status }) => status(404, { error: 'unknown artist' }))
  .get('/old', ({ set }) => {
    set.status = 301;
    set.headers.location = '/new';
  })
  .get('/redirect', ({ redirect }) => redirect('/new', 302))
  .get('/boom', () => {
    throw new Error('boom');
  })
  .post('/body', ({ body }) => body, { body: t.Object({ name: t.String() }) });

const info = spyOn(logger, 'info');

afterAll(() => info.mockRestore());

async function logged(
  path: string,
  init?: RequestInit
): Promise<{ status: number; line: unknown }> {
  info.mockClear();
  const res = await app.handle(new Request(`http://localhost${path}`, init));
  // onAfterResponse runs once the response is out, on the next turn.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const http = info.mock.calls.filter(([msg]) => msg === 'http');
  expect(http).toHaveLength(1);
  return { status: res.status, line: http[0]?.[1] };
}

describe('requestLog', () => {
  it('logs the status the client received, with the matched route', async () => {
    expect(await logged('/ok')).toEqual({
      status: 200,
      line: expect.objectContaining({ method: 'GET', path: '/ok', route: '/ok', status: 200 }),
    });
    expect(await logged('/artist/nobody')).toEqual({
      status: 404,
      line: expect.objectContaining({
        path: '/artist/nobody',
        route: '/artist/:slug',
        status: 404,
      }),
    });
    expect(await logged('/old')).toMatchObject({ status: 301, line: { status: 301 } });
    expect(await logged('/redirect')).toMatchObject({ status: 302, line: { status: 302 } });
  });

  it('logs errors, failed validations and unknown paths too', async () => {
    expect(await logged('/boom')).toMatchObject({
      status: 500,
      line: { route: '/boom', status: 500 },
    });
    expect(
      await logged('/body', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      })
    ).toMatchObject({ status: 422, line: { route: '/body', status: 422 } });
    const unknown = await logged('/nowhere');
    expect(unknown).toMatchObject({ status: 404, line: { path: '/nowhere', status: 404 } });
    expect(unknown.line).not.toHaveProperty('route', expect.anything());
  });

  it('times each request and keeps the query string out of the log', async () => {
    const { line } = await logged('/ok?token=secret');
    expect(line).toMatchObject({ path: '/ok' });
    expect(typeof (line as { durationMs?: unknown }).durationMs).toBe('number');
    expect(JSON.stringify(line)).not.toContain('secret');
  });
});
