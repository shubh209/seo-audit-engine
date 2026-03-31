const API_BASE = 'https://seo-audit-engine.onrender.com/api';

// DOM refs
const submitSection = document.getElementById('submit-section');
const progressSection = document.getElementById('progress-section');
const reportSection = document.getElementById('report-section');
const urlInput = document.getElementById('url-input');
const submitBtn = document.getElementById('submit-btn');
const inputError = document.getElementById('input-error');
const headerStatus = document.getElementById('header-status');
const statusDot = document.getElementById('status-dot');

// ============================================
// STATE
// ============================================
let elapsedInterval = null;
let elapsedStart = null;

// ============================================
// SUBMIT HANDLER
// ============================================
submitBtn.addEventListener('click', () => submitAudit());
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAudit(); });

async function submitAudit() {
  const rawInput = urlInput.value.trim();
  if (!rawInput) {
    showError('Please enter a URL');
    return;
  }

  // Add https:// if missing
  const url = rawInput.startsWith('http') ? rawInput : `https://${rawInput}`;

  try { new URL(url); } catch {
    showError('Invalid URL — try something like example.com');
    return;
  }

  showError('');
  submitBtn.disabled = true;
  setHeaderStatus('submitting...', false);

  try {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (data.cached) {
      // Already have a recent audit — fetch and show it directly
      setHeaderStatus('loading cached result...', true);
      const jobRes = await fetch(`${API_BASE}/jobs/${data.jobId}`);
      const job = await jobRes.json();
      showReport(job);
    } else {
      // New job — show progress and poll
      showProgress(url, data.jobId);
    }

  } catch (err) {
    showError('Failed to connect to API — is the server running?');
    submitBtn.disabled = false;
    setHeaderStatus('error', false);
    statusDot.className = 'status-dot error';
  }
}

// ============================================
// PROGRESS VIEW
// ============================================
const STEP_ORDER = [
  'crawling',
  'scoring_performance',
  'checking_accessibility',
  'checking_seo',
  'building_report'
];

function showProgress(url, jobId) {
  submitSection.classList.add('hidden');
  reportSection.classList.add('hidden');
  progressSection.classList.remove('hidden');

  document.getElementById('progress-url').textContent = url;
  setHeaderStatus('processing...', true);

  // Reset all steps
  document.querySelectorAll('.step').forEach(el => {
    el.className = 'step';
    el.querySelector('.step-status').textContent = 'waiting';
  });

  // Start elapsed timer
  elapsedStart = Date.now();
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    const secs = ((Date.now() - elapsedStart) / 1000).toFixed(1);
    document.getElementById('elapsed-time').textContent = `${secs}s`;
  }, 100);

  // Poll job status every 2 seconds
  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      const job = await res.json();
      updateStepper(job.status);

      if (job.status === 'complete') {
        clearInterval(pollInterval);
        clearInterval(elapsedInterval);
        setTimeout(() => showReport(job), 800);
      }

      if (job.status === 'failed') {
        clearInterval(pollInterval);
        clearInterval(elapsedInterval);
        setHeaderStatus('audit failed', false);
        statusDot.className = 'status-dot error';
        showError(`Audit failed: ${job.error || 'unknown error'}`);
        submitBtn.disabled = false;
      }

    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function updateStepper(currentStatus) {
  const currentIndex = STEP_ORDER.indexOf(currentStatus);

  STEP_ORDER.forEach((stepName, i) => {
    const el = document.querySelector(`.step[data-step="${stepName}"]`);
    if (!el) return;

    const statusEl = el.querySelector('.step-status');

    if (i < currentIndex) {
      // Completed step
      el.className = 'step complete';
      statusEl.textContent = '✓ done';
    } else if (i === currentIndex) {
      // Active step
      el.className = 'step active';
      statusEl.innerHTML = '<span class="spinner"></span>running';
    } else {
      // Waiting step
      el.className = 'step';
      statusEl.textContent = 'waiting';
    }
  });
}

// ============================================
// REPORT VIEW
// ============================================
function showReport(job) {
  progressSection.classList.add('hidden');
  submitSection.classList.add('hidden');
  reportSection.classList.remove('hidden');

  setHeaderStatus('complete', true);
  statusDot.className = 'status-dot active';

  const report = job.report;

  // Header
  document.getElementById('report-url-display').textContent = job.url;
  document.getElementById('report-time').textContent =
    `${(job.processing_time_ms / 1000).toFixed(1)}s`;
  document.getElementById('report-checks').textContent =
    `${job.checks_run || 0} checks run`;

  // Scores
  // Scores — fallback to report scores if top-level scores are null
  const perfScore = job.performance_score ?? report?.scores?.performance ?? 0;
  const a11yScore = job.accessibility_score ?? report?.scores?.accessibility ?? 0;
  const seoScore = job.seo_score ?? report?.scores?.seo ?? 0;
  const overallScore = job.overall_score ?? report?.scores?.overall ?? 0;

  animateScore('overall', overallScore);
  animateScore('performance', perfScore);
  animateScore('accessibility', a11yScore);
  animateScore('seo', seoScore);

  // Performance metrics
  if (report?.performance?.metrics) {
    const metricsList = document.getElementById('metrics-list');
    document.getElementById('panel-perf-score').textContent =
      `score: ${job.performance_score}`;
    const labels = {
      firstContentfulPaint: 'First Contentful Paint',
      largestContentfulPaint: 'Largest Contentful Paint',
      timeToInteractive: 'Time to Interactive',
      totalBlockingTime: 'Total Blocking Time',
      cumulativeLayoutShift: 'Cumulative Layout Shift',
      speedIndex: 'Speed Index'
    };
    metricsList.innerHTML = Object.entries(report.performance.metrics)
      .map(([key, val]) => `
        <div class="metric-row">
          <span class="metric-key">${labels[key] || key}</span>
          <span class="metric-value">${val}</span>
        </div>`)
      .join('');
  }

  // SEO checks
  if (report?.seo?.checks) {
    const seoList = document.getElementById('seo-checks-list');
    document.getElementById('panel-seo-score').textContent =
      `score: ${job.seo_score}`;
    seoList.innerHTML = report.seo.checks.map(check => `
      <div class="check-row">
        <span class="check-icon ${check.status}">
          ${check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✕'}
        </span>
        <div>
          <div class="check-message">${check.message}</div>
          ${check.impact ? `<div class="check-impact">${check.impact}</div>` : ''}
        </div>
      </div>`).join('');
  }

  // Accessibility violations
  if (report?.accessibility) {
    const a11yList = document.getElementById('violations-list');
    document.getElementById('panel-a11y-score').textContent =
      `score: ${job.accessibility_score} · ${report.accessibility.passedChecks} checks passed`;

    if (report.accessibility.violations.length === 0) {
      a11yList.innerHTML = `<div class="no-violations">✓ No accessibility violations found</div>`;
    } else {
      a11yList.innerHTML = report.accessibility.violations.map(v => `
        <div class="violation-row">
          <div class="violation-header">
            <span class="violation-id">${v.id}</span>
            <span class="violation-badge ${v.severity}">${v.severity}</span>
            <span style="font-family:var(--mono);font-size:0.7rem;color:var(--text-dim)">
              ${v.affectedElements} element${v.affectedElements !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="violation-desc">${v.description}</div>
        </div>`).join('');
    }
  }

  // Save to recent history
  saveToRecent(job);
  loadRecent();
}

function animateScore(name, score) {
  const numEl = document.getElementById(`score-${name}`);
  const barEl = document.getElementById(`bar-${name}`);

  const colorClass = score >= 80 ? 'good' : score >= 50 ? 'ok' : 'bad';

  numEl.textContent = score ?? '--';
  numEl.className = `score-number ${colorClass}`;

  setTimeout(() => {
    barEl.style.width = `${score}%`;
    barEl.className = `score-fill ${colorClass === 'good' ? '' : colorClass}`;
  }, 100);
}

// ============================================
// NEW AUDIT BUTTON
// ============================================
document.getElementById('new-audit-btn').addEventListener('click', () => {
  reportSection.classList.add('hidden');
  submitSection.classList.remove('hidden');
  urlInput.value = '';
  submitBtn.disabled = false;
  setHeaderStatus('ready', false);
  statusDot.className = 'status-dot';
  loadRecent();
});

// ============================================
// RECENT HISTORY
// ============================================
function saveToRecent(job) {
  const recent = JSON.parse(localStorage.getItem('recent-audits') || '[]');
  const entry = {
    id: job.id,
    url: job.url,
    overall_score: job.overall_score,
    created_at: job.created_at
  };
  const filtered = recent.filter(r => r.url !== job.url);
  filtered.unshift(entry);
  localStorage.setItem('recent-audits', JSON.stringify(filtered.slice(0, 5)));
}

function loadRecent() {
  const recent = JSON.parse(localStorage.getItem('recent-audits') || '[]');
  const list = document.getElementById('recent-list');
  const section = document.getElementById('recent-section');

  if (recent.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = recent.map(r => `
    <div class="recent-item" data-id="${r.id}">
      <span class="recent-item-url">${r.url}</span>
      <span class="recent-item-score">${r.overall_score ?? '--'}/100</span>
      <span class="recent-item-date">${new Date(r.created_at).toLocaleDateString()}</span>
    </div>`).join('');

  list.querySelectorAll('.recent-item').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      setHeaderStatus('loading...', true);
      const res = await fetch(`${API_BASE}/jobs/${id}`);
      const job = await res.json();
      showReport(job);
    });
  });
}

// ============================================
// HELPERS
// ============================================
function showError(msg) {
  inputError.textContent = msg;
}

function setHeaderStatus(text, active) {
  headerStatus.textContent = text;
  statusDot.className = `status-dot${active ? ' active' : ''}`;
}


// ============================================
// PDF DOWNLOAD
// ============================================
document.getElementById('download-pdf-btn').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const colors = {
    green: [0, 200, 100],
    dark: [20, 20, 20],
    dim: [100, 100, 100],
    dimmer: [180, 180, 180],
    red: [220, 60, 60],
    yellow: [200, 160, 0],
    bg: [245, 245, 245]
  };

  const scoreColor = (score) =>
    score >= 80 ? colors.green : score >= 50 ? colors.yellow : colors.red;

  // Header
  doc.setFillColor(...[20, 20, 20]);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text('[ SEO_AUDIT ]', margin, 13);
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.dimmer);
  doc.text('seo-audit-engine.pages.dev', margin, 21);
  doc.setTextColor(0, 255, 136);
  doc.text('// audit complete', pageWidth - margin - 28, 13);

  y = 38;

  // URL
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...colors.dark);
  const urlText = document.getElementById('report-url-display').textContent;
  doc.text(urlText, margin, y);
  y += 7;

  // Meta
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.dim);
  const metaTime = document.getElementById('report-time').textContent;
  const metaChecks = document.getElementById('report-checks').textContent;
  doc.text(`${metaTime} · ${metaChecks} · ${new Date().toLocaleDateString()}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(...colors.dimmer);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Score Cards
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...colors.dim);
  doc.text('// scores', margin, y);
  y += 5;

  const scoreCards = [
    { label: 'OVERALL', id: 'score-overall' },
    { label: 'PERFORMANCE', id: 'score-performance' },
    { label: 'ACCESSIBILITY', id: 'score-accessibility' },
    { label: 'SEO', id: 'score-seo' }
  ];

  const cardWidth = contentWidth / 4;
  scoreCards.forEach((card, i) => {
    const x = margin + i * cardWidth;
    const score = parseInt(document.getElementById(card.id).textContent) || 0;

    doc.setFillColor(...colors.bg);
    doc.rect(x, y, cardWidth - 2, 22, 'F');

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colors.dim);
    doc.text(card.label, x + 3, y + 6);

    doc.setFont('courier', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...scoreColor(score));
    doc.text(String(score), x + 3, y + 18);
  });

  y += 30;

  // Performance Metrics
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...colors.dim);
  doc.text('// performance metrics', margin, y);
  y += 5;

  const metricRows = document.querySelectorAll('.metric-row');
  metricRows.forEach(row => {
    const key = row.querySelector('.metric-key')?.textContent;
    const val = row.querySelector('.metric-value')?.textContent;
    if (!key || !val) return;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.dim);
    doc.text(key, margin, y);
    doc.setTextColor(...colors.dark);
    doc.text(val, pageWidth - margin, y, { align: 'right' });

    doc.setDrawColor(...colors.dimmer);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    y += 7;
  });

  y += 5;

  // SEO Checks
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...colors.dim);
  doc.text('// seo checks', margin, y);
  y += 5;

  const checkRows = document.querySelectorAll('.check-row');
  checkRows.forEach(row => {
    if (y > 260) { doc.addPage(); y = 20; }

    const icon = row.querySelector('.check-icon');
    const msg = row.querySelector('.check-message')?.textContent;
    const impact = row.querySelector('.check-impact')?.textContent;
    if (!msg) return;

    const isPass = icon?.classList.contains('pass');
    const isWarn = icon?.classList.contains('warn');
    const isFail = icon?.classList.contains('fail');

    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(isPass ? 0 : 0, isPass ? 180 : (isWarn ? 160 : 200),
      isPass ? 100 : (isWarn ? 0 : 60));
    doc.text(isPass ? '✓' : (isWarn ? '⚠' : '✕'), margin, y);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.dark);
    const msgLines = doc.splitTextToSize(msg, contentWidth - 8);
    doc.text(msgLines, margin + 6, y);
    y += msgLines.length * 4.5;

    if (impact) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...colors.dim);
      doc.text(impact, margin + 6, y);
      y += 5;
    }

    doc.setDrawColor(...colors.dimmer);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  });

  y += 5;
  if (y > 240) { doc.addPage(); y = 20; }

  // Accessibility Violations
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...colors.dim);
  doc.text('// accessibility violations', margin, y);
  y += 5;

  const violations = document.querySelectorAll('.violation-row');
  if (violations.length === 0) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.green);
    doc.text('✓ No accessibility violations found', margin, y);
    y += 8;
  } else {
    violations.forEach(row => {
      if (y > 260) { doc.addPage(); y = 20; }

      const id = row.querySelector('.violation-id')?.textContent;
      const severity = row.querySelector('.violation-badge')?.textContent;
      const desc = row.querySelector('.violation-desc')?.textContent;
      if (!id) return;

      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...colors.dark);
      doc.text(id, margin, y);

      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...colors.red);
      doc.text(severity || '', margin + 40, y);
      y += 5;

      if (desc) {
        doc.setFont('courier', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...colors.dim);
        const descLines = doc.splitTextToSize(desc, contentWidth);
        doc.text(descLines, margin, y);
        y += descLines.length * 4 + 3;
      }
    });
  }

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...[20, 20, 20]);
    doc.rect(0, 285, pageWidth, 12, 'F');
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...colors.dimmer);
    doc.text('Built with Node.js · BullMQ · PostgreSQL · Redis · Playwright', margin, 292);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 292, { align: 'right' });
  }

  // Save
  const filename = `seo-audit-${urlText.replace(/https?:\/\//, '').replace(/\//g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
});


// ============================================
// INIT
// ============================================
loadRecent();