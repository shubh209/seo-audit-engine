const API_BASE = 'http://localhost:3000/api';

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
  animateScore('overall', job.overall_score);
  animateScore('performance', job.performance_score);
  animateScore('accessibility', job.accessibility_score);
  animateScore('seo', job.seo_score);

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
// INIT
// ============================================
loadRecent();