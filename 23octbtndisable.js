/* =========================================================
   DAILY CHECK-IN WIDGET (UNow "Giữ chuỗi bạn thân") - logic layer

   WebEngage attribute/event contract is UNCHANGED, so the existing
   Journey Block keeps working:

     user.custom.xyz = { "<CampaignId from index.html>": {
       TotalPoints, CycleStartDate, LastStreakDate, StreakCount, VisitedDays
     } }

   Event "7-DAY STREAK" payload (flat):
     event_time, cycle_start_date, campaign_id, server_time,
     dailyPoints, streak, TotalPoints

   Config (points / bonus / start date) is read from
   window.WE_STREAK_CONFIG in the HTML - see CONFIG below.

   v4 (22oct): server_time fix - see SERVER TIME section.
   v5 (23oct): first server-time request can be started in the HTML
               <head> (window.__WE_TIME_PREFETCH__) and is reused here.
   v6 (23oct): button resets correctly on a new day - "today" is counted
               like the Journey Block (UTC, server time) and also checked
               against LastStreakDate. Optional config: dayOffsetMinutes,
               debug.
   v7 (23oct): [WE-Streak] console logs for every button state, tap,
               server-time attempt and event send (config logs: false
               turns them off).

   Screen flow (2 screens):
     1. Main (grid)  --click button-->  2. Daily success (shows TotalPoints
        + confetti)
   ========================================================= */

(function () {

  "use strict";

  /* ---------------------------------------------------------
     CONFIG
     Set per campaign in the HTML as window.WE_STREAK_CONFIG
     (an inline <script> placed BEFORE this file). Any value left
     out there falls back to the default below.
     Keep points/bonus in sync with the Journey Block.
     --------------------------------------------------------- */
  var DEFAULT_CONFIG = {
    totalDays: 7,
    dailyPoints: 50,
    milestones: [
     // { day: 4, bonus: 200 },
      { day: 7, bonus: 450 }
    ],
    eventName: "7-DAY STREAK",
    /* Full UTC instant on purpose - see parseFlexibleDate. */
    defaultCycleStartDate: "2026-10-07T00:00:00.000Z"
    /* Reward-day label (8th block) is calculated: cycle start + 7 days. */
  };

  var pageConfig = window.WE_STREAK_CONFIG || {};

  function pickNumber(value, fallback) {
    var n = Number(value);
    return (value !== undefined && value !== null && value !== "" && !isNaN(n) && n > 0) ? n : fallback;
  }

  function pickMilestones(value, fallback) {
    if (!Array.isArray(value)) return fallback;
    return value
      .filter(function (m) { return m && !isNaN(Number(m.day)) && !isNaN(Number(m.bonus)); })
      .map(function (m) { return { day: Number(m.day), bonus: Number(m.bonus) }; });
  }

  var CONFIG = {
    totalDays: pickNumber(pageConfig.totalDays, DEFAULT_CONFIG.totalDays),
    dailyPoints: pickNumber(pageConfig.dailyPoints, DEFAULT_CONFIG.dailyPoints),
    milestones: pickMilestones(pageConfig.milestones, DEFAULT_CONFIG.milestones),
    eventName: pageConfig.eventName || DEFAULT_CONFIG.eventName,
    defaultCycleStartDate: pageConfig.defaultCycleStartDate || DEFAULT_CONFIG.defaultCycleStartDate,
    /* When a "new day" starts, as minutes from UTC. MUST match the Journey
       Block's dateTimezone: 'UTC' -> 0 (default), 'Asia/Ho_Chi_Minh' -> 420. */
    dayOffsetMinutes: isNaN(Number(pageConfig.dayOffsetMinutes)) ? 0 : Number(pageConfig.dayOffsetMinutes || 0),
    /* true -> shows a small status line under the button (for UAT only). */
    debug: pageConfig.debug === true,
    /* Console logs ([WE-Streak] ...). On by default; set logs: false to silence. */
    logs: pageConfig.logs !== false
  };

  /* ---- console logging helpers ---- */
  var LOG_PREFIX = "[WE-Streak]";
  function log() {
    if (!CONFIG.logs || typeof console === "undefined") return;
    var args = [LOG_PREFIX].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (e) {}
  }
  function warn() {
    if (typeof console === "undefined") return;
    var args = [LOG_PREFIX].concat([].slice.call(arguments));
    try { console.warn.apply(console, args); } catch (e) {}
  }
  function logError() {
    if (typeof console === "undefined") return;
    var args = [LOG_PREFIX].concat([].slice.call(arguments));
    try { console.error.apply(console, args); } catch (e) {}
  }
  function toIso(d) {
    try { return d ? d.toISOString() : String(d); } catch (e) { return String(d); }
  }

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

  /* Gift box art on the 8th (reward) block. */
  var BONUS_CELL_SRC = ASSET + "GIFT%20BOX%20%281%29.png";

  /* Main button states (per design):
       - check-in available     -> "Điểm danh ngay", enabled (tracks event, opens screen 2)
       - already checked in     -> "Đã điểm danh", DISABLED + "Trở lại vào ngày mai" below
       - 7-day cycle is over    -> "Đã kết thúc", DISABLED, no note */
  var CTA_TEXT = {
    checkIn: "Điểm danh ngay",
    checkedIn: "Đã điểm danh",
    sending: "Đang điểm danh…",
    finished: "Đã kết thúc"
  };

  var SCREEN = { CHECKIN: "checkin", DAILY: "daily" };

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

  /* Day number of an instant in the Journey Block's timezone (UTC by
     default). Two instants on the same calendar day there get the same
     number - this is exactly how the Journey Block counts days, so the
     button and the server always agree on what "today" is. */
  var DAY_MS = 86400000;
  function dayIndex(date) {
    return Math.floor((date.getTime() + CONFIG.dayOffsetMinutes * 60000) / DAY_MS);
  }
  /* Midnight (in that timezone) of a day number, as a Date whose UTC
     fields carry the calendar date - read it with getUTC*(). */
  function dayStartDate(index) {
    return new Date(index * DAY_MS);
  }
  /* A bare calendar date (no time/zone) = that day in the Journey timezone. */
  function calendarDate(y, m, d) {
    return new Date(Date.UTC(y, m, d) - CONFIG.dayOffsetMinutes * 60000);
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
    if (iso) return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    var dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (dmy) {
      var year = Number(dmy[3]);
      if (dmy[3].length === 2) year += 2000;
      return calendarDate(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }

    var fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  /* Dates here come from dayStartDate(), so read the UTC fields. */
  function formatFullDate(date) {
    return pad2(date.getUTCDate()) + "/" + pad2(date.getUTCMonth() + 1);
  }

  /* Design: first cell shows "dd/mm", the rest just "dd", today shows "Hôm nay". */
  function formatDayLabel(date, dayPosition) {
    return dayPosition === 1 ? formatFullDate(date) : pad2(date.getUTCDate());
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

  var savedVisitedDays = parseVisitedDays(campaignData[ATTR.VISITED_DAYS]);
  var visitedDays = savedVisitedDays.slice();
  var totalPoints = Number(campaignData[ATTR.TOTAL_POINTS]) || 0;
  var lastStreakDate = parseFlexibleDate(campaignData[ATTR.LAST_STREAK_DATE]);

  /* ---------------------------------------------------------
     "Is it a new day?"  (button reset logic)
     - Today is counted in the Journey Block's timezone (UTC), using the
       SERVER time once it has arrived (phone clock only until then).
     - Already checked in today  <=>  LastStreakDate falls on today
       (the same rule the Journey Block uses to accept/reject a claim).
       Profiles without LastStreakDate fall back to VisitedDays.
     - On a new day neither is true, so the button is enabled again.
     --------------------------------------------------------- */
  var currentDay, cycleFinished, alreadyCheckedInToday;
  var todaySource = "phone";
  var todayDate = today;
  var claimStarted = false;

  function computeDayState(now, source) {
    todayDate = now;
    todaySource = source;
    visitedDays = savedVisitedDays.slice();

    currentDay = Math.max(1, dayIndex(now) - dayIndex(cycleStartDate) + 1);
    cycleFinished = currentDay > CONFIG.totalDays;

    /* LastStreakDate is the Journey Block's own record of the last
       accepted check-in, so when it exists it decides on its own.
       VisitedDays is only used for profiles without a LastStreakDate. */
    var lastIsToday = !!lastStreakDate && dayIndex(lastStreakDate) === dayIndex(now);
    alreadyCheckedInToday = lastStreakDate ? lastIsToday : (visitedDays.indexOf(currentDay) !== -1);

    /* Saved day number differs from ours but the server says "today" ->
       show today's block as claimed so the grid matches the button. */
    if (lastIsToday && !cycleFinished && visitedDays.indexOf(currentDay) === -1) {
      visitedDays.push(currentDay);
      visitedDays.sort(function (a, b) { return a - b; });
      warn("Day-number mismatch: LastStreakDate is today but VisitedDays has no day " + currentDay +
           " - showing today as claimed. Check CycleStartDate format in the profile.");
    }

    log("Day check (" + source + " time):",
        "now =", toIso(now),
        "| today's day =", currentDay + "/" + CONFIG.totalDays,
        "| cycleFinished =", cycleFinished,
        "| LastStreakDate is today =", lastIsToday,
        "| decided by =", lastStreakDate ? "LastStreakDate" : "VisitedDays",
        "| alreadyCheckedInToday =", alreadyCheckedInToday);
  }

  log("Config:", JSON.stringify(CONFIG));
  log("Campaign id:", campaignId, "| raw CampaignData type:", typeof customData[CAMPAIGN_DATA_KEY],
      "| has entry for this campaign:", !!campaignMap[campaignId]);
  log("Saved data -> CycleStartDate:", campaignData[ATTR.CYCLE_START_DATE], "=> parsed", toIso(cycleStartDate),
      "(", campaignData[ATTR.CYCLE_START_DATE] ? "from profile" : "from config default", ")");
  log("Saved data -> VisitedDays:", JSON.stringify(campaignData[ATTR.VISITED_DAYS]), "=> parsed", JSON.stringify(savedVisitedDays));
  log("Saved data -> LastStreakDate:", campaignData[ATTR.LAST_STREAK_DATE], "=> parsed", toIso(lastStreakDate));
  log("Saved data -> TotalPoints:", campaignData[ATTR.TOTAL_POINTS], "=> parsed", totalPoints);
  if (!cycleStartDate) logError("CycleStartDate could not be parsed (profile AND config default) - day math will fail.");
  if (campaignData[ATTR.LAST_STREAK_DATE] && !lastStreakDate) {
    warn("LastStreakDate exists but could not be parsed:", campaignData[ATTR.LAST_STREAK_DATE], "- falling back to VisitedDays.");
  }

  computeDayState(today, "phone");

  function dateForDay(dayPosition) {
    return dayStartDate(dayIndex(cycleStartDate) + (dayPosition - 1));
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
  var ctaNoteEl = $("ctaNote");   /* "Trở lại vào ngày mai" under the main button */
  var screens = {
    checkin: $("screenCheckin"),
    daily: $("screenDaily")
  };
  var dailyAmountEl = $("dailyAmount");


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

    /* 8th block: reward day = cycle start + 7 days (e.g. 07/10 -> 14/10). */
    var rewardDate = dateForDay(CONFIG.totalDays + 1);
    var bonus = document.createElement("div");
    bonus.className = "day bonus";
    bonus.innerHTML =
      '<div class="head">' + formatFullDate(rewardDate) + '</div>' +
      '<div class="body">' +
        '<img class="gift" src="' + BONUS_CELL_SRC + '" alt="">' +
        '<div class="bonus-lbl">Nhận thưởng</div>' +
      '</div>';
    gridEl.appendChild(bonus);

    pointsValEl.textContent = totalPoints;

    if (canCheckIn()) {
      ctaBtnEl.disabled = false;
      ctaBtnEl.textContent = CTA_TEXT.checkIn;
      if (ctaNoteEl) ctaNoteEl.hidden = true;
      log("Button ENABLED ('" + CTA_TEXT.checkIn + "') - reason: day " + currentDay +
          " not checked in yet and cycle not finished.");
    } else if (alreadyCheckedInToday && !cycleFinished) {
      ctaBtnEl.disabled = true;
      ctaBtnEl.textContent = CTA_TEXT.checkedIn;
      if (ctaNoteEl) ctaNoteEl.hidden = false;
      log("Button DISABLED ('" + CTA_TEXT.checkedIn + "') - reason: " +
          (claimStarted
            ? "checked in just now in this session (day " + currentDay + ")."
            : "already checked in today (day " + currentDay + ", decided by " +
              (lastStreakDate ? "LastStreakDate " + toIso(lastStreakDate) : "VisitedDays " + JSON.stringify(savedVisitedDays)) + ")."));
    } else {
      ctaBtnEl.disabled = true;
      ctaBtnEl.textContent = CTA_TEXT.finished;
      if (ctaNoteEl) ctaNoteEl.hidden = true;
      log("Button DISABLED ('" + CTA_TEXT.finished + "') - reason: cycle finished (today is day " + currentDay +
          " > " + CONFIG.totalDays + ", cycle started " + toIso(cycleStartDate) + ").");
    }
    renderDebug();
  }

  function canCheckIn() {
    return !cycleFinished && !alreadyCheckedInToday;
  }

  /* UAT helper: WE_STREAK_CONFIG.debug = true shows why the button is in
     its current state. Leave debug off (default) in production. */
  function renderDebug() {
    if (!CONFIG.debug || !ctaBtnEl) return;
    var el = document.getElementById("weStreakDebug");
    if (!el) {
      el = document.createElement("div");
      el.id = "weStreakDebug";
      el.style.cssText = "margin-top:8px;font:11px/1.4 monospace;color:#8A94A6;text-align:center;word-break:break-word";
      var anchor = ctaNoteEl || ctaBtnEl;
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
    function d(x) { return x ? formatFullDate(dayStartDate(dayIndex(x))) : "-"; }
    el.textContent =
      "day " + currentDay + "/" + CONFIG.totalDays +
      " | start " + d(cycleStartDate) +
      " | today " + d(todayDate) + " (" + todaySource + ")" +
      " | visited [" + savedVisitedDays.join(",") + "]" +
      " | last " + d(lastStreakDate) +
      " | " + (canCheckIn() ? "CAN CHECK IN" : (cycleFinished ? "CYCLE OVER" : "CHECKED IN TODAY"));
  }


  /* ================= WEBENGAGE ================= */

  function trackEvent(eventName, payload) {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent(eventName, JSON.stringify(payload || {}));
        log("weNotification.trackEvent called OK for '" + eventName + "'.");
      } else {
        logError("weNotification.trackEvent is NOT available - event '" + eventName + "' was NOT sent.");
      }
    } catch (e) { logError("WebEngage tracking error:", e); }
  }

  function closeWidget() {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
        log("Close tapped - calling weNotification.close().");
        weNotification.close();
      } else {
        logError("weNotification.close is NOT available - popup not closed.");
      }
    } catch (e) { logError("WebEngage close error:", e); }
  }

  /* ---------------------------------------------------------
     SERVER TIME  (v4 - fix: server_time missing)

     Old behaviour: one fetch at open with a 2.5s deadline counted from
     OPEN. On mobile the first request (DNS + TLS) often takes longer,
     so the deadline expired, the code gave up for good, and the event
     was sent without server_time.

     New behaviour:
       - Fetch starts at open, each attempt has its own 6s limit, and a
         failed attempt is retried (up to 3 attempts in total).
       - On tap:
           * server time known  -> event sent IMMEDIATELY with server_time
           * still loading      -> button shows "Đang điểm danh…" and we
                                   wait up to 6s more (a new attempt is
                                   started if none is running), THEN send
           * still nothing      -> event sent without server_time
                                   (Journey Block falls back to event_time)
       - Screen 2 opens only AFTER the event has been sent, so once the
         user sees the success screen, killing the app is safe.
       - Every event carries server_time_status (ok / timeout / error)
         so you can see in WebEngage why a value was missing.
     --------------------------------------------------------- */
  var SERVER_TIME_ATTEMPT_MS = 6000;   /* limit for one fetch attempt   */
  var SERVER_TIME_MAX_ATTEMPTS = 3;    /* attempts in total             */
  var TAP_WAIT_MS = 6000;              /* max wait after the tap        */

  var serverTimeBase = null;      /* Date from utctime.app             */
  var serverTimeFetchedAt = 0;    /* nowMs() when it arrived           */
  var serverTimeStatus = "pending";
  var attemptsMade = 0;
  var attemptRunning = false;
  var serverTimeWaiters = [];

  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  /* Server time "right now" = fetched value + time elapsed since the fetch. */
  function currentServerTimeIso() {
    if (!serverTimeBase) return null;
    return new Date(serverTimeBase.getTime() + (nowMs() - serverTimeFetchedAt)).toISOString();
  }

  function notifyWaiters() {
    var list = serverTimeWaiters;
    serverTimeWaiters = [];
    list.forEach(function (fn) { fn(); });
  }

  function startServerTimeAttempt() {
    if (serverTimeBase || attemptRunning || attemptsMade >= SERVER_TIME_MAX_ATTEMPTS) return;
    attemptRunning = true;
    attemptsMade++;

    var finished = false;
    function finish(iso, status, arrivedAt) {
      if (finished) return;
      finished = true;
      attemptRunning = false;
      var d = iso ? new Date(iso) : null;
      if (d && !isNaN(d.getTime())) {
        serverTimeBase = d;
        /* arrivedAt = when the response actually came back (performance.now
           clock), so the elapsed-time correction stays exact. */
        serverTimeFetchedAt = (typeof arrivedAt === "number") ? arrivedAt : nowMs();
        serverTimeStatus = "ok";
        log("Server time received (attempt " + attemptsMade + "):", toIso(d),
            "| phone clock:", toIso(new Date()),
            "| difference:", Math.round((Date.now() - d.getTime()) / 1000) + "s");
        onServerTimeReady();
        notifyWaiters();
        return;
      }
      serverTimeStatus = status;
      warn("Server time attempt " + attemptsMade + "/" + SERVER_TIME_MAX_ATTEMPTS + " failed (" + status + ")" +
           (attemptsMade < SERVER_TIME_MAX_ATTEMPTS ? " - retrying" : " - giving up, event will use event_time"));
      if (attemptsMade < SERVER_TIME_MAX_ATTEMPTS) {
        setTimeout(startServerTimeAttempt, 500);
      } else {
        notifyWaiters();
      }
    }

    var timer = setTimeout(function () { finish(null, "timeout"); }, SERVER_TIME_ATTEMPT_MS);

    /* 1st attempt: reuse the request the HTML <head> already started
       (window.__WE_TIME_PREFETCH__), so the time is fetched as early as
       possible - before CSS, fonts and images load. Later attempts, or
       pages without the prefetch, make a fresh request. */
    var pre = window.__WE_TIME_PREFETCH__;
    log("Server time attempt " + attemptsMade + " started" +
        (attemptsMade === 1 && pre && pre.promise ? " (reusing <head> prefetch)" : " (new request)"));
    var request;
    if (attemptsMade === 1 && pre && pre.promise && typeof pre.promise.then === "function") {
      request = pre.promise.then(function (res) {
        if (!res || res.error) throw new Error("prefetch failed");
        return res;
      });
    } else {
      request = fetch(SERVER_TIME_URL, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) { return { iso: d && d.utc_iso, at: nowMs() }; });
    }

    request
      .then(function (res) {
        clearTimeout(timer);
        finish(res.iso, res.iso ? "ok" : "bad_response", res.at);
      })
      .catch(function () {
        clearTimeout(timer);
        finish(null, "error");
      });
  }

  /* Calls back with the current server time (or null) - immediately if
     known, otherwise when it arrives or after maxWaitMs, whichever first. */
  function getServerTime(maxWaitMs, callback) {
    if (serverTimeBase) { callback(currentServerTimeIso()); return; }

    if (!attemptRunning) {
      if (attemptsMade >= SERVER_TIME_MAX_ATTEMPTS) attemptsMade = SERVER_TIME_MAX_ATTEMPTS - 1; /* one more try on tap */
      startServerTimeAttempt();
    }

    var done = false;
    function reply() {
      if (done) return;
      done = true;
      clearTimeout(t);
      callback(currentServerTimeIso());
    }
    var t = setTimeout(function () {
      if (!serverTimeBase && serverTimeStatus === "pending") serverTimeStatus = "timeout";
      reply();
    }, maxWaitMs);
    serverTimeWaiters.push(reply);
  }

  /* Server time arrived -> decide "today" with it instead of the phone
     clock (phone clock can be wrong or in another timezone). */
  function onServerTimeReady() {
    if (claimStarted) { log("Server time arrived after the tap - day state not recomputed."); return; }
    var serverNow = new Date(currentServerTimeIso());
    var before = currentDay + "|" + alreadyCheckedInToday + "|" + cycleFinished;
    computeDayState(serverNow, "server");
    var after = currentDay + "|" + alreadyCheckedInToday + "|" + cycleFinished;
    if (before !== after) {
      log("Server time changed the day state:", before, "->", after, "(day|checkedIn|finished) - re-rendering.");
    } else {
      log("Server time confirms the phone's day state:", after, "(day|checkedIn|finished).");
    }
    if (before !== after || CONFIG.debug) render();
  }

  startServerTimeAttempt();   /* start as soon as the popup opens */

  /* Sends the claim event exactly once, then calls onSent. */
  var claimSent = false;
  function sendClaimEvent(streak, totalPointsValue, onSent) {
    if (!serverTimeBase) log("Server time not ready yet - waiting up to " + TAP_WAIT_MS + "ms before sending the event.");
    getServerTime(TAP_WAIT_MS, function (serverTime) {
      if (claimSent) { warn("Event already sent - duplicate send blocked."); return; }
      claimSent = true;
      var payload = buildClaimEventPayload(streak, totalPointsValue, serverTime);
      log("Sending event '" + CONFIG.eventName + "':", JSON.stringify(payload));
      trackEvent(CONFIG.eventName, payload);
      if (onSent) onSent();
    });
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
    p.server_time_status = serverTime ? "ok" : serverTimeStatus;   /* debug only - ignored by the Journey Block */
    return p;
  }


  /* ================= CONFETTI =================
     Self-contained canvas confetti (no external library), drawn over
     the page for ~3s, then the canvas removes itself. Skipped when the
     device has "reduce motion" turned on. */

  var CONFETTI_COLORS = ["#FFD45C", "#F6B500", "#77FFA2", "#3BE07A", "#1D70FF", "#5B9BFF", "#FFFFFF", "#FF6B6B"];

  function launchConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    document.body.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }

    var dpr = window.devicePixelRatio || 1;
    var W = window.innerWidth;
    var H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    var pieces = [];
    var COUNT = 140;

    /* Two bursts from the left and right bottom corners + a shower from the top. */
    for (var i = 0; i < COUNT; i++) {
      var fromTop = i % 3 === 0;
      var fromLeft = i % 2 === 0;
      var angle, speed, x, y;

      if (fromTop) {
        x = Math.random() * W;
        y = -20 - Math.random() * H * 0.3;
        angle = Math.PI / 2;
        speed = 1 + Math.random() * 2;
      } else {
        x = fromLeft ? 0 : W;
        y = H * 0.7;
        angle = fromLeft
          ? -Math.PI / 2 + (Math.random() * 0.9 + 0.15)        /* up and to the right */
          : -Math.PI / 2 - (Math.random() * 0.9 + 0.15);       /* up and to the left  */
        speed = 9 + Math.random() * 8;
      }

      pieces.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI,
        round: Math.random() < 0.25
      });
    }

    var DURATION = 3000;
    var start = null;

    function frame(ts) {
      if (!start) start = ts;
      var elapsed = ts - start;
      var fade = elapsed > DURATION - 600 ? Math.max(0, (DURATION - elapsed) / 600) : 1;

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;

      for (var j = 0; j < pieces.length; j++) {
        var p = pieces[j];
        p.vy += 0.25;          /* gravity */
        p.vx *= 0.985;         /* air drag */
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.tilt += 0.1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.tilt)), p.w, p.h * Math.abs(Math.cos(p.tilt)) + 1);
        }
        ctx.restore();
      }

      if (elapsed < DURATION) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(frame);
  }


  /* ================= SCREENS ================= */

  function show(id) {
    log("Showing screen:", id);
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

  /* Always opens screen 2 with the user's total, with confetti. */
  function showResult(fromPoints) {
    show(SCREEN.DAILY);
    countUp(dailyAmountEl, fromPoints, totalPoints);
    launchConfetti();
  }

  function onCtaClick() {

    /* Button is disabled when already checked in / cycle over -
       this guard just makes sure no event can ever be sent twice. */
    if (!canCheckIn()) {
      log("Button tap ignored - check-in not allowed (alreadyCheckedInToday =", alreadyCheckedInToday,
          ", cycleFinished =", cycleFinished, ").");
      return;
    }
    claimStarted = true;
    log("Button tapped - check-in for day " + currentDay + " started.");

    var previousPoints = totalPoints;

    visitedDays.push(currentDay);
    visitedDays.sort(function (a, b) { return a - b; });
    alreadyCheckedInToday = true;

    totalPoints += CONFIG.dailyPoints;

    var streak = getCurrentStreak();
    CONFIG.milestones.forEach(function (m) {
      if (streak === m.day) totalPoints += m.bonus;
    });

    /* Grey out straight away; show a short "working" label only if
       we actually have to wait for the server time. */
    render();
    if (!serverTimeBase) ctaBtnEl.textContent = CTA_TEXT.sending;

    sendClaimEvent(streak, totalPoints, function () {
      render();
      showResult(previousPoints);   /* screen 2 only after the event is sent */
    });
  }


  /* ================= WIRE UP ================= */

  window.addEventListener("error", function (ev) {
    logError("Page error:", ev && ev.message, ev && ev.filename ? "(" + ev.filename + ":" + ev.lineno + ")" : "");
  });
  if (!ctaBtnEl) logError("#ctaBtn not found in the HTML.");

  ctaBtnEl.addEventListener("click", onCtaClick);

  /* "dailyCloseBtn" (Trở lại vào ngày mai) is NOT bound here - it closes
     through its own onclick="weNotification.close();" in the HTML. */
  ["closeMain", "closeDaily"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("click", closeWidget);
  });

  render();

})();
