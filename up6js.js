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

   Screen flow (2 screens):
     1. Main (grid)  --click button-->  2. Daily success (shows TotalPoints
        + confetti)
   ========================================================= */

(function () {

  "use strict";

  var CONFIG = {
    totalDays: 7,
    dailyPoints: 50,
    milestones: [
     // { day: 4, bonus: 200 },
      { day: 7, bonus: 250 }
    ],
    eventName: "7-DAY STREAK",
    /* Full UTC instant on purpose - see parseFlexibleDate. */
    defaultCycleStartDate: "2026-10-07T00:00:00.000Z"
    /* Reward-day label (8th block) is calculated: cycle start + 7 days. */
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

  /* Gift box art on the 8th (reward) block. */
  var BONUS_CELL_SRC = ASSET + "Gift%20box%20%282%29.png";

  /* The button is ALWAYS clickable:
       - check-in available  -> "Điểm danh ngay" (tracks event, then opens screen 2)
       - already checked in / cycle over -> "Xem điểm tích lũy" (opens screen 2, no event) */
  var CTA_TEXT = {
    checkIn: "Điểm danh ngay",
    viewPoints: "Xem điểm tích lũy"
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

  function formatFullDate(date) {
    return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1);
  }

  /* Design: first cell shows "dd/mm", the rest just "dd", today shows "Hôm nay". */
  function formatDayLabel(date, dayPosition) {
    return dayPosition === 1 ? formatFullDate(date) : pad2(date.getDate());
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

  ["closeMain", "closeDaily", "dailyCloseBtn"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("click", closeWidget);
  });

  render();

})();
