import { buildReport } from '../src/steps/buildReport.js';

const mockLighthouseData = {
  score: 85,
  metrics: {
    firstContentfulPaint: '1.2 s',
    largestContentfulPaint: '2.4 s',
    timeToInteractive: '3.1 s',
    totalBlockingTime: '120 ms',
    cumulativeLayoutShift: '0.05',
    speedIndex: '1.8 s'
  }
};

const mockAccessibilityData = {
  score: 90,
  violations: [
    {
      id: 'color-contrast',
      severity: 'serious',
      description: 'Elements must have sufficient color contrast',
      affectedElements: 2,
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/color-contrast'
    }
  ],
  passes: 31
};

const mockSEOData = {
  score: 80,
  checks: [
    { check: 'title-tag', status: 'pass', severity: 'none', message: 'Title tag present', impact: null },
    { check: 'meta-description', status: 'fail', severity: 'high', message: 'Meta description missing', impact: 'Affects search snippets' }
  ]
};

describe('buildReport', () => {

  describe('Overall score calculation', () => {
    test('calculates overall score as average of three scores', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      // (85 + 90 + 80) / 3 = 85
      expect(report.scores.overall).toBe(85);
    });

    test('overall score is rounded to nearest integer', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: { ...mockLighthouseData, score: 83 },
        accessibilityData: { ...mockAccessibilityData, score: 90 },
        seoData: { ...mockSEOData, score: 80 }
      });
      expect(Number.isInteger(report.scores.overall)).toBe(true);
    });
  });

  describe('Report structure', () => {
    test('returns all required top-level fields', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(report).toHaveProperty('url');
      expect(report).toHaveProperty('auditedAt');
      expect(report).toHaveProperty('scores');
      expect(report).toHaveProperty('performance');
      expect(report).toHaveProperty('accessibility');
      expect(report).toHaveProperty('seo');
    });

    test('scores object has all four score types', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(report.scores).toHaveProperty('overall');
      expect(report.scores).toHaveProperty('performance');
      expect(report.scores).toHaveProperty('accessibility');
      expect(report.scores).toHaveProperty('seo');
    });

    test('url is correctly set in report', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(report.url).toBe('https://example.com');
    });

    test('auditedAt is a valid ISO date string', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(() => new Date(report.auditedAt)).not.toThrow();
      expect(new Date(report.auditedAt).toISOString()).toBe(report.auditedAt);
    });
  });

  describe('SEO section', () => {
    test('correctly separates failures warnings and passes', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(report.seo.failures).toHaveLength(1);
      expect(report.seo.passes).toHaveLength(1);
      expect(report.seo.warnings).toHaveLength(0);
    });
  });

  describe('Accessibility section', () => {
    test('includes violations array', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(report.accessibility.violations).toHaveLength(1);
      expect(report.accessibility.violations[0].id).toBe('color-contrast');
    });

    test('includes passed checks count', () => {
      const report = buildReport({
        url: 'https://example.com',
        lighthouseData: mockLighthouseData,
        accessibilityData: mockAccessibilityData,
        seoData: mockSEOData
      });
      expect(report.accessibility.passedChecks).toBe(31);
    });
  });
});