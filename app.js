/* ============================================================
   Wine Tasting Showdown — App Logic
   All DOM manipulation uses safe methods (createElement,
   textContent, setAttribute) per secure coding guidelines.
   ============================================================ */

(function () {
  'use strict';

  // --- Wine Registry (shared with host.html via localStorage) ---
  let wineRegistry = {};

  function loadWineRegistry() {
    try {
      const data = localStorage.getItem('wine-registry');
      if (data) wineRegistry = JSON.parse(data) || {};
    } catch (e) {
      wineRegistry = {};
    }
  }

  /** Returns display name for a bottle, e.g. "Honig, 2023" or "Bottle 7" */
  function bottleName(id) {
    const wine = wineRegistry[id];
    if (wine) {
      let name = wine.winery;
      if (wine.year && wine.year !== '—') name += ', ' + wine.year;
      return name;
    }
    return 'Bottle ' + id;
  }

  /** Returns full detail line, e.g. "Honig, 2023 · Napa Valley · Brought by Alice" */
  function bottleDetail(id) {
    const wine = wineRegistry[id];
    if (wine) {
      let parts = [wine.winery];
      if (wine.year && wine.year !== '—') parts.push(wine.year);
      if (wine.region && wine.region !== '—') parts.push(wine.region);
      if (wine.broughtBy && wine.broughtBy !== '—') parts.push('Brought by ' + wine.broughtBy);
      return parts.join(' · ');
    }
    return '';
  }

  // --- DOM References ---
  const inputTextarea = document.getElementById('rankings-input');
  const btnLoadSample = document.getElementById('btn-load-sample');
  const btnAnalyze = document.getElementById('btn-analyze');
  const inputError = document.getElementById('input-error');
  const resultsSection = document.getElementById('results-section');
  const footer = document.getElementById('footer');

  // --- Sample Data Generator ---
  function generateSampleData() {
    const names = [
      'Alice', 'Bob', 'Charlie', 'Diana', 'Ethan',
      'Fiona', 'George', 'Hannah', 'Ivan', 'Julia',
      'Kevin', 'Laura', 'Marco', 'Nina', 'Oscar',
      'Priya', 'Quinn', 'Rachel', 'Sam', 'Tara'
    ];
    const numBottles = 20;

    // Create a "ground truth" preference to make data somewhat correlated
    const groundTruth = shuffleArray(
      Array.from({ length: numBottles }, (_, i) => i + 1)
    );

    const lines = names.map((name) => {
      // Start from ground truth and apply random swaps to simulate variation
      const ranking = [...groundTruth];
      const swapCount = 10 + Math.floor(Math.random() * 40); // 10-50 swaps
      for (let s = 0; s < swapCount; s++) {
        const i = Math.floor(Math.random() * numBottles);
        const j = Math.floor(Math.random() * numBottles);
        [ranking[i], ranking[j]] = [ranking[j], ranking[i]];
      }
      return name + ': ' + ranking.join(', ');
    });

    return lines.join('\n');
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // --- Parse Input ---
  function parseRankings(text) {
    const lines = text.trim().split('\n').filter((l) => l.trim().length > 0);
    const rankings = {};
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        errors.push('Line ' + (i + 1) + ': missing colon separator.');
        continue;
      }

      const name = line.substring(0, colonIndex).trim();
      const bottlesStr = line.substring(colonIndex + 1).trim();

      if (!name) {
        errors.push('Line ' + (i + 1) + ': empty name.');
        continue;
      }

      if (rankings[name]) {
        errors.push('Line ' + (i + 1) + ': duplicate name "' + name + '".');
        continue;
      }

      const bottles = bottlesStr
        .split(/[,\s]+/)
        .filter((b) => b.length > 0)
        .map(Number);

      if (bottles.some(isNaN)) {
        errors.push(
          'Line ' + (i + 1) + ': non-numeric bottle ID for "' + name + '".'
        );
        continue;
      }

      // Check for duplicate bottles
      const bottleSet = new Set(bottles);
      if (bottleSet.size !== bottles.length) {
        errors.push(
          'Line ' + (i + 1) + ': duplicate bottle IDs for "' + name + '".'
        );
        continue;
      }

      rankings[name] = bottles;
    }

    // Validate all have same bottles
    const names = Object.keys(rankings);
    if (names.length < 2) {
      errors.push('Need at least 2 people\'s rankings.');
    }

    if (names.length > 0) {
      const expectedBottles = new Set(rankings[names[0]]);
      for (let i = 1; i < names.length; i++) {
        const currentBottles = new Set(rankings[names[i]]);
        if (currentBottles.size !== expectedBottles.size) {
          errors.push(
            '"' +
              names[i] +
              '" ranked ' +
              currentBottles.size +
              ' bottles, expected ' +
              expectedBottles.size +
              '.'
          );
        }
      }
    }

    return { rankings, errors };
  }

  // --- Statistical Computations ---

  /**
   * Compute Borda-count style overall ranking.
   * Each person's #1 gets rank 1, #2 gets rank 2, etc.
   * Sum ranks across all people. Lower sum = better bottle.
   */
  function computeOverallRankings(rankings) {
    const names = Object.keys(rankings);
    const bottleScores = {};

    for (const name of names) {
      const bottles = rankings[name];
      for (let i = 0; i < bottles.length; i++) {
        const bottleId = bottles[i];
        if (!bottleScores[bottleId]) {
          bottleScores[bottleId] = { totalRank: 0, ranks: [] };
        }
        bottleScores[bottleId].totalRank += i + 1; // 1-indexed rank
        bottleScores[bottleId].ranks.push(i + 1);
      }
    }

    const sorted = Object.entries(bottleScores)
      .map(([id, data]) => ({
        bottleId: parseInt(id),
        totalRank: data.totalRank,
        avgRank: data.totalRank / names.length,
        ranks: data.ranks,
        variance: computeVariance(data.ranks),
        bestRank: Math.min(...data.ranks),
        worstRank: Math.max(...data.ranks),
      }))
      .sort((a, b) => a.totalRank - b.totalRank);

    return sorted;
  }

  function computeVariance(arr) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  }

  /**
   * Kendall's Tau-b rank correlation between two rankings.
   * Returns a value in [-1, 1].
   */
  function kendallTau(ranking1, ranking2) {
    // Build position maps
    const pos1 = {};
    const pos2 = {};
    for (let i = 0; i < ranking1.length; i++) {
      pos1[ranking1[i]] = i;
    }
    for (let i = 0; i < ranking2.length; i++) {
      pos2[ranking2[i]] = i;
    }

    const items = ranking1; // both should have the same items
    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const diff1 = pos1[a] - pos1[b];
        const diff2 = pos2[a] - pos2[b];
        if (diff1 * diff2 > 0) {
          concordant++;
        } else if (diff1 * diff2 < 0) {
          discordant++;
        }
      }
    }

    const n = items.length;
    const totalPairs = (n * (n - 1)) / 2;
    if (totalPairs === 0) return 0;
    return (concordant - discordant) / totalPairs;
  }

  /**
   * Compute pairwise agreement matrix and per-person stats.
   */
  function computeAgreements(rankings) {
    const names = Object.keys(rankings);
    const n = names.length;
    const matrix = {};
    const avgScores = {};

    for (const name of names) {
      matrix[name] = {};
      avgScores[name] = { total: 0, count: 0 };
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const tau = kendallTau(rankings[names[i]], rankings[names[j]]);
        matrix[names[i]][names[j]] = tau;
        matrix[names[j]][names[i]] = tau;
        avgScores[names[i]].total += tau;
        avgScores[names[i]].count++;
        avgScores[names[j]].total += tau;
        avgScores[names[j]].count++;
      }
      matrix[names[i]][names[i]] = 1.0; // self-correlation
    }

    const personStats = names
      .map((name) => ({
        name,
        avgAgreement:
          avgScores[name].count > 0
            ? avgScores[name].total / avgScores[name].count
            : 0,
      }))
      .sort((a, b) => b.avgAgreement - a.avgAgreement);

    // Find best and worst pair
    let bestPair = { names: ['', ''], tau: -Infinity };
    let worstPair = { names: ['', ''], tau: Infinity };

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const tau = matrix[names[i]][names[j]];
        if (tau > bestPair.tau) {
          bestPair = { names: [names[i], names[j]], tau };
        }
        if (tau < worstPair.tau) {
          worstPair = { names: [names[i], names[j]], tau };
        }
      }
    }

    return { matrix, personStats, bestPair, worstPair, names };
  }

  /**
   * Find each person's "closest twin" (highest pairwise tau).
   */
  function findClosestTwin(name, matrix, allNames) {
    let bestName = '';
    let bestTau = -Infinity;
    for (const other of allNames) {
      if (other === name) continue;
      const tau = matrix[name][other];
      if (tau > bestTau) {
        bestTau = tau;
        bestName = other;
      }
    }
    return { name: bestName, tau: bestTau };
  }

  // --- DOM Rendering (all safe — no innerHTML) ---

  function clearElement(el) {
    el.replaceChildren();
  }

  function createElement(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
  }

  function renderResults(rankings) {
    loadWineRegistry();
    const overallRankings = computeOverallRankings(rankings);
    const agreements = computeAgreements(rankings);

    renderPodium(overallRankings);
    renderRankingsTable(overallRankings, Object.keys(rankings).length);
    renderConsensusControversy(overallRankings);
    renderTasteTwinsWolves(agreements);
    renderPairs(agreements);
    renderMatrix(agreements);
    renderIndividualCards(rankings, agreements, overallRankings);

    resultsSection.classList.remove('hidden');
    footer.classList.remove('hidden');

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPodium(overallRankings) {
    const container = document.getElementById('podium-area');
    clearElement(container);

    if (overallRankings.length < 3) return;

    // Display order: 2nd, 1st, 3rd
    const displayOrder = [
      { data: overallRankings[1], place: 2, label: '2nd Place' },
      { data: overallRankings[0], place: 1, label: '1st Place' },
      { data: overallRankings[2], place: 3, label: '3rd Place' },
    ];

    const medals = ['🥈', '🥇', '🥉'];

    displayOrder.forEach((item, idx) => {
      const podiumItem = createElement('div', 'podium-item');

      const label = createElement('div', 'podium-label', item.label);
      podiumItem.appendChild(label);

      const pedestal = createElement('div', 'podium-pedestal');

      const rank = createElement(
        'div',
        'podium-rank',
        medals[idx] + ' #' + item.data.bottleId
      );
      pedestal.appendChild(rank);

      const bottleInfo = createElement(
        'div',
        'podium-bottle',
        bottleName(item.data.bottleId)
      );
      pedestal.appendChild(bottleInfo);

      const detail = bottleDetail(item.data.bottleId);
      if (detail) {
        const detailEl = createElement('div', 'podium-score', detail);
        pedestal.appendChild(detailEl);
      }

      const score = createElement(
        'div',
        'podium-score',
        'Avg rank: ' + item.data.avgRank.toFixed(1)
      );
      pedestal.appendChild(score);

      podiumItem.appendChild(pedestal);
      container.appendChild(podiumItem);
    });
  }

  function renderRankingsTable(overallRankings, numPeople) {
    const wrapper = document.getElementById('rankings-table-wrapper');
    clearElement(wrapper);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    ['Rank', 'Bottle', 'Total Score', 'Avg Rank', 'Best', 'Worst', 'Spread'].forEach(
      (text) => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
      }
    );
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const maxTotal = overallRankings[overallRankings.length - 1].totalRank;
    const minTotal = overallRankings[0].totalRank;

    overallRankings.forEach((item, idx) => {
      const row = document.createElement('tr');

      const rankCell = document.createElement('td');
      rankCell.textContent = '#' + (idx + 1);
      rankCell.style.fontWeight = '700';
      if (idx < 3) rankCell.style.color = 'var(--wine-gold)';
      row.appendChild(rankCell);

      const bottleCell = document.createElement('td');
      const bottleMain = createElement('span', null, bottleName(item.bottleId));
      bottleCell.appendChild(bottleMain);
      const wine = wineRegistry[item.bottleId];
      if (wine) {
        bottleCell.setAttribute('title', bottleDetail(item.bottleId));
        if (wine.broughtBy && wine.broughtBy !== '—') {
          const broughtBy = createElement('span', 'brought-by', ' · ' + wine.broughtBy);
          bottleCell.appendChild(broughtBy);
        }
      }
      row.appendChild(bottleCell);

      const scoreCell = document.createElement('td');
      scoreCell.textContent = item.totalRank;
      row.appendChild(scoreCell);

      const avgCell = document.createElement('td');
      avgCell.textContent = item.avgRank.toFixed(1);
      row.appendChild(avgCell);

      const bestCell = document.createElement('td');
      bestCell.textContent = item.bestRank;
      bestCell.style.color = 'var(--wine-green)';
      row.appendChild(bestCell);

      const worstCell = document.createElement('td');
      worstCell.textContent = item.worstRank;
      worstCell.style.color = 'var(--wine-rose)';
      row.appendChild(worstCell);

      // Spread bar
      const spreadCell = document.createElement('td');
      spreadCell.className = 'rank-bar-cell';
      const bar = document.createElement('div');
      const pct =
        maxTotal > minTotal
          ? ((item.totalRank - minTotal) / (maxTotal - minTotal)) * 100
          : 50;
      bar.className =
        'rank-bar ' + (pct < 33 ? 'low' : pct < 66 ? 'mid' : 'high');
      bar.style.width = Math.max(4, pct) + '%';
      spreadCell.appendChild(bar);
      row.appendChild(spreadCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
  }

  function renderConsensusControversy(overallRankings) {
    const consensusList = document.getElementById('consensus-list');
    const controversyList = document.getElementById('controversy-list');
    clearElement(consensusList);
    clearElement(controversyList);

    const byVariance = [...overallRankings].sort(
      (a, b) => a.variance - b.variance
    );
    const maxVariance = byVariance[byVariance.length - 1].variance;

    // Top 5 most agreed-upon
    const top5consensus = byVariance.slice(0, 5);
    const badges = ['badge-gold', 'badge-silver', 'badge-bronze', 'badge-neutral', 'badge-neutral'];

    top5consensus.forEach((item, idx) => {
      const el = createStatItem(
        badges[idx],
        idx + 1,
        bottleName(item.bottleId),
        'Variance: ' + item.variance.toFixed(1) + ' · Avg rank: ' + item.avgRank.toFixed(1),
        '±' + Math.sqrt(item.variance).toFixed(1)
      );
      consensusList.appendChild(el);
    });

    // Top 5 most controversial
    const top5controversy = byVariance.slice(-5).reverse();
    top5controversy.forEach((item, idx) => {
      const el = createStatItem(
        badges[idx],
        idx + 1,
        bottleName(item.bottleId),
        'Range: ' + item.bestRank + '→' + item.worstRank + ' · Variance: ' + item.variance.toFixed(1),
        '±' + Math.sqrt(item.variance).toFixed(1)
      );

      // Add variance meter
      const meter = createElement('div', 'variance-meter');
      const fill = createElement('div', 'variance-fill');
      fill.style.width =
        (maxVariance > 0 ? (item.variance / maxVariance) * 100 : 0) + '%';
      fill.style.background =
        'linear-gradient(90deg, var(--wine-gold), var(--wine-red))';
      meter.appendChild(fill);
      el.appendChild(meter);

      controversyList.appendChild(el);
    });
  }

  function renderTasteTwinsWolves(agreements) {
    const twinsList = document.getElementById('twins-list');
    const wolvesList = document.getElementById('wolves-list');
    clearElement(twinsList);
    clearElement(wolvesList);

    const stats = agreements.personStats;
    const badges = ['badge-gold', 'badge-silver', 'badge-bronze', 'badge-neutral', 'badge-neutral'];

    // Top 5 most agreeable
    stats.slice(0, 5).forEach((person, idx) => {
      const twin = findClosestTwin(
        person.name,
        agreements.matrix,
        agreements.names
      );
      const el = createStatItem(
        badges[idx],
        idx + 1,
        person.name,
        'Closest twin: ' + twin.name + ' (τ=' + twin.tau.toFixed(2) + ')',
        'τ̄=' + person.avgAgreement.toFixed(2)
      );
      twinsList.appendChild(el);
    });

    // Bottom 5
    stats
      .slice(-5)
      .reverse()
      .forEach((person, idx) => {
        const twin = findClosestTwin(
          person.name,
          agreements.matrix,
          agreements.names
        );
        const el = createStatItem(
          badges[idx],
          idx + 1,
          person.name,
          'Even closest match: ' + twin.name + ' (τ=' + twin.tau.toFixed(2) + ')',
          'τ̄=' + person.avgAgreement.toFixed(2)
        );
        wolvesList.appendChild(el);
      });
  }

  function renderPairs(agreements) {
    const bestPairEl = document.getElementById('best-pair');
    const worstPairEl = document.getElementById('worst-pair');
    clearElement(bestPairEl);
    clearElement(worstPairEl);

    // Best pair
    const bestDisplay = createElement('div', 'pair-display');
    const bestNames = createElement('div', 'pair-names');
    bestNames.textContent =
      agreements.bestPair.names[0] + ' ♥ ' + agreements.bestPair.names[1];
    bestDisplay.appendChild(bestNames);
    const bestScore = createElement(
      'div',
      'pair-score',
      'Kendall\'s τ = ' +
        agreements.bestPair.tau.toFixed(3) +
        ' — practically soulmates!'
    );
    bestDisplay.appendChild(bestScore);
    bestPairEl.appendChild(bestDisplay);

    // Worst pair
    const worstDisplay = createElement('div', 'pair-display');
    const worstNames = createElement('div', 'pair-names');
    worstNames.textContent =
      agreements.worstPair.names[0] + ' ⚔ ' + agreements.worstPair.names[1];
    worstDisplay.appendChild(worstNames);
    const worstScore = createElement(
      'div',
      'pair-score',
      'Kendall\'s τ = ' +
        agreements.worstPair.tau.toFixed(3) +
        ' — agree to disagree!'
    );
    worstDisplay.appendChild(worstScore);
    worstPairEl.appendChild(worstDisplay);
  }

  function renderMatrix(agreements) {
    const wrapper = document.getElementById('matrix-wrapper');
    clearElement(wrapper);

    const names = agreements.names;
    const table = document.createElement('table');

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.textContent = '';
    headerRow.appendChild(cornerTh);

    names.forEach((name) => {
      const th = document.createElement('th');
      // Abbreviate long names for matrix
      th.textContent = name.length > 6 ? name.substring(0, 5) + '…' : name;
      th.setAttribute('title', name);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    names.forEach((rowName) => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = rowName;
      nameCell.style.fontWeight = '600';
      nameCell.style.textAlign = 'left';
      row.appendChild(nameCell);

      names.forEach((colName) => {
        const cell = document.createElement('td');
        if (rowName === colName) {
          cell.textContent = '—';
          cell.className = 'cell-self';
        } else {
          const tau = agreements.matrix[rowName][colName];
          cell.textContent = tau.toFixed(2);
          cell.className = getCorrelationClass(tau);
        }
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
  }

  function getCorrelationClass(tau) {
    if (tau >= 0.5) return 'corr-high';
    if (tau >= 0.2) return 'corr-medium';
    if (tau >= 0) return 'corr-low';
    return 'corr-neg';
  }

  function renderIndividualCards(rankings, agreements, overallRankings) {
    const container = document.getElementById('individual-cards');
    clearElement(container);

    const names = Object.keys(rankings);
    const numBottles = rankings[names[0]].length;

    // Precompute: which bottles did each person rank highest?
    // Also: how different is their #1 pick from the group?
    const groupWinner = overallRankings[0].bottleId;
    const stats = agreements.personStats;
    const avgMin = stats[stats.length - 1].avgAgreement;
    const avgMax = stats[0].avgAgreement;

    names.forEach((name) => {
      const card = createElement('div', 'individual-card');

      const nameEl = createElement('div', 'individual-card-name', name);
      card.appendChild(nameEl);

      const bottles = rankings[name];
      const top3 = bottles.slice(0, 3);
      const bottom3 = bottles.slice(-3).reverse();

      // Find this person's stats
      const personStat = stats.find((s) => s.name === name);
      const twin = findClosestTwin(name, agreements.matrix, agreements.names);

      // Stats
      const statsData = [
        ['Top 3 Picks', '#' + top3.join(', #')],
        ['Bottom 3', '#' + bottom3.join(', #')],
        ['Avg Agreement (τ̄)', personStat.avgAgreement.toFixed(3)],
        ['Closest Twin', twin.name + ' (τ=' + twin.tau.toFixed(2) + ')'],
        ['Group\'s #1 was their...', '#' + (bottles.indexOf(groupWinner) + 1)],
      ];

      statsData.forEach(([label, value]) => {
        const row = createElement('div', 'individual-stat-row');
        const labelEl = createElement('span', 'individual-stat-label', label);
        const valueEl = createElement('span', 'individual-stat-value', value);
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        card.appendChild(row);
      });

      // Tag
      const rankInGroup =
        stats.findIndex((s) => s.name === name) + 1;
      let tagClass, tagText;
      if (rankInGroup <= Math.ceil(names.length * 0.25)) {
        tagClass = 'tag-conformist';
        tagText = '🫂 Taste Twin — Top ' + Math.round((rankInGroup / names.length) * 100) + '% agreement';
      } else if (rankInGroup >= Math.ceil(names.length * 0.75)) {
        tagClass = 'tag-contrarian';
        tagText = '🐺 Lone Wolf — Bottom ' + Math.round(((names.length - rankInGroup + 1) / names.length) * 100) + '% agreement';
      } else {
        tagClass = 'tag-average';
        tagText = '🍷 Middle of the pack';
      }

      const tag = createElement('span', 'individual-tag ' + tagClass, tagText);
      card.appendChild(tag);

      container.appendChild(card);
    });
  }

  function createStatItem(badgeClass, badgeNum, name, detail, value) {
    const el = createElement('div', 'stat-item');

    const badge = createElement('div', 'stat-rank-badge ' + badgeClass, badgeNum);
    el.appendChild(badge);

    const info = createElement('div', 'stat-info');
    const nameEl = createElement('div', 'stat-name', name);
    const detailEl = createElement('div', 'stat-detail', detail);
    info.appendChild(nameEl);
    info.appendChild(detailEl);
    el.appendChild(info);

    const valueEl = createElement('div', 'stat-value', value);
    el.appendChild(valueEl);

    return el;
  }

  // --- Event Handlers ---

  btnLoadSample.addEventListener('click', function () {
    inputTextarea.value = generateSampleData();
    inputError.textContent = '';
  });

  btnAnalyze.addEventListener('click', function () {
    inputError.textContent = '';
    const text = inputTextarea.value.trim();

    if (!text) {
      inputError.textContent = 'Please enter rankings or load sample data first.';
      return;
    }

    const { rankings, errors } = parseRankings(text);

    if (errors.length > 0) {
      inputError.textContent = errors.join(' | ');
      return;
    }

    renderResults(rankings);
  });

  // --- Firebase: Load Rankings Button ---
  const btnLoadFirebase = document.getElementById('btn-load-firebase');
  const firebaseStatus = document.getElementById('firebase-status');

  if (btnLoadFirebase && typeof WineDB !== 'undefined') {
    btnLoadFirebase.addEventListener('click', function () {
      firebaseStatus.textContent = 'Loading from Firebase...';
      firebaseStatus.style.color = 'var(--wine-accent)';

      Promise.all([
        WineDB.getAllRankings(),
        WineDB.getRegistry(),
      ]).then(function (results) {
        var rankings = results[0];
        var registry = results[1];

        // Store registry to localStorage so the results renderer can use it
        if (registry && Object.keys(registry).length > 0) {
          try {
            localStorage.setItem('wine-registry', JSON.stringify(registry));
          } catch (e) { /* ignore */ }
        }

        var names = Object.keys(rankings);
        if (names.length === 0) {
          firebaseStatus.textContent = 'No rankings submitted yet. Waiting for guests...';
          firebaseStatus.style.color = 'var(--wine-rose)';
          return;
        }

        // Convert to text format and populate textarea
        var lines = names.map(function (name) {
          return name + ': ' + rankings[name].join(', ');
        });

        inputTextarea.value = lines.join('\n');
        firebaseStatus.textContent = '✓ Loaded ' + names.length + ' rankings from Firebase!';
        firebaseStatus.style.color = 'var(--wine-green)';
      }).catch(function (err) {
        firebaseStatus.textContent = 'Error loading from Firebase. Check your connection.';
        firebaseStatus.style.color = 'var(--wine-red)';
      });
    });
  }
})();
