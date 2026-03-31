import { chromium } from 'playwright';

export const crawlPage = async (url) => {
  console.log(`  Crawling: ${url}`);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // Block images, fonts, and media to speed up the crawl
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const statusCode = response.status();
    const html = await page.content();

    // Extract key page data
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

    return { ...pageData, html, statusCode, url };

  } finally {
    await browser.close(); // Always close the browser even if an error occurs
  }
};