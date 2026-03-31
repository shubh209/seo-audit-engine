export const runSEOChecks = async (pageData, url) => {
  console.log(`  Running SEO checks on: ${url}`);
  const checks = [];

  // Title tag checks
  if (!pageData.title) {
    checks.push({ check: 'title-tag', status: 'fail', severity: 'high',
      message: 'Page is missing a title tag',
      impact: 'Title tags are the most important on-page SEO element' });
  } else if (pageData.title.length > 60) {
    checks.push({ check: 'title-length', status: 'warn', severity: 'medium',
      message: `Title is ${pageData.title.length} characters (recommended: under 60)`,
      impact: 'Long titles get truncated in search results' });
  } else {
    checks.push({ check: 'title-tag', status: 'pass', severity: 'none',
      message: `Title tag present: "${pageData.title}"`, impact: null });
  }

  // Meta description checks
  if (!pageData.metaDescription) {
    checks.push({ check: 'meta-description', status: 'fail', severity: 'high',
      message: 'Meta description is missing',
      impact: 'Google uses meta descriptions in search result snippets' });
  } else if (pageData.metaDescription.length > 160) {
    checks.push({ check: 'meta-description-length', status: 'warn', severity: 'low',
      message: `Meta description is ${pageData.metaDescription.length} chars (recommended: under 160)`,
      impact: 'Description gets truncated in search results' });
  } else {
    checks.push({ check: 'meta-description', status: 'pass', severity: 'none',
      message: 'Meta description present and correct length', impact: null });
  }

  // H1 checks
  if (pageData.h1s.length === 0) {
    checks.push({ check: 'h1-missing', status: 'fail', severity: 'high',
      message: 'Page has no H1 heading',
      impact: 'H1 tells search engines what the page is about' });
  } else if (pageData.h1s.length > 1) {
    checks.push({ check: 'h1-multiple', status: 'warn', severity: 'medium',
      message: `Page has ${pageData.h1s.length} H1 tags (recommended: exactly 1)`,
      impact: 'Multiple H1s dilute the primary topic signal' });
  } else {
    checks.push({ check: 'h1-tag', status: 'pass', severity: 'none',
      message: `Single H1 present: "${pageData.h1s[0]}"`, impact: null });
  }

  // Image alt text checks
  const imagesWithoutAlt = pageData.images.filter(img => 
    img.alt === null || img.alt === undefined
  );
  if (imagesWithoutAlt.length > 0) {
    checks.push({ check: 'image-alt-text', status: 'fail', severity: 'medium',
      message: `${imagesWithoutAlt.length} of ${pageData.images.length} images are missing alt text`,
      impact: 'Alt text helps search engines understand image content' });
  } else if (pageData.images.length > 0) {
    checks.push({ check: 'image-alt-text', status: 'pass', severity: 'none',
      message: `All ${pageData.images.length} images have alt text`, impact: null });
  }

  // Canonical tag check
  if (!pageData.canonical) {
    checks.push({ check: 'canonical-tag', status: 'warn', severity: 'medium',
      message: 'No canonical tag found',
      impact: 'Canonical tags prevent duplicate content issues' });
  } else {
    checks.push({ check: 'canonical-tag', status: 'pass', severity: 'none',
      message: 'Canonical tag present', impact: null });
  }

  // Viewport check (mobile friendliness)
  if (!pageData.viewport) {
    checks.push({ check: 'viewport', status: 'fail', severity: 'high',
      message: 'No viewport meta tag found',
      impact: 'Google uses mobile-first indexing — missing viewport hurts rankings' });
  } else {
    checks.push({ check: 'viewport', status: 'pass', severity: 'none',
      message: 'Viewport meta tag present', impact: null });
  }

  // Lang attribute check
  if (!pageData.lang) {
    checks.push({ check: 'lang-attribute', status: 'warn', severity: 'low',
      message: 'HTML lang attribute is missing',
      impact: 'Helps search engines serve the right language to users' });
  } else {
    checks.push({ check: 'lang-attribute', status: 'pass', severity: 'none',
      message: `Lang attribute set to "${pageData.lang}"`, impact: null });
  }

  // Calculate SEO score
  const failures = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const score = Math.max(0, 100 - (failures * 15) - (warnings * 5));

  return { checks, score };
};