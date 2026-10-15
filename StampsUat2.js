(function () {
  "use strict";

  var POINTS_PER_STAMP = 100,
      BONUS = 500,
      BUY_EVENT = "stamp_buy_now_click",
      PRODUCT_EVENT = "stamp_product_click",
      products = [
        {pid:"167896f",name:"Laundry liquid",image:"https://images.pexels.com/photos/5218021/pexels-photo-5218021.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/167896f"},
        {pid:"item2",name:"Fabric enhancer",image:"https://images.pexels.com/photos/5217887/pexels-photo-5217887.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/item2"},
        {pid:"13372",name:"Dishwash",image:"https://images.pexels.com/photos/10574059/pexels-photo-10574059.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/13372"},
        {pid:"toothpaste",name:"Toothpaste",image:"https://images.pexels.com/photos/5613566/pexels-photo-5613566.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/toothpaste"},
        {pid:"handwash",name:"Handwash",image:"https://images.pexels.com/photos/10568476/pexels-photo-10568476.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/handwash"},
        {pid:"shower_gel",name:"Shower gel",image:"https://images.pexels.com/photos/7263030/pexels-photo-7263030.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/shower_gel"},
        {pid:"shampoo",name:"Shampoo",image:"https://images.pexels.com/photos/3735627/pexels-photo-3735627.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/shampoo"},
        {pid:"sunscreen",name:"Sunscreen",image:"https://images.pexels.com/photos/11010801/pexels-photo-11010801.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/sunscreen"},
        {pid:"seasoning",name:"Seasoning",image:"https://images.pexels.com/photos/15777497/pexels-photo-15777497.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://www.example.com/product/seasoning"}
      ],
      data = window.WE_CUSTOM_DATA || {};

  function norm(v) {
    return String(v == null ? "" : v).trim().toLowerCase();
  }

  // Match saved values by product ID OR product name (case-insensitive).
  // Returns product IDs of collected stamps, without duplicates.
  function getCollectedPids(list) {
    if (!Array.isArray(list)) return [];
    var saved = list.map(norm).filter(Boolean);
    return products
      .filter(function (p) {
        return saved.indexOf(norm(p.pid)) !== -1 || saved.indexOf(norm(p.name)) !== -1;
      })
      .map(function (p) { return p.pid; });
  }

  var collected = getCollectedPids(data.CampaignData);
  var isAllCollected = collected.length === products.length && products.length > 0;
  var totalPoints = collected.length * POINTS_PER_STAMP + (isAllCollected ? BONUS : 0);

  console.log("[STAMPS] Saved values:", data.CampaignData);
  console.log("[STAMPS] Collected product IDs:", collected, "| points:", totalPoints);

  function hasWE(fn) {
    return typeof weNotification !== "undefined" && typeof weNotification[fn] === "function";
  }

  function track(eventName, payload) {
    try {
      if (hasWE("trackEvent")) {
        weNotification.trackEvent(eventName, JSON.stringify(payload));
        console.log("[STAMPS] Event sent:", eventName, payload);
      } else {
        console.log("[STAMPS] weNotification.trackEvent not available");
      }
    } catch (err) {
      console.log("[STAMPS] trackEvent error:", err);
    }
  }

  function closeInApp() {
    try {
      if (hasWE("close")) weNotification.close();
    } catch (err) {
      console.log("[STAMPS] close error:", err);
    }
  }

  function summaryPayload() {
    return {
      campaign_id: data.CampaignId,
      collected_count: collected.length,
      total_points: totalPoints,
      matched_product_ids: collected.join(",")
    };
  }

  // DOM elements
  var viewStamps = document.getElementById("viewStamps"),
      viewRules = document.getElementById("viewRules"),
      gridEl = document.getElementById("grid"),
      goalLabel = document.getElementById("goalLabel"),
      goalAmount = document.getElementById("goalAmount"),
      fractionEl = document.getElementById("fraction"),
      trackFill = document.getElementById("trackFill"),
      buyNowBtn = document.getElementById("buyNowBtn"),
      seeRulesBtn = document.getElementById("seeRulesBtn"),
      backBtn = document.getElementById("backBtn"),
      normalBtnGroup = document.getElementById("normalBtnGroup"),
      getRewardBtn = document.getElementById("getRewardBtn");

  // SEE RULES / BACK
  if (seeRulesBtn) {
    seeRulesBtn.onclick = function () {
      if (viewStamps) viewStamps.style.display = "none";
      if (viewRules) viewRules.style.display = "block";
    };
  }
  if (backBtn) {
    backBtn.onclick = function () {
      if (viewRules) viewRules.style.display = "none";
      if (viewStamps) viewStamps.style.display = "block";
    };
  }

  // BUY NOW: send event only, in-app stays open
  if (buyNowBtn) {
    buyNowBtn.onclick = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      console.log("[STAMPS] BUY NOW clicked");
      track(BUY_EVENT, summaryPayload());
    };
  }

  // GET 500: send event, then close
  if (getRewardBtn) {
    getRewardBtn.onclick = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      console.log("[STAMPS] GET REWARD clicked");
      track(BUY_EVENT, summaryPayload());
      closeInApp();
    };
  }

  // Product image: send event, open link, close
  function openProductLink(item) {
    console.log("[STAMPS] Product clicked:", item.pid);
    track(PRODUCT_EVENT, {
      campaign_id: data.CampaignId,
      product_id: item.pid,
      product_name: item.name,
      url: item.url
    });
    if (!item.url) return;
    try {
      if (hasWE("openDeepLink")) {
        weNotification.openDeepLink(item.url);
      } else {
        window.open(item.url, "_top");
      }
    } catch (err) {
      window.location.href = item.url;
    }
    closeInApp();
  }

  // Render stamps
  if (gridEl) {
    gridEl.innerHTML = "";
    products.forEach(function (item) {
      var isCollected = collected.indexOf(item.pid) !== -1;
      var el = document.createElement("div");
      el.className = "stamp" + (isCollected ? " collected" : "");
      el.innerHTML =
        '<div class="name">' + item.name + '</div>' +
        '<div class="art" style="cursor:pointer;"><img src="' + item.image + '" alt="' + item.name + '"></div>' +
        '<div class="pts">+' + POINTS_PER_STAMP + ' <span class="coin">U</span></div>';
      var art = el.querySelector(".art");
      if (art) art.onclick = function () { openProductLink(item); };
      gridEl.appendChild(el);
    });
  }

  // Completed / in-progress state
  if (goalAmount) goalAmount.textContent = String(BONUS);
  if (isAllCollected) {
    if (goalLabel) goalLabel.textContent = "collection completed:";
    if (normalBtnGroup) normalBtnGroup.style.display = "none";
    if (getRewardBtn) getRewardBtn.style.display = "block";
  } else {
    if (goalLabel) goalLabel.textContent = "Complete the set to win:";
    if (normalBtnGroup) normalBtnGroup.style.display = "flex";
    if (getRewardBtn) getRewardBtn.style.display = "none";
  }

  if (fractionEl) fractionEl.textContent = collected.length + "/" + products.length;
  if (trackFill) trackFill.style.width = Math.round((collected.length / products.length) * 100) + "%";
})();
