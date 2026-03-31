import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

export const runLighthouse = async (url) => {
  console.log(`  Running Lighthouse on: ${url}`);

  const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox'] });

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