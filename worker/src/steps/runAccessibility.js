import { chromium } from 'playwright';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const runAccessibility = async (html, url) => {
  console.log(`  Running accessibility checks on: ${url}`);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Inject axe-core into the page and run it
    await page.addScriptTag({
      path: require.resolve('axe-core/axe.min.js')
    });

    const results = await page.evaluate(async () => {
      return await axe.run();
    });

    return {
      violations: results.violations.map(v => ({
        id: v.id,
        severity: v.impact,
        description: v.description,
        affectedElements: v.nodes.length,
        helpUrl: v.helpUrl
      })),
      passes: results.passes.length,
      score: Math.max(0, 100 - (results.violations.length * 10))
    };

  } finally {
    await browser.close();
  }
};