import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Violations the site had when this suite was written, so a new one fails the test while these
 * are fixed in their own PR. Each is named by its axe rule and a piece of the element's HTML
 * (axe's own selector there is a React id, which changes from page to page). An entry says why it
 * is here; the PR that fixes it removes it.
 */
const KNOWN: readonly { rule: string; html: string; why: string }[] = [
  {
    // shell/NowPlayingSheet.tsx: the phone's player bar, on every page but the home page. Its
    // visible words are « I’ll Be Around The Growlers », its name « Ouvrir « I’ll Be Around »,
    // The Growlers »: the words are not one run of the name (WCAG 2.5.3, Label in Name), so a
    // voice command saying what is written may miss it.
    rule: 'label-content-name-mismatch',
    html: 'aria-label="Ouvrir «',
    why: 'the sheet trigger’s name wraps the title in quotes and adds a comma',
  },
];

/** The impacts that fail a page: axe's two highest (github.com/dequelabs/axe-core, impact). */
const FAILING = new Set(['serious', 'critical']);

/** axe on the page as drawn: no serious or critical violation beyond KNOWN. */
export async function expectNoNewViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const found = violations
    .filter((violation) => FAILING.has(violation.impact ?? ''))
    .flatMap((violation) =>
      violation.nodes.map((node) => ({
        rule: violation.id,
        target: node.target.join(' '),
        html: node.html,
        summary: node.failureSummary ?? violation.help,
      }))
    )
    .filter((v) => !KNOWN.some((known) => known.rule === v.rule && v.html.includes(known.html)));
  expect(found).toEqual([]);
}
