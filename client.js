/* ============================================================
   Wine Tasting Client v2 — Grid Select + Insert-Slot Ranking
   Flow: Tap bottle in grid → Tap slot in list to place it.
   All DOM uses createElement/textContent (no innerHTML).
   ============================================================ */

(function () {
  'use strict';

  // --- Constants ---
  var TOTAL_BOTTLES = 20;
  var STORAGE_KEY = 'wine-tasting-state-v2';

  // --- State ---
  var state = {
    name: '',
    bottles: [],       // ordered array of bottle IDs, best (index 0) to worst
    submitted: false,
  };

  // Insert mode: which bottle we're about to place
  var insertingBottle = null;

  // --- DOM References ---
  var screenWelcome = document.getElementById('screen-welcome');
  var screenRanking = document.getElementById('screen-ranking');
  var screenSubmitted = document.getElementById('screen-submitted');

  var inputName = document.getElementById('input-name');
  var btnJoin = document.getElementById('btn-join');
  var welcomeError = document.getElementById('welcome-error');

  var headerName = document.getElementById('header-name');
  var bottleCountEl = document.getElementById('bottle-count');
  var bottleGrid = document.getElementById('bottle-grid');
  var insertBanner = document.getElementById('insert-banner');
  var insertBannerText = document.getElementById('insert-banner-text');
  var btnCancelInsert = document.getElementById('btn-cancel-insert');
  var rankedList = document.getElementById('ranked-list');
  var listTitle = document.getElementById('list-title');
  var listHint = document.getElementById('list-hint');
  var btnSubmit = document.getElementById('btn-submit');
  var btnReset = document.getElementById('btn-reset');

  var rankingOutputText = document.getElementById('ranking-output-text');
  var btnCopy = document.getElementById('btn-copy');
  var copyConfirm = document.getElementById('copy-confirm');
  var btnEdit = document.getElementById('btn-edit');
  var btnNew = document.getElementById('btn-new');

  // --- Persistence ---
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function loadState() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        var parsed = JSON.parse(data);
        if (parsed && parsed.name) {
          state = parsed;
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function clearState() {
    state = { name: '', bottles: [], submitted: false };
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // --- Helpers ---
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showScreen(screen) {
    screenWelcome.classList.remove('active');
    screenRanking.classList.remove('active');
    screenSubmitted.classList.remove('active');
    screen.classList.add('active');
  }

  // --- Init ---
  function init() {
    if (loadState()) {
      if (state.submitted) {
        showSubmittedScreen();
      } else {
        showRankingScreen();
      }
    }
    bindEvents();
  }

  function bindEvents() {
    btnJoin.addEventListener('click', handleJoin);
    inputName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleJoin();
    });

    btnCancelInsert.addEventListener('click', cancelInsert);
    btnSubmit.addEventListener('click', handleSubmit);
    btnReset.addEventListener('click', handleReset);
    btnCopy.addEventListener('click', handleCopy);
    btnEdit.addEventListener('click', function () {
      state.submitted = false;
      saveState();
      showRankingScreen();
    });
    btnNew.addEventListener('click', function () {
      clearState();
      insertingBottle = null;
      showScreen(screenWelcome);
      inputName.value = '';
    });
  }

  // --- Handlers ---
  function handleJoin() {
    var name = inputName.value.trim();
    if (!name) {
      welcomeError.textContent = 'Please enter your name.';
      return;
    }
    welcomeError.textContent = '';
    state.name = name;
    saveState();
    showRankingScreen();
  }

  function handleGridTap(bottleId) {
    if (state.bottles.indexOf(bottleId) !== -1) return; // already used

    if (state.bottles.length === 0) {
      // First bottle — just add it directly, no insert mode needed
      state.bottles.push(bottleId);
      insertingBottle = null;
      saveState();
      renderGrid();
      renderList(true);
      updateUI();
      return;
    }

    // Enter insert mode
    insertingBottle = bottleId;
    renderGrid();
    showInsertBanner(bottleId);
    renderList(false);
  }

  function handleInsertAt(index) {
    if (insertingBottle === null) return;

    state.bottles.splice(index, 0, insertingBottle);
    var justInserted = insertingBottle;
    insertingBottle = null;

    saveState();
    hideInsertBanner();
    renderGrid();
    renderList(true, state.bottles.indexOf(justInserted));
    updateUI();
  }

  function cancelInsert() {
    insertingBottle = null;
    hideInsertBanner();
    renderGrid();
    renderList(false);
  }

  function handleMoveUp(index) {
    if (index <= 0) return;
    var temp = state.bottles[index - 1];
    state.bottles[index - 1] = state.bottles[index];
    state.bottles[index] = temp;
    saveState();
    renderList(false);
  }

  function handleMoveDown(index) {
    if (index >= state.bottles.length - 1) return;
    var temp = state.bottles[index + 1];
    state.bottles[index + 1] = state.bottles[index];
    state.bottles[index] = temp;
    saveState();
    renderList(false);
  }

  function handleRemove(bottleId) {
    var idx = state.bottles.indexOf(bottleId);
    if (idx !== -1) {
      state.bottles.splice(idx, 1);
      saveState();
      renderGrid();
      renderList(false);
      updateUI();
    }
  }

  function handleSubmit() {
    if (state.bottles.length === 0) return;
    state.submitted = true;
    saveState();

    // Sync to Firebase so the host sees it instantly
    if (typeof WineDB !== 'undefined') {
      WineDB.saveRanking(state.name, state.bottles);
    }

    showSubmittedScreen();
  }

  function handleReset() {
    state.bottles = [];
    state.submitted = false;
    insertingBottle = null;
    saveState();
    hideInsertBanner();
    renderGrid();
    renderList(false);
    updateUI();
  }

  function handleCopy() {
    var text = buildOutputString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        copyConfirm.textContent = '✓ Copied to clipboard!';
        setTimeout(function () { copyConfirm.textContent = ''; }, 3000);
      }).catch(function () { fallbackCopy(); });
    } else {
      fallbackCopy();
    }
  }

  function fallbackCopy() {
    var range = document.createRange();
    range.selectNodeContents(rankingOutputText);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    copyConfirm.textContent = 'Text selected — press Ctrl+C / Cmd+C to copy.';
  }

  // --- UI Updates ---
  function updateUI() {
    bottleCountEl.textContent = state.bottles.length + ' / ' + TOTAL_BOTTLES;
    btnSubmit.disabled = state.bottles.length === 0;
  }

  function showInsertBanner(bottleId) {
    insertBannerText.textContent = 'Placing Bottle ' + bottleId + ' — tap a slot below';
    insertBanner.classList.remove('hidden');
    listHint.textContent = 'Tap a slot to insert';
  }

  function hideInsertBanner() {
    insertBanner.classList.add('hidden');
    listHint.textContent = 'Best at top';
  }

  function buildOutputString() {
    return state.name + ': ' + state.bottles.join(', ');
  }

  // --- Screen Renderers ---
  function showRankingScreen() {
    showScreen(screenRanking);
    headerName.textContent = state.name;
    insertingBottle = null;
    hideInsertBanner();
    renderGrid();
    renderList(false);
    updateUI();
  }

  function showSubmittedScreen() {
    showScreen(screenSubmitted);
    rankingOutputText.textContent = buildOutputString();
    copyConfirm.textContent = '';
  }

  // --- Grid Rendering ---
  function renderGrid() {
    bottleGrid.replaceChildren();

    for (var i = 1; i <= TOTAL_BOTTLES; i++) {
      var btn = el('button', 'grid-btn', i);
      btn.setAttribute('aria-label', 'Bottle ' + i);

      var isUsed = state.bottles.indexOf(i) !== -1;
      var isActive = insertingBottle === i;

      if (isUsed) {
        btn.classList.add('grid-btn-used');
      } else if (isActive) {
        btn.classList.add('grid-btn-active');
      }

      // Closure for click handler
      (function (bottleId, used) {
        btn.addEventListener('click', function () {
          if (!used) handleGridTap(bottleId);
        });
      })(i, isUsed);

      bottleGrid.appendChild(btn);
    }
  }

  // --- List Rendering ---
  function renderList(animate, animateIndex) {
    rankedList.replaceChildren();

    if (state.bottles.length === 0 && insertingBottle === null) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('span', 'empty-icon', '🥂'));
      empty.appendChild(el('p', null, 'No bottles ranked yet.'));
      empty.appendChild(el('p', 'empty-sub', 'Tap a bottle number above to get started!'));
      rankedList.appendChild(empty);
      return;
    }

    var inserting = insertingBottle !== null;
    var count = state.bottles.length;

    // If inserting, show a slot at position 0 (before first bottle)
    if (inserting) {
      rankedList.appendChild(createInsertSlot(0, count));
    }

    // Render each bottle with an insert slot after it
    state.bottles.forEach(function (bottleId, idx) {
      var item = createBottleItem(bottleId, idx, count);

      if (animate && idx === animateIndex) {
        item.classList.add('just-added');
      }

      rankedList.appendChild(item);

      if (inserting) {
        rankedList.appendChild(createInsertSlot(idx + 1, count));
      }
    });
  }

  function createInsertSlot(insertIndex, totalBottles) {
    var slot = el('div', 'insert-slot active');
    var label;
    if (totalBottles === 0) {
      label = '👆 Tap to place here';
    } else if (insertIndex === 0) {
      label = '👆 Best — place #1';
    } else if (insertIndex === totalBottles) {
      label = '👇 Place last (#' + (insertIndex + 1) + ')';
    } else {
      label = '— Place #' + (insertIndex + 1) + ' —';
    }

    var text = el('span', 'insert-slot-text', label);
    slot.appendChild(text);

    (function (idx) {
      slot.addEventListener('click', function () {
        handleInsertAt(idx);
      });
    })(insertIndex);

    return slot;
  }

  function createBottleItem(bottleId, index, total) {
    var item = el('div', 'bottle-item');

    // Rank badge
    var rank = el('span', 'bottle-rank' + (index < 3 ? ' top-3' : ''), '#' + (index + 1));
    item.appendChild(rank);

    // Label
    var label = el('span', 'bottle-label', 'Bottle ' + bottleId);
    item.appendChild(label);

    // Move buttons
    var moveBtns = el('div', 'move-btns');

    var upBtn = el('button', 'btn-move', '▲');
    upBtn.setAttribute('aria-label', 'Move up');
    if (index === 0) upBtn.disabled = true;
    (function (idx) {
      upBtn.addEventListener('click', function () { handleMoveUp(idx); });
    })(index);
    moveBtns.appendChild(upBtn);

    var downBtn = el('button', 'btn-move', '▼');
    downBtn.setAttribute('aria-label', 'Move down');
    if (index === total - 1) downBtn.disabled = true;
    (function (idx) {
      downBtn.addEventListener('click', function () { handleMoveDown(idx); });
    })(index);
    moveBtns.appendChild(downBtn);

    item.appendChild(moveBtns);

    // Remove button
    var removeBtn = el('button', 'bottle-remove', '✕');
    removeBtn.setAttribute('aria-label', 'Remove Bottle ' + bottleId);
    (function (id) {
      removeBtn.addEventListener('click', function () { handleRemove(id); });
    })(bottleId);
    item.appendChild(removeBtn);

    return item;
  }

  // --- Boot ---
  init();
})();
