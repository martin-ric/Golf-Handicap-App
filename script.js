/**
 * Golf Handicap – Score Differential
 * Modular structure, validation, error handling, XSS-safe output (textContent only),
 * and accessibility improvements.
 */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
  .then(() => console.log("Service Worker Registered"))
  .catch((err) => console.error("Service Worker Failed to Register", err));
}

(function () {
  "use strict";

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  var CONFIG = {
    STORAGE_KEY: "golf-handicap-rounds",
    MAX_ROUNDS_FOR_HANDICAP: 20,
    BEST_ROUNDS_COUNT: 8,
    WHS_MULTIPLIER: 0.96,
    CONSTANT_SLOPE: 113
  };

  // ============================================================================
  // VALIDATION SERVICE
  // ============================================================================

  var ValidationService = {
    /**
     * Validates a date string (YYYY-MM-DD format).
     * @param {string} dateString - Date string
     * @returns {{valid: boolean, error: string|null}}
     */
    validateDate: function (dateString) {
      if (!dateString || typeof dateString !== "string") {
        return { valid: false, error: "Please provide a valid date." };
      }
      var trimmed = dateString.trim();
      if (!trimmed) {
        return { valid: false, error: "Please provide a date." };
      }
      var regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(trimmed)) {
        return { valid: false, error: "Invalid date format. Please use YYYY-MM-DD." };
      }
      var dateObj = new Date(trimmed + "T00:00:00");
      if (isNaN(dateObj.getTime())) {
        return { valid: false, error: "Invalid date." };
      }
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateObj > today) {
        return { valid: false, error: "The date cannot be in the future." };
      }
      return { valid: true, error: null };
    },

    /**
     * Validates gross score input.
     * @param {string|number} score - Score value
     * @param {boolean} [isNineHole] - Whether this is a 9-hole round
     * @returns {{valid: boolean, error: string|null, value: number|null}}
     */
    validateScore: function (score, isNineHole) {
      if (score === "" || score === null || score === undefined) {
        return { valid: false, error: "Please enter a gross score.", value: null };
      }
      var num = typeof score === "string" ? parseFloat(score) : Number(score);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Gross score must be a valid number.", value: null };
      }
      var maxScore = isNineHole ? 120 : 200;
      if (num < 1 || num > maxScore) {
        return { valid: false, error: "Gross score must be between 1 and " + maxScore + ".", value: null };
      }
      if (num !== Math.floor(num)) {
        return { valid: false, error: "Gross score must be a whole number.", value: null };
      }
      return { valid: true, error: null, value: num };
    },

    /**
     * Validates course rating input.
     * @param {string|number} courseRating - Course rating value
     * @param {boolean} [isNineHole] - Whether this is a 9-hole round
     * @returns {{valid: boolean, error: string|null, value: number|null}}
     */
    validateCourseRating: function (courseRating, isNineHole) {
      if (courseRating === "" || courseRating === null || courseRating === undefined) {
        return { valid: false, error: "Please enter a course rating.", value: null };
      }
      var num = typeof courseRating === "string" ? parseFloat(courseRating) : Number(courseRating);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Course rating must be a valid number.", value: null };
      }
      var minCR = isNineHole ? 20 : 50;
      var maxCR = isNineHole ? 45 : 80;
      if (num < minCR || num > maxCR) {
        return { valid: false, error: "Course rating must be between " + minCR + " and " + maxCR + ".", value: null };
      }
      return { valid: true, error: null, value: num };
    },

    /**
     * Validates slope rating input.
     * @param {string|number} slope - Slope rating value
     * @returns {{valid: boolean, error: string|null, value: number|null}}
     */
    validateSlope: function (slope) {
      if (slope === "" || slope === null || slope === undefined) {
        return { valid: false, error: "Please enter a slope rating.", value: null };
      }
      var num = typeof slope === "string" ? parseFloat(slope) : Number(slope);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Slope rating must be a valid number.", value: null };
      }
      if (num < 55 || num > 155) {
        return { valid: false, error: "Slope rating must be between 55 and 155.", value: null };
      }
      if (num !== Math.floor(num)) {
        return { valid: false, error: "Slope rating must be a whole number.", value: null };
      }
      return { valid: true, error: null, value: num };
    },

    /**
     * Validates Handicap Index input (used for 9-hole rounds).
     * @param {string|number} hcpi - Handicap Index value
     * @returns {{valid: boolean, error: string|null, value: number|null}}
     */
    validateHcpi: function (hcpi) {
      if (hcpi === "" || hcpi === null || hcpi === undefined) {
        return { valid: false, error: "Please enter your Handicap Index to calculate the 9-hole differential.", value: null };
      }
      var num = typeof hcpi === "string" ? parseFloat(hcpi) : Number(hcpi);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Handicap Index must be a valid number.", value: null };
      }
      if (num < -6.0 || num > 54.0) {
        return { valid: false, error: "Handicap Index must be between -6.0 and 54.0.", value: null };
      }
      return { valid: true, error: null, value: num };
    },

    /**
     * Validates Stableford points input.
     * @param {string|number} points - Stableford points
     * @param {boolean} [isNineHole] - Whether this is a 9-hole round
     * @returns {{valid: boolean, error: string|null, value: number|null}}
     */
    validateStablefordPoints: function (points, isNineHole) {
      if (points === "" || points === null || points === undefined) {
        return { valid: false, error: "Please enter your Stableford points.", value: null };
      }
      var num = typeof points === "string" ? parseFloat(points) : Number(points);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Stableford points must be a valid number.", value: null };
      }
      if (num !== Math.floor(num)) {
        return { valid: false, error: "Stableford points must be a whole number.", value: null };
      }
      var maxPoints = isNineHole ? 54 : 90;
      if (num < 0 || num > maxPoints) {
        return { valid: false, error: "Stableford points must be between 0 and " + maxPoints + ".", value: null };
      }
      return { valid: true, error: null, value: num };
    },

    /**
     * Validates a round object (from storage).
     * @param {Object} round - Round object
     * @returns {{valid: boolean, error: string|null}}
     */
    validateRound: function (round) {
      if (!round || typeof round !== "object") {
        return { valid: false, error: "Invalid round object." };
      }
      // score, courseRating, slope are optional (manual entries may omit them)
      var required = ["id", "date", "differential"];
      for (var i = 0; i < required.length; i++) {
        if (!(required[i] in round)) {
          return { valid: false, error: "Round object is missing a required field: " + required[i] + "." };
        }
      }
      if (typeof round.differential !== "number" || isNaN(round.differential)) {
        return { valid: false, error: "Invalid differential value." };
      }
      return { valid: true, error: null };
    }
  };

  // ============================================================================
  // STORAGE SERVICE
  // ============================================================================

  var StorageService = {
    /**
     * Load rounds from localStorage with error handling.
     * @returns {Array<Object>} Array of rounds or empty array on error
     */
    loadRounds: function () {
      try {
        var raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          console.warn("LocalStorage does not contain an array. Resetting.");
          return [];
        }
        var validated = [];
        for (var i = 0; i < parsed.length; i++) {
          var validation = ValidationService.validateRound(parsed[i]);
          if (validation.valid) {
            validated.push(parsed[i]);
          } else {
            console.warn("Invalid round skipped:", validation.error);
          }
        }
        return validated;
      } catch (e) {
        console.error("Error loading from LocalStorage:", e);
        return [];
      }
    },

    /**
     * Save rounds to localStorage with error handling.
     * @param {Array<Object>} rounds - Array of round objects
     * @returns {{success: boolean, error: string|null}}
     */
    saveRounds: function (rounds) {
      if (!Array.isArray(rounds)) {
        return { success: false, error: "Rounds must be an array." };
      }
      try {
        var json = JSON.stringify(rounds);
        localStorage.setItem(CONFIG.STORAGE_KEY, json);
        return { success: true, error: null };
      } catch (e) {
        if (e.name === "QuotaExceededError") {
          return { success: false, error: "Storage space full. Please delete old rounds." };
        }
        console.error("Error saving to LocalStorage:", e);
        return { success: false, error: "Error saving: " + e.message };
      }
    },

    /**
     * Delete all rounds from localStorage.
     * @returns {{success: boolean, error: string|null}}
     */
    deleteAll: function () {
      try {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        return { success: true, error: null };
      } catch (e) {
        console.error("Error deleting from LocalStorage:", e);
        return { success: false, error: "Error deleting: " + e.message };
      }
    }
  };

  // ============================================================================
  // IMPORT / EXPORT SERVICE
  // ============================================================================

  var ImportExportService = {
    MAX_IMPORT_ROUNDS: 500,

    /**
     * Export rounds and course book as a JSON file download.
     */
    exportJSON: function () {
      var rounds = StorageService.loadRounds();
      var courseBook = CourseService.loadCourseBook();
      var today = new Date();
      var exportedAt = today.getFullYear() + "-" +
        String(today.getMonth() + 1).padStart(2, "0") + "-" +
        String(today.getDate()).padStart(2, "0");

      var exportData = {
        version: 1,
        exportedAt: exportedAt,
        rounds: rounds,
        courseBook: courseBook
      };

      var json = JSON.stringify(exportData, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "golf-handicap-export-" + exportedAt + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /**
     * Validate a single round from an imported file.
     * Returns whitelisted fields only; re-generates id.
     * @param {*} raw - Raw object from parsed JSON
     * @param {number} index - Position in the array (for error messages)
     * @returns {{valid: boolean, round: Object|null, error: string|null}}
     */
    validateImportedRound: function (raw, index) {
      var prefix = "Round " + (index + 1) + ": ";

      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { valid: false, round: null, error: prefix + "must be an object." };
      }

      // date (required)
      if (typeof raw.date !== "string") {
        return { valid: false, round: null, error: prefix + "date must be a string." };
      }
      var date = raw.date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { valid: false, round: null, error: prefix + "date must be in YYYY-MM-DD format." };
      }
      var dateObj = new Date(date + "T00:00:00");
      if (isNaN(dateObj.getTime())) {
        return { valid: false, round: null, error: prefix + "date is not a valid date." };
      }
      var todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      if (dateObj > todayEnd) {
        return { valid: false, round: null, error: prefix + "date cannot be in the future." };
      }

      // differential (required)
      if (typeof raw.differential !== "number" || isNaN(raw.differential) || !isFinite(raw.differential)) {
        return { valid: false, round: null, error: prefix + "differential must be a number." };
      }
      if (raw.differential < -10 || raw.differential > 60) {
        return { valid: false, round: null, error: prefix + "differential must be between -10 and 60." };
      }

      // score (optional)
      var score = null;
      if (raw.score !== null && raw.score !== undefined) {
        if (typeof raw.score !== "number" || isNaN(raw.score) || !isFinite(raw.score)) {
          return { valid: false, round: null, error: prefix + "score must be a number." };
        }
        if (raw.score < 1 || raw.score > 200) {
          return { valid: false, round: null, error: prefix + "score must be between 1 and 200." };
        }
        score = raw.score;
      }

      // courseRating (optional)
      var courseRating = null;
      if (raw.courseRating !== null && raw.courseRating !== undefined) {
        if (typeof raw.courseRating !== "number" || isNaN(raw.courseRating) || !isFinite(raw.courseRating)) {
          return { valid: false, round: null, error: prefix + "courseRating must be a number." };
        }
        if (raw.courseRating < 20 || raw.courseRating > 80) {
          return { valid: false, round: null, error: prefix + "courseRating must be between 20 and 80." };
        }
        courseRating = raw.courseRating;
      }

      // slope (optional)
      var slope = null;
      if (raw.slope !== null && raw.slope !== undefined) {
        if (typeof raw.slope !== "number" || isNaN(raw.slope) || !isFinite(raw.slope)) {
          return { valid: false, round: null, error: prefix + "slope must be a number." };
        }
        if (raw.slope < 55 || raw.slope > 155) {
          return { valid: false, round: null, error: prefix + "slope must be between 55 and 155." };
        }
        slope = raw.slope;
      }

      // courseName (optional) — silently truncate to 80 chars
      var courseName = null;
      if (raw.courseName !== null && raw.courseName !== undefined) {
        if (typeof raw.courseName !== "string") {
          return { valid: false, round: null, error: prefix + "courseName must be a string." };
        }
        courseName = raw.courseName.slice(0, 80);
      }

      // note (optional) — silently truncate to 280 chars
      var note = null;
      if (raw.note !== null && raw.note !== undefined) {
        if (typeof raw.note !== "string") {
          return { valid: false, round: null, error: prefix + "note must be a string." };
        }
        note = raw.note.slice(0, 280);
      }

      // stablefordPoints (optional)
      var stablefordPoints = null;
      if (raw.stablefordPoints !== null && raw.stablefordPoints !== undefined) {
        if (typeof raw.stablefordPoints !== "number" || isNaN(raw.stablefordPoints) || !isFinite(raw.stablefordPoints)) {
          return { valid: false, round: null, error: prefix + "stablefordPoints must be a number." };
        }
        if (raw.stablefordPoints < 0 || raw.stablefordPoints > 90) {
          return { valid: false, round: null, error: prefix + "stablefordPoints must be between 0 and 90." };
        }
        stablefordPoints = raw.stablefordPoints;
      }

      // hcpiUsed (optional)
      var hcpiUsed = null;
      if (raw.hcpiUsed !== null && raw.hcpiUsed !== undefined) {
        if (typeof raw.hcpiUsed !== "number" || isNaN(raw.hcpiUsed) || !isFinite(raw.hcpiUsed)) {
          return { valid: false, round: null, error: prefix + "hcpiUsed must be a number." };
        }
        if (raw.hcpiUsed < -6 || raw.hcpiUsed > 54) {
          return { valid: false, round: null, error: prefix + "hcpiUsed must be between -6 and 54." };
        }
        hcpiUsed = raw.hcpiUsed;
      }

      // scoringMethod (optional, whitelist to known values)
      var scoringMethod = raw.scoringMethod === "stableford" ? "stableford" : "gross";

      // isNineHole (optional, coerce to boolean)
      var isNineHole = raw.isNineHole === true;

      // excludeFromHandicap (optional, coerce to boolean)
      var excludeFromHandicap = raw.excludeFromHandicap === true;

      // manualEntry (optional, coerce to boolean)
      var manualEntry = raw.manualEntry === true;

      // Return whitelisted round with fresh id
      return {
        valid: true,
        round: {
          id: String(Date.now()) + "-" + index,
          date: date,
          differential: raw.differential,
          score: score,
          courseRating: courseRating,
          slope: slope,
          courseName: courseName,
          isNineHole: isNineHole,
          scoringMethod: scoringMethod,
          stablefordPoints: stablefordPoints,
          hcpiUsed: hcpiUsed,
          note: note,
          excludeFromHandicap: excludeFromHandicap,
          manualEntry: manualEntry
        },
        error: null
      };
    },

    /**
     * Parse and fully validate a JSON import string.
     * @param {string} jsonString - Raw file contents
     * @returns {{valid: boolean, rounds: Array|null, courseBook: Array|null, error: string|null}}
     */
    parseImportFile: function (jsonString) {
      var parsed;
      try {
        parsed = JSON.parse(jsonString);
      } catch (e) {
        return { valid: false, rounds: null, courseBook: null, error: "The file is not valid JSON." };
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { valid: false, rounds: null, courseBook: null, error: "Invalid file format." };
      }

      if (!Array.isArray(parsed.rounds)) {
        return { valid: false, rounds: null, courseBook: null, error: "File does not contain a rounds array." };
      }

      if (parsed.rounds.length > this.MAX_IMPORT_ROUNDS) {
        return { valid: false, rounds: null, courseBook: null, error: "File contains more than " + this.MAX_IMPORT_ROUNDS + " rounds. Import aborted." };
      }

      var validatedRounds = [];
      var errors = [];
      for (var i = 0; i < parsed.rounds.length; i++) {
        var result = this.validateImportedRound(parsed.rounds[i], i);
        if (result.valid) {
          validatedRounds.push(result.round);
        } else {
          errors.push(result.error);
        }
      }

      if (errors.length > 0) {
        return {
          valid: false, rounds: null, courseBook: null,
          error: errors[0] + (errors.length > 1 ? " (and " + (errors.length - 1) + " more error" + (errors.length - 1 !== 1 ? "s" : "") + ")" : "")
        };
      }

      // courseBook (optional) — validate if present, silently skip invalid entries
      var courseBook = null;
      if (Array.isArray(parsed.courseBook)) {
        courseBook = [];
        for (var j = 0; j < parsed.courseBook.length; j++) {
          var c = parsed.courseBook[j];
          if (c && typeof c === "object" &&
              typeof c.name === "string" && c.name.trim() &&
              typeof c.cr === "number" && isFinite(c.cr) && c.cr >= 20 && c.cr <= 80 &&
              typeof c.slope === "number" && isFinite(c.slope) && c.slope >= 55 && c.slope <= 155) {
            courseBook.push({ name: c.name.slice(0, 80), cr: c.cr, slope: c.slope });
          }
        }
      }

      return { valid: true, rounds: validatedRounds, courseBook: courseBook, error: null };
    }
  };

  // ============================================================================
  // COURSE SERVICE (autocomplete + user course book)
  // ============================================================================

  var CourseService = {
    STORAGE_KEY: "golf-course-book",
    _seedCourses: [],

    /**
     * Fetch and cache the bundled courses.json seed file.
     * Called once at startup; _seedCourses is populated asynchronously.
     */
    loadSeedData: function () {
      var self = this;
      return fetch("./courses.json")
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (data) {
          if (!Array.isArray(data)) { self._seedCourses = []; return; }
          self._seedCourses = data
            .filter(function (c) {
              return c.yellow_tee_men &&
                c.yellow_tee_men.course_rating !== null &&
                c.yellow_tee_men.slope !== null;
            })
            .map(function (c) {
              return {
                name: c.name,
                cr: c.yellow_tee_men.course_rating,
                slope: c.yellow_tee_men.slope
              };
            });
        })
        .catch(function () {
          self._seedCourses = [];
        });
    },

    /**
     * Load user's personal course book from localStorage.
     * @returns {Array<{name: string, cr: number, slope: number}>}
     */
    loadCourseBook: function () {
      try {
        var raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    },

    /**
     * Persist the user's course book to localStorage.
     * @param {Array} courses
     */
    saveCourseBook: function (courses) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(courses));
      } catch (e) {
        console.warn("Could not save course book:", e);
      }
    },

    /**
     * Silently add or update a course in the user's personal course book.
     * Called automatically when a round with name + CR + slope is saved.
     * @param {string} name - Course name
     * @param {number} cr - Course rating
     * @param {number} slope - Slope rating
     */
    saveUserCourse: function (name, cr, slope) {
      if (!name || cr === null || cr === undefined || slope === null || slope === undefined) return;
      var book = this.loadCourseBook();
      var key = name.toLowerCase();
      var found = false;
      for (var i = 0; i < book.length; i++) {
        if (book[i].name.toLowerCase() === key) {
          book[i] = { name: name, cr: cr, slope: slope };
          found = true;
          break;
        }
      }
      if (!found) {
        book.push({ name: name, cr: cr, slope: slope });
      }
      this.saveCourseBook(book);
    },

    /**
     * Search both the user's course book and the seed data for courses matching
     * the query string. User book entries take priority; seed entries fill the rest.
     * @param {string} query
     * @returns {Array<{name: string, cr: number, slope: number}>} Up to 8 results
     */
    search: function (query) {
      var q = (query || "").trim().toLowerCase();
      var results = [];
      var seen = {};

      // User course book has priority
      var book = this.loadCourseBook();
      for (var i = 0; i < book.length; i++) {
        if (!q || book[i].name.toLowerCase().indexOf(q) !== -1) {
          results.push({ name: book[i].name, cr: book[i].cr, slope: book[i].slope });
          seen[book[i].name.toLowerCase()] = true;
        }
      }

      // Seed courses as fallback
      for (var j = 0; j < this._seedCourses.length; j++) {
        var c = this._seedCourses[j];
        if ((!q || c.name.toLowerCase().indexOf(q) !== -1) && !seen[c.name.toLowerCase()]) {
          results.push({ name: c.name, cr: c.cr, slope: c.slope });
        }
      }

      return results.slice(0, 8);
    },

    /**
     * Attach autocomplete behaviour to a course name input.
     * When a suggestion is selected, fills nameInput, crInput, and slopeInput.
     * The dropdown is appended to nameInput's parentNode (which must have
     * position: relative set via CSS).
     *
     * @param {HTMLInputElement} nameInput
     * @param {HTMLInputElement} crInput
     * @param {HTMLInputElement} slopeInput
     */
    attachAutocomplete: function (nameInput, crInput, slopeInput) {
      if (!nameInput) return;
      var self = this;

      var dropdown = document.createElement("ul");
      dropdown.className = "course-suggestions";
      dropdown.setAttribute("role", "listbox");
      dropdown.setAttribute("aria-label", "Course suggestions");
      dropdown.style.display = "none";
      nameInput.parentNode.appendChild(dropdown);

      function renderSuggestions(results) {
        dropdown.textContent = "";
        if (results.length === 0) {
          dropdown.style.display = "none";
          return;
        }
        results.forEach(function (course) {
          var li = document.createElement("li");
          li.className = "course-suggestion-item";
          li.setAttribute("role", "option");
          li.setAttribute("tabindex", "-1");

          var nameEl = document.createElement("span");
          nameEl.className = "course-suggestion-name";
          nameEl.textContent = course.name;

          var detailEl = document.createElement("span");
          detailEl.className = "course-suggestion-detail";
          detailEl.textContent = "CR\u00a0" + course.cr + "\u00b7 Slope\u00a0" + course.slope;

          li.appendChild(nameEl);
          li.appendChild(detailEl);

          li.addEventListener("mousedown", function (e) {
            // Prevent the input from losing focus before we fill values
            e.preventDefault();
            nameInput.value = course.name;
            if (crInput) crInput.value = course.cr;
            if (slopeInput) slopeInput.value = course.slope;
            dropdown.style.display = "none";
            nameInput.focus();
          });

          dropdown.appendChild(li);
        });
        dropdown.style.display = "";
      }

      nameInput.addEventListener("input", function () {
        renderSuggestions(self.search(nameInput.value));
      });

      nameInput.addEventListener("focus", function () {
        renderSuggestions(self.search(nameInput.value));
      });

      nameInput.addEventListener("blur", function () {
        // Short delay so mousedown on a list item fires before blur hides it
        setTimeout(function () { dropdown.style.display = "none"; }, 160);
      });

      nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          dropdown.style.display = "none";
        }
      });
    }
  };

  // ============================================================================
  // WHS SERVICE (World Handicap System calculations)
  // ============================================================================

  var WHSService = {
    /**
     * Calculate expected 9-hole SD supplement using official WHS formula.
     * Formula: ((HCPI * 1.04) + 2.4) / 2
     * Represents the statistically expected score on the 9 holes not played.
     * @param {number} hcpi - Current Handicap Index
     * @returns {number} Expected 9-hole score differential
     */
    calculateExpectedNineHoleSD: function (hcpi) {
      return ((hcpi * 1.04) + 2.4) / 2;
    },

    /**
     * Calculate score differential using WHS formula.
     * Formula: (113 / Slope) * (Score - Course Rating)
     * @param {number} score - Gross score
     * @param {number} courseRating - Course rating
     * @param {number} slope - Slope rating
     * @returns {number} Score differential rounded to one decimal place
     */
    calculateScoreDifferential: function (score, courseRating, slope) {
      var scoreDifferential = (CONFIG.CONSTANT_SLOPE / slope) * (score - courseRating);
      return Math.round(scoreDifferential * 10) / 10;
    },

    /**
     * Calculate the score differential from an 18-hole Stableford result.
     * Derived from the WHS identity AGS = Par + CourseHandicap + (36 - points),
     * which simplifies to: Differential = HCPI + (113 / Slope) * (36 - points).
     * Scoring exactly 36 points (playing to handicap) yields a differential equal
     * to the Handicap Index.
     * @param {number} points - Stableford points scored
     * @param {number} slope - Slope rating
     * @param {number} hcpi - Handicap Index used to play the round
     * @returns {number} Score differential rounded to one decimal place
     */
    calculateStablefordDifferential: function (points, slope, hcpi) {
      var scoreDifferential = hcpi + (CONFIG.CONSTANT_SLOPE / slope) * (36 - points);
      return Math.round(scoreDifferential * 10) / 10;
    },

    /**
     * Calculate the score differential from a 9-hole Stableford result.
     * Over 9 holes, playing to handicap means 18 points. The 9-hole portion is
     * derived as: diff9 = HCPI/2 + (113 / Slope) * (18 - points), then combined
     * with the expected differential of the 9 holes not played (same supplement
     * used for 9-hole gross rounds).
     * @param {number} points - Stableford points scored over 9 holes
     * @param {number} slope - 9-hole slope rating
     * @param {number} hcpi - Handicap Index used to play the round
     * @returns {number} 18-hole score differential rounded to one decimal place
     */
    calculateNineHoleStablefordDifferential: function (points, slope, hcpi) {
      var diff9 = (hcpi / 2) + (CONFIG.CONSTANT_SLOPE / slope) * (18 - points);
      var expectedSD = this.calculateExpectedNineHoleSD(hcpi);
      return Math.round((diff9 + expectedSD) * 10) / 10;
    },

    /**
     * Get WHS calculation parameters based on number of rounds.
     * Implements the official WHS sliding scale.
     * @param {number} roundCount - Number of rounds available
     * @returns {{countToUse: number, adjustment: number}} Number of best rounds to use and adjustment to apply
     */
    getWHSCalculationParams: function (roundCount) {
      if (roundCount <= 0) {
        return { countToUse: 0, adjustment: 0 };
      }
      if (roundCount >= 1 && roundCount <= 3) {
        return { countToUse: 1, adjustment: -2.0 };
      }
      if (roundCount === 4) {
        return { countToUse: 1, adjustment: -1.0 };
      }
      if (roundCount === 5) {
        return { countToUse: 1, adjustment: 0 };
      }
      if (roundCount === 6) {
        return { countToUse: 2, adjustment: -1.0 };
      }
      if (roundCount >= 7 && roundCount <= 8) {
        return { countToUse: 2, adjustment: 0 };
      }
      if (roundCount >= 9 && roundCount <= 11) {
        return { countToUse: 3, adjustment: 0 };
      }
      if (roundCount >= 12 && roundCount <= 14) {
        return { countToUse: 4, adjustment: 0 };
      }
      if (roundCount >= 15 && roundCount <= 16) {
        return { countToUse: 5, adjustment: 0 };
      }
      if (roundCount >= 17 && roundCount <= 18) {
        return { countToUse: 6, adjustment: 0 };
      }
      if (roundCount === 19) {
        return { countToUse: 7, adjustment: 0 };
      }
      // 20 or more rounds
      return { countToUse: 8, adjustment: 0 };
    },

    /**
     * Calculate handicap index using official WHS sliding scale.
     * Only considers the most recent 20 rounds if more than 20 are available.
     * @param {Array<Object>} rounds - All rounds (newest first)
     * @returns {{handicap: number|null, roundsUsed: number, bestRoundsUsed: number, adjustment: number}}
     */
    calculateHandicapIndex: function (rounds) {
      if (!rounds || rounds.length === 0) {
        return { handicap: null, roundsUsed: 0, bestRoundsUsed: 0, adjustment: 0, usedRoundIds: [] };
      }

      // Take only the most recent 20 rounds
      var roundsToConsider = rounds.slice(0, CONFIG.MAX_ROUNDS_FOR_HANDICAP);
      var roundsUsed = roundsToConsider.length;

      // Get WHS calculation parameters based on number of rounds
      var params = this.getWHSCalculationParams(roundsUsed);

      if (params.countToUse === 0) {
        return { handicap: null, roundsUsed: roundsUsed, bestRoundsUsed: 0, adjustment: 0, usedRoundIds: [] };
      }

      // Sort by differential (ascending = best first)
      var sortedByDifferential = roundsToConsider.slice().sort(function (a, b) {
        return a.differential - b.differential;
      });

      // Take the best rounds
      var bestRounds = sortedByDifferential.slice(0, params.countToUse);

      // Track which rounds feed into the handicap (for highlighting in the list)
      var usedRoundIds = bestRounds.map(function (r) {
        return r.id;
      });

      // Calculate average
      var sum = bestRounds.reduce(function (acc, r) {
        return acc + r.differential;
      }, 0);
      var average = sum / params.countToUse;

      // Apply adjustment
      var adjustedAverage = average + params.adjustment;

      // Round to one decimal place
      var handicapIndex = Math.round(adjustedAverage * 10) / 10;

      return {
        handicap: handicapIndex,
        roundsUsed: roundsUsed,
        bestRoundsUsed: params.countToUse,
        adjustment: params.adjustment,
        usedRoundIds: usedRoundIds
      };
    },

    /**
     * Return handicap calculation info for display.
     * @param {Array<Object>} rounds - All rounds (newest first)
     * @returns {{handicap: number|null, roundsUsed: number, bestRoundsUsed: number, adjustment: number}}
     */
    getHandicapInfo: function (rounds) {
      return this.calculateHandicapIndex(rounds);
    }
  };

  // ============================================================================
  // ANALYTICS SERVICE (derived insights — read-only)
  // ============================================================================

  var AnalyticsService = {
    SVG_NS: "http://www.w3.org/2000/svg",

    /**
     * Compute the Handicap Index as it stood after each handicap-eligible round,
     * producing a chronological series for the trend chart.
     * @param {Array<Object>} poolRounds - Handicap-eligible rounds (any order)
     * @returns {Array<{date: string, handicap: number}>} Oldest first
     */
    computeHandicapTrend: function (poolRounds) {
      var oldestFirst = poolRounds.slice().sort(function (a, b) {
        return a.date.localeCompare(b.date);
      });
      var series = [];
      for (var i = 0; i < oldestFirst.length; i++) {
        // Rounds up to and including this date, newest first for the WHS calc
        var newestFirst = oldestFirst.slice(0, i + 1).reverse();
        var info = WHSService.calculateHandicapIndex(newestFirst);
        if (info.handicap !== null) {
          series.push({ date: oldestFirst[i].date, handicap: info.handicap });
        }
      }
      return series;
    },

    /**
     * Aggregate per-course statistics from the rounds that have a course name.
     * @param {Array<Object>} rounds - All rounds
     * @returns {Array<Object>} Stats sorted by rounds played (desc), then last played
     */
    computeCourseStats: function (rounds) {
      var map = {};
      rounds.forEach(function (r) {
        if (!r.courseName) return;
        var key = r.courseName.toLowerCase();
        if (!map[key]) {
          map[key] = { name: r.courseName, diffs: [], lastPlayed: r.date };
        }
        var entry = map[key];
        entry.diffs.push(r.differential);
        if (r.date > entry.lastPlayed) entry.lastPlayed = r.date;
      });

      var stats = Object.keys(map).map(function (k) {
        var e = map[k];
        var sum = e.diffs.reduce(function (acc, d) { return acc + d; }, 0);
        return {
          name: e.name,
          count: e.diffs.length,
          avg: Math.round((sum / e.diffs.length) * 10) / 10,
          best: Math.min.apply(null, e.diffs),
          worst: Math.max.apply(null, e.diffs),
          lastPlayed: e.lastPlayed
        };
      });

      stats.sort(function (a, b) {
        return (b.count - a.count) || b.lastPlayed.localeCompare(a.lastPlayed);
      });
      return stats;
    },

    /**
     * Render the handicap trend as an inline SVG line chart (XSS-safe; built
     * entirely with DOM APIs and textContent). Shows a hint when there is too
     * little data.
     * @param {HTMLElement} container
     * @param {Array<{date: string, handicap: number}>} series - Oldest first
     */
    renderTrendChart: function (container, series) {
      if (!container) return;
      container.textContent = "";

      if (series.length < 2) {
        var hint = document.createElement("p");
        hint.className = "insights-empty";
        hint.textContent = "Play more rounds to see your handicap trend.";
        container.appendChild(hint);
        return;
      }

      var W = 320, H = 168;
      var padX = 12, padT = 26, padB = 22;
      var plotW = W - padX * 2;
      var plotH = H - padT - padB;
      var ns = this.SVG_NS;

      var values = series.map(function (p) { return p.handicap; });
      var minH = Math.min.apply(null, values);
      var maxH = Math.max.apply(null, values);
      // Breathing room so points never sit on the chart edges
      var headroom = (maxH - minH) * 0.18 || 1;
      minH -= headroom; maxH += headroom;
      var range = maxH - minH;
      var n = series.length;
      var baseline = padT + plotH;

      // Position points along a real time axis (not evenly spaced by index)
      var times = series.map(function (p) {
        return new Date(p.date + "T00:00:00").getTime();
      });
      var minT = times[0];
      var maxT = times[n - 1];
      var spanT = maxT - minT;

      function xAt(i) {
        // Fall back to even spacing if every round shares the same date
        if (spanT <= 0) return padX + plotW * (i / (n - 1));
        return padX + plotW * ((times[i] - minT) / spanT);
      }
      // Larger handicap higher on screen → improvement (decreasing) trends downward
      function yAt(h) { return padT + plotH * (1 - (h - minH) / range); }

      // Small helper to create namespaced SVG elements with attributes
      function el(name, attrs, cls) {
        var e = document.createElementNS(ns, name);
        if (cls) e.setAttribute("class", cls);
        if (attrs) {
          for (var k in attrs) { e.setAttribute(k, attrs[k]); }
        }
        return e;
      }

      var svg = el("svg", { viewBox: "0 0 " + W + " " + H }, "handicap-chart-svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label",
        "Handicap trend from " + UIService.formatDate(series[0].date) +
        " to " + UIService.formatDate(series[n - 1].date) +
        ", " + series[0].handicap + " to " + series[n - 1].handicap);

      // Gradient fill under the line
      var defs = el("defs");
      var grad = el("linearGradient", { id: "chart-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
      grad.appendChild(el("stop", { offset: "0", "stop-color": "#166534", "stop-opacity": "0.22" }));
      grad.appendChild(el("stop", { offset: "1", "stop-color": "#166534", "stop-opacity": "0" }));
      defs.appendChild(grad);
      svg.appendChild(defs);

      // Transparent backdrop dismisses the tooltip when clicked
      var backdrop = el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" });
      svg.appendChild(backdrop);

      var coords = series.map(function (p, i) { return { x: xAt(i), y: yAt(p.handicap) }; });

      // Area fill
      var areaD = "M " + coords[0].x + " " + baseline;
      coords.forEach(function (c) { areaD += " L " + c.x + " " + c.y; });
      areaD += " L " + coords[n - 1].x + " " + baseline + " Z";
      svg.appendChild(el("path", { d: areaD, fill: "url(#chart-grad)" }, "chart-area"));

      // Trend line
      var lineD = "M " + coords[0].x + " " + coords[0].y;
      for (var li = 1; li < n; li++) { lineD += " L " + coords[li].x + " " + coords[li].y; }
      svg.appendChild(el("path", { d: lineD }, "chart-line"));

      // Subtle date anchors at the corners (replace the horizontal axis)
      var d0 = el("text", { x: padX, y: H - 6 }, "chart-label");
      d0.setAttribute("text-anchor", "start");
      d0.textContent = UIService.formatDate(series[0].date);
      svg.appendChild(d0);
      var d1 = el("text", { x: W - padX, y: H - 6 }, "chart-label");
      d1.setAttribute("text-anchor", "end");
      d1.textContent = UIService.formatDate(series[n - 1].date);
      svg.appendChild(d1);

      // Persistent label for the latest handicap (anchors the vertical scale)
      var lastLabel = el("text", { x: coords[n - 1].x, y: coords[n - 1].y - 9 }, "chart-value-label");
      lastLabel.setAttribute("text-anchor", "end");
      lastLabel.textContent = String(series[n - 1].handicap);
      svg.appendChild(lastLabel);

      // Tooltip group, kept on top and hidden until a point is clicked
      var tip = el("g", null, "chart-tooltip");
      tip.style.display = "none";
      var tipBg = el("rect", { rx: 4, height: 16 }, "chart-tooltip-bg");
      var tipText = el("text", null, "chart-tooltip-text");
      tipText.setAttribute("text-anchor", "middle");
      tip.appendChild(tipBg);
      tip.appendChild(tipText);

      var pointEls = [];
      var activeIdx = -1;

      function hideTip() {
        tip.style.display = "none";
        if (activeIdx >= 0 && pointEls[activeIdx]) pointEls[activeIdx].setAttribute("r", "3");
        activeIdx = -1;
      }
      function showTip(i) {
        if (activeIdx === i) { hideTip(); return; }
        if (activeIdx >= 0 && pointEls[activeIdx]) pointEls[activeIdx].setAttribute("r", "3");
        var p = series[i];
        var label = UIService.formatDate(p.date) + "   " + p.handicap;
        tipText.textContent = label;
        var tw = label.length * 5.1 + 14;
        var th = 16;
        var tx = Math.max(2, Math.min(W - tw - 2, coords[i].x - tw / 2));
        var ty = coords[i].y - th - 9;
        if (ty < 2) ty = coords[i].y + 9;
        tipBg.setAttribute("x", tx);
        tipBg.setAttribute("y", ty);
        tipBg.setAttribute("width", tw);
        tipText.setAttribute("x", tx + tw / 2);
        tipText.setAttribute("y", ty + 11);
        tip.style.display = "";
        pointEls[i].setAttribute("r", "4.5");
        activeIdx = i;
      }

      backdrop.addEventListener("click", hideTip);

      // Visible donut points plus a generous invisible hit target for tapping
      coords.forEach(function (c, i) {
        var dot = el("circle", { cx: c.x, cy: c.y, r: 3 }, "chart-point");
        var hit = el("circle", { cx: c.x, cy: c.y, r: 12, fill: "transparent" }, "chart-hit");
        hit.addEventListener("click", function (ev) { ev.stopPropagation(); showTip(i); });
        pointEls.push(dot);
        svg.appendChild(dot);
        svg.appendChild(hit);
      });

      svg.appendChild(tip);
      container.appendChild(svg);
    },

    /**
     * Render per-course statistics as a table (XSS-safe via textContent).
     * @param {HTMLElement} container
     * @param {Array<Object>} stats
     */
    renderCourseStats: function (container, stats) {
      if (!container) return;
      container.textContent = "";

      if (stats.length === 0) {
        var hint = document.createElement("p");
        hint.className = "insights-empty";
        hint.textContent = "Add course names to your rounds to see course statistics.";
        container.appendChild(hint);
        return;
      }

      var table = document.createElement("table");
      table.className = "course-stats-table";

      var thead = document.createElement("thead");
      var headRow = document.createElement("tr");
      ["Course", "Rounds", "Avg", "Best", "Worst"].forEach(function (h, idx) {
        var th = document.createElement("th");
        th.textContent = h;
        if (idx > 0) th.className = "num";
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      stats.forEach(function (s) {
        var tr = document.createElement("tr");

        var nameCell = document.createElement("td");
        nameCell.textContent = s.name;
        nameCell.className = "course-stats-name";
        tr.appendChild(nameCell);

        [s.count, s.avg, s.best, s.worst].forEach(function (val) {
          var td = document.createElement("td");
          td.className = "num";
          td.textContent = String(val);
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      container.appendChild(table);
    }
  };

  // ============================================================================
  // UI SERVICE
  // ============================================================================

  var UIService = {
    /**
     * Format date from YYYY-MM-DD to DD/MM/YYYY.
     * @param {string} isoDate - ISO date string
     * @returns {string} Formatted date string
     */
    formatDate: function (isoDate) {
      var parts = isoDate.split("-");
      if (parts.length !== 3) return isoDate;
      return parts[2] + "/" + parts[1] + "/" + parts[0];
    },

    /**
     * Set today's date in a date input field.
     * @param {HTMLInputElement} input - Date input element
     */
    setToday: function (input) {
      if (!input || input.type !== "date") return;
      var today = new Date();
      var year = today.getFullYear();
      var month = String(today.getMonth() + 1).padStart(2, "0");
      var day = String(today.getDate()).padStart(2, "0");
      input.value = year + "-" + month + "-" + day;
    },

    /**
     * Show an error message (textContent only, XSS-safe).
     * @param {HTMLElement} container - Container element
     * @param {string} message - Error message
     */
    showError: function (container, message) {
      if (!container) return;
      container.textContent = "";
      container.classList.remove("visible");
      requestAnimationFrame(function () {
        container.textContent = message || "An error occurred.";
        container.classList.add("visible");
        container.setAttribute("role", "alert");
        container.setAttribute("aria-live", "assertive");
      });
    },

    /**
     * Show result (score differential) in container (textContent only, XSS-safe).
     * @param {HTMLElement} container - Container element
     * @param {number} scoreDifferential - Score differential value
     */
    showResult: function (container, scoreDifferential) {
      if (!container) return;
      container.textContent = "";
      container.classList.remove("visible");
      requestAnimationFrame(function () {
        container.classList.add("visible");
        container.removeAttribute("role");
        container.setAttribute("aria-live", "polite");
        var label = document.createElement("span");
        label.textContent = "Score Differential";
        var valueEl = document.createElement("span");
        valueEl.className = "value";
        valueEl.textContent = String(scoreDifferential);
        container.appendChild(label);
        container.appendChild(valueEl);
      });
    },

    /**
     * Clear the result/error container.
     * @param {HTMLElement} container - Container element
     */
    clearResult: function (container) {
      if (!container) return;
      container.textContent = "";
      container.classList.remove("visible");
      container.removeAttribute("role");
    }
  };

  // ============================================================================
  // APPLICATION (main logic)
  // ============================================================================

  var App = {
    scoringMethod: "gross",

    elements: {
      form: null,
      roundDateInput: null,
      grossScoreInput: null,
      grossScoreLabel: null,
      courseRatingInput: null,
      slopeInput: null,
      courseNameInput: null,
      noteInput: null,
      methodGrossButton: null,
      methodStablefordButton: null,
      stablefordRow: null,
      stablefordPointsInput: null,
      nineHoleRow: null,
      nineHoleInput: null,
      hcpiRow: null,
      hcpiHintText: null,
      hcpiInput: null,
      resultContainer: null,
      handicapValue: null,
      handicapHint: null,
      roundsList: null,
      roundsEmpty: null,
      deleteAllButton: null,
      addRoundButton: null,
      exportButton: null,
      importButton: null,
      importFileInput: null,
      importStatus: null,
      handicapChart: null,
      courseStats: null
    },

    /**
     * Initialize the application.
     */
    init: function () {
      this.elements.form = document.getElementById("handicap-form");
      this.elements.roundDateInput = document.getElementById("round-date");
      this.elements.grossScoreInput = document.getElementById("gross-score");
      this.elements.grossScoreLabel = document.getElementById("gross-score-label");
      this.elements.courseRatingInput = document.getElementById("course-rating");
      this.elements.slopeInput = document.getElementById("slope-rating");
      this.elements.courseNameInput = document.getElementById("course-name");
      this.elements.noteInput = document.getElementById("round-note");
      this.elements.methodGrossButton = document.getElementById("method-gross");
      this.elements.methodStablefordButton = document.getElementById("method-stableford");
      this.elements.stablefordRow = document.getElementById("stableford-row");
      this.elements.stablefordPointsInput = document.getElementById("stableford-points");
      this.elements.nineHoleRow = document.getElementById("nine-hole-row");
      this.elements.nineHoleInput = document.getElementById("nine-hole");
      this.elements.hcpiRow = document.getElementById("hcpi-row");
      this.elements.hcpiHintText = document.getElementById("hcpi-hint-text");
      this.elements.hcpiInput = document.getElementById("hcpi-input");
      this.elements.resultContainer = document.getElementById("result");
      this.elements.handicapValue = document.getElementById("handicap-value");
      this.elements.handicapHint = document.getElementById("handicap-hint");
      this.elements.roundsList = document.getElementById("rounds-list");
      this.elements.roundsEmpty = document.getElementById("rounds-empty");
      this.elements.deleteAllButton = document.getElementById("delete-all");
      this.elements.addRoundButton = document.getElementById("add-round");
      this.elements.exportButton = document.getElementById("export-data");
      this.elements.importButton = document.getElementById("import-data");
      this.elements.importFileInput = document.getElementById("import-file-input");
      this.elements.importStatus = document.getElementById("import-status");
      this.elements.handicapChart = document.getElementById("handicap-chart");
      this.elements.courseStats = document.getElementById("course-stats");

      // Export/import elements are optional — exclude from required check
      var optionalElements = ["exportButton", "importButton", "importFileInput", "importStatus",
        "grossScoreLabel", "noteInput", "methodGrossButton", "methodStablefordButton",
        "stablefordRow", "stablefordPointsInput", "nineHoleRow", "hcpiRow", "hcpiHintText",
        "handicapChart", "courseStats"];
      var missingElements = [];
      for (var key in this.elements) {
        if (!this.elements[key] && optionalElements.indexOf(key) === -1) {
          missingElements.push(key);
        }
      }
      if (missingElements.length > 0) {
        console.error("Missing DOM elements:", missingElements);
        return;
      }

      this.elements.form.addEventListener("submit", this.handleSubmit.bind(this));
      this.elements.deleteAllButton.addEventListener("click", this.handleDeleteAll.bind(this));
      this.elements.nineHoleInput.addEventListener("change", this.handleNineHoleToggle.bind(this));
      this.elements.addRoundButton.addEventListener("click", this.showAddRoundCard.bind(this));

      if (this.elements.methodGrossButton && this.elements.methodStablefordButton) {
        var appRef = this;
        this.elements.methodGrossButton.addEventListener("click", function () {
          appRef.setScoringMethod("gross");
        });
        this.elements.methodStablefordButton.addEventListener("click", function () {
          appRef.setScoringMethod("stableford");
        });
      }


      if (this.elements.exportButton) {
        this.elements.exportButton.addEventListener("click", this.handleExport.bind(this));
      }
      if (this.elements.importButton && this.elements.importFileInput) {
        var self = this;
        this.elements.importButton.addEventListener("click", function () {
          self.elements.importFileInput.click();
        });
        this.elements.importFileInput.addEventListener("change", this.handleImportFileSelected.bind(this));
      }

      UIService.setToday(this.elements.roundDateInput);

      // Load seed courses; re-trigger suggestions if field is already focused
      var courseNameInput = this.elements.courseNameInput;
      CourseService.loadSeedData().then(function () {
        if (courseNameInput && document.activeElement === courseNameInput) {
          courseNameInput.dispatchEvent(new Event("input"));
        }
      });
      CourseService.attachAutocomplete(
        this.elements.courseNameInput,
        this.elements.courseRatingInput,
        this.elements.slopeInput
      );

      this.updateUI();
    },

    /**
     * Handle form submit.
     * @param {Event} event - Submit event
     */
    handleSubmit: function (event) {
      event.preventDefault();
      UIService.clearResult(this.elements.resultContainer);

      var isStableford = this.scoringMethod === "stableford";
      var dateRaw = this.elements.roundDateInput.value;
      var courseRatingRaw = this.elements.courseRatingInput.value;
      var slopeRaw = this.elements.slopeInput.value;
      var courseNameRaw = this.elements.courseNameInput.value.trim().slice(0, 80);
      var noteRaw = this.elements.noteInput ? this.elements.noteInput.value.trim().slice(0, 280) : "";
      // 9-hole applies to both Gross Score and Stableford rounds
      var isNineHole = this.elements.nineHoleInput.checked;

      // --- Common validations: date, course rating, slope ---
      var dateValidation = ValidationService.validateDate(dateRaw);
      if (!dateValidation.valid) {
        UIService.showError(this.elements.resultContainer, dateValidation.error);
        this.elements.roundDateInput.setAttribute("aria-invalid", "true");
        this.elements.roundDateInput.focus();
        return;
      }
      this.elements.roundDateInput.removeAttribute("aria-invalid");

      var courseRatingValidation = ValidationService.validateCourseRating(courseRatingRaw, isNineHole);
      if (!courseRatingValidation.valid) {
        UIService.showError(this.elements.resultContainer, courseRatingValidation.error);
        this.elements.courseRatingInput.setAttribute("aria-invalid", "true");
        this.elements.courseRatingInput.focus();
        return;
      }
      this.elements.courseRatingInput.removeAttribute("aria-invalid");

      var slopeValidation = ValidationService.validateSlope(slopeRaw);
      if (!slopeValidation.valid) {
        UIService.showError(this.elements.resultContainer, slopeValidation.error);
        this.elements.slopeInput.setAttribute("aria-invalid", "true");
        this.elements.slopeInput.focus();
        return;
      }
      this.elements.slopeInput.removeAttribute("aria-invalid");

      var scoreDifferential;
      var newRound = {
        id: String(Date.now()),
        date: dateRaw.trim(),
        score: null,
        courseRating: courseRatingValidation.value,
        slope: slopeValidation.value,
        differential: 0,
        courseName: courseNameRaw || null,
        isNineHole: isNineHole,
        scoringMethod: this.scoringMethod,
        stablefordPoints: null,
        hcpiUsed: null,
        note: noteRaw || null,
        excludeFromHandicap: false
      };

      if (isStableford) {
        // --- Stableford branch: points + Handicap Index ---
        var pointsValidation = ValidationService.validateStablefordPoints(this.elements.stablefordPointsInput.value, isNineHole);
        if (!pointsValidation.valid) {
          UIService.showError(this.elements.resultContainer, pointsValidation.error);
          this.elements.stablefordPointsInput.setAttribute("aria-invalid", "true");
          this.elements.stablefordPointsInput.focus();
          return;
        }
        this.elements.stablefordPointsInput.removeAttribute("aria-invalid");

        var sbHcpiValidation = ValidationService.validateHcpi(this.elements.hcpiInput.value);
        if (!sbHcpiValidation.valid) {
          UIService.showError(this.elements.resultContainer, sbHcpiValidation.error);
          this.elements.hcpiInput.setAttribute("aria-invalid", "true");
          this.elements.hcpiInput.focus();
          return;
        }
        this.elements.hcpiInput.removeAttribute("aria-invalid");

        scoreDifferential = isNineHole
          ? WHSService.calculateNineHoleStablefordDifferential(
              pointsValidation.value,
              slopeValidation.value,
              sbHcpiValidation.value
            )
          : WHSService.calculateStablefordDifferential(
              pointsValidation.value,
              slopeValidation.value,
              sbHcpiValidation.value
            );
        newRound.stablefordPoints = pointsValidation.value;
        newRound.hcpiUsed = sbHcpiValidation.value;
      } else {
        // --- Gross score branch ---
        var scoreValidation = ValidationService.validateScore(this.elements.grossScoreInput.value, isNineHole);
        if (!scoreValidation.valid) {
          UIService.showError(this.elements.resultContainer, scoreValidation.error);
          this.elements.grossScoreInput.setAttribute("aria-invalid", "true");
          this.elements.grossScoreInput.focus();
          return;
        }
        this.elements.grossScoreInput.removeAttribute("aria-invalid");

        scoreDifferential = WHSService.calculateScoreDifferential(
          scoreValidation.value,
          courseRatingValidation.value,
          slopeValidation.value
        );
        // For 9-hole rounds, combine with expected SD using official WHS formula
        if (isNineHole) {
          var hcpiValidation = ValidationService.validateHcpi(this.elements.hcpiInput.value);
          if (!hcpiValidation.valid) {
            UIService.showError(this.elements.resultContainer, hcpiValidation.error);
            this.elements.hcpiInput.setAttribute("aria-invalid", "true");
            this.elements.hcpiInput.focus();
            return;
          }
          this.elements.hcpiInput.removeAttribute("aria-invalid");
          var expectedSD = WHSService.calculateExpectedNineHoleSD(hcpiValidation.value);
          scoreDifferential = Math.round((scoreDifferential + expectedSD) * 10) / 10;
          newRound.hcpiUsed = hcpiValidation.value;
        }
        newRound.score = scoreValidation.value;
      }

      newRound.differential = scoreDifferential;
      UIService.showResult(this.elements.resultContainer, scoreDifferential);

      var rounds = StorageService.loadRounds();
      rounds.unshift(newRound);
      var saveResult = StorageService.saveRounds(rounds);
      if (!saveResult.success) {
        UIService.showError(this.elements.resultContainer, saveResult.error);
        return;
      }

      // Silently save the course to the user's course book for future autocomplete
      if (courseNameRaw && courseRatingValidation.value !== null && slopeValidation.value !== null) {
        CourseService.saveUserCourse(courseNameRaw, courseRatingValidation.value, slopeValidation.value);
      }

      this.updateUI();
    },

    /**
     * Switch the input form between Gross Score and Stableford scoring.
     * @param {string} method - "gross" or "stableford"
     */
    setScoringMethod: function (method) {
      this.scoringMethod = method === "stableford" ? "stableford" : "gross";
      var isStableford = this.scoringMethod === "stableford";

      if (this.elements.methodGrossButton) {
        this.elements.methodGrossButton.classList.toggle("active", !isStableford);
        this.elements.methodGrossButton.setAttribute("aria-pressed", String(!isStableford));
      }
      if (this.elements.methodStablefordButton) {
        this.elements.methodStablefordButton.classList.toggle("active", isStableford);
        this.elements.methodStablefordButton.setAttribute("aria-pressed", String(isStableford));
      }

      if (this.elements.grossScoreLabel) this.elements.grossScoreLabel.style.display = isStableford ? "none" : "";
      this.elements.grossScoreInput.style.display = isStableford ? "none" : "";
      if (this.elements.stablefordRow) this.elements.stablefordRow.style.display = isStableford ? "" : "none";
      // The 9-hole toggle stays visible for both scoring methods; its checked
      // state is preserved when switching between them.
      if (isStableford) {
        this.elements.grossScoreInput.removeAttribute("aria-invalid");
      } else {
        if (this.elements.stablefordPointsInput) this.elements.stablefordPointsInput.removeAttribute("aria-invalid");
      }

      this.updateHcpiRowVisibility();
    },

    /**
     * Show the Handicap Index row when it is needed (Stableford rounds, or
     * 9-hole rounds) and update its hint text. Pre-fills the current handicap.
     */
    updateHcpiRowVisibility: function () {
      var needHcpi = this.scoringMethod === "stableford" || this.elements.nineHoleInput.checked;
      if (this.elements.hcpiRow) {
        this.elements.hcpiRow.style.display = needHcpi ? "" : "none";
      }
      // In Stableford mode, hint the expected reference: 18 points for 9 holes,
      // 36 points for 18 holes (playing exactly to handicap).
      if (this.elements.stablefordPointsInput) {
        this.elements.stablefordPointsInput.placeholder =
          this.elements.nineHoleInput.checked ? "e.g. 18" : "e.g. 36";
      }
      if (this.elements.hcpiHintText) {
        this.elements.hcpiHintText.textContent = this.scoringMethod === "stableford"
          ? "(for Stableford calculation)"
          : "(for 9-hole calculation)";
      }
      if (needHcpi) {
        this.prefillHcpi();
      } else {
        this.elements.hcpiInput.value = "";
        this.elements.hcpiInput.removeAttribute("aria-invalid");
      }
    },

    /**
     * Pre-fill the Handicap Index field with the current calculated handicap,
     * if the field is empty and a handicap is available.
     */
    prefillHcpi: function () {
      if (this.elements.hcpiInput.value) return;
      var info = WHSService.getHandicapInfo(this.getHandicapPool());
      if (info.handicap !== null) {
        this.elements.hcpiInput.value = String(info.handicap);
      }
    },

    /**
     * Return the rounds eligible for the handicap calculation (those not
     * excluded), sorted newest first.
     * @returns {Array<Object>}
     */
    getHandicapPool: function () {
      return StorageService.loadRounds()
        .filter(function (r) { return !r.excludeFromHandicap; })
        .sort(function (a, b) { return b.date.localeCompare(a.date); });
    },

    /**
     * Handle "Delete all" button click.
     */
    handleDeleteAll: function () {
      var rounds = StorageService.loadRounds();
      if (rounds.length === 0) return;
      if (!confirm("Are you sure you want to delete all saved rounds?")) return;
      var deleteResult = StorageService.deleteAll();
      if (!deleteResult.success) {
        alert("Error deleting: " + deleteResult.error);
        return;
      }
      UIService.clearResult(this.elements.resultContainer);
      this.updateUI();
    },

    /**
     * Show/hide and pre-fill the HCPI field when the 9-hole checkbox changes.
     */
    handleNineHoleToggle: function () {
      this.updateHcpiRowVisibility();
    },

    /**
     * Delete a single round by id.
     * @param {string} roundId - Round id
     */
    deleteRound: function (roundId) {
      var rounds = StorageService.loadRounds().filter(function (r) {
        return r.id !== roundId;
      });
      var saveResult = StorageService.saveRounds(rounds);
      if (!saveResult.success) {
        alert("Error deleting: " + saveResult.error);
        return;
      }
      this.updateUI();
    },

    /**
     * Build an editable card for adding or editing a round.
     * @param {Object|null} existingRound - Round to edit, or null for a new entry
     * @returns {HTMLElement} The editable card element
     */
    createEditableCard: function (existingRound) {
      var app = this;
      var isEdit = !!existingRound;

      // Helper: build a labeled input row
      function makeRow(labelText, inputId, type, placeholder, step) {
        var row = document.createElement("div");
        row.className = "round-card-editable-row";
        var lbl = document.createElement("label");
        lbl.setAttribute("for", inputId);
        lbl.textContent = labelText;
        var inp = document.createElement("input");
        inp.type = type || "text";
        inp.id = inputId;
        inp.placeholder = placeholder || "";
        if (step !== undefined) inp.step = String(step);
        row.appendChild(lbl);
        row.appendChild(inp);
        return row;
      }

      function todayISO() {
        var t = new Date();
        return t.getFullYear() + "-" +
          String(t.getMonth() + 1).padStart(2, "0") + "-" +
          String(t.getDate()).padStart(2, "0");
      }

      var card = document.createElement("div");
      card.className = "round-card-editable";
      card.id = "edit-round-card";
      card.setAttribute("role", "form");
      card.setAttribute("aria-label", isEdit ? "Edit round" : "Add historic round");

      var dateRow = makeRow(isEdit ? "Date" : "Date (optional, defaults to today)", "edit-date", "date", "");
      dateRow.querySelector("input").value = isEdit ? existingRound.date : todayISO();

      // Course name first so autocomplete can pre-fill CR/Slope
      var courseNameRow = makeRow("Course Name (optional)", "edit-course-name", "text", "e.g. Augusta National");
      courseNameRow.querySelector("input").setAttribute("autocomplete", "off");

      // Stableford rounds are edited via points + Handicap Index (the
      // differential is recomputed); gross/manual rounds edit the differential
      // directly. This keeps the edit UX aligned with the entry form.
      var isStableford = isEdit && existingRound.scoringMethod === "stableford";
      var pointsRow, hcpiRow, diffRow, scoreRow;
      if (isStableford) {
        pointsRow = makeRow("Stableford Points", "edit-points", "number", "e.g. 36", 1);
        hcpiRow = makeRow("Handicap Index", "edit-hcpi", "number", "e.g. 18.0", 0.1);
      } else {
        diffRow = makeRow("Score Differential", "edit-differential", "number", "e.g. 12.3", 0.1);
        scoreRow = makeRow("Gross Score (optional)", "edit-score", "number", "e.g. 85");
      }
      var crRow = makeRow("Course Rating (optional)", "edit-cr", "number", "e.g. 72.5", 0.1);
      var slopeRow = makeRow(isStableford ? "Slope Rating" : "Slope Rating (optional)", "edit-slope", "number", "e.g. 128");
      var noteRow = makeRow("Note (optional)", "edit-note", "text", "e.g. windy, played with John");

      // 9-hole checkbox
      var nineHoleRow = document.createElement("div");
      nineHoleRow.className = "nine-hole-row";
      var nineHoleCb = document.createElement("input");
      nineHoleCb.type = "checkbox";
      nineHoleCb.id = "edit-nine-hole";
      var nineHoleLbl = document.createElement("label");
      nineHoleLbl.setAttribute("for", "edit-nine-hole");
      nineHoleLbl.textContent = "9-hole round";
      nineHoleRow.appendChild(nineHoleCb);
      nineHoleRow.appendChild(nineHoleLbl);

      // Count-for-handicap checkbox
      var countRow = document.createElement("div");
      countRow.className = "nine-hole-row";
      var countCb = document.createElement("input");
      countCb.type = "checkbox";
      countCb.id = "edit-count";
      var countLbl = document.createElement("label");
      countLbl.setAttribute("for", "edit-count");
      countLbl.textContent = "Count for handicap";
      countRow.appendChild(countCb);
      countRow.appendChild(countLbl);

      // Pre-fill values when editing
      if (isEdit) {
        courseNameRow.querySelector("input").value = existingRound.courseName || "";
        if (isStableford) {
          if (existingRound.stablefordPoints !== null && existingRound.stablefordPoints !== undefined) {
            pointsRow.querySelector("input").value = String(existingRound.stablefordPoints);
          }
          if (existingRound.hcpiUsed !== null && existingRound.hcpiUsed !== undefined) {
            hcpiRow.querySelector("input").value = String(existingRound.hcpiUsed);
          }
        } else {
          diffRow.querySelector("input").value = String(existingRound.differential);
          if (existingRound.score !== null && existingRound.score !== undefined) {
            scoreRow.querySelector("input").value = String(existingRound.score);
          }
        }
        if (existingRound.courseRating !== null && existingRound.courseRating !== undefined) {
          crRow.querySelector("input").value = String(existingRound.courseRating);
        }
        if (existingRound.slope !== null && existingRound.slope !== undefined) {
          slopeRow.querySelector("input").value = String(existingRound.slope);
        }
        noteRow.querySelector("input").value = existingRound.note || "";
        nineHoleCb.checked = !!existingRound.isNineHole;
      }
      // New rounds count by default; for edits, reflect the stored flag
      countCb.checked = isEdit ? !existingRound.excludeFromHandicap : true;

      // For Stableford edits, hint the expected reference (18 pts for 9 holes,
      // 36 for 18 holes) and keep it in sync with the 9-hole toggle.
      if (isStableford) {
        var pointsInputEl = pointsRow.querySelector("input");
        var syncPointsHint = function () {
          pointsInputEl.placeholder = nineHoleCb.checked ? "e.g. 18" : "e.g. 36";
        };
        syncPointsHint();
        nineHoleCb.addEventListener("change", syncPointsHint);
      }

      var errorEl = document.createElement("p");
      errorEl.className = "add-round-error";
      errorEl.style.display = "none";

      var actionsDiv = document.createElement("div");
      actionsDiv.className = "round-card-editable-actions";
      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-save-round";
      saveBtn.textContent = "Save";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-cancel-round";
      cancelBtn.textContent = "Cancel";
      actionsDiv.appendChild(saveBtn);
      actionsDiv.appendChild(cancelBtn);

      card.appendChild(dateRow);
      card.appendChild(courseNameRow);
      if (isStableford) {
        card.appendChild(pointsRow);
        card.appendChild(hcpiRow);
      } else {
        card.appendChild(diffRow);
        card.appendChild(scoreRow);
      }
      card.appendChild(crRow);
      card.appendChild(slopeRow);
      card.appendChild(noteRow);
      card.appendChild(nineHoleRow);
      card.appendChild(countRow);
      card.appendChild(errorEl);
      card.appendChild(actionsDiv);

      cancelBtn.addEventListener("click", function () {
        // Re-render to restore the original card (edit) or simply remove (add)
        app.updateUI();
      });

      saveBtn.addEventListener("click", function () {
        app.saveEditableCard(card, errorEl, existingRound);
      });

      return card;
    },

    /**
     * Show an editable card at the top of the rounds list for manual round entry.
     * Only one editable card can be open at a time.
     */
    showAddRoundCard: function () {
      if (this.elements.roundsList.querySelector(".round-card-editable")) return;

      var card = this.createEditableCard(null);
      this.elements.roundsList.prepend(card);

      CourseService.attachAutocomplete(
        document.getElementById("edit-course-name"),
        document.getElementById("edit-cr"),
        document.getElementById("edit-slope")
      );

      document.getElementById("edit-differential").focus();
    },

    /**
     * Replace a displayed round card with an editable card for in-place editing.
     * @param {string} roundId - Round id
     */
    openEditRound: function (roundId) {
      if (this.elements.roundsList.querySelector(".round-card-editable")) return;

      var round = StorageService.loadRounds().filter(function (r) {
        return r.id === roundId;
      })[0];
      if (!round) return;

      var target = this.elements.roundsList.querySelector('[data-id="' + roundId + '"]');
      if (!target) return;

      var card = this.createEditableCard(round);
      this.elements.roundsList.replaceChild(card, target);

      CourseService.attachAutocomplete(
        document.getElementById("edit-course-name"),
        document.getElementById("edit-cr"),
        document.getElementById("edit-slope")
      );

      var focusEl = document.getElementById("edit-points") || document.getElementById("edit-differential");
      if (focusEl) focusEl.focus();
    },

    /**
     * Validate and save the editable card (handles both add and edit).
     * @param {HTMLElement} card - The editable card element
     * @param {HTMLElement} errorEl - Inline error paragraph
     * @param {Object|null} existingRound - Round being edited, or null for a new entry
     */
    saveEditableCard: function (card, errorEl, existingRound) {
      var isEdit = !!existingRound;
      var isStableford = isEdit && existingRound.scoringMethod === "stableford";
      var dateInput = document.getElementById("edit-date");
      var crInput = document.getElementById("edit-cr");
      var slopeInput = document.getElementById("edit-slope");
      var courseNameInput = document.getElementById("edit-course-name");
      var noteInput = document.getElementById("edit-note");
      var nineHoleCb = document.getElementById("edit-nine-hole");
      var countCb = document.getElementById("edit-count");

      errorEl.style.display = "none";

      // Date is optional – defaults to today
      var dateRaw = dateInput.value;
      var date;
      if (!dateRaw) {
        var t = new Date();
        date = t.getFullYear() + "-" +
          String(t.getMonth() + 1).padStart(2, "0") + "-" +
          String(t.getDate()).padStart(2, "0");
      } else {
        var dateValidation = ValidationService.validateDate(dateRaw);
        if (!dateValidation.valid) {
          errorEl.textContent = dateValidation.error;
          errorEl.style.display = "";
          dateInput.focus();
          return;
        }
        date = dateRaw.trim();
      }

      // Common fields
      var courseName = courseNameInput.value.trim().slice(0, 80) || null;
      var note = noteInput.value.trim().slice(0, 280) || null;
      var isNineHole = nineHoleCb.checked;
      var excludeFromHandicap = !countCb.checked;
      var courseRating = crInput.value !== "" ? parseFloat(crInput.value) : null;

      var round = {
        id: isEdit ? existingRound.id : String(Date.now()),
        date: date,
        score: null,
        courseRating: courseRating,
        slope: null,
        differential: 0,
        courseName: courseName,
        isNineHole: isNineHole,
        note: note,
        excludeFromHandicap: excludeFromHandicap,
        scoringMethod: "gross",
        stablefordPoints: null,
        hcpiUsed: isEdit ? (existingRound.hcpiUsed || null) : null,
        manualEntry: isEdit ? existingRound.manualEntry === true : true
      };

      if (isStableford) {
        // --- Stableford edit: recompute the differential from points + index ---
        var pointsInput = document.getElementById("edit-points");
        var hcpiInput = document.getElementById("edit-hcpi");

        var slopeV = ValidationService.validateSlope(slopeInput.value);
        if (!slopeV.valid) {
          errorEl.textContent = slopeV.error;
          errorEl.style.display = "";
          slopeInput.focus();
          return;
        }
        var pointsV = ValidationService.validateStablefordPoints(pointsInput.value, isNineHole);
        if (!pointsV.valid) {
          errorEl.textContent = pointsV.error;
          errorEl.style.display = "";
          pointsInput.focus();
          return;
        }
        var hcpiV = ValidationService.validateHcpi(hcpiInput.value);
        if (!hcpiV.valid) {
          errorEl.textContent = hcpiV.error;
          errorEl.style.display = "";
          hcpiInput.focus();
          return;
        }

        round.slope = slopeV.value;
        round.differential = isNineHole
          ? WHSService.calculateNineHoleStablefordDifferential(pointsV.value, slopeV.value, hcpiV.value)
          : WHSService.calculateStablefordDifferential(pointsV.value, slopeV.value, hcpiV.value);
        round.scoringMethod = "stableford";
        round.stablefordPoints = pointsV.value;
        round.hcpiUsed = hcpiV.value;
      } else {
        // --- Gross / manual edit: differential is entered directly ---
        var diffInput = document.getElementById("edit-differential");
        var scoreInput = document.getElementById("edit-score");

        var diffRaw = diffInput.value;
        if (diffRaw === "" || diffRaw === null || diffRaw === undefined) {
          errorEl.textContent = "Score Differential is required.";
          errorEl.style.display = "";
          diffInput.focus();
          return;
        }
        var diff = parseFloat(diffRaw);
        if (isNaN(diff) || !isFinite(diff) || diff < -10 || diff > 60) {
          errorEl.textContent = "Score Differential must be a number between -10 and 60.";
          errorEl.style.display = "";
          diffInput.focus();
          return;
        }
        round.differential = Math.round(diff * 10) / 10;
        round.score = scoreInput.value !== "" ? parseInt(scoreInput.value, 10) : null;
        round.slope = slopeInput.value !== "" ? parseInt(slopeInput.value, 10) : null;
      }

      var rounds = StorageService.loadRounds();
      if (isEdit) {
        rounds = rounds.map(function (r) {
          return r.id === round.id ? round : r;
        });
      } else {
        rounds.push(round);
      }
      var saveResult = StorageService.saveRounds(rounds);
      if (!saveResult.success) {
        errorEl.textContent = saveResult.error;
        errorEl.style.display = "";
        return;
      }

      // Silently save the course to the user's course book for future autocomplete
      if (courseName && round.courseRating !== null && round.slope !== null) {
        CourseService.saveUserCourse(courseName, round.courseRating, round.slope);
      }

      this.updateUI();
    },

    /**
     * Toggle whether a round counts toward the handicap calculation.
     * @param {string} roundId - Round id
     */
    toggleRoundExclusion: function (roundId) {
      var rounds = StorageService.loadRounds().map(function (r) {
        if (r.id === roundId) {
          r.excludeFromHandicap = !r.excludeFromHandicap;
        }
        return r;
      });
      var saveResult = StorageService.saveRounds(rounds);
      if (!saveResult.success) {
        alert("Error saving: " + saveResult.error);
        return;
      }
      this.updateUI();
    },

    /**
     * Update handicap display.
     * @param {Object} info - Result from WHSService.getHandicapInfo
     */
    updateHandicap: function (info) {
      if (info.handicap !== null) {
        this.elements.handicapValue.textContent = String(info.handicap);
        var hintText = "Based on your best " + info.bestRoundsUsed + " out of " + info.roundsUsed + " rounds";
        this.elements.handicapHint.textContent = hintText;
      } else {
        this.elements.handicapValue.textContent = "—";
        this.elements.handicapHint.textContent = "At least 1 counting round required";
      }
    },

    /**
     * Render the rounds list (textContent only, XSS-safe).
     * @param {Array<Object>} roundsNewestFirst - All rounds, sorted newest first
     * @param {Array<string>} usedRoundIds - Ids of the rounds feeding the handicap
     */
    renderRoundsList: function (roundsNewestFirst, usedRoundIds) {
      this.elements.roundsList.textContent = "";

      this.elements.deleteAllButton.style.display = roundsNewestFirst.length > 0 ? "" : "none";

      var app = this;
      var usedLookup = {};
      (usedRoundIds || []).forEach(function (id) { usedLookup[id] = true; });

      roundsNewestFirst.forEach(function (round) {
        var isCounting = usedLookup[round.id] === true;
        var isExcluded = round.excludeFromHandicap === true;

        var card = document.createElement("div");
        card.className = "round-card";
        if (isCounting) card.className += " round-card-counting";
        if (isExcluded) card.className += " round-card-excluded";
        card.setAttribute("data-id", round.id);
        card.setAttribute("role", "listitem");

        // --- Header: date (+ badges) and action buttons ---
        var header = document.createElement("div");
        header.className = "round-card-header";

        var dateSpan = document.createElement("span");
        dateSpan.className = "round-card-date";
        dateSpan.textContent = UIService.formatDate(round.date);
        if (round.isNineHole) {
          dateSpan.appendChild(app.makeBadge("9H"));
        }
        if (round.scoringMethod === "stableford") {
          dateSpan.appendChild(app.makeBadge("Stbf"));
        }
        if (isCounting) {
          dateSpan.appendChild(app.makeBadge("Counts", "round-card-badge-counts"));
        }
        if (isExcluded) {
          dateSpan.appendChild(app.makeBadge("Not counted", "round-card-badge-excluded"));
        }

        var actions = document.createElement("div");
        actions.className = "round-card-actions";

        var countButton = document.createElement("button");
        countButton.type = "button";
        countButton.className = "btn-round-count" + (isExcluded ? " off" : "");
        countButton.textContent = isExcluded ? "○" : "◉";
        countButton.title = isExcluded ? "Excluded — click to count for handicap" : "Counting for handicap — click to exclude";
        countButton.setAttribute("aria-label", countButton.title);
        countButton.setAttribute("aria-pressed", String(!isExcluded));
        countButton.addEventListener("click", function () {
          app.toggleRoundExclusion(round.id);
        });

        var editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "btn-round-edit";
        editButton.title = "Edit round";
        editButton.setAttribute("aria-label", "Edit round from " + UIService.formatDate(round.date));
        editButton.textContent = "✎";
        editButton.addEventListener("click", function () {
          app.openEditRound(round.id);
        });

        var deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn-round-delete";
        deleteButton.title = "Delete round";
        deleteButton.setAttribute("aria-label", "Delete round from " + UIService.formatDate(round.date));
        deleteButton.textContent = "×";
        deleteButton.addEventListener("click", function () {
          app.deleteRound(round.id);
        });

        actions.appendChild(countButton);
        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        header.appendChild(dateSpan);
        header.appendChild(actions);

        var differentialSpan = document.createElement("span");
        differentialSpan.className = "round-card-differential";
        differentialSpan.textContent = "Diff. " + String(round.differential);

        var details = document.createElement("div");
        details.className = "round-card-details";
        var detailsParts = [];
        if (round.courseName) {
          detailsParts.push(round.courseName);
        }
        if (round.scoringMethod === "stableford" && round.stablefordPoints !== null && round.stablefordPoints !== undefined) {
          detailsParts.push("Stableford " + round.stablefordPoints);
        }
        if (round.score !== null && round.score !== undefined) {
          detailsParts.push("Score " + round.score);
        }
        if (round.courseRating !== null && round.courseRating !== undefined) {
          detailsParts.push("CR " + round.courseRating);
        }
        if (round.slope !== null && round.slope !== undefined) {
          detailsParts.push("Slope " + round.slope);
        }
        details.textContent = detailsParts.join(" · ");

        card.appendChild(header);
        card.appendChild(differentialSpan);
        card.appendChild(details);

        if (round.note) {
          var noteEl = document.createElement("div");
          noteEl.className = "round-card-note";
          noteEl.textContent = round.note;
          card.appendChild(noteEl);
        }

        app.elements.roundsList.appendChild(card);
      });
    },

    /**
     * Create a small badge span for a round card.
     * @param {string} text - Badge text
     * @param {string} [extraClass] - Optional extra CSS class
     * @returns {HTMLElement}
     */
    makeBadge: function (text, extraClass) {
      var badge = document.createElement("span");
      badge.className = "round-card-badge" + (extraClass ? " " + extraClass : "");
      badge.textContent = text;
      return badge;
    },

    /**
     * Handle Export button click.
     */
    handleExport: function () {
      var rounds = StorageService.loadRounds();
      if (rounds.length === 0) {
        alert("No rounds to export.");
        return;
      }
      ImportExportService.exportJSON();
    },

    /**
     * Handle file selected for import.
     * @param {Event} event - Change event from file input
     */
    handleImportFileSelected: function (event) {
      var file = event.target.files[0];
      // Reset so the same file can be re-selected if needed
      event.target.value = "";

      if (!file) return;

      var app = this;
      var reader = new FileReader();

      reader.onerror = function () {
        app.showImportStatus("Could not read the file.", true);
      };

      reader.onload = function (e) {
        var result = ImportExportService.parseImportFile(e.target.result);
        if (!result.valid) {
          app.showImportStatus(result.error, true);
          return;
        }

        var importCount = result.rounds.length;
        var existingRounds = StorageService.loadRounds();
        var existingCount = existingRounds.length;

        var replace = true;
        if (existingCount > 0) {
          var msg = "Found " + importCount + " round" + (importCount !== 1 ? "s" : "") + " in the file.\n\n" +
            "OK \u2014 Replace your " + existingCount + " existing round" + (existingCount !== 1 ? "s" : "") + " with the imported data.\n" +
            "Cancel \u2014 Add imported rounds to your existing rounds.";
          replace = confirm(msg);
        }

        var finalRounds = replace ? result.rounds : existingRounds.concat(result.rounds);

        var saveResult = StorageService.saveRounds(finalRounds);
        if (!saveResult.success) {
          app.showImportStatus("Import failed: " + saveResult.error, true);
          return;
        }

        // Merge course book entries (add new courses, don't overwrite existing)
        if (result.courseBook && result.courseBook.length > 0) {
          result.courseBook.forEach(function (c) {
            CourseService.saveUserCourse(c.name, c.cr, c.slope);
          });
        }

        app.updateUI();
        app.showImportStatus("Imported " + importCount + " round" + (importCount !== 1 ? "s" : "") + " successfully.", false);
      };

      reader.readAsText(file);
    },

    /**
     * Show a temporary status message below the rounds footer.
     * @param {string} message - Message to display
     * @param {boolean} isError - True for error styling, false for success
     */
    showImportStatus: function (message, isError) {
      var el = this.elements.importStatus;
      if (!el) return;
      el.textContent = message;
      el.className = "import-status " + (isError ? "import-status-error" : "import-status-success");
      el.style.display = "";
      clearTimeout(this._importStatusTimer);
      this._importStatusTimer = setTimeout(function () {
        el.style.display = "none";
        el.textContent = "";
      }, 5000);
    },

    /**
     * Update full UI (handicap + rounds list).
     */
    updateUI: function () {
      var allRounds = StorageService.loadRounds().slice().sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });
      var pool = allRounds.filter(function (r) {
        return !r.excludeFromHandicap;
      });
      var info = WHSService.getHandicapInfo(pool);
      this.updateHandicap(info);
      this.renderRoundsList(allRounds, info.usedRoundIds || []);
      this.renderInsights(allRounds, pool);
    },

    /**
     * Render the analytics insights (handicap trend + course statistics).
     * @param {Array<Object>} allRounds - All rounds, newest first
     * @param {Array<Object>} pool - Handicap-eligible rounds, newest first
     */
    renderInsights: function (allRounds, pool) {
      if (this.elements.handicapChart) {
        AnalyticsService.renderTrendChart(
          this.elements.handicapChart,
          AnalyticsService.computeHandicapTrend(pool)
        );
      }
      if (this.elements.courseStats) {
        AnalyticsService.renderCourseStats(
          this.elements.courseStats,
          AnalyticsService.computeCourseStats(allRounds)
        );
      }
    }
  };

  // ============================================================================
  // START
  // ============================================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      App.init();
    });
  } else {
    App.init();
  }
})();