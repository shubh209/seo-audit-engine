export const buildReport = ({ url, lighthouseData, accessibilityData, seoData }) => {
  const overallScore = Math.round(
    (lighthouseData.score + accessibilityData.score + seoData.score) / 3
  );

  return {
    url,
    auditedAt: new Date().toISOString(),
    scores: {
      overall: overallScore,
      performance: lighthouseData.score,
      accessibility: accessibilityData.score,
      seo: seoData.score
    },
    performance: {
      score: lighthouseData.score,
      metrics: lighthouseData.metrics
    },
    accessibility: {
      score: accessibilityData.score,
      violations: accessibilityData.violations,
      passedChecks: accessibilityData.passes
    },
    seo: {
      score: seoData.score,
      checks: seoData.checks,
      failures: seoData.checks.filter(c => c.status === 'fail'),
      warnings: seoData.checks.filter(c => c.status === 'warn'),
      passes: seoData.checks.filter(c => c.status === 'pass')
    }
  };
};