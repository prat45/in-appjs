/* =========================================================
   DAILY CHECK-IN WIDGET (UNow "Giữ chuỗi bạn thân") - logic layer

   WebEngage attribute/event contract is UNCHANGED from the previous
   version, so the existing Journey Block keeps working:

     user.custom.xyz = { "camp_311olhm": {
       TotalPoints, CycleStartDate, LastStreakDate, StreakCount, VisitedDays
     } }

   Event "7-DAY STREAK" payload (flat):
     event_time, cycle_start_date, campaign_id, server_time,
     dailyPoints, streak, TotalPoints

   Screen flow:
     1. Main (grid)  --click "Điểm danh ngay"-->
     2. Daily success (shows the user's updated TotalPoints)
        OR
     3. Final reward, when the updated TotalPoints reaches 800
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
    /* 7 x 50 + 200 + 250 = 800 -> show the final screen at this total */
    finalRewardPoints: 800,
    eventName: "7-DAY STREAK",
    /* Full UTC instant on purpose - see parseFlexibleDate. */
    defaultCycleStartDate: "2026-11-01T00:00:00.000Z"
  };

  var ATTR = {
    CYCLE_START_DATE: "CycleStartDate",
    VISITED_DAYS: "VisitedDays",
    TOTAL_POINTS: "TotalPoints",
    LAST_STREAK_DATE: "LastStreakDate",
    STREAK_COUNT: "StreakCount"
  };

  var CAMPAIGN_ID_KEY = "CampaignId";
  var CAMPAIGN_DATA_KEY = "CampaignData";

  var EVENT_PAYLOAD_KEY = {
    EVENT_TIME: "event_time",
    CYCLE_START_DATE: "cycle_start_date",
    CAMPAIGN_ID: "campaign_id",
    SERVER_TIME: "server_time",
    DAILY_POINTS: "dailyPoints",
    STREAK: "streak",
    TOTAL_POINTS: "TotalPoints"
  };

  var SERVER_TIME_URL = "https://utctime.app/api/now";
  var WE_DATE_PREFIX = "~t";

  var ASSET = "https://onsite-assets-editor.s3.amazonaws.com/images/we10a5cb699/";

  var DAY_STATUS = { CLAIMED: "claimed", TODAY: "today", MISSED: "missed", UPCOMING: "upcoming" };

  var DAY_ICON_SRC = {
    claimed: ASSET + "icon-claimed-seal.png",
    today: ASSET + "icon-upcoming.png",
    missed: ASSET + "icon-missed.png",
    upcoming: ASSET + "icon-upcoming.png"
  };
  var BONUS_CELL_SRC = ASSET + "cell-bonus-day.png";

  /* The button is ALWAYS clickable:
       - check-in available  -> "Điểm danh ngay" (tracks event, then opens screen 2/3)
       - already checked in / cycle over -> "Xem điểm tích lũy" (opens screen 2/3, no event) */
  var CTA_TEXT = {
    checkIn: "Điểm danh ngay",
    viewPoints: "Xem điểm tích lũy"
  };

  var SCREEN = { CHECKIN: "checkin", DAILY: "daily", FINAL: "final" };

  var customData = window.WE_CUSTOM_DATA || {};


  /* ================= DATE HELPERS ================= */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function diffInDays(a, b) {
    var ms = startOfDay(a).getTime() - startOfDay(b).getTime();
    return Math.round(ms / 86400000);
  }

  function isMissingValue(value) {
    if (value === undefined || value === null) return true;
    var s = String(value).trim().toLowerCase();
    if (s.indexOf("{{") !== -1) return true;
    return s === "" || s === "nil" || s === "null" || s === "undefined" || s === "nan" || s === "0";
  }

  function parseFlexibleDate(value) {
    if (isMissingValue(value)) return null;

    var s = String(value).trim();
    if (s.indexOf(WE_DATE_PREFIX) === 0) s = s.slice(WE_DATE_PREFIX.length);

    var epoch = s.match(/^\d{10,13}$/);
    if (epoch) {
      var ms = epoch[0].length === 13 ? Number(epoch[0]) : Number(epoch[0]) * 1000;
      var epochDate = new Date(ms);
      return isNaN(epochDate.getTime()) ? null : epochDate;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+\-]\d{2}:?\d{2})$/.test(s)) {
      var instant = new Date(s);
      if (!isNaN(instant.getTime())) return instant;
    }

    var iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    var dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (dmy) {
      var year = Number(dmy[3]);
      if (dmy[3].length === 2) year += 2000;
      return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }

    var fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  /* Design: first cell shows "dd/mm", the rest just "dd", today shows "Hôm nay". */
  function formatDayLabel(date, dayPosition) {
    return dayPosition === 1
      ? pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1)
      : pad2(date.getDate());
  }


  /* ================= DATA HELPERS ================= */

  function parseVisitedDays(raw) {
    if (isMissingValue(raw)) return [];
    var items = Array.isArray(raw) ? raw : String(raw).replace(/[\[\]"]/g, "").split(",");
    return items
      .map(function (p) { return parseInt(p, 10); })
      .filter(function (n) { return !isNaN(n) && n >= 1 && n <= CONFIG.totalDays; })
      .filter(function (n, i, arr) { return arr.indexOf(n) === i; })
      .sort(function (a, b) { return a - b; });
  }

  function parseCampaignMap(raw) {
    if (isMissingValue(raw)) return {};
    if (typeof raw === "object") return raw;
    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (e) {
      console.warn("WebEngage CampaignData did not parse as JSON - falling back to {}. Raw:", raw);
      return {};
    }
  }


  /* ================= STATE ================= */

  var today = new Date();

  var campaignId = customData[CAMPAIGN_ID_KEY];
  var campaignMap = parseCampaignMap(customData[CAMPAIGN_DATA_KEY]);
  if (Object.keys(campaignMap).length > 0 && !campaignMap[campaignId]) {
    console.warn("CampaignData has no entry for '" + campaignId + "'. Keys:", Object.keys(campaignMap));
  }
  var campaignData = campaignMap[campaignId] || {};

  var cycleStartDate = parseFlexibleDate(campaignData[ATTR.CYCLE_START_DATE]) ||
                       parseFlexibleDate(CONFIG.defaultCycleStartDate);

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
      if (visitedDays.indexOf(d) !== -1) streak++;
      else break;
    }
    return streak;
  }

  function dayState(dayPosition) {
    if (visitedDays.indexOf(dayPosition) !== -1) return DAY_STATUS.CLAIMED;
    if (dayPosition === currentDay && !cycleFinished) return DAY_STATUS.TODAY;
    if (dayPosition < currentDay) return DAY_STATUS.MISSED;
    return DAY_STATUS.UPCOMING;
  }


  /* ================= ELEMENTS ================= */

  function $(id) { return document.getElementById(id); }

  var pointsValEl = $("pointsVal");
  var gridEl = $("grid");
  var ctaBtnEl = $("ctaBtn");
  var screens = {
    checkin: $("screenCheckin"),
    daily: $("screenDaily"),
    final: $("screenFinal")
  };
  var dailyAmountEl = $("dailyAmount");
  var finalAmountEl = $("finalAmount");

  /* Stats row values come from CONFIG so they never drift from the logic. */
  $("statDaily").textContent = CONFIG.dailyPoints;
  $("statMax").textContent = CONFIG.finalRewardPoints;


  /* ================= RENDER ================= */

  function render() {

    gridEl.innerHTML = "";

    for (var n = 1; n <= CONFIG.totalDays; n++) {
      var st = dayState(n);
      var el = document.createElement("div");
      el.className = "day " + st;
      el.innerHTML =
        '<div class="head">' + (st === DAY_STATUS.TODAY ? "Hôm nay" : formatDayLabel(dateForDay(n), n)) + '</div>' +
        '<div class="body">' +
          '<img class="icon" src="' + DAY_ICON_SRC[st] + '" alt="">' +
          '<div class="pts">' + CONFIG.dailyPoints + '</div>' +
        '</div>';
      gridEl.appendChild(el);
    }

    /* 8th cell: baked "08/11 - Nhận thưởng" gift art (fixed campaign payout date). */
    var bonus = document.createElement("div");
    bonus.className = "day bonus";
    bonus.innerHTML = '<img src="' + BONUS_CELL_SRC + '" alt="08/11 - Nhận thưởng">';
    gridEl.appendChild(bonus);

    pointsValEl.textContent = totalPoints;

    ctaBtnEl.disabled = false;
    ctaBtnEl.textContent = canCheckIn() ? CTA_TEXT.checkIn : CTA_TEXT.viewPoints;
  }

  function canCheckIn() {
    return !cycleFinished && !alreadyCheckedInToday;
  }


  /* ================= WEBENGAGE ================= */

  function trackEvent(eventName, payload) {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent(eventName, JSON.stringify(payload || {}));
      }
    } catch (e) { console.log("WebEngage tracking error:", e); }
  }

  function closeWidget() {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
        weNotification.close();
      }
    } catch (e) { console.log("WebEngage close error:", e); }
  }

  function fetchServerTime() {
    return fetch(SERVER_TIME_URL)
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.utc_iso) || null; })
      .catch(function () { return null; });
  }

  function buildClaimEventPayload(streak, totalPointsValue, serverTime) {
    var p = {};
    p[EVENT_PAYLOAD_KEY.EVENT_TIME] = WE_DATE_PREFIX + new Date().toISOString();
    p[EVENT_PAYLOAD_KEY.CYCLE_START_DATE] = WE_DATE_PREFIX + cycleStartDate.toISOString();
    p[EVENT_PAYLOAD_KEY.CAMPAIGN_ID] = campaignId;
    p[EVENT_PAYLOAD_KEY.DAILY_POINTS] = CONFIG.dailyPoints;
    p[EVENT_PAYLOAD_KEY.STREAK] = streak;
    p[EVENT_PAYLOAD_KEY.TOTAL_POINTS] = totalPointsValue;
    if (serverTime) p[EVENT_PAYLOAD_KEY.SERVER_TIME] = WE_DATE_PREFIX + serverTime;
    return p;
  }


  /* ================= SCREENS ================= */

  function show(id) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("is-on", key === id);
    });
    window.scrollTo(0, 0);
  }

  /* Small count-up on the big number so the user sees their points land. */
  function countUp(el, from, to) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) { el.textContent = to; return; }
    var start = null, duration = 700;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    el.textContent = from;
    requestAnimationFrame(step);
  }


  /* ================= CHECK-IN ================= */

  /* Opens screen 3 when the total has reached 800, otherwise screen 2. */
  function showResult(fromPoints) {
    if (totalPoints >= CONFIG.finalRewardPoints) {
      show(SCREEN.FINAL);
      countUp(finalAmountEl, fromPoints, totalPoints);
    } else {
      show(SCREEN.DAILY);
      countUp(dailyAmountEl, fromPoints, totalPoints);
    }
  }

  function onCtaClick() {

    /* Already checked in today, or the 7 days are over:
       no new points, just show the user's current total. */
    if (!canCheckIn()) {
      showResult(totalPoints);
      return;
    }

    var previousPoints = totalPoints;

    visitedDays.push(currentDay);
    visitedDays.sort(function (a, b) { return a - b; });
    alreadyCheckedInToday = true;

    totalPoints += CONFIG.dailyPoints;

    var streak = getCurrentStreak();
    CONFIG.milestones.forEach(function (m) {
      if (streak === m.day) totalPoints += m.bonus;
    });

    fetchServerTime().then(function (serverTime) {
      trackEvent(CONFIG.eventName, buildClaimEventPayload(streak, totalPoints, serverTime));
    });

    render();
    showResult(previousPoints);
  }


  /* ================= WIRE UP ================= */

  ctaBtnEl.addEventListener("click", onCtaClick);

  ["closeMain", "closeDaily", "closeFinal", "dailyCloseBtn", "finalCloseBtn"].forEach(function (id) {
    $(id).addEventListener("click", closeWidget);
  });

  render();

})();
