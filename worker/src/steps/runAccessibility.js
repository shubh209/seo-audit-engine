import { createRequire } from 'module';
import { getBrowser } from '../browser.js';

const require = createRequire(import.meta.url);

const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  resultTypes: ['violations', 'passes'],
  iframes: false
};

export const formatAxeResults = (results) => ({
  violations: results.violations.map(v => ({
    id: v.id,
    severity: v.impact,
    description: v.description,
    affectedElements: v.nodes.length,
    helpUrl: v.helpUrl
  })),
  passes: results.passes.length,
  score: Math.max(0, 100 - (results.violations.length * 10))
});

/** Run axe on an already-loaded Playwright page (fastest path — no setContent). */
export const runAxeOnPage = async (page) => {
  await page.addScriptTag({
    path: require.resolve('axe-core/axe.min.js')
  });

  const results = await page.evaluate(async (options) => {
    return await axe.run(document, options);
  }, AXE_OPTIONS);

  return formatAxeResults(results);
};

/** Fallback: run axe from HTML string when no live page is available. */
export const runAccessibility = async (html, url) => {
  console.log(`  Running accessibility checks on: ${url}`);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await runAxeOnPage(page);
  } finally {
    await page.close();
  }
};
