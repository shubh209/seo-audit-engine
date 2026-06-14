import { createRequire } from 'module';
import { getBrowser } from '../browser.js';

const require = createRequire(import.meta.url);

export const runAccessibility = async (html, url) => {
  console.log(`  Running accessibility checks on: ${url}`);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

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
    await page.close();
  }
};
