import { getBrowser } from '../browser.js';
import { runAxeOnPage } from './runAccessibility.js';

export const crawlPage = async (url) => {
  console.log(`  Crawling: ${url}`);
  const crawlStart = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    const loadTimeMs = Date.now() - crawlStart;
    const statusCode = response.status();
    const html = await page.content();

    const pageData = await page.evaluate(() => {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el ? el.getAttribute('content') : null;
      };

      return {
        title: document.title,
        metaDescription: getMeta('description'),
        h1s: Array.from(document.querySelectorAll('h1')).map(el => el.textContent.trim()),
        h2s: Array.from(document.querySelectorAll('h2')).map(el => el.textContent.trim()),
        images: Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.getAttribute('alt')
        })),
        links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
          href: a.href,
          text: a.textContent.trim()
        })),
        canonical: document.querySelector('link[rel="canonical"]')?.href || null,
        robotsMeta: getMeta('robots'),
        viewport: getMeta('viewport'),
        lang: document.documentElement.lang || null
      };
    });

    // Run axe on the live DOM before closing — avoids a second page + setContent
    const a11yStart = Date.now();
    const accessibilityData = await runAxeOnPage(page);
    const a11yMs = Date.now() - a11yStart;

    return {
      ...pageData,
      html,
      statusCode,
      url,
      loadTimeMs,
      crawlMs: loadTimeMs,
      a11yMs,
      accessibilityData
    };

  } finally {
    await page.close();
  }
};
