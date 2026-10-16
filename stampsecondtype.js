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

    gridEl.innerHTML = "";

    CONFIG.products.forEach(function (product) {
      var state = tileState(product.pid);
      var el = document.createElement("a");
      el.className = "stamp " + state;
      el.href = product.url || "javascript:void(0)";
      el.innerHTML =
        '<img class="stamp-img" src="' + product.image + '" alt="">' +
        '<div class="stamp-label">' + product.name + "</div>" +
        (state !== TILE_STATE.DEFAULT ? '<div class="stamp-tick">✓</div>' : "");
      gridEl.appendChild(el);
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

  function closeWidget() {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
        weNotification.close();
      }
    } catch (error) {
      console.log("WebEngage close error:", error);
    }
  }

  function onGetRewardClick() {
    if (!setComplete) {
      return;
    }
    trackEvent(CONFIG.eventName, {
      campaign_id: campaignId,
      event_time: WE_DATE_PREFIX + new Date().toISOString(),
      TotalPoints: totalPoints + CONFIG.rewardPoints
    });
    closeWidget();
  }

  function showRules() {
    viewStampsEl.style.display = "none";
    viewRulesEl.style.display = "block";
  }

  function showStamps() {
    viewRulesEl.style.display = "none";
    viewStampsEl.style.display = "block";
  }

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

})();
