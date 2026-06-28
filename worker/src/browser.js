import { chromium } from 'playwright';

let browserPromise = null;

export const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    // If the launch rejects, clear the promise so the next call retries
    // instead of re-awaiting a permanently rejected promise.
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
};

export const closeBrowser = async () => {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
};

process.on('SIGTERM', () => { closeBrowser().finally(() => process.exit(0)); });
process.on('SIGINT', () => { closeBrowser().finally(() => process.exit(0)); });
