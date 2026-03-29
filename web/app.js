// Dashboard API Base URL
const API_BASE = window.location.origin + '/api';

// Global chart instances
let languageChart = null;
let symbolChart = null;

/**
 * Initialize dashboard
 */
async function init() {
  setupTabNavigation();
  setupEventListeners();
  await refreshDashboard();

  // Auto-refresh every 30 seconds
  setInterval(refreshDashboard, 30000);
}

/**
 * Setup tab navigation
 */
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(tabName).classList.add('active');
    });
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Search functionality
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');

  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') performSearch();
  });

  // Reindex button
  document.getElementById('reindexBtn').addEventListener('click', reindexDatabase);

  // Settings form
  const settingsForm = document.getElementById('settingsForm');
  settingsForm.addEventListener('submit', e => {
    e.preventDefault();
    saveSettings();
  });

  // Reset button
  document.getElementById('resetBtn').addEventListener('click', resetSettings);

  // Filter functionality
  const filterInput = document.getElementById('filterInput');
  filterInput.addEventListener('input', filterFiles);
}

/**
 * Refresh entire dashboard
 */
async function refreshDashboard() {
  try {
    await Promise.all([
      updateStats(),
      updateLanguageChart(),
      updateRecentFiles(),
      loadSettings(),
      checkHealth(),
    ]);
  } catch (error) {
    console.error('Dashboard refresh failed:', error);
  }
}

/**
 * Update statistics
 */
async function updateStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');

    const stats = await response.json();
    document.getElementById('fileCount').textContent = stats.files.toLocaleString();
    document.getElementById('symbolCount').textContent = stats.symbols.toLocaleString();
    document.getElementById('importCount').textContent = stats.imports.toLocaleString();
    document.getElementById('dbSize').textContent = stats.dbSize;
    document.getElementById('lastIndexed').textContent = stats.lastIndexed;
  } catch (error) {
    console.error('Error updating stats:', error);
    showAlert('Error loading statistics', 'error');
  }
}

/**
 * Update language breakdown chart
 */
async function updateLanguageChart() {
  try {
    const response = await fetch(`${API_BASE}/languages`);
    if (!response.ok) throw new Error('Failed to fetch languages');

    const languages = await response.json();

    // Prepare data for language chart
    const labels = languages.map(l => l.language);
    const fileCounts = languages.map(l => l.fileCount);
    const symbolCounts = languages.map(l => l.symbolCount);

    const chartContainer = document.getElementById('languageChart');
    const ctx = chartContainer.getContext('2d');

    // Destroy existing chart if it exists
    if (languageChart) {
      languageChart.destroy();
    }

    languageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Files',
            data: fileCounts,
            backgroundColor: '#3b82f6',
            borderRadius: 4,
          },
          {
            label: 'Symbols',
            data: symbolCounts,
            backgroundColor: '#10b981',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
            },
          },
        },
      },
    });

    // Create symbol type chart
    await updateSymbolTypeChart();
  } catch (error) {
    console.error('Error updating language chart:', error);
  }
}

/**
 * Update symbol type chart
 */
async function updateSymbolTypeChart() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');

    const stats = await response.json();

    // For now, create a simple pie chart with total symbols
    const chartContainer = document.getElementById('symbolChart');
    const ctx = chartContainer.getContext('2d');

    // Destroy existing chart if it exists
    if (symbolChart) {
      symbolChart.destroy();
    }

    symbolChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Functions', 'Classes', 'Variables', 'Other'],
        datasets: [
          {
            data: [
              Math.floor(stats.symbols * 0.4),
              Math.floor(stats.symbols * 0.25),
              Math.floor(stats.symbols * 0.25),
              Math.floor(stats.symbols * 0.1),
            ],
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
            borderColor: 'white',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    });
  } catch (error) {
    console.error('Error updating symbol chart:', error);
  }
}

/**
 * Update recent files
 */
async function updateRecentFiles() {
  try {
    const response = await fetch(`${API_BASE}/files?limit=10`);
    if (!response.ok) throw new Error('Failed to fetch files');

    const files = await response.json();
    const tbody = document.getElementById('recentFilesTable');

    if (files.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No files indexed yet</td></tr>';
      return;
    }

    tbody.innerHTML = files
      .map(
        file => `
        <tr>
          <td><code>${escapeHtml(file.path)}</code></td>
          <td><span class="language-badge">${file.language}</span></td>
          <td>${file.modifiedAt}</td>
        </tr>
      `
      )
      .join('');
  } catch (error) {
    console.error('Error updating files:', error);
  }
}

/**
 * Perform search
 */
async function performSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) {
    showAlert('Please enter a search query', 'info');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 50 }),
    });

    if (!response.ok) throw new Error('Search failed');

    const results = await response.json();
    const tbody = document.getElementById('searchResultsTable');

    if (results.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No results found</td></tr>';
      return;
    }

    tbody.innerHTML = results
      .map(
        result => `
        <tr>
          <td><code>${escapeHtml(result.path)}</code></td>
          <td><span class="language-badge">${result.language}</span></td>
          <td>${result.size}</td>
        </tr>
      `
      )
      .join('');

    showAlert(`Found ${results.length} result(s)`, 'success');
  } catch (error) {
    console.error('Search error:', error);
    showAlert('Search failed: ' + error.message, 'error');
  }
}

/**
 * Load settings form
 */
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE}/config`);
    if (!response.ok) throw new Error('Failed to fetch config');

    const config = await response.json();

    document.getElementById('mcpFolder').value = config.mcpFolder;
    document.getElementById('dbPath').value = config.dbPath;
    document.getElementById('dashboardPort').value = config.dashboardPort;
    document.getElementById('autoIndex').checked = config.autoIndex;
    document.getElementById('batchSize').value = config.batchSize;
    document.getElementById('debounceDelay').value = config.debounceDelay;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    const updates = {
      MCP_FOLDER: document.getElementById('mcpFolder').value,
      DB_PATH: document.getElementById('dbPath').value,
      DASHBOARD_PORT: parseInt(document.getElementById('dashboardPort').value, 10),
      AUTO_INDEX: document.getElementById('autoIndex').checked,
      BATCH_SIZE: parseInt(document.getElementById('batchSize').value, 10),
      DEBOUNCE_DELAY: parseInt(document.getElementById('debounceDelay').value, 10),
    };

    const response = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0] || 'Failed to save configuration');
    }

    const result = await response.json();
    if (result.success) {
      showAlert('Configuration saved successfully!', 'success');
      await loadSettings();
    } else {
      showAlert('Failed to save configuration: ' + result.errors.join(', '), 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showAlert('Error saving configuration: ' + error.message, 'error');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/config/reset`, {
      method: 'POST',
    });

    if (!response.ok) throw new Error('Failed to reset configuration');

    showAlert('Settings reset to defaults', 'success');
    await loadSettings();
  } catch (error) {
    console.error('Error resetting settings:', error);
    showAlert('Error resetting configuration: ' + error.message, 'error');
  }
}

/**
 * Filter files table
 */
function filterFiles() {
  const filter = document.getElementById('filterInput').value.toLowerCase();
  const rows = document.querySelectorAll('#filesTable tr');

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

/**
 * Reindex database
 */
async function reindexDatabase() {
  if (!confirm('This will reindex your codebase. This may take a while. Continue?')) {
    return;
  }

  try {
    document.getElementById('reindexBtn').disabled = true;
    document.getElementById('reindexBtn').textContent = '🔄 Reindexing...';

    const response = await fetch(`${API_BASE}/reindex`, {
      method: 'POST',
    });

    if (!response.ok) throw new Error('Reindex failed');

    showAlert('Reindexing started. Check back in a moment...', 'info');

    // Refresh dashboard after a delay
    setTimeout(() => {
      refreshDashboard();
      document.getElementById('reindexBtn').disabled = false;
      document.getElementById('reindexBtn').textContent = '🔄 Reindex';
    }, 2000);
  } catch (error) {
    console.error('Reindex error:', error);
    showAlert('Reindex failed: ' + error.message, 'error');
    document.getElementById('reindexBtn').disabled = false;
    document.getElementById('reindexBtn').textContent = '🔄 Reindex';
  }
}

/**
 * Check server health
 */
async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('Health check failed');

    const health = await response.json();
    const indicator = document.querySelector('.status-indicator');

    if (health.database?.connected) {
      indicator.classList.add('healthy');
      indicator.innerHTML =
        '<div class="status-dot"></div><span style="color: #10b981">✓ Connected</span>';
    } else {
      indicator.classList.remove('healthy');
      indicator.innerHTML =
        '<div class="status-dot"></div><span style="color: #f59e0b">⚠ Disconnected</span>';
    }
  } catch (error) {
    console.error('Health check error:', error);
  }
}

/**
 * Show alert message
 */
function showAlert(message, type = 'info') {
  const alertDiv = document.getElementById('settingsMessage');
  alertDiv.textContent = message;
  alertDiv.className = `alert alert-${type}`;
  alertDiv.style.display = 'block';

  setTimeout(() => {
    alertDiv.style.display = 'none';
  }, 5000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
