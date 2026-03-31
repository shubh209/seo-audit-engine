import { runSEOChecks } from '../src/steps/runSEOChecks.js';

// Mock page data that simulates what crawlPage.js returns
const perfectPage = {
  title: 'Example Domain',
  metaDescription: 'This is a well optimized page with a good meta description.',
  h1s: ['Main Heading'],
  h2s: ['Section One', 'Section Two'],
  images: [
    { src: 'https://example.com/img1.jpg', alt: 'A descriptive alt text' },
    { src: 'https://example.com/img2.jpg', alt: 'Another image description' }
  ],
  canonical: 'https://example.com/',
  viewport: 'width=device-width, initial-scale=1',
  lang: 'en',
  links: [],
  statusCode: 200
};

const brokenPage = {
  title: null,
  metaDescription: null,
  h1s: [],
  h2s: [],
  images: [
    { src: 'https://example.com/img1.jpg', alt: null },
    { src: 'https://example.com/img2.jpg', alt: null }
  ],
  canonical: null,
  viewport: null,
  lang: null,
  links: [],
  statusCode: 200
};

const multipleH1Page = {
  ...perfectPage,
  h1s: ['First H1', 'Second H1', 'Third H1']
};

const longTitlePage = {
  ...perfectPage,
  title: 'This is an extremely long title that definitely exceeds the recommended 60 character limit for SEO'
};

const longMetaPage = {
  ...perfectPage,
  metaDescription: 'This meta description is way too long and exceeds the recommended 160 character limit. It will get truncated in search results which is bad for click through rates and overall SEO performance of the page.'
};

describe('runSEOChecks', () => {

  describe('Title tag checks', () => {
    test('passes when title tag is present and correct length', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      const titleCheck = result.checks.find(c => c.check === 'title-tag');
      expect(titleCheck.status).toBe('pass');
    });

    test('fails when title tag is missing', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      const titleCheck = result.checks.find(c => c.check === 'title-tag');
      expect(titleCheck.status).toBe('fail');
      expect(titleCheck.severity).toBe('high');
    });

    test('warns when title is over 60 characters', async () => {
      const result = await runSEOChecks(longTitlePage, 'https://example.com');
      const titleCheck = result.checks.find(c => c.check === 'title-length');
      expect(titleCheck.status).toBe('warn');
      expect(titleCheck.severity).toBe('medium');
    });
  });

  describe('Meta description checks', () => {
    test('passes when meta description is present and correct length', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      const metaCheck = result.checks.find(c => c.check === 'meta-description');
      expect(metaCheck.status).toBe('pass');
    });

    test('fails when meta description is missing', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      const metaCheck = result.checks.find(c => c.check === 'meta-description');
      expect(metaCheck.status).toBe('fail');
      expect(metaCheck.severity).toBe('high');
    });

    test('warns when meta description exceeds 160 characters', async () => {
      const result = await runSEOChecks(longMetaPage, 'https://example.com');
      const metaCheck = result.checks.find(c => c.check === 'meta-description-length');
      expect(metaCheck.status).toBe('warn');
    });
  });

  describe('H1 tag checks', () => {
    test('passes when exactly one H1 is present', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      const h1Check = result.checks.find(c => c.check === 'h1-tag');
      expect(h1Check.status).toBe('pass');
    });

    test('fails when no H1 is present', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      const h1Check = result.checks.find(c => c.check === 'h1-missing');
      expect(h1Check.status).toBe('fail');
      expect(h1Check.severity).toBe('high');
    });

    test('warns when multiple H1s are present', async () => {
      const result = await runSEOChecks(multipleH1Page, 'https://example.com');
      const h1Check = result.checks.find(c => c.check === 'h1-multiple');
      expect(h1Check.status).toBe('warn');
      expect(h1Check.message).toContain('3');
    });
  });

  describe('Image alt text checks', () => {
    test('passes when all images have alt text', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      const altCheck = result.checks.find(c => c.check === 'image-alt-text');
      expect(altCheck.status).toBe('pass');
    });

    test('fails when images are missing alt text', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      const altCheck = result.checks.find(c => c.check === 'image-alt-text');
      expect(altCheck.status).toBe('fail');
      expect(altCheck.message).toContain('2 of 2');
    });
  });

  describe('Canonical tag checks', () => {
    test('passes when canonical tag is present', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      const canonicalCheck = result.checks.find(c => c.check === 'canonical-tag');
      expect(canonicalCheck.status).toBe('pass');
    });

    test('warns when canonical tag is missing', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      const canonicalCheck = result.checks.find(c => c.check === 'canonical-tag');
      expect(canonicalCheck.status).toBe('warn');
    });
  });

  describe('Viewport checks', () => {
    test('passes when viewport meta tag is present', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      const viewportCheck = result.checks.find(c => c.check === 'viewport');
      expect(viewportCheck.status).toBe('pass');
    });

    test('fails when viewport is missing', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      const viewportCheck = result.checks.find(c => c.check === 'viewport');
      expect(viewportCheck.status).toBe('fail');
      expect(viewportCheck.severity).toBe('high');
    });
  });

  describe('Score calculation', () => {
    test('perfect page scores 100', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      expect(result.score).toBe(100);
    });

    test('broken page scores lower than 50', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      expect(result.score).toBeLessThan(50);
    });

    test('score is always between 0 and 100', async () => {
      const result = await runSEOChecks(brokenPage, 'https://example.com');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Output structure', () => {
    test('returns checks array and score', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('score');
      expect(Array.isArray(result.checks)).toBe(true);
    });

    test('each check has required fields', async () => {
      const result = await runSEOChecks(perfectPage, 'https://example.com');
      result.checks.forEach(check => {
        expect(check).toHaveProperty('check');
        expect(check).toHaveProperty('status');
        expect(check).toHaveProperty('severity');
        expect(check).toHaveProperty('message');
      });
    });
  });
});