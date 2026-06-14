/* ============================================================
   Wine Registration — Host Logic
   Stores bottle registry in localStorage under a shared key
   so the results page can read it too.
   All DOM uses createElement/textContent (no innerHTML).
   ============================================================ */

(function () {
  'use strict';

  var STORAGE_KEY = 'wine-registry';

  // Registry: { "1": { winery, year, region }, "5": { ... }, ... }
  var registry = {};

  // --- DOM ---
  var inputId = document.getElementById('input-id');
  var btnIdMinus = document.getElementById('btn-id-minus');
  var btnIdPlus = document.getElementById('btn-id-plus');
  var inputWinery = document.getElementById('input-winery');
  var inputYear = document.getElementById('input-year');
  var inputRegion = document.getElementById('input-region');
  var inputBroughtBy = document.getElementById('input-brought-by');
  var inputPrice = document.getElementById('input-price');
  var formError = document.getElementById('form-error');
  var btnRegister = document.getElementById('btn-register');
  var registryList = document.getElementById('registry-list');
  var registryEmpty = document.getElementById('registry-empty');
  var registryCount = document.getElementById('registry-count');

  // --- Persistence ---
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
    } catch (e) { /* ignore */ }
    // Sync to Firebase
    if (typeof WineDB !== 'undefined') {
      WineDB.saveRegistry(registry);
    }
  }

  function load() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        registry = JSON.parse(data) || {};
      }
    } catch (e) {
      registry = {};
    }
  }

  // --- Helpers ---
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // --- Init ---
  function init() {
    load();
    renderList(false);
    advanceToNextFreeId();
    bindEvents();

    // Listen for real-time Firebase updates (e.g. if host has two tabs)
    if (typeof WineDB !== 'undefined') {
      WineDB.onRegistry(function (fbRegistry) {
        registry = fbRegistry;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(registry)); } catch (e) { /* ignore */ }
        renderList(false);
        advanceToNextFreeId();
      });
    }
  }

  function bindEvents() {
    btnIdMinus.addEventListener('click', function () {
      var v = parseInt(inputId.value, 10) || 1;
      if (v > 1) inputId.value = v - 1;
    });

    btnIdPlus.addEventListener('click', function () {
      var v = parseInt(inputId.value, 10) || 1;
      inputId.value = v + 1;
    });

    btnRegister.addEventListener('click', handleRegister);

    // Enter key in any field triggers register
    [inputWinery, inputYear, inputRegion, inputBroughtBy, inputPrice].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleRegister();
      });
    });
  }

  function handleRegister() {
    formError.textContent = '';

    var id = parseInt(inputId.value, 10);
    var winery = inputWinery.value.trim();
    var year = inputYear.value.trim();
    var region = inputRegion.value.trim();
    var broughtBy = inputBroughtBy.value.trim();
    var price = inputPrice.value.trim();

    if (isNaN(id) || id < 1) {
      formError.textContent = 'Please enter a valid bottle ID.';
      return;
    }

    if (!winery) {
      formError.textContent = 'Please enter the winery name.';
      return;
    }

    if (registry[id]) {
      formError.textContent = 'Bottle #' + id + ' is already registered (' + registry[id].winery + '). Remove it first to re-register.';
      return;
    }

    registry[id] = {
      winery: winery,
      year: year || '—',
      region: region || '—',
      broughtBy: broughtBy || '—',
      price: price || '—',
    };

    save();

    // Clear form
    inputWinery.value = '';
    inputYear.value = '';
    inputRegion.value = '';
    inputBroughtBy.value = '';
    inputPrice.value = '';

    renderList(true, id);
    advanceToNextFreeId();

    // Focus winery for next entry
    inputWinery.focus();
  }

  function handleRemove(id) {
    delete registry[id];
    save();
    renderList(false);
  }

  function advanceToNextFreeId() {
    // Find the lowest unused positive integer
    var candidate = 1;
    while (registry[candidate]) {
      candidate++;
    }
    inputId.value = candidate;
  }

  // --- Rendering ---
  function renderList(animate, animateId) {
    registryList.replaceChildren();

    var ids = Object.keys(registry)
      .map(Number)
      .sort(function (a, b) { return a - b; });

    var count = ids.length;
    registryCount.textContent = count + ' bottle' + (count !== 1 ? 's' : '');

    if (count === 0) {
      registryEmpty.style.display = '';
      return;
    }

    registryEmpty.style.display = 'none';

    ids.forEach(function (id) {
      var wine = registry[id];
      var item = el('div', 'registry-item');

      if (animate && id === animateId) {
        item.classList.add('just-added');
      }

      // ID badge
      var idBadge = el('span', 'registry-id', '#' + id);
      item.appendChild(idBadge);

      // Info
      var info = el('div', 'registry-info');
      var name = el('div', 'registry-wine-name', wine.winery);
      var brought = wine.broughtBy && wine.broughtBy !== '—' ? ' · ' + wine.broughtBy : '';
      var priceStr = wine.price && wine.price !== '—' ? ' · $' + wine.price : '';
      var detail = el('div', 'registry-wine-detail',
        wine.year + ' · ' + wine.region + brought + priceStr);
      info.appendChild(name);
      info.appendChild(detail);
      item.appendChild(info);

      // Remove button
      var removeBtn = el('button', 'registry-remove', '✕');
      removeBtn.setAttribute('aria-label', 'Remove Bottle ' + id);
      (function (bottleId) {
        removeBtn.addEventListener('click', function () {
          handleRemove(bottleId);
        });
      })(id);
      item.appendChild(removeBtn);

      registryList.appendChild(item);
    });
  }

  // --- Reset Functions (two-click safety: click once to arm, again to execute) ---
  var btnResetRankings = document.getElementById('btn-reset-rankings');
  var btnResetAll = document.getElementById('btn-reset-all');
  var resetStatus = document.getElementById('reset-status');
  var resetRankingsArmed = false;
  var resetAllArmed = false;

  function showResetStatus(msg, color) {
    resetStatus.textContent = msg;
    resetStatus.style.color = color;
    resetStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function disarmRankingsBtn() {
    resetRankingsArmed = false;
    btnResetRankings.textContent = 'Clear All Rankings';
    btnResetRankings.style.background = '';
  }

  function disarmAllBtn() {
    resetAllArmed = false;
    btnResetAll.textContent = 'Reset Everything';
    btnResetAll.style.background = '';
  }

  if (btnResetRankings) {
    btnResetRankings.addEventListener('click', function () {
      if (!resetRankingsArmed) {
        resetRankingsArmed = true;
        btnResetRankings.textContent = '⚠️ Click again to confirm';
        btnResetRankings.style.background = 'rgba(224, 96, 112, 0.3)';
        showResetStatus('Click the button again to clear all rankings...', 'var(--wine-rose)');
        setTimeout(function () {
          if (resetRankingsArmed) {
            disarmRankingsBtn();
            resetStatus.textContent = '';
          }
        }, 4000);
        return;
      }

      disarmRankingsBtn();
      btnResetRankings.textContent = 'Clearing...';

      if (typeof firebase === 'undefined') {
        showResetStatus('⚠️ Firebase not loaded. Are you online?', 'var(--wine-red)');
        disarmRankingsBtn();
        return;
      }

      firebase.database().ref('rankings').remove().then(function () {
        showResetStatus('✅ All rankings cleared! Bottle registrations kept.', 'var(--wine-green)');
        disarmRankingsBtn();
      }).catch(function (err) {
        showResetStatus('❌ Error: ' + (err.message || 'Could not reach Firebase'), 'var(--wine-red)');
        disarmRankingsBtn();
      });
    });
  }

  if (btnResetAll) {
    btnResetAll.addEventListener('click', function () {
      if (!resetAllArmed) {
        resetAllArmed = true;
        btnResetAll.textContent = '⚠️ Click again to DELETE ALL';
        btnResetAll.style.background = 'rgba(224, 96, 112, 0.4)';
        showResetStatus('Click the button again to delete ALL data...', 'var(--wine-rose)');
        setTimeout(function () {
          if (resetAllArmed) {
            disarmAllBtn();
            resetStatus.textContent = '';
          }
        }, 4000);
        return;
      }

      disarmAllBtn();
      btnResetAll.textContent = 'Resetting...';

      if (typeof firebase === 'undefined') {
        showResetStatus('⚠️ Firebase not loaded. Are you online?', 'var(--wine-red)');
        disarmAllBtn();
        return;
      }

      Promise.all([
        firebase.database().ref('rankings').remove(),
        firebase.database().ref('registry').remove(),
      ]).then(function () {
        registry = {};
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        try { localStorage.removeItem('wine-registry'); } catch (e) { /* ignore */ }
        renderList(false);
        advanceToNextFreeId();
        showResetStatus('✅ Everything reset! Firebase is clean. Ready for the party! 🎉', 'var(--wine-green)');
        disarmAllBtn();
      }).catch(function (err) {
        showResetStatus('❌ Error: ' + (err.message || 'Could not reach Firebase'), 'var(--wine-red)');
        disarmAllBtn();
      });
    });
  }

  // --- Boot ---
  init();
})();
