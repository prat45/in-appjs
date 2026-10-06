/* =========================================================
   DAILY CHECK-IN WIDGET (UNow redesign) - logic layer

   Same WebEngage attribute/event contract as uniliver/gamification01.js
   and the uniliver Journey Block - this file is a visual redesign only
   (dark theme, 3 distinct screens, Vietnamese copy). It intentionally
   keeps CONFIG, ATTR, EVENT_PAYLOAD_KEY and the event name identical so
   the existing Journey Block works against this UI unchanged.

     TotalPoints, CycleStartDate, LastStreakDate,
     StreakCount, VisitedDays (int positions, e.g. [1,2,4])

   nested inside a Map-type user attribute (campaignAttr in the Journey
   Block, "xyz" at the time of writing) keyed by this campaign's id:

     user.custom.xyz = { "camp_311olhm": { TotalPoints: 50, ... }, ... }

   The campaign id is hardcoded in index.html only (as
   WE_CUSTOM_DATA.CampaignId) - this file has no copy of its own.

   On check-in click we track CONFIG.eventName ("7-DAY STREAK") with a
   flat payload the Journey Block reads as:

     event["custom"]["event_time"]
     event["custom"]["cycle_start_date"]
     event["custom"]["campaign_id"]
     event["custom"]["server_time"]
     event["custom"]["dailyPoints"]
     event["custom"]["streak"]
     event["custom"]["TotalPoints"]

   The server recomputes TotalPoints / StreakCount / VisitedDays
   authoritatively from these values plus the profile's previously
   persisted per-campaign data; what we update locally below is only an
   optimistic preview for this session - the next load picks up the
   real numbers.

   Screens: unlike the uniliver widget's 2-screen (checkin/reward)
   design, this redesign has THREE distinct screens matching the new
   mock - a plain daily check-in confirmation, and a separate "streak
   completed" screen shown only when the 7-day streak is finished. The
   old day-4 milestone bonus still applies to the points total, it just
   no longer gets its own dedicated screen (that bonus simply shows up
   folded into whichever screen's point total is displayed next).
   ========================================================= */

(function () {

  "use strict";

  var CONFIG = {
    totalDays: 7,
    dailyPoints: 50,
    milestones: [
      { day: 4, bonus: 200 },
      { day: 7, bonus: 250 }
    ],
    eventName: "7-DAY STREAK",

    /*
     * Fixed, shared day-1 for every user - used when the profile
     * doesn't have a CycleStartDate yet (first-ever visit).
     *
     * Format: a full UTC instant ("YYYY-MM-DDT00:00:00.000Z"), not a
     * bare "YYYY-MM-DD" - parseFlexibleDate parses a bare date using
     * the BROWSER'S LOCAL timezone, so on an IST browser a bare date
     * here would silently resolve to the previous UTC calendar day.
     * The Journey Block computes every day/streak boundary in UTC, so
     * this default has to already be an unambiguous UTC instant.
     */
    defaultCycleStartDate: "2026-09-24T00:00:00.000Z"
  };

  /* Field keys within this campaign's own entry - the schema the Journey Block reads/writes. */
  var ATTR = {
    CYCLE_START_DATE: "CycleStartDate",
    VISITED_DAYS: "VisitedDays",
    TOTAL_POINTS: "TotalPoints",
    LAST_STREAK_DATE: "LastStreakDate",
    STREAK_COUNT: "StreakCount"
  };

  /* WE_CUSTOM_DATA fields (see index.html). */
  var CAMPAIGN_ID_KEY = "CampaignId";
  var CAMPAIGN_DATA_KEY = "CampaignData";

  /* Event custom-data keys, flat on the event. */
  var EVENT_PAYLOAD_KEY = {
    EVENT_TIME: "event_time",
    CYCLE_START_DATE: "cycle_start_date",
    CAMPAIGN_ID: "campaign_id",
    SERVER_TIME: "server_time",
    DAILY_POINTS: "dailyPoints",
    STREAK: "streak",
    TOTAL_POINTS: "TotalPoints"
  };

  /* Third-party UTC time source for EVENT_PAYLOAD_KEY.SERVER_TIME. */
  var SERVER_TIME_URL = "https://utctime.app/api/now";

  /* WebEngage's own marker for a Date-typed custom value. */
  var WE_DATE_PREFIX = "~t";

  /* index.html element ids. */
  var ELEMENT_ID = {
    POINTS_VALUE: "pointsVal",
    GRID: "grid",
    CTA_BUTTON: "ctaBtn",
    CTA_BUTTON_IMG: "ctaBtnImg",
    CTA_SUBTEXT: "ctaSubtext",
    SCREEN_CHECKIN: "screenCheckin",
    SCREEN_DAILY: "screenDaily",
    SCREEN_FINAL: "screenFinal",
    CLOSE_MAIN: "closeMain",
    CLOSE_DAILY: "closeDaily",
    CLOSE_FINAL: "closeFinal",
    DAILY_CLOSE_BTN: "dailyCloseBtn",
    FINAL_CLOSE_BTN: "finalCloseBtn",
    DAILY_AMOUNT: "dailyAmount",
    FINAL_AMOUNT: "finalAmount"
  };

  var DAY_STATUS = {
    CLAIMED: "claimed",
    TODAY: "today",
    MISSED: "missed",
    UPCOMING: "upcoming"
  };

  /* Figma-exported art (see assets/) swapped in per day/CTA state. */
  var DAY_ICON_SRC = {
    claimed: "assets/icon-claimed-seal.png",
    today: "assets/icon-today.png",
    missed: "assets/icon-missed.png",
    upcoming: "assets/icon-upcoming.png"
  };

  var CTA_IMG_SRC = {
    enabled: "assets/btn-checkin.png",
    disabled: "assets/btn-checked-in.png"
  };

  var SCREEN = {
    CHECKIN: "checkin",
    DAILY: "daily",
    FINAL: "final"
  };

  var customData = window.WE_CUSTOM_DATA || {};


  /* =======================================================
     DATE HELPERS
  ======================================================= */

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function diffInDays(a, b) {
    var ms = startOfDay(a).getTime() - startOfDay(b).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  function isMissingValue(value) {
    if (value === undefined || value === null) {
      return true;
    }
    var s = String(value).trim().toLowerCase();
    if (s.indexOf("{{") !== -1) {
      return true;
    }
    return s === "" || s === "nil" || s === "null" || s === "undefined" || s === "nan" || s === "0";
  }

  function parseFlexibleDate(value) {

    if (isMissingValue(value)) {
      return null;
    }

    var s = String(value).trim();

    if (s.indexOf(WE_DATE_PREFIX) === 0) {
      s = s.slice(WE_DATE_PREFIX.length);
    }

    var epoch = s.match(/^\d{10,13}$/);
    if (epoch) {
      var ms = epoch[0].length === 13 ? Number(epoch[0]) : Number(epoch[0]) * 1000;
      var epochDate = new Date(ms);
      return isNaN(epochDate.getTime()) ? null : epochDate;
    }

    /*
     * A full timestamp with a time-of-day AND an explicit UTC/offset
     * marker is a genuine instant, not a bare calendar date - it has to
     * go through the native parser so the UTC/offset correctly
     * resolves to OUR local calendar day.
     */
    var hasExplicitZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+\-]\d{2}:?\d{2})$/.test(s);
    if (hasExplicitZone) {
      var instant = new Date(s);
      if (!isNaN(instant.getTime())) {
        return instant;
      }
    }

    var iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    var dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (dmy) {
      var year = Number(dmy[3]);
      if (dmy[3].length === 2) {
        year += 2000;
      }
      return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }

    var fallback = new Date(s);
    if (!isNaN(fallback.getTime())) {
      return fallback;
    }

    return null;
  }

  function formatDayLabel(date) {
    return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1);
  }


  /* =======================================================
     VISITED-DAYS HELPERS
  ======================================================= */

  function parseVisitedDays(raw) {

    if (isMissingValue(raw)) {
      return [];
    }

    var items = Array.isArray(raw)
      ? raw
      : String(raw).replace(/[\[\]"]/g, "").split(",");

    return items
      .map(function (part) { return parseInt(part, 10); })
      .filter(function (n) { return !isNaN(n) && n >= 1 && n <= CONFIG.totalDays; })
      .filter(function (n, index, arr) { return arr.indexOf(n) === index; })
      .sort(function (a, b) { return a - b; });
  }


  /* =======================================================
     CAMPAIGN DATA HELPERS
  ======================================================= */

  function parseCampaignMap(raw) {

    if (isMissingValue(raw)) {
      return {};
    }

    if (typeof raw === "object") {
      return raw;
    }

    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (error) {
      console.warn("WebEngage CampaignData did not parse as JSON - falling back to {}. Raw value:", raw);
      return {};
    }
  }


  /* =======================================================
     STATE
  ======================================================= */

  var today = new Date();

  var campaignId = customData[CAMPAIGN_ID_KEY];
  var campaignMap = parseCampaignMap(customData[CAMPAIGN_DATA_KEY]);
  if (Object.keys(campaignMap).length > 0 && !campaignMap[campaignId]) {
    console.warn("WebEngage CampaignData parsed but has no entry for CampaignId '" + campaignId + "' - treating as no cycle yet. Parsed keys:", Object.keys(campaignMap));
  }
  var campaignData = campaignMap[campaignId] || {};

  var cycleStartDate = parseFlexibleDate(campaignData[ATTR.CYCLE_START_DATE]) || parseFlexibleDate(CONFIG.defaultCycleStartDate);

  var visitedDays = parseVisitedDays(campaignData[ATTR.VISITED_DAYS]);
  var totalPoints = Number(campaignData[ATTR.TOTAL_POINTS]) || 0;

  var currentDay = Math.max(1, diffInDays(today, cycleStartDate) + 1);
  var cycleFinished = currentDay > CONFIG.totalDays;
  var alreadyCheckedInToday = visitedDays.indexOf(currentDay) !== -1;

  function dateForDay(dayPosition) {
    var d = new Date(cycleStartDate);
    d.setDate(d.getDate() + (dayPosition - 1));
    return d;
  }

  function getCurrentStreak() {
    var from = alreadyCheckedInToday ? currentDay : currentDay - 1;
    var streak = 0;
    for (var d = from; d >= 1; d--) {
      if (visitedDays.indexOf(d) !== -1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  function dayState(dayPosition) {
    if (visitedDays.indexOf(dayPosition) !== -1) {
      return DAY_STATUS.CLAIMED;
    }
    if (dayPosition === currentDay && !cycleFinished) {
      return DAY_STATUS.TODAY;
    }
    if (dayPosition < currentDay) {
      return DAY_STATUS.MISSED;
    }
    return DAY_STATUS.UPCOMING;
  }


  /* =======================================================
     UI ELEMENTS
  ======================================================= */

  var pointsValEl = document.getElementById(ELEMENT_ID.POINTS_VALUE);
  var gridEl = document.getElementById(ELEMENT_ID.GRID);
  var ctaBtnEl = document.getElementById(ELEMENT_ID.CTA_BUTTON);
  var ctaBtnImgEl = document.getElementById(ELEMENT_ID.CTA_BUTTON_IMG);
  var ctaSubtextEl = document.getElementById(ELEMENT_ID.CTA_SUBTEXT);
  var screenCheckinEl = document.getElementById(ELEMENT_ID.SCREEN_CHECKIN);
  var screenDailyEl = document.getElementById(ELEMENT_ID.SCREEN_DAILY);
  var screenFinalEl = document.getElementById(ELEMENT_ID.SCREEN_FINAL);
  var dailyAmountEl = document.getElementById(ELEMENT_ID.DAILY_AMOUNT);
  var finalAmountEl = document.getElementById(ELEMENT_ID.FINAL_AMOUNT);


  /* =======================================================
     RENDER
  ======================================================= */

  function render() {

    gridEl.innerHTML = "";

    for (var n = 1; n <= CONFIG.totalDays; n++) {
      var st = dayState(n);
      var el = document.createElement("div");
      el.className = "day " + st;
      el.innerHTML =
        '<div class="head">' + (st === DAY_STATUS.TODAY ? "Hôm nay" : formatDayLabel(dateForDay(n))) + '</div>' +
        '<div class="body">' +
        '<img class="icon" src="' + DAY_ICON_SRC[st] + '" alt="">' +
        '<div class="pts">' + CONFIG.dailyPoints + '</div>' +
        '</div>';
      gridEl.appendChild(el);
    }

    /*
     * The bonus-day cell is a single baked Figma export (date, gift
     * art and "Nhận thưởng" label all in one image) - the payout date
     * ("08/11") is this campaign's fixed real-world date (UNow's 8th
     * birthday), not something computed from the user's own cycle, so
     * a static asset is correct here rather than a mismatch to fix.
     */
    var bonus = document.createElement("div");
    bonus.className = "day bonus";
    bonus.innerHTML = '<img src="assets/cell-bonus-day.png" alt="08/11 - Nhận thưởng">';
    gridEl.appendChild(bonus);

    pointsValEl.textContent = totalPoints;

    if (cycleFinished) {
      ctaBtnEl.disabled = true;
      ctaBtnImgEl.src = CTA_IMG_SRC.disabled;
      ctaSubtextEl.hidden = true;
    } else if (alreadyCheckedInToday) {
      ctaBtnEl.disabled = true;
      ctaBtnImgEl.src = CTA_IMG_SRC.disabled;
      ctaSubtextEl.hidden = false;
    } else {
      ctaBtnEl.disabled = false;
      ctaBtnImgEl.src = CTA_IMG_SRC.enabled;
      ctaSubtextEl.hidden = true;
    }
  }


  /* =======================================================
     WEBENGAGE HOOKS
  ======================================================= */

  function trackEvent(eventName, payload) {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent(eventName, JSON.stringify(payload || {}));
      }
    } catch (error) {
      console.log("WebEngage tracking error:", error);
    }
  }

  function closeWidget() {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
        weNotification.close();
      }
    } catch (error) {
      console.log("WebEngage close error:", error);
    }
  }

  function fetchServerTime() {
    return fetch(SERVER_TIME_URL)
      .then(function (response) { return response.json(); })
      .then(function (data) { return (data && data.utc_iso) || null; })
      .catch(function () { return null; });
  }

  function buildClaimEventPayload(streak, totalPointsValue, serverTime) {
    var payload = {};
    payload[EVENT_PAYLOAD_KEY.EVENT_TIME] = WE_DATE_PREFIX + new Date().toISOString();
    payload[EVENT_PAYLOAD_KEY.CYCLE_START_DATE] = WE_DATE_PREFIX + cycleStartDate.toISOString();
    payload[EVENT_PAYLOAD_KEY.CAMPAIGN_ID] = campaignId;
    payload[EVENT_PAYLOAD_KEY.DAILY_POINTS] = CONFIG.dailyPoints;
    payload[EVENT_PAYLOAD_KEY.STREAK] = streak;
    payload[EVENT_PAYLOAD_KEY.TOTAL_POINTS] = totalPointsValue;
    if (serverTime) {
      payload[EVENT_PAYLOAD_KEY.SERVER_TIME] = WE_DATE_PREFIX + serverTime;
    }
    return payload;
  }


  /* =======================================================
     SCREENS
  ======================================================= */

  function show(id) {
    screenCheckinEl.classList.toggle("is-on", id === SCREEN.CHECKIN);
    screenDailyEl.classList.toggle("is-on", id === SCREEN.DAILY);
    screenFinalEl.classList.toggle("is-on", id === SCREEN.FINAL);
    window.scrollTo(0, 0);
  }


  /* =======================================================
     CHECK-IN
  ======================================================= */

  function checkIn() {

    if (cycleFinished || alreadyCheckedInToday) {
      return;
    }

    ctaBtnEl.disabled = true;

    visitedDays.push(currentDay);
    visitedDays.sort(function (a, b) { return a - b; });
    alreadyCheckedInToday = true;

    totalPoints += CONFIG.dailyPoints;

    var streak = getCurrentStreak();

    CONFIG.milestones.forEach(function (m) {
      if (streak === m.day) {
        totalPoints += m.bonus;
      }
    });

    fetchServerTime().then(function (serverTime) {
      trackEvent(CONFIG.eventName, buildClaimEventPayload(streak, totalPoints, serverTime));
    });

    render();

    if (streak === CONFIG.totalDays) {
      finalAmountEl.textContent = totalPoints;
      show(SCREEN.FINAL);
    } else {
      dailyAmountEl.textContent = totalPoints;
      show(SCREEN.DAILY);
    }
  }


  /* =======================================================
     WIRE UP
  ======================================================= */

  ctaBtnEl.addEventListener("click", checkIn);

  document.getElementById(ELEMENT_ID.CLOSE_MAIN).addEventListener("click", closeWidget);
  document.getElementById(ELEMENT_ID.CLOSE_DAILY).addEventListener("click", closeWidget);
  document.getElementById(ELEMENT_ID.CLOSE_FINAL).addEventListener("click", closeWidget);
  document.getElementById(ELEMENT_ID.DAILY_CLOSE_BTN).addEventListener("click", closeWidget);
  document.getElementById(ELEMENT_ID.FINAL_CLOSE_BTN).addEventListener("click", closeWidget);

  render();

})();
