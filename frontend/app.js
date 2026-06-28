const API_BASE = 'https://seo-audit-engine.onrender.com/api';

const submitSection   = document.getElementById('submit-section');
const progressSection = document.getElementById('progress-section');
const reportSection   = document.getElementById('report-section');
const urlInput        = document.getElementById('url-input');
const submitBtn       = document.getElementById('submit-btn');
const inputError      = document.getElementById('input-error');
const headerStatus    = document.getElementById('header-status');
const statusDot       = document.getElementById('status-dot');
const progressFill    = document.getElementById('progress-fill');
const apiHealthDot    = document.getElementById('api-health-dot');

let elapsedInterval  = null;
let elapsedStart     = null;
let lastJobSnapshot  = null;

const STEP_ORDER = [
  'crawling',
  'scoring_performance',
  'checking_accessibility',
  'checking_seo',
  'building_report'
];

const TIMING_KEYS = {
  crawl:  'crawl_ms',
  perf:   'perf_ms',
  a11y:   'a11y_ms',
  seo:    'seo_ms',
  report: 'report_ms'
};

// ── API health check ──────────────────────────────────────────────────────────
// Pings /health on load; shows green dot in the button when the API is ready.

async function checkApiHealth() {
  try {
    const res  = await fetch(`${API_BASE.replace('/api', '')}/health`, {
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      // Header dot — green + pulsing
      setHeaderStatus('ready', true);
      // Button dot
      apiHealthDot.classList.remove('down');
      apiHealthDot.classList.add('up');
      apiHealthDot.setAttribute('aria-label', 'API status: ready');
      apiHealthDot.setAttribute('title', 'API is ready');
    } else {
      throw new Error('bad status');
    }
  } catch {
    // Header dot — stays grey, label hints the issue
    setHeaderStatus('unavailable', false);
    // Button dot
    apiHealthDot.classList.remove('up');
    apiHealthDot.classList.add('down');
    apiHealthDot.setAttribute('aria-label', 'API status: unavailable');
    apiHealthDot.setAttribute('title', 'API unavailable — it may be waking up');
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

submitBtn.addEventListener('click', () => submitAudit());
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAudit(); });

async function submitAudit() {
  const rawInput = urlInput.value.trim();
  if (!rawInput) {
    showError('Please enter a URL');
    return;
  }

  const url = rawInput.startsWith('http') ? rawInput : `https://${rawInput}`;

  try { new URL(url); } catch {
    showError('Invalid URL — try something like example.com');
    return;
  }

  showError('');
  submitBtn.disabled = true;
  setHeaderStatus('submitting…', false);

  try {
    const res  = await fetch(`${API_BASE}/jobs`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url })
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Could not start audit');
      submitBtn.disabled = false;
      setHeaderStatus('error', false);
      statusDot.className = 'status-dot error';
      return;
    }

    if (data.cached) {
      setHeaderStatus('loading cached result…', true);
      const jobRes = await fetch(`${API_BASE}/jobs/${data.jobId}`);
      const job    = await jobRes.json();
      showReport(job);
    } else {
      showProgress(url, data.jobId);
    }
  } catch {
    showError('Could not reach the API — it may be waking up. Try again in 30 seconds.');
    submitBtn.disabled = false;
    setHeaderStatus('error', false);
    statusDot.className = 'status-dot error';
  }
}

// ── Progress view ─────────────────────────────────────────────────────────────

function showProgress(url, jobId) {
  submitSection.classList.add('hidden');
  reportSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  lastJobSnapshot = null;

  document.getElementById('progress-url').textContent = url;
  progressFill.style.width = '0%';
  setHeaderStatus('processing…', true);

  document.querySelectorAll('.step').forEach((el) => {
    el.className = 'step';
    el.querySelector('.step-status').textContent = 'waiting';
    el.querySelector('.step-timing')?.classList.add('hidden');
  });

  elapsedStart = Date.now();
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    const secs = ((Date.now() - elapsedStart) / 1000).toFixed(1);
    document.getElementById('elapsed-time').textContent = `${secs}s`;
  }, 100);

  trackJobProgress(jobId);
}

function trackJobProgress(jobId) {
  let pollInterval = null;
  let eventSource  = null;

  const cleanup = () => {
    if (pollInterval) clearInterval(pollInterval);
    clearInterval(elapsedInterval);
    if (eventSource) eventSource.close();
  };

  const handleJobUpdate = async (job) => {
    if (job.error === 'Job not found') {
      showError('Job not found');
      cleanup();
      submitBtn.disabled = false;
      return;
    }

    lastJobSnapshot = job;
    updateStepper(job.status, job);
    applyStepTimings(job);

    if (job.status === 'complete') {
      cleanup();
      progressFill.style.width = '100%';
      const res    = await fetch(`${API_BASE}/jobs/${jobId}`);
      const fullJob = await res.json();
      setTimeout(() => showReport(fullJob), 500);
    }

    if (job.status === 'failed') {
      cleanup();
      progressSection.classList.add('hidden');
      submitSection.classList.remove('hidden');
      setHeaderStatus('audit failed', false);
      statusDot.className = 'status-dot error';
      markFailedStep(job.failed_step);
      showError(formatAuditError(job.error, job.failed_step));
      submitBtn.disabled = false;
    }
  };

  const startPollingFallback = () => {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`);
        await handleJobUpdate(await res.json());
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  };

  try {
    eventSource = new EventSource(`${API_BASE}/stream/${jobId}`);
    eventSource.onmessage = (e) => {
      try { handleJobUpdate(JSON.parse(e.data)); }
      catch (err) { console.error('SSE parse error:', err); }
    };
    eventSource.onerror = () => {
      eventSource.close();
      eventSource = null;
      startPollingFallback();
    };
  } catch {
    startPollingFallback();
  }
}

function updateStepper(currentStatus, job = {}) {
  const currentIndex  = STEP_ORDER.indexOf(currentStatus);
  const progressIndex = currentIndex >= 0 ? currentIndex : STEP_ORDER.length;

  progressFill.style.width = `${Math.max(8, (progressIndex / STEP_ORDER.length) * 100)}%`;

  STEP_ORDER.forEach((stepName, i) => {
    const el = document.querySelector(`.step[data-step="${stepName}"]`);
    if (!el) return;

    const statusEl = el.querySelector('.step-status');

    if (job.status === 'failed' && job.failed_step === stepName) {
      el.className = 'step failed';
      statusEl.textContent = 'failed';
    } else if (i < currentIndex) {
      el.className = 'step complete';
      statusEl.textContent = 'done';
    } else if (i === currentIndex) {
      el.className = 'step active';
      statusEl.innerHTML = '<span class="spinner"></span>running';
    } else {
      el.className = 'step';
      statusEl.textContent = 'waiting';
    }
  });
}

function markFailedStep(failedStep) {
  if (!failedStep) return;
  const el = document.querySelector(`.step[data-step="${failedStep}"]`);
  if (el) {
    el.className = 'step failed';
    el.querySelector('.step-status').textContent = 'failed';
  }
}

function applyStepTimings(job) {
  Object.entries(TIMING_KEYS).forEach(([key, field]) => {
    const el = document.querySelector(`.step-timing[data-timing="${key}"]`);
    if (!el || job[field] == null) return;
    el.textContent = `${job[field]}ms`;
    el.classList.remove('hidden');
  });
}

function formatAuditError(error, failedStep) {
  const msg = error || 'Unknown error';
  if (msg.includes('ERR_NAME_NOT_RESOLVED'))
    return 'Domain not found — double-check the URL spelling.';
  if (msg.includes('Timeout') || msg.includes('timeout'))
    return 'Site took too long to respond (45s limit).';
  if (msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('ERR_CONNECTION_RESET'))
    return 'Could not connect to this site — it may be down or blocking automated requests.';
  if (msg.includes('ERR_CERT') || msg.includes('SSL'))
    return 'SSL certificate error — the site has an invalid or expired certificate.';
  if (failedStep === 'crawling')
    return `Crawl failed: ${msg.split('\n')[0].slice(0, 120)}`;
  return `Audit failed: ${msg.split('\n')[0].slice(0, 120)}`;
}

// ── Report view ───────────────────────────────────────────────────────────────

function showReport(job) {
  progressSection.classList.add('hidden');
  submitSection.classList.add('hidden');
  reportSection.classList.remove('hidden');

  setHeaderStatus('complete', true);
  statusDot.className = 'status-dot active';
  submitBtn.disabled = false;

  const report = job.report;
  document.getElementById('report-url-display').textContent = job.url;
  document.getElementById('report-time').textContent =
    `${(job.processing_time_ms / 1000).toFixed(1)}s total`;
  document.getElementById('report-checks').textContent =
    `${job.checks_run || 0} checks run`;

  const timingParts = [
    job.crawl_ms != null && `crawl ${job.crawl_ms}ms`,
    job.a11y_ms  != null && `a11y ${job.a11y_ms}ms`
  ].filter(Boolean);
  document.getElementById('report-timings').textContent =
    timingParts.length ? timingParts.join(' · ') : 'step timings unavailable';

  const perfScore    = job.performance_score    ?? report?.scores?.performance    ?? 0;
  const a11yScore    = job.accessibility_score  ?? report?.scores?.accessibility  ?? 0;
  const seoScore     = job.seo_score            ?? report?.scores?.seo            ?? 0;
  const overallScore = job.overall_score        ?? report?.scores?.overall        ?? 0;

  animateScore('overall',       overallScore);
  animateScore('performance',   perfScore);
  animateScore('accessibility', a11yScore);
  animateScore('seo',           seoScore);

  if (report?.performance?.metrics) {
    const labels = {
      firstContentfulPaint:    'First Contentful Paint',
      largestContentfulPaint:  'Largest Contentful Paint',
      timeToInteractive:       'Time to Interactive',
      totalBlockingTime:       'Total Blocking Time',
      cumulativeLayoutShift:   'Cumulative Layout Shift',
      speedIndex:              'Speed Index'
    };
    document.getElementById('panel-perf-score').textContent = `score ${perfScore}`;
    document.getElementById('metrics-list').innerHTML = Object.entries(report.performance.metrics)
      .map(([key, val]) => `
        <div class="metric-row">
          <span class="metric-key">${labels[key] || key}</span>
          <span class="metric-value">${val}</span>
        </div>`)
      .join('');
  }

  if (report?.seo?.checks) {
    document.getElementById('panel-seo-score').textContent = `score ${seoScore}`;
    document.getElementById('seo-checks-list').innerHTML = report.seo.checks.map((check) => `
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

  if (report?.accessibility) {
    document.getElementById('panel-a11y-score').textContent =
      `score ${a11yScore} · ${report.accessibility.passedChecks} passed`;
    const a11yList = document.getElementById('violations-list');

    if (report.accessibility.violations.length === 0) {
      a11yList.innerHTML = '<div class="no-violations">✓ No accessibility violations found</div>';
    } else {
      a11yList.innerHTML = report.accessibility.violations.map((v) => `
        <div class="violation-row">
          <div class="violation-header">
            <span class="violation-id">${v.id}</span>
            <span class="violation-badge ${v.severity}">${v.severity}</span>
            <span style="font-family:var(--mono);font-size:0.68rem;color:var(--text-faint)">
              ${v.affectedElements} element${v.affectedElements !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="violation-desc">${v.description}</div>
        </div>`).join('');
    }
  }

  saveToRecent(job);
  loadRecent();
}

function scoreColor(score) {
  if (score >= 80) return 'var(--good)';
  if (score >= 50) return 'var(--warn)';
  return 'var(--danger)';
}

function animateScore(name, score) {
  const numEl  = document.getElementById(`score-${name}`);
  const ringEl = document.getElementById(`ring-${name}`);
  const fill   = ringEl?.querySelector('.ring-fill');

  numEl.textContent = score ?? '--';
  if (fill) {
    ringEl.style.setProperty('--ring-color', scoreColor(score));
    fill.style.stroke           = scoreColor(score);
    fill.style.strokeDashoffset = `${100 - (score || 0)}`;
  }
}

// ── New audit button ──────────────────────────────────────────────────────────

document.getElementById('new-audit-btn').addEventListener('click', () => {
  reportSection.classList.add('hidden');
  submitSection.classList.remove('hidden');
  urlInput.value        = '';
  submitBtn.disabled    = false;
  setHeaderStatus('ready', false);
  statusDot.className   = 'status-dot';
  loadRecent();
});

// ── Recent audits ─────────────────────────────────────────────────────────────

function saveToRecent(job) {
  const recent  = JSON.parse(localStorage.getItem('recent-audits') || '[]');
  const entry   = { id: job.id, url: job.url, overall_score: job.overall_score, created_at: job.created_at };
  const filtered = recent.filter((r) => r.url !== job.url);
  filtered.unshift(entry);
  localStorage.setItem('recent-audits', JSON.stringify(filtered.slice(0, 5)));
}

function loadRecent() {
  const recent  = JSON.parse(localStorage.getItem('recent-audits') || '[]');
  const list    = document.getElementById('recent-list');
  const section = document.getElementById('recent-section');

  if (recent.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = recent.map((r) => `
    <div class="recent-item" data-id="${r.id}">
      <span class="recent-item-url">${r.url}</span>
      <span class="recent-item-score">${r.overall_score ?? '--'}/100</span>
      <span class="recent-item-date">${new Date(r.created_at).toLocaleDateString()}</span>
    </div>`).join('');

  list.querySelectorAll('.recent-item').forEach((el) => {
    el.addEventListener('click', async () => {
      setHeaderStatus('loading…', true);
      const res = await fetch(`${API_BASE}/jobs/${el.dataset.id}`);
      showReport(await res.json());
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(msg) {
  inputError.textContent = msg;
}

function setHeaderStatus(text, active) {
  headerStatus.textContent  = text;
  statusDot.className       = `status-dot${active ? ' active' : ''}`;
}

// ── PDF export ────────────────────────────────────────────────────────────────

document.getElementById('download-pdf-btn').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth    = 210;
  const margin       = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const colors = {
    green:  [52, 211, 153],
    dark:   [15, 23, 42],
    dim:    [100, 116, 139],
    dimmer: [148, 163, 184],
    red:    [248, 113, 113],
    yellow: [251, 191, 36],
    bg:     [241, 245, 249]
  };

  const pdfScoreColor = (score) =>
    score >= 80 ? colors.green : score >= 50 ? colors.yellow : colors.red;

  doc.setFillColor(...colors.dark);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text('SEO Audit Engine', margin, 13);
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.dimmer);
  doc.text('seo-audit-engine.pages.dev', margin, 21);

  y = 38;
  const urlText = document.getElementById('report-url-display').textContent;
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...colors.dark);
  doc.text(urlText, margin, y);
  y += 8;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.dim);
  doc.text(
    `${document.getElementById('report-time').textContent} · ${document.getElementById('report-checks').textContent}`,
    margin,
    y
  );
  y += 10;

  const scoreCards = [
    { label: 'OVERALL',       id: 'score-overall' },
    { label: 'PERFORMANCE',   id: 'score-performance' },
    { label: 'ACCESSIBILITY', id: 'score-accessibility' },
    { label: 'SEO',           id: 'score-seo' }
  ];

  const cardWidth = contentWidth / 4;
  scoreCards.forEach((card, i) => {
    const x     = margin + i * cardWidth;
    const score = parseInt(document.getElementById(card.id).textContent, 10) || 0;
    doc.setFillColor(...colors.bg);
    doc.rect(x, y, cardWidth - 2, 22, 'F');
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colors.dim);
    doc.text(card.label, x + 3, y + 6);
    doc.setFont('courier', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...pdfScoreColor(score));
    doc.text(String(score), x + 3, y + 18);
  });

  y += 30;
  document.querySelectorAll('.metric-row').forEach((row) => {
    const key = row.querySelector('.metric-key')?.textContent;
    const val = row.querySelector('.metric-value')?.textContent;
    if (!key || !val) return;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.dim);
    doc.text(key, margin, y);
    doc.setTextColor(...colors.dark);
    doc.text(val, pageWidth - margin, y, { align: 'right' });
    y += 7;
  });

  doc.save(`seo-audit-${urlText.replace(/https?:\/\//, '').replace(/\//g, '-')}.pdf`);
});

// ── Init ──────────────────────────────────────────────────────────────────────

checkApiHealth();
loadRecent();
