(function () {

  "use strict";

  var customData = window.WE_CUSTOM_DATA || {};

  var DEFAULT_PRODUCTS = [];

  function pickArray(value, fallback) {
    return Array.isArray(value) ? value : fallback;
  }

  function pickNumber(value, fallback) {
    var n = Number(value);
    return (value !== undefined && value !== null && value !== "" && !isNaN(n) && n > 0) ? n : fallback;
  }

  var CONFIG = {
    products: pickArray(customData.Products, DEFAULT_PRODUCTS),
    rewardPoints: pickNumber(customData.RewardPoints, 500),
    highlightWindowDays: pickNumber(customData.HighlightWindowDays, 4),
    eventName: customData.EventName || "STAMP_SET_COMPLETE"
  };

  var ATTR = {
    POINT_ISSUES_ID: "point_issues_id",
    PRODUCT_PURCHASE: "product_purchase",
    TOTAL_POINTS: "TotalPoints"
  };

  var CAMPAIGN_ID_KEY = "CampaignId";
  var CAMPAIGN_DATA_KEY = "CampaignData";

  var TILE_STATE = {
    CONFIRMED: "confirmed",
    HIGHLIGHTED: "highlighted",
    DEFAULT: "default"
  };

  var ELEMENT_ID = {
    GRID: "grid",
    FRACTION: "fraction",
    TRACK_FILL: "trackFill",
    GOAL_AMOUNT: "goalAmount",
    GET_REWARD_BTN: "getRewardBtn",
    NORMAL_BTN_GROUP: "normalBtnGroup",
    BUY_NOW_BTN: "buyNowBtn",
    BUY_NOW_HIDDEN_LINK: "buyNowHiddenLink",
    SEE_RULES_BTN: "seeRulesBtn",
    BACK_BTN: "backBtn",
    VIEW_STAMPS: "viewStamps",
    VIEW_RULES: "viewRules"
  };

  var WE_DATE_PREFIX = "~t";

  function isMissingValue(value) {
    if (value === undefined || value === null) {
      return true;
    }
    var s = String(value).trim().toLowerCase();
    if (s.indexOf("{{") !== -1) {
      return true;
    }
    return s === "" || s === "nil" || s === "null" || s === "undefined" || s === "nan";
  }

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

  function parseIdArray(raw) {
    if (isMissingValue(raw)) {
      return [];
    }
    var items = Array.isArray(raw)
      ? raw
      : String(raw).replace(/[\[\]"]/g, "").split(",");
    return items
      .map(function (id) { return String(id).trim(); })
      .filter(Boolean);
  }

  function parseDate(value) {
    if (isMissingValue(value)) {
      return null;
    }
    var s = String(value).trim();
    if (s.indexOf(WE_DATE_PREFIX) === 0) {
      s = s.slice(WE_DATE_PREFIX.length);
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function parsePurchaseList(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter(function (entry) { return entry && entry.id; })
      .map(function (entry) {
        return { id: String(entry.id).trim(), date: parseDate(entry.date) };
      })
      .filter(function (entry) { return entry.date; });
  }

  function daysSince(date) {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }

  var campaignId = customData[CAMPAIGN_ID_KEY];
  var campaignMap = parseCampaignMap(customData[CAMPAIGN_DATA_KEY]);
  if (Object.keys(campaignMap).length > 0 && !campaignMap[campaignId]) {
    console.warn("WebEngage CampaignData parsed but has no entry for CampaignId '" + campaignId + "' - treating as no stamps yet. Parsed keys:", Object.keys(campaignMap));
  }
  var campaignData = campaignMap[campaignId] || {};

  var confirmedIds = parseIdArray(campaignData[ATTR.POINT_ISSUES_ID]);
  var purchases = parsePurchaseList(campaignData[ATTR.PRODUCT_PURCHASE]);
  var totalPoints = Number(campaignData[ATTR.TOTAL_POINTS]) || 0;

  function latestPurchaseDate(pid) {
    var latest = null;
    purchases.forEach(function (p) {
      if (p.id === pid && (!latest || p.date > latest)) {
        latest = p.date;
      }
    });
    return latest;
  }

  function tileState(pid) {
    if (confirmedIds.indexOf(pid) !== -1) {
      return TILE_STATE.CONFIRMED;
    }
    var purchaseDate = latestPurchaseDate(pid);
    if (purchaseDate && daysSince(purchaseDate) <= CONFIG.highlightWindowDays) {
      return TILE_STATE.HIGHLIGHTED;
    }
    return TILE_STATE.DEFAULT;
  }

  var collectedCount = CONFIG.products.filter(function (p) {
    return confirmedIds.indexOf(p.pid) !== -1;
  }).length;

  var setComplete = collectedCount === CONFIG.products.length;

  var gridEl = document.getElementById(ELEMENT_ID.GRID);
  var fractionEl = document.getElementById(ELEMENT_ID.FRACTION);
  var trackFillEl = document.getElementById(ELEMENT_ID.TRACK_FILL);
  var goalAmountEl = document.getElementById(ELEMENT_ID.GOAL_AMOUNT);
  var getRewardBtnEl = document.getElementById(ELEMENT_ID.GET_REWARD_BTN);
  var normalBtnGroupEl = document.getElementById(ELEMENT_ID.NORMAL_BTN_GROUP);
  var viewStampsEl = document.getElementById(ELEMENT_ID.VIEW_STAMPS);
  var viewRulesEl = document.getElementById(ELEMENT_ID.VIEW_RULES);

  function render() {

    /*
     * Tiles are REAL static <a href="..."> elements already in
     * index.html, each with its own correct per-product href from page
     * load - WebEngage registers one navigable action per anchor it finds
     * when it parses the message HTML, keyed to whatever href was there
     * at that time. A href assigned or changed afterward via JS (or a
     * click simulated on a different, hidden anchor) is not reliably
     * picked up by that registration. So this never creates the anchor,
     * never touches .href, and never simulates a click - it only ever
     * fills in each existing tile's inner content and state class.
     */
    CONFIG.products.forEach(function (product) {
      var state = tileState(product.pid);
      var el = gridEl.querySelector('[data-pid="' + product.pid + '"]');
      if (!el) {
        console.warn("No static tile found in index.html for pid '" + product.pid + "' - add an <a class=\"stamp\" data-pid=\"" + product.pid + "\" href=\"...\"> to the grid.");
        return;
      }
      el.className = "stamp " + state;
      el.innerHTML =
        '<img class="stamp-img" src="' + product.image + '" alt="">' +
        '<div class="stamp-label">' + product.name + "</div>" +
        (state === TILE_STATE.CONFIRMED ? '<div class="stamp-tick">✓</div>' : "");
    });

    fractionEl.textContent = collectedCount + "/" + CONFIG.products.length;
    trackFillEl.style.width = (collectedCount / CONFIG.products.length * 100) + "%";
    goalAmountEl.textContent = CONFIG.rewardPoints;

    if (setComplete) {
      getRewardBtnEl.style.display = "block";
      normalBtnGroupEl.style.display = "none";
    } else {
      getRewardBtnEl.style.display = "none";
      normalBtnGroupEl.style.display = "flex";
    }
  }

  function trackEvent(eventName, payload) {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent(eventName, JSON.stringify(payload || {}));
      }
    } catch (error) {
      console.log("WebEngage tracking error:", error);
    }
  }

  /* Page 3 "ĐÓNG": record the completed set, then close the in-app. */
  function onGetRewardClick() {
    if (setComplete) {
      trackEvent(CONFIG.eventName, {
        campaign_id: campaignId,
        event_time: WE_DATE_PREFIX + new Date().toISOString(),
        TotalPoints: totalPoints + CONFIG.rewardPoints
      });
    }
    try {
      weNotification.close();
    } catch (error) {
      console.log("WebEngage close error:", error);
    }
  }

  /* Page switching is a horizontal slide: the CSS moves both views when
     #mainModal gets / loses the "show-rules" class. Views are never set
     to display:none, so the transition can animate both ways. */
  var mainModalEl = document.getElementById("mainModal");

  function setRulesVisible(visible) {
    mainModalEl.classList.toggle("show-rules", visible);
    viewStampsEl.setAttribute("aria-hidden", visible ? "true" : "false");
    viewRulesEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function showRules() { setRulesVisible(true); }
  function showStamps() { setRulesVisible(false); }

  viewStampsEl.style.display = "";
  viewRulesEl.style.display = "";
  setRulesVisible(false);

  document.getElementById(ELEMENT_ID.SEE_RULES_BTN).addEventListener("click", showRules);
  document.getElementById(ELEMENT_ID.BACK_BTN).addEventListener("click", showStamps);
  getRewardBtnEl.addEventListener("click", onGetRewardClick);

  var buyNowBtnEl = document.getElementById(ELEMENT_ID.BUY_NOW_BTN);
  var buyNowHiddenLinkEl = document.getElementById(ELEMENT_ID.BUY_NOW_HIDDEN_LINK);

  buyNowBtnEl.addEventListener("click", function () {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.click === "function") {
        weNotification.click("", "", "");
      }
    } catch (error) {
      console.log("WebEngage click error:", error);
    }
    var href = buyNowHiddenLinkEl && buyNowHiddenLinkEl.getAttribute("href");
    if (href && href !== "javascript:void(0)") {
      window.location.href = href;
    }
  });

  render();

  /* =====================================================================
   * UI LAYER (runs after render): collected artwork, final screen,
   * page-3 rules button and confetti. Visual only - no game logic here.
   * ===================================================================== */

  function sizeImg(img, scale) {
    var pct = 109.5 * scale;
    img.style.width = pct + "%";
    img.style.height = pct + "%";
    img.style.left = img.style.top = (-(pct - 100) / 2) + "%";
  }

  // 1) Collected stamps show their collected artwork (page 1 and page 3)
  CONFIG.products.forEach(function (p) {
    var tile = gridEl && gridEl.querySelector('[data-pid="' + p.pid + '"]');
    if (!tile) return;
    var img = tile.querySelector(".stamp-img");
    if (!img) return;
    img.alt = p.name || "";
    if (tileState(p.pid) === TILE_STATE.CONFIRMED && p.collectedImage) {
      img.src = p.collectedImage;
      if (p.collectedScale) sizeImg(img, p.collectedScale);
    } else if (p.lockedScale) {
      sizeImg(img, p.lockedScale); // evens out artwork exported with extra padding
    }
  });

  // 2) Full set -> page 3 (SĂN TRỌN BỘ becomes ĐÓNG) + confetti
  if (setComplete) {
    mainModalEl.classList.add("is-complete");
    getRewardBtnEl.style.display = "block";
    launchConfetti();
  }

  // 3) XEM THỂ LỆ on page 3 opens the rules page
  var finalRulesBtn = document.getElementById("finalRulesBtn");
  if (finalRulesBtn) {
    finalRulesBtn.addEventListener("click", showRules);
  }

  // ---------- Confetti (no external library) ----------
  function launchConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var canvas = document.createElement("canvas");
    canvas.id = "confettiCanvas";
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1, W = 0, H = 0;
    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    var colors = ["#FFC52E", "#FFE07A", "#E8332A", "#3567F0", "#7DFF9A", "#FFFFFF"];
    var parts = [];
    function piece(x, y, vx, vy) {
      return {
        x: x, y: y, vx: vx, vy: vy,
        w: 5 + Math.random() * 5, h: 8 + Math.random() * 6,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        color: colors[(Math.random() * colors.length) | 0],
        shape: Math.random() < 0.3 ? "circle" : "rect", life: 0
      };
    }
    function burst(x, y, dir, n) {
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + dir * (0.3 + Math.random() * 0.6), s = 7 + Math.random() * 7;
        parts.push(piece(x, y, Math.cos(a) * s, Math.sin(a) * s));
      }
    }
    function rain(n) {
      for (var i = 0; i < n; i++) {
        parts.push(piece(Math.random() * W, -20 - Math.random() * 40, (Math.random() - 0.5) * 2, 2 + Math.random() * 3));
      }
    }
    var waves = 0;
    (function wave() {
      burst(0, H * 0.75, 1, 45); burst(W, H * 0.75, -1, 45); rain(40);
      if (++waves < 3) setTimeout(wave, 900);
    })();

    var start = Date.now();
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy = Math.min(p.vy + 0.18, 6); p.vx *= 0.99;
        p.x += p.vx + Math.sin((p.life += 0.05)) * 0.6; p.y += p.vy; p.r += p.vr;
        if (p.y > H + 30) { parts.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color;
        if (p.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r))); }
        ctx.restore();
      }
      if (parts.length || Date.now() - start < 3000) requestAnimationFrame(frame);
      else { window.removeEventListener("resize", resize); canvas.remove(); }
    })();
  }

})();
