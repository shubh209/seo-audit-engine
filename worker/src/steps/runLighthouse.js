import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

export const runLighthouse = async (url) => {
  console.log(`  Running Lighthouse on: ${url}`);

  // Find the Chromium that Playwright downloaded
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ||
    '/opt/render/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell';

  const chrome = await launch({
    chromePath: chromiumPath,
    chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['performance'],
      logLevel: 'error'
    });

    const { categories, audits } = result.lhr;

    return {
      score: Math.round(categories.performance.score * 100),
      metrics: {
        firstContentfulPaint: audits['first-contentful-paint'].displayValue,
        largestContentfulPaint: audits['largest-contentful-paint'].displayValue,
        timeToInteractive: audits['interactive'].displayValue,
        totalBlockingTime: audits['total-blocking-time'].displayValue,
        cumulativeLayoutShift: audits['cumulative-layout-shift'].displayValue,
        speedIndex: audits['speed-index'].displayValue
      }
    };

  } finally {
    await chrome.kill();
  }
};