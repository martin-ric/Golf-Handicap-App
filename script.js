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
        return { handicap: null, roundsUsed: 0, bestRoundsUsed: 0, adjustment: 0 };
      }
      
      // Take only the most recent 20 rounds
      var roundsToConsider = rounds.slice(0, CONFIG.MAX_ROUNDS_FOR_HANDICAP);
      var roundsUsed = roundsToConsider.length;
      
      // Get WHS calculation parameters based on number of rounds
      var params = this.getWHSCalculationParams(roundsUsed);
      
      if (params.countToUse === 0) {
        return { handicap: null, roundsUsed: roundsUsed, bestRoundsUsed: 0, adjustment: 0 };
      }
      
      // Sort by differential (ascending = best first)
      var sortedByDifferential = roundsToConsider.slice().sort(function (a, b) {
        return a.differential - b.differential;
      });
      
      // Take the best rounds
      var bestRounds = sortedByDifferential.slice(0, params.countToUse);
      
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
        adjustment: params.adjustment
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
    elements: {
      form: null,
      roundDateInput: null,
      grossScoreInput: null,
      courseRatingInput: null,
      slopeInput: null,
      courseNameInput: null,
      nineHoleInput: null,
      hcpiInput: null,
      resultContainer: null,
      handicapValue: null,
      handicapHint: null,
      roundsList: null,
      roundsEmpty: null,
      deleteAllButton: null,
      addRoundButton: null
    },

    /**
     * Initialize the application.
     */
    init: function () {
      this.elements.form = document.getElementById("handicap-form");
      this.elements.roundDateInput = document.getElementById("round-date");
      this.elements.grossScoreInput = document.getElementById("gross-score");
      this.elements.courseRatingInput = document.getElementById("course-rating");
      this.elements.slopeInput = document.getElementById("slope-rating");
      this.elements.courseNameInput = document.getElementById("course-name");
      this.elements.nineHoleInput = document.getElementById("nine-hole");
      this.elements.hcpiInput = document.getElementById("hcpi-input");
      this.elements.resultContainer = document.getElementById("result");
      this.elements.handicapValue = document.getElementById("handicap-value");
      this.elements.handicapHint = document.getElementById("handicap-hint");
      this.elements.roundsList = document.getElementById("rounds-list");
      this.elements.roundsEmpty = document.getElementById("rounds-empty");
      this.elements.deleteAllButton = document.getElementById("delete-all");
      this.elements.addRoundButton = document.getElementById("add-round");

      var missingElements = [];
      for (var key in this.elements) {
        if (!this.elements[key]) {
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

      UIService.setToday(this.elements.roundDateInput);
      this.updateUI();
    },

    /**
     * Handle form submit.
     * @param {Event} event - Submit event
     */
    handleSubmit: function (event) {
      event.preventDefault();
      UIService.clearResult(this.elements.resultContainer);

      var dateRaw = this.elements.roundDateInput.value;
      var scoreRaw = this.elements.grossScoreInput.value;
      var courseRatingRaw = this.elements.courseRatingInput.value;
      var slopeRaw = this.elements.slopeInput.value;
      var courseNameRaw = this.elements.courseNameInput.value.trim().slice(0, 80);
      var isNineHole = this.elements.nineHoleInput.checked;

      var dateValidation = ValidationService.validateDate(dateRaw);
      if (!dateValidation.valid) {
        UIService.showError(this.elements.resultContainer, dateValidation.error);
        this.elements.roundDateInput.setAttribute("aria-invalid", "true");
        this.elements.roundDateInput.focus();
        return;
      }
      this.elements.roundDateInput.removeAttribute("aria-invalid");

      var scoreValidation = ValidationService.validateScore(scoreRaw, isNineHole);
      if (!scoreValidation.valid) {
        UIService.showError(this.elements.resultContainer, scoreValidation.error);
        this.elements.grossScoreInput.setAttribute("aria-invalid", "true");
        this.elements.grossScoreInput.focus();
        return;
      }
      this.elements.grossScoreInput.removeAttribute("aria-invalid");

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

      var scoreDifferential = WHSService.calculateScoreDifferential(
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
      }
      UIService.showResult(this.elements.resultContainer, scoreDifferential);

      var rounds = StorageService.loadRounds();
      var newRound = {
        id: String(Date.now()),
        date: dateRaw.trim(),
        score: scoreValidation.value,
        courseRating: courseRatingValidation.value,
        slope: slopeValidation.value,
        differential: scoreDifferential,
        courseName: courseNameRaw || null,
        isNineHole: isNineHole
      };
      rounds.unshift(newRound);
      var saveResult = StorageService.saveRounds(rounds);
      if (!saveResult.success) {
        UIService.showError(this.elements.resultContainer, saveResult.error);
        return;
      }

      this.updateUI();
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
      var hcpiRow = document.getElementById("nine-hole-hcpi-row");
      if (this.elements.nineHoleInput.checked) {
        hcpiRow.style.display = "";
        // Pre-fill with current handicap index if available
        if (!this.elements.hcpiInput.value) {
          var rounds = StorageService.loadRounds();
          var newestFirst = rounds.slice().sort(function (a, b) {
            return b.date.localeCompare(a.date);
          });
          var info = WHSService.getHandicapInfo(newestFirst);
          if (info.handicap !== null) {
            this.elements.hcpiInput.value = String(info.handicap);
          }
        }
      } else {
        hcpiRow.style.display = "none";
        this.elements.hcpiInput.value = "";
        this.elements.hcpiInput.removeAttribute("aria-invalid");
      }
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
     * Show an editable card at the top of the rounds list for manual round entry.
     * Only one editable card can be open at a time.
     */
    showAddRoundCard: function () {
      if (document.getElementById("add-round-card")) return;

      var app = this;

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

      var card = document.createElement("div");
      card.className = "round-card-editable";
      card.id = "add-round-card";
      card.setAttribute("role", "form");
      card.setAttribute("aria-label", "Add historic round");

      // Date (optional – defaults to today)
      var dateRow = makeRow("Date (optional, defaults to today)", "add-date", "date", "");
      var today = new Date();
      dateRow.querySelector("input").value =
        today.getFullYear() + "-" +
        String(today.getMonth() + 1).padStart(2, "0") + "-" +
        String(today.getDate()).padStart(2, "0");

      // Score differential (required)
      var diffRow = makeRow("Score Differential", "add-differential", "number", "e.g. 12.3", 0.1);

      // Optional fields
      var scoreRow = makeRow("Gross Score (optional)", "add-score", "number", "e.g. 85");
      var crRow = makeRow("Course Rating (optional)", "add-cr", "number", "e.g. 72.5", 0.1);
      var slopeRow = makeRow("Slope Rating (optional)", "add-slope", "number", "e.g. 128");
      var courseNameRow = makeRow("Course Name (optional)", "add-course-name", "text", "e.g. Augusta National");

      // 9-hole checkbox
      var nineHoleRow = document.createElement("div");
      nineHoleRow.className = "nine-hole-row";
      var nineHoleCb = document.createElement("input");
      nineHoleCb.type = "checkbox";
      nineHoleCb.id = "add-nine-hole";
      var nineHoleLbl = document.createElement("label");
      nineHoleLbl.setAttribute("for", "add-nine-hole");
      nineHoleLbl.textContent = "9-hole round";
      nineHoleRow.appendChild(nineHoleCb);
      nineHoleRow.appendChild(nineHoleLbl);

      // Inline error message
      var errorEl = document.createElement("p");
      errorEl.className = "add-round-error";
      errorEl.style.display = "none";

      // Save / Cancel buttons
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
      card.appendChild(diffRow);
      card.appendChild(scoreRow);
      card.appendChild(crRow);
      card.appendChild(slopeRow);
      card.appendChild(courseNameRow);
      card.appendChild(nineHoleRow);
      card.appendChild(errorEl);
      card.appendChild(actionsDiv);

      // Insert at bottom of rounds list (above the Add button)
      this.elements.roundsList.appendChild(card);
      document.getElementById("add-differential").focus();

      cancelBtn.addEventListener("click", function () {
        card.remove();
      });

      saveBtn.addEventListener("click", function () {
        app.handleSaveManualRound(card, errorEl);
      });
    },

    /**
     * Validate and save a manually entered round from the editable card.
     * @param {HTMLElement} card - The editable card element
     * @param {HTMLElement} errorEl - Inline error paragraph
     */
    handleSaveManualRound: function (card, errorEl) {
      var dateInput = document.getElementById("add-date");
      var diffInput = document.getElementById("add-differential");
      var scoreInput = document.getElementById("add-score");
      var crInput = document.getElementById("add-cr");
      var slopeInput = document.getElementById("add-slope");
      var courseNameInput = document.getElementById("add-course-name");
      var nineHoleCb = document.getElementById("add-nine-hole");

      // Score differential is required
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
      diff = Math.round(diff * 10) / 10;

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

      // Optional numeric fields
      var score = scoreInput.value !== "" ? parseInt(scoreInput.value, 10) : null;
      var courseRating = crInput.value !== "" ? parseFloat(crInput.value) : null;
      var slope = slopeInput.value !== "" ? parseInt(slopeInput.value, 10) : null;
      var courseName = courseNameInput.value.trim().slice(0, 80) || null;
      var isNineHole = nineHoleCb.checked;

      errorEl.style.display = "none";

      var newRound = {
        id: String(Date.now()),
        date: date,
        score: score,
        courseRating: courseRating,
        slope: slope,
        differential: diff,
        courseName: courseName,
        isNineHole: isNineHole,
        manualEntry: true
      };

      var rounds = StorageService.loadRounds();
      rounds.push(newRound);
      var saveResult = StorageService.saveRounds(rounds);
      if (!saveResult.success) {
        errorEl.textContent = saveResult.error;
        errorEl.style.display = "";
        return;
      }

      card.remove();
      this.updateUI();
    },

    /**
     * Update handicap display.
     */
    updateHandicap: function () {
      var rounds = StorageService.loadRounds();
      var newestFirst = rounds.slice().sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });
      var info = WHSService.getHandicapInfo(newestFirst);
      if (info.handicap !== null) {
        this.elements.handicapValue.textContent = String(info.handicap);
        var hintText = "Based on your best " + info.bestRoundsUsed + " out of " + info.roundsUsed + " rounds";
        this.elements.handicapHint.textContent = hintText;
      } else {
        this.elements.handicapValue.textContent = "—";
        this.elements.handicapHint.textContent = "At least 1 round required";
      }
    },

    /**
     * Render the rounds list (textContent only, XSS-safe).
     */
    renderRoundsList: function () {
      this.elements.roundsList.textContent = "";
      var rounds = StorageService.loadRounds();
      var newestFirst = rounds.slice().sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });

      this.elements.deleteAllButton.style.display = newestFirst.length > 0 ? "" : "none";

      var app = this;
      newestFirst.forEach(function (round) {
        var card = document.createElement("div");
        card.className = "round-card";
        card.setAttribute("data-id", round.id);
        card.setAttribute("role", "listitem");

        var dateSpan = document.createElement("span");
        dateSpan.className = "round-card-date";
        dateSpan.textContent = UIService.formatDate(round.date);
        if (round.isNineHole) {
          var badge = document.createElement("span");
          badge.className = "round-card-badge";
          badge.textContent = "9H";
          dateSpan.appendChild(badge);
        }

        var differentialSpan = document.createElement("span");
        differentialSpan.className = "round-card-differential";
        differentialSpan.textContent = "Diff. " + String(round.differential);

        var deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn-round-delete";
        deleteButton.title = "Delete round";
        deleteButton.setAttribute("aria-label", "Delete round from " + UIService.formatDate(round.date));
        deleteButton.textContent = "×";
        deleteButton.addEventListener("click", function () {
          app.deleteRound(round.id);
        });

        var details = document.createElement("div");
        details.className = "round-card-details";
        var detailsParts = [];
        if (round.courseName) {
          detailsParts.push(round.courseName);
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

        card.appendChild(dateSpan);
        card.appendChild(differentialSpan);
        card.appendChild(deleteButton);
        card.appendChild(details);
        app.elements.roundsList.appendChild(card);
      });
    },

    /**
     * Update full UI (handicap + rounds list).
     */
    updateUI: function () {
      this.updateHandicap();
      this.renderRoundsList();
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