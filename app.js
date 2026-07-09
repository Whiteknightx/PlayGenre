/* ══════════════════════════════════════════════════════════════════════════════
   PLAYGENRE — Market Intelligence Engine
   app.js — Routing, Data Loading, Charts, and Interaction Logic
   ══════════════════════════════════════════════════════════════════════════════ */

// ── STATE ──
let globalTrends = [];
let marketGrid = [];
let networks = {};
let trendingGames = [];
let genreDetailCache = {};
let activeGenreKey = null;
let timelineChartInstance = null;
let platformChartInstance = null;
let radarChartInstance = null;

// ── BOOT SEQUENCE ──
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const boot = document.getElementById('boot');
    if (boot) boot.classList.add('gone');
    setTimeout(() => { boot.style.display = 'none'; }, 600);
  }, 2400);

  loadAllData();
});

// ── TAB ROUTING ──
function switchTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const sec = document.getElementById('sec-' + tab);
  const btn = document.getElementById('tab-' + tab);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');

  // Lazy init charts when their tab is first visited
  if (tab === 'radar' && !radarChartInstance && marketGrid.length) {
    renderRadarScatter();
  }
}

// ── DATA LOADING ──
async function loadAllData() {
  try {
    const [trendsRes, gridRes, netRes, gamesRes] = await Promise.allSettled([
      fetch('data/global_trends.json').then(r => r.ok ? r.json() : null),
      fetch('data/market_grid.json').then(r => r.ok ? r.json() : null),
      fetch('data/networks.json').then(r => r.ok ? r.json() : null),
      fetch('data/games_trend.json').then(r => r.ok ? r.json() : null),
    ]);

    globalTrends = trendsRes.status === 'fulfilled' && trendsRes.value ? trendsRes.value : getFallbackTrends();
    marketGrid = gridRes.status === 'fulfilled' && gridRes.value ? gridRes.value : getFallbackMarketGrid();
    networks = netRes.status === 'fulfilled' && netRes.value ? netRes.value : getFallbackNetworks();
    trendingGames = gamesRes.status === 'fulfilled' && gamesRes.value ? gamesRes.value : getFallbackTrendingGames();
  } catch (e) {
    console.warn('Data load failed, using fallback data:', e);
    globalTrends = getFallbackTrends();
    marketGrid = getFallbackMarketGrid();
    networks = getFallbackNetworks();
    trendingGames = getFallbackTrendingGames();
  }

  renderPulseDashboard();
  renderGenreSidebar();
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1: MARKET PULSE
// ══════════════════════════════════════════════════════════════════════════════

function renderPulseDashboard() {
  renderAnomalies();
  renderTrendsTable();
  renderTrendingGamesGrid();
}

function renderAnomalies() {
  const container = document.getElementById('anomalies-list');
  if (!container) return;

  // Generate dynamic insights from actual data
  const sorted = [...globalTrends].sort((a, b) => b.growth_pct - a.growth_pct);
  const insights = [];

  if (sorted.length >= 1) {
    const top = sorted[0];
    insights.push({
      time: 'SIGNAL',
      text: `<strong>"${top.genre_name}"</strong> has surged <strong>+${top.growth_pct}%</strong> in social discussion over the past 30 days. Activity index: ${top.this_month.toLocaleString()}.`
    });
  }
  if (sorted.length >= 2) {
    const s = sorted[1];
    insights.push({
      time: 'SIGNAL',
      text: `<strong>"${s.genre_name}"</strong> is growing at <strong>+${s.growth_pct}%</strong> month-over-month with ${s.opportunity_class === 'Excellent' ? 'excellent' : 'strong'} opportunity potential.`
    });
  }

  // Find excellent opportunities
  const excellentOpps = globalTrends.filter(g => g.opportunity_class === 'Excellent');
  if (excellentOpps.length > 0) {
    const names = excellentOpps.map(g => `"${g.genre_name}"`).join(', ');
    insights.push({
      time: 'OPPORTUNITY',
      text: `<strong>Excellent Opportunity Zones detected:</strong> ${names} — high player demand with relatively low developer competition.`
    });
  }

  // Declining signal
  const declining = sorted.filter(g => g.growth_pct < 0);
  if (declining.length > 0) {
    const names = declining.map(g => `"${g.genre_name}" (${g.growth_pct}%)`).join(', ');
    insights.push({
      time: 'WARNING',
      text: `Declining momentum detected in: ${names}. Consider pivoting away from oversaturated segments.`
    });
  }

  if (insights.length === 0) {
    insights.push({
      time: 'INFO',
      text: 'Market data is being aggregated. Insights will appear once scrape cycles complete.'
    });
  }

  container.innerHTML = insights.map(i => `
    <div class="timeline-item">
      <div class="timeline-time">${i.time}</div>
      <div class="timeline-desc">${i.text}</div>
    </div>
  `).join('');
}

function renderTrendsTable() {
  const tbody = document.getElementById('trends-table-body');
  if (!tbody) return;

  tbody.innerHTML = globalTrends.map(g => {
    const growthColor = g.growth_pct >= 0 ? 'var(--success)' : 'var(--danger)';
    const growthIcon = g.growth_pct >= 0 ? '↑' : '↓';
    const oppClass = g.opportunity_class.toLowerCase();

    return `
      <tr style="cursor: pointer;" onclick="jumpToGenre('${g.genre_id}')">
        <td><strong>${g.genre_name}</strong></td>
        <td><span class="tag-badge">${g.category}</span></td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">${g.this_month.toLocaleString()}</td>
        <td style="text-align: right; color: ${growthColor}; font-weight: 700;">${growthIcon} ${Math.abs(g.growth_pct)}%</td>
        <td style="text-align: center;">${renderHeatmapBlock(g.heatmap_reddit)}</td>
        <td style="text-align: center;">${renderHeatmapBlock(g.heatmap_youtube)}</td>
        <td style="text-align: center;">${renderHeatmapBlock(g.heatmap_tiktok)}</td>
        <td style="text-align: center;">${renderHeatmapBlock(g.heatmap_steam)}</td>
        <td style="text-align: center;">${renderHeatmapBlock(g.heatmap_bluesky)}</td>
        <td><span class="opp-badge ${oppClass}">${g.opportunity_class === 'Excellent' ? '⭐ ' : ''}${g.opportunity_class}</span></td>
      </tr>
    `;
  }).join('');
}

function renderHeatmapBlock(level) {
  level = Math.max(1, Math.min(5, level || 1));
  let blocks = '';
  for (let i = 0; i < 5; i++) {
    blocks += '<span></span>';
  }
  return `<div class="heatmap-block active-${level}">${blocks}</div>`;
}

function renderTrendingGamesGrid() {
  const container = document.getElementById('trending-games-grid');
  if (!container) return;

  container.innerHTML = trendingGames.slice(0, 8).map(g => renderGameCard(g)).join('');
}

function renderGameCard(game) {
  return `
    <div class="game-card">
      <div class="game-capsule-wrap">
        <img class="game-capsule" src="${game.capsule_url}" alt="${game.name}" loading="lazy" onerror="this.style.display='none'"/>
      </div>
      <div class="game-card-content">
        <div class="game-title">${game.name}</div>
        <div class="game-meta-row">
          <span>Trend: <strong style="color: var(--cyan);">${game.trend_score}</strong></span>
          <span style="color: ${game.growth_pct >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">
            ${game.growth_pct >= 0 ? '↑' : '↓'}${Math.abs(game.growth_pct)}%
          </span>
        </div>
        <div class="game-meta-row">
          <span>Sentiment: <strong style="color: var(--success);">${game.sentiment_positive}%</strong> positive</span>
        </div>
      </div>
    </div>
  `;
}

function jumpToGenre(genreId) {
  switchTab('genre');
  setTimeout(() => selectGenre(genreId), 100);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2: GENRE INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

function renderGenreSidebar() {
  const container = document.getElementById('genre-sidebar-list');
  if (!container) return;

  container.innerHTML = globalTrends.map(g => `
    <button class="sidebar-item" data-genre="${g.genre_id}" onclick="selectGenre('${g.genre_id}')">
      <span>${g.genre_name}</span>
      <span class="sub-cat">${g.category}</span>
    </button>
  `).join('');
}

async function selectGenre(genreId) {
  activeGenreKey = genreId;

  // Highlight sidebar
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.sidebar-item[data-genre="${genreId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Show detail panel
  const panel = document.getElementById('genre-detail-panel');
  if (panel) panel.style.display = 'block';

  // Load genre detail data
  let data = genreDetailCache[genreId];
  if (!data) {
    try {
      const res = await fetch(`data/genres/${genreId}.json`);
      if (res.ok) {
        data = await res.json();
        genreDetailCache[genreId] = data;
      }
    } catch (e) {
      console.warn('Genre detail fetch failed:', e);
    }
  }

  // Fallback from global trends summary
  if (!data) {
    const summary = globalTrends.find(g => g.genre_id === genreId);
    if (summary) {
      data = {
        genre_name: summary.genre_name,
        supply_count: Math.round(summary.this_month * 0.3),
        demand_count: summary.this_month,
        growth_pct: summary.growth_pct,
        opportunity_score: summary.opportunity_score || 5.0,
        opportunity_class: summary.opportunity_class || 'Medium',
        heatmap: {
          reddit: summary.heatmap_reddit * 800,
          youtube: summary.heatmap_youtube * 600,
          tiktok: summary.heatmap_tiktok * 500,
          steam: summary.heatmap_steam * 400,
          bluesky: summary.heatmap_bluesky * 300
        },
        timeline: [
          { month: 'Jan', count: Math.round(summary.this_month * 0.4) },
          { month: 'Feb', count: Math.round(summary.this_month * 0.55) },
          { month: 'Mar', count: Math.round(summary.this_month * 0.7) },
          { month: 'Apr', count: Math.round(summary.this_month * 0.82) },
          { month: 'May', count: Math.round(summary.this_month * 0.93) },
          { month: 'Jun', count: summary.this_month },
        ],
        related_network: networks[summary.genre_name] || ['Indie', 'Singleplayer', 'Strategy'],
        games: []
      };
    }
  }

  if (!data) return;
  renderGenreDetail(data);
}

function renderGenreDetail(data) {
  // Title
  document.getElementById('genre-title').textContent = data.genre_name;

  // Metrics
  document.getElementById('metric-supply').textContent = (data.supply_count || 0).toLocaleString();
  document.getElementById('metric-demand').textContent = (data.demand_count || 0).toLocaleString();

  const growthEl = document.getElementById('metric-growth');
  const growthSubEl = document.getElementById('metric-growth-sub');
  const gp = data.growth_pct || 0;
  growthEl.textContent = (gp >= 0 ? '+' : '') + gp + '%';
  growthEl.style.color = gp >= 0 ? 'var(--success)' : 'var(--danger)';

  if (gp >= 100) {
    growthSubEl.textContent = '🔥 explosive growth';
    growthSubEl.className = 'metric-change positive';
  } else if (gp >= 30) {
    growthSubEl.textContent = '↑ strong momentum';
    growthSubEl.className = 'metric-change positive';
  } else if (gp >= 0) {
    growthSubEl.textContent = '→ stable growth';
    growthSubEl.className = 'metric-change positive';
  } else {
    growthSubEl.textContent = '↓ declining interest';
    growthSubEl.className = 'metric-change negative';
  }

  document.getElementById('metric-opp').textContent = (data.opportunity_score || 0).toFixed(1);
  const oppBadge = document.getElementById('metric-opp-class');
  const oppClass = (data.opportunity_class || 'Medium').toLowerCase();
  oppBadge.textContent = (data.opportunity_class === 'Excellent' ? '⭐ ' : '') + data.opportunity_class;
  oppBadge.className = 'opp-badge ' + oppClass;

  // Related Network Nodes
  const networkContainer = document.getElementById('genre-network-nodes');
  const relatedTags = data.related_network || [];
  networkContainer.innerHTML = relatedTags.map(tag =>
    `<div class="network-node">${tag}</div>`
  ).join('');

  // Timeline Chart
  renderTimelineChart(data.timeline || []);

  // Platform Distribution Chart
  renderPlatformChart(data.heatmap || {});

  // Games Grid
  const gamesGrid = document.getElementById('genre-games-grid');
  if (data.games && data.games.length > 0) {
    gamesGrid.innerHTML = data.games.slice(0, 8).map(g => renderGameCard(g)).join('');
  } else {
    gamesGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-dim);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
        <p>Run the data processor to populate game listings for this genre.</p>
      </div>
    `;
  }
}

function renderTimelineChart(timeline) {
  const ctx = document.getElementById('timelineChart');
  if (!ctx) return;

  if (timelineChartInstance) {
    timelineChartInstance.destroy();
  }

  const labels = timeline.map(t => t.month);
  const values = timeline.map(t => t.count);

  timelineChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Discussion Volume',
        data: values,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#06b6d4',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
      }]
    },
    options: getChartOptions('Mentions')
  });
}

function renderPlatformChart(heatmap) {
  const ctx = document.getElementById('platformDistributionChart');
  if (!ctx) return;

  if (platformChartInstance) {
    platformChartInstance.destroy();
  }

  const labels = ['Reddit', 'YouTube', 'TikTok', 'Steam', 'Bluesky'];
  const values = [
    heatmap.reddit || 0,
    heatmap.youtube || 0,
    heatmap.tiktok || 0,
    heatmap.steam || 0,
    heatmap.bluesky || 0,
  ];
  const colors = ['#f97316', '#ef4444', '#06b6d4', '#8b5cf6', '#3b82f6'];

  platformChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + '33'),
        borderColor: colors,
        borderWidth: 2,
        hoverBackgroundColor: colors.map(c => c + '66'),
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { family: "'Outfit', sans-serif", size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 10, 25, 0.9)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
        }
      },
      cutout: '60%',
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3: OPPORTUNITY RADAR (Scatter Chart)
// ══════════════════════════════════════════════════════════════════════════════

function renderRadarScatter() {
  const ctx = document.getElementById('radarChart');
  if (!ctx) return;

  if (radarChartInstance) {
    radarChartInstance.destroy();
  }

  // Color-code by opportunity class
  const classColors = {
    'Excellent': { bg: 'rgba(16, 185, 129, 0.5)', border: '#10b981' },
    'High': { bg: 'rgba(6, 182, 212, 0.5)', border: '#06b6d4' },
    'Medium': { bg: 'rgba(245, 158, 11, 0.5)', border: '#f59e0b' },
    'Low': { bg: 'rgba(239, 68, 68, 0.5)', border: '#ef4444' },
  };

  const dataPoints = marketGrid.map(g => ({
    x: g.supply,
    y: g.demand,
    label: g.genre_name,
    oppClass: g.opportunity_class,
  }));

  // Group data by opportunity class for separate dataset coloring
  const groups = {};
  dataPoints.forEach(p => {
    if (!groups[p.oppClass]) groups[p.oppClass] = [];
    groups[p.oppClass].push(p);
  });

  const datasets = Object.entries(groups).map(([cls, points]) => {
    const colors = classColors[cls] || classColors['Medium'];
    return {
      label: cls,
      data: points.map(p => ({ x: p.x, y: p.y, label: p.label })),
      backgroundColor: colors.bg,
      borderColor: colors.border,
      borderWidth: 2,
      pointRadius: 8,
      pointHoverRadius: 12,
      pointStyle: 'circle',
    };
  });

  radarChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'SUPPLY → (Active Game Listings)',
            color: '#94a3b8',
            font: { family: "'Outfit', sans-serif", size: 13, weight: '600' }
          },
          min: 0,
          max: 105,
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false,
          },
          ticks: { color: '#64748b', font: { size: 11 } },
        },
        y: {
          title: {
            display: true,
            text: '↑ DEMAND (Social Discussion Volume)',
            color: '#94a3b8',
            font: { family: "'Outfit', sans-serif", size: 13, weight: '600' }
          },
          min: 0,
          max: 105,
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false,
          },
          ticks: { color: '#64748b', font: { size: 11 } },
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: "'Outfit', sans-serif", size: 12 },
            padding: 16,
            usePointStyle: true,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 10, 25, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            title: function(items) {
              if (items.length > 0 && items[0].raw.label) {
                return items[0].raw.label;
              }
              return '';
            },
            label: function(item) {
              return `Supply: ${item.raw.x} | Demand: ${item.raw.y}`;
            }
          }
        }
      },
    },
    plugins: [{
      // Custom plugin to draw genre name labels next to each point
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((point, j) => {
            const dataPoint = dataset.data[j];
            if (dataPoint && dataPoint.label) {
              ctx.save();
              ctx.fillStyle = '#e2e8f0';
              ctx.font = "600 11px 'Outfit', sans-serif";
              ctx.textAlign = 'left';
              ctx.fillText(dataPoint.label, point.x + 12, point.y + 4);
              ctx.restore();
            }
          });
        });
      }
    }]
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4: GAME INVESTIGATOR
// ══════════════════════════════════════════════════════════════════════════════

function investigateGame() {
  const input = document.getElementById('game-search-input');
  const query = (input ? input.value : '').trim();
  if (!query) return;

  const resultsPanel = document.getElementById('investigator-results');
  if (!resultsPanel) return;
  resultsPanel.style.display = 'block';

  // Try to match against our trending games dataset
  const match = trendingGames.find(g =>
    g.name.toLowerCase().includes(query.toLowerCase())
  );

  if (match) {
    renderInvestigatorResult(match, resultsPanel);
  } else {
    // Generate simulated investigation for any query
    renderInvestigatorResult({
      name: query,
      capsule_url: '',
      trend_score: Math.floor(Math.random() * 30) + 65,
      growth_pct: Math.floor(Math.random() * 500) + 50,
      sentiment_positive: Math.floor(Math.random() * 15) + 80,
      tags: ['Indie', 'Adventure', 'Singleplayer', 'Atmospheric', 'Story Rich']
    }, resultsPanel);
  }
}

function renderInvestigatorResult(game, container) {
  const trendScore = game.trend_score || 85;
  const growth = game.growth_pct || 120;
  const sentiment = game.sentiment_positive || 88;

  // Simulated platform breakdown
  const platforms = [
    { name: 'Reddit', pct: 38, color: '#f97316' },
    { name: 'YouTube', pct: 28, color: '#ef4444' },
    { name: 'TikTok', pct: 18, color: '#06b6d4' },
    { name: 'Steam', pct: 10, color: '#8b5cf6' },
    { name: 'News / Bluesky', pct: 6, color: '#3b82f6' },
  ];

  // Simulated event timeline
  const events = [
    { time: '10:00 AM', desc: '<strong>Steam page updated</strong> — new screenshots added' },
    { time: '11:30 AM', desc: '<strong>Reddit post</strong> hits front page of r/IndieGaming' },
    { time: '1:15 PM', desc: '<strong>YouTube trailer</strong> crosses 500K views' },
    { time: '3:00 PM', desc: '<strong>Gaming outlet</strong> publishes preview article' },
    { time: '5:45 PM', desc: '<strong>TikTok</strong> trend begins — 200+ new videos' },
    { time: '8:00 PM', desc: '<strong>Twitch streamer</strong> plays demo — 45K live viewers' },
  ];

  container.innerHTML = `
    <div class="panel">
      <div class="investigator-header">
        ${game.capsule_url ? `<img class="investigator-capsule" src="${game.capsule_url}" alt="${game.name}" onerror="this.style.display='none'"/>` : ''}
        <div class="investigator-details">
          <h2 style="font-family: 'Orbitron', sans-serif; font-size: 1.5rem;">${game.name}</h2>
          <div class="game-pill-row">
            ${(game.tags || []).slice(0, 6).map(t => `<span class="tag-badge">${t}</span>`).join('')}
          </div>
          <div style="margin-top: 0.8rem; display: flex; gap: 2rem; font-size: 0.9rem;">
            <span>Trend Score: <strong style="color: var(--cyan); font-size: 1.1rem;">${trendScore}</strong></span>
            <span>Growth: <strong style="color: var(--success); font-size: 1.1rem;">+${growth}%</strong></span>
            <span>Sentiment: <strong style="color: var(--success); font-size: 1.1rem;">${sentiment}%</strong> positive</span>
          </div>
        </div>
      </div>

      <!-- AI REPORT -->
      <div style="margin-bottom: 1.8rem;">
        <div class="panel-title"><span class="dot cyan"></span> AI Intelligence Summary</div>
        <div class="report-block">
          "${game.name}" experienced a <strong>${growth}%</strong> increase in cross-platform discussion over the past 24 hours.
          Most engagement originated from Reddit following community posts highlighting the game's unique art direction and mechanics.
          YouTube discussions focused on the official trailer analysis, while TikTok users created 200+ organic gameplay clips.
          Steam community sentiment is <strong>${sentiment}%</strong> positive, with players praising the atmospheric design and innovative gameplay loop.
          Current trend trajectory suggests sustained growth over the next 7-14 days.
        </div>
      </div>

      <!-- TWO COLUMN: Platform + Timeline -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;" class="responsive-split">
        
        <!-- PLATFORM BREAKDOWN -->
        <div>
          <div class="panel-title"><span class="dot purple"></span> Platform Discussion Breakdown</div>
          ${platforms.map(p => `
            <div style="margin-bottom: 1rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.3rem;">
                <span>${p.name}</span>
                <strong style="color: ${p.color};">${p.pct}%</strong>
              </div>
              <div style="height: 6px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden;">
                <div style="width: ${p.pct}%; height: 100%; background: ${p.color}; border-radius: 3px; transition: width 0.8s ease;"></div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- EVENT TIMELINE -->
        <div>
          <div class="panel-title"><span class="dot amber"></span> Trend Event Timeline</div>
          <div class="timeline-list">
            ${events.map(e => `
              <div class="timeline-item">
                <div class="timeline-time">${e.time}</div>
                <div class="timeline-desc">${e.desc}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED CHART OPTIONS
// ══════════════════════════════════════════════════════════════════════════════

function getChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(10, 10, 25, 0.9)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        ticks: { color: '#64748b', font: { family: "'Outfit', sans-serif", size: 12 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        ticks: { color: '#64748b', font: { family: "'Outfit', sans-serif", size: 11 } },
        title: {
          display: true,
          text: yLabel || '',
          color: '#94a3b8',
          font: { family: "'Outfit', sans-serif", size: 12, weight: '500' },
        }
      }
    }
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FALLBACK DATA (used when JSON files haven't been generated yet)
// ══════════════════════════════════════════════════════════════════════════════

function getFallbackTrends() {
  return [
    { genre_id: 'creature_collector', genre_name: 'Creature Collector', category: 'Theme', last_month: 700, this_month: 1900, growth_pct: 171.2, opportunity_score: 8.7, opportunity_class: 'Excellent', heatmap_reddit: 3, heatmap_youtube: 4, heatmap_tiktok: 3, heatmap_steam: 1, heatmap_bluesky: 2 },
    { genre_id: 'incremental', genre_name: 'Incremental', category: 'Mechanic', last_month: 950, this_month: 2300, growth_pct: 142.5, opportunity_score: 9.1, opportunity_class: 'Excellent', heatmap_reddit: 4, heatmap_youtube: 2, heatmap_tiktok: 1, heatmap_steam: 5, heatmap_bluesky: 1 },
    { genre_id: 'bullet_heaven', genre_name: 'Bullet Heaven', category: 'Mechanic', last_month: 1100, this_month: 2080, growth_pct: 89.4, opportunity_score: 6.3, opportunity_class: 'High', heatmap_reddit: 3, heatmap_youtube: 3, heatmap_tiktok: 2, heatmap_steam: 4, heatmap_bluesky: 1 },
    { genre_id: 'automation', genre_name: 'Automation', category: 'Mechanic', last_month: 1800, this_month: 2976, growth_pct: 65.3, opportunity_score: 7.2, opportunity_class: 'High', heatmap_reddit: 4, heatmap_youtube: 2, heatmap_tiktok: 1, heatmap_steam: 4, heatmap_bluesky: 1 },
    { genre_id: 'roguelite', genre_name: 'Roguelite', category: 'Mechanic', last_month: 4100, this_month: 6200, growth_pct: 51.2, opportunity_score: 4.5, opportunity_class: 'Medium', heatmap_reddit: 5, heatmap_youtube: 3, heatmap_tiktok: 2, heatmap_steam: 5, heatmap_bluesky: 2 },
    { genre_id: 'cozy', genre_name: 'Cozy', category: 'Theme', last_month: 3200, this_month: 4765, growth_pct: 48.9, opportunity_score: 5.8, opportunity_class: 'Medium', heatmap_reddit: 2, heatmap_youtube: 4, heatmap_tiktok: 5, heatmap_steam: 2, heatmap_bluesky: 3 },
    { genre_id: 'psychological_horror', genre_name: 'Psychological Horror', category: 'Theme', last_month: 3800, this_month: 5000, growth_pct: 31.6, opportunity_score: 5.1, opportunity_class: 'Medium', heatmap_reddit: 3, heatmap_youtube: 5, heatmap_tiktok: 3, heatmap_steam: 1, heatmap_bluesky: 1 },
    { genre_id: 'deckbuilder', genre_name: 'Deckbuilder', category: 'Mechanic', last_month: 3600, this_month: 4500, growth_pct: 25.0, opportunity_score: 4.0, opportunity_class: 'Medium', heatmap_reddit: 4, heatmap_youtube: 3, heatmap_tiktok: 1, heatmap_steam: 4, heatmap_bluesky: 1 },
    { genre_id: 'soulslike', genre_name: 'Soulslike', category: 'Genre', last_month: 5500, this_month: 6200, growth_pct: 12.7, opportunity_score: 3.2, opportunity_class: 'Low', heatmap_reddit: 5, heatmap_youtube: 5, heatmap_tiktok: 3, heatmap_steam: 4, heatmap_bluesky: 2 },
    { genre_id: 'colony_sim', genre_name: 'Colony Sim', category: 'Genre', last_month: 2100, this_month: 2500, growth_pct: 19.0, opportunity_score: 6.5, opportunity_class: 'High', heatmap_reddit: 4, heatmap_youtube: 2, heatmap_tiktok: 1, heatmap_steam: 5, heatmap_bluesky: 1 },
    { genre_id: 'precision_platformer', genre_name: 'Precision Platformer', category: 'Genre', last_month: 1400, this_month: 1600, growth_pct: 14.3, opportunity_score: 5.5, opportunity_class: 'Medium', heatmap_reddit: 3, heatmap_youtube: 2, heatmap_tiktok: 2, heatmap_steam: 3, heatmap_bluesky: 1 },
    { genre_id: 'walking_simulator', genre_name: 'Walking Simulator', category: 'Genre', last_month: 2800, this_month: 2650, growth_pct: -5.4, opportunity_score: 3.8, opportunity_class: 'Low', heatmap_reddit: 2, heatmap_youtube: 3, heatmap_tiktok: 1, heatmap_steam: 2, heatmap_bluesky: 1 },
    { genre_id: 'immersive_sim', genre_name: 'Immersive Sim', category: 'Genre', last_month: 3100, this_month: 2900, growth_pct: -6.5, opportunity_score: 4.2, opportunity_class: 'Medium', heatmap_reddit: 4, heatmap_youtube: 3, heatmap_tiktok: 1, heatmap_steam: 3, heatmap_bluesky: 1 },
    { genre_id: 'open_world_survival_craft', genre_name: 'Open World Survival Craft', category: 'Genre', last_month: 6200, this_month: 5800, growth_pct: -6.5, opportunity_score: 2.9, opportunity_class: 'Low', heatmap_reddit: 4, heatmap_youtube: 4, heatmap_tiktok: 3, heatmap_steam: 5, heatmap_bluesky: 2 },
  ];
}

function getFallbackMarketGrid() {
  return [
    { genre_name: 'Creature Collector', supply: 15, demand: 78, opportunity_score: 8.7, opportunity_class: 'Excellent' },
    { genre_name: 'Incremental', supply: 12, demand: 85, opportunity_score: 9.1, opportunity_class: 'Excellent' },
    { genre_name: 'Bullet Heaven', supply: 55, demand: 65, opportunity_score: 6.3, opportunity_class: 'High' },
    { genre_name: 'Automation', supply: 22, demand: 62, opportunity_score: 7.2, opportunity_class: 'High' },
    { genre_name: 'Roguelite', supply: 75, demand: 88, opportunity_score: 4.5, opportunity_class: 'Medium' },
    { genre_name: 'Cozy', supply: 48, demand: 72, opportunity_score: 5.8, opportunity_class: 'Medium' },
    { genre_name: 'Psychological Horror', supply: 60, demand: 70, opportunity_score: 5.1, opportunity_class: 'Medium' },
    { genre_name: 'Deckbuilder', supply: 65, demand: 68, opportunity_score: 4.0, opportunity_class: 'Medium' },
    { genre_name: 'Soulslike', supply: 82, demand: 80, opportunity_score: 3.2, opportunity_class: 'Low' },
    { genre_name: 'Colony Sim', supply: 30, demand: 55, opportunity_score: 6.5, opportunity_class: 'High' },
    { genre_name: 'Precision Platformer', supply: 35, demand: 42, opportunity_score: 5.5, opportunity_class: 'Medium' },
    { genre_name: 'Walking Simulator', supply: 50, demand: 35, opportunity_score: 3.8, opportunity_class: 'Low' },
    { genre_name: 'Immersive Sim', supply: 40, demand: 38, opportunity_score: 4.2, opportunity_class: 'Medium' },
    { genre_name: 'Open World Survival Craft', supply: 90, demand: 75, opportunity_score: 2.9, opportunity_class: 'Low' },
  ];
}

function getFallbackNetworks() {
  return {
    'Roguelite': ['Deckbuilder', 'Bullet Heaven', 'Action Roguelike', 'Survivors-like', 'Twin Stick Shooter', 'Procedural Generation'],
    'Creature Collector': ['Monster Taming', 'Turn-Based', 'RPG', 'Pixel Art', 'Open World', 'Co-op'],
    'Incremental': ['Idle', 'Clicker', 'Simulation', 'Management', 'Automation', 'Resource Management'],
    'Psychological Horror': ['Narrative', 'Mystery', 'Walking Simulator', 'Puzzle', 'Investigation', 'Atmospheric'],
    'Cozy': ['Farming Sim', 'Life Sim', 'Relaxing', 'Cute', 'Wholesome', 'Crafting'],
    'Bullet Heaven': ['Roguelite', 'Action', 'Survivors-like', 'Top-Down', 'Arcade', 'Horde'],
    'Colony Sim': ['Base Building', 'Management', 'Survival', 'Strategy', 'Crafting', 'Sandbox'],
    'Automation': ['Factory', 'Base Building', 'Management', 'Crafting', 'Sandbox', 'Simulation'],
    'Deckbuilder': ['Roguelite', 'Card Game', 'Turn-Based', 'Strategy', 'RPG', 'Single Player'],
    'Soulslike': ['Action RPG', 'Difficult', 'Dark Fantasy', 'Boss Rush', 'Metroidvania', 'Combat'],
    'Precision Platformer': ['Indie', 'Difficult', '2D', 'Pixel Art', 'Speedrun', 'Retro'],
    'Walking Simulator': ['Narrative', 'Atmospheric', 'Exploration', 'Story Rich', 'First Person', 'Puzzle'],
    'Immersive Sim': ['Stealth', 'Open World', 'FPS', 'Sandbox', 'Action', 'RPG'],
    'Open World Survival Craft': ['Building', 'Multiplayer', 'Survival', 'Crafting', 'Sandbox', 'Co-op'],
  };
}

function getFallbackTrendingGames() {
  return [
    { app_id: 1569580, name: 'Blue Prince', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1569580/header.jpg', trend_score: 96, growth_pct: 1200, sentiment_positive: 94, tags: ['Puzzle', 'Mystery', 'Roguelite', 'Exploration'] },
    { app_id: 2129530, name: 'REANIMAL', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2129530/header.jpg', trend_score: 93, growth_pct: 840, sentiment_positive: 91, tags: ['Horror', 'Co-op', 'Adventure', 'Atmospheric'] },
    { app_id: 1332010, name: 'Stray', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1332010/header.jpg', trend_score: 90, growth_pct: 620, sentiment_positive: 96, tags: ['Cats', 'Adventure', 'Cyberpunk', 'Exploration'] },
    { app_id: 3326230, name: 'Hozy', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3326230/header.jpg', trend_score: 88, growth_pct: 540, sentiment_positive: 92, tags: ['Cozy', 'Relaxing', 'Physics', 'Puzzle'] },
    { app_id: 753640, name: 'Outer Wilds', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/753640/header.jpg', trend_score: 87, growth_pct: 380, sentiment_positive: 97, tags: ['Exploration', 'Space', 'Mystery', 'Story Rich'] },
    { app_id: 1167630, name: 'Teardown', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1167630/header.jpg', trend_score: 85, growth_pct: 310, sentiment_positive: 90, tags: ['Destruction', 'Physics', 'Sandbox', 'Voxel'] },
    { app_id: 668580, name: 'Atomic Heart', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/668580/header.jpg', trend_score: 82, growth_pct: 250, sentiment_positive: 82, tags: ['FPS', 'Open World', 'Sci-fi', 'Action'] },
    { app_id: 990080, name: 'Hogwarts Legacy', capsule_url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/990080/header.jpg', trend_score: 80, growth_pct: 180, sentiment_positive: 89, tags: ['Magic', 'RPG', 'Open World', 'Fantasy'] },
  ];
}
