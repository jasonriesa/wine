/* ============================================================
   Firebase Sync — Shared module for all wine tasting pages
   Initializes Firebase and provides read/write helpers for
   the wine registry and guest rankings.

   NOTE: Firebase web API keys are designed to be public —
   they only identify the project. Security is enforced via
   Firebase Realtime Database Security Rules, not the API key.
   ============================================================ */

/* global firebase */

var WineDB = (function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyCj7wPKCDWa3q63YkFE66ms04ZtqEODDAo",
    authDomain: "wine-tasting-e0407.firebaseapp.com",
    databaseURL: "https://wine-tasting-e0407-default-rtdb.firebaseio.com",
    projectId: "wine-tasting-e0407",
    storageBucket: "wine-tasting-e0407.firebasestorage.app",
    messagingSenderId: "462828695035",
    appId: "1:462828695035:web:e71a7756e985b89d10af5e"
  };

  firebase.initializeApp(firebaseConfig);
  var db = firebase.database();

  return {
    // --- Registry (host writes, results page reads) ---

    /** Save entire registry object to Firebase */
    saveRegistry: function (registry) {
      return db.ref('registry').set(registry);
    },

    /** Save a single bottle to the registry */
    saveBottle: function (id, data) {
      return db.ref('registry/' + id).set(data);
    },

    /** Remove a single bottle from the registry */
    removeBottle: function (id) {
      return db.ref('registry/' + id).remove();
    },

    /** Listen for real-time registry changes */
    onRegistry: function (callback) {
      db.ref('registry').on('value', function (snap) {
        callback(snap.val() || {});
      });
    },

    /** One-time read of registry */
    getRegistry: function () {
      return db.ref('registry').once('value').then(function (snap) {
        return snap.val() || {};
      });
    },

    // --- Rankings (guests write, results page reads) ---

    /** Save a guest's ranking */
    saveRanking: function (name, bottles) {
      return db.ref('rankings/' + encodeKey(name)).set({
        name: name,
        bottles: bottles,
        submittedAt: firebase.database.ServerValue.TIMESTAMP,
      });
    },

    /** Remove a guest's ranking */
    removeRanking: function (name) {
      return db.ref('rankings/' + encodeKey(name)).remove();
    },

    /** Listen for real-time ranking changes */
    onRankings: function (callback) {
      db.ref('rankings').on('value', function (snap) {
        var raw = snap.val() || {};
        var result = {};
        Object.keys(raw).forEach(function (key) {
          var entry = raw[key];
          if (entry && entry.name && entry.bottles) {
            result[entry.name] = entry.bottles;
          }
        });
        callback(result);
      });
    },

    /** One-time read of all rankings */
    getAllRankings: function () {
      return db.ref('rankings').once('value').then(function (snap) {
        var raw = snap.val() || {};
        var result = {};
        Object.keys(raw).forEach(function (key) {
          var entry = raw[key];
          if (entry && entry.name && entry.bottles) {
            result[entry.name] = entry.bottles;
          }
        });
        return result;
      });
    },

    /** Get count of submitted rankings */
    getRankingsCount: function () {
      return db.ref('rankings').once('value').then(function (snap) {
        return snap.numChildren();
      });
    },
  };

  /** Firebase keys can't contain . $ # [ ] / so we encode names */
  function encodeKey(str) {
    return str.replace(/[.#$\[\]\/]/g, '_');
  }
})();
