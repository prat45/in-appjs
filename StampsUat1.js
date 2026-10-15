
(function(){
  "use strict";
  var o = 100,
      bonus = 500,
      t = "stamp_buy_now_click",
      n = [
        {pid:"167896f",name:"Laundry liquid",image:"https://images.pexels.com/photos/5218021/pexels-photo-5218021.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/productDetailPage?sku=32017849&utm_source=banner&utm_campaign=facebook"},
        {pid:"item2",name:"Fabric enhancer",image:"https://images.pexels.com/photos/5217887/pexels-photo-5217887.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/recommendations&utm_source=banner&utm_campaign=facebook"},
        {pid:"13372",name:"Dishwash",image:"https://images.pexels.com/photos/10574059/pexels-photo-10574059.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/offers?defaultTab=coupons&utm_source=banner&utm_campaign=facebook"},
        {pid:"toothpaste",name:"Toothpaste",image:"https://images.pexels.com/photos/5613566/pexels-photo-5613566.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/loyalty&utm_source=banner&utm_campaign=facebook"},
        {pid:"handwash",name:"Handwash",image:"https://images.pexels.com/photos/10568476/pexels-photo-10568476.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/loyalty/wallet&utm_source=banner&utm_campaign=facebook"},
        {pid:"shower_gel",name:"Shower gel",image:"https://images.pexels.com/photos/7263030/pexels-photo-7263030.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/loyalty/banner?type=loyalty&utm_source=banner&utm_campaign=facebook"},
        {pid:"shampoo",name:"Shampoo",image:"https://images.pexels.com/photos/3735627/pexels-photo-3735627.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/loyalty/banner?type=target&utm_source=banner&utm_campaign=facebook"},
        {pid:"sunscreen",name:"Sunscreen",image:"https://images.pexels.com/photos/11010801/pexels-photo-11010801.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/search-result?q=knorr&utm_source=banner&utm_campaign=facebook"},
        {pid:"seasoning",name:"Seasoning",image:"https://images.pexels.com/photos/15777497/pexels-photo-15777497.jpeg?auto=compress&cs=tinysrgb&w=400",url:"https://uat-vtp-commerce.b2b.unileverservices.com/dlink/category/id=773&utm_source=banner&utm_campaign=facebook"}
      ],
      i = window.WE_CUSTOM_DATA || {};

  function getMatchedPids(list) {
    if (!Array.isArray(list)) return [];
    var targetPids = n.map(function(item) { return String(item.pid).trim(); });
    return list
      .map(function(item) { return String(item).trim(); })
      .filter(function(pid) { return pid && targetPids.indexOf(pid) !== -1; })
      .filter(function(pid, idx, arr) { return arr.indexOf(pid) === idx; });
  }

  var a = getMatchedPids(i.CampaignData);
  var isAllCollected = a.length === n.length && n.length > 0;
  var totalEarnedPoints = a.length * o + (isAllCollected ? bonus : 0);

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

  if (seeRulesBtn) {
    seeRulesBtn.onclick = function() {
      if (viewStamps) viewStamps.style.display = "none";
      if (viewRules) viewRules.style.display = "block";
    };
  }
  if (backBtn) {
    backBtn.onclick = function() {
      if (viewRules) viewRules.style.display = "none";
      if (viewStamps) viewStamps.style.display = "block";
    };
  }
  function triggerWebEngageAction() {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent(t, JSON.stringify({
          campaign_id: i.CampaignId,
          collected_count: a.length,
          total_points: totalEarnedPoints,
          matched_product_ids: a.join(",")
        }));
      }
    } catch (err) {
      console.log("WebEngage tracking error:", err);
    }
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
        weNotification.close();
      }
    } catch (err) {
      console.log("WebEngage close error:", err);
    }
  }

  if (buyNowBtn) buyNowBtn.onclick = triggerWebEngageAction;
  if (getRewardBtn) getRewardBtn.onclick = triggerWebEngageAction;

  function openProductLink(item) {
    if (!item.url) return;
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent("stamp_product_click", JSON.stringify({
          campaign_id: i.CampaignId,
          product_id: item.pid,
          product_name: item.name,
          url: item.url
        }));
      }
    } catch (err) {
      console.log("WebEngage tracking error:", err);
    }
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.openDeepLink === "function") {
        weNotification.openDeepLink(item.url);
      } else {
        window.open(item.url, "_top");
      }
    } catch (err) {
      window.location.href = item.url;
    }
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
        weNotification.close();
      }
    } catch (err) {}
  }
  if (gridEl) {
    gridEl.innerHTML = "";
    n.forEach(function(item) {
      var isCollected = a.indexOf(String(item.pid)) !== -1;
      var el = document.createElement("div");
      el.className = "stamp" + (isCollected ? " collected" : "");
      el.innerHTML = '<div class="name">' + item.name + '</div>' +
                     '<div class="art" style="cursor:pointer;"><img src="' + item.image + '" alt="' + item.name + '"></div>' +
                     '<div class="pts">+100 <span class="coin">U</span></div>';
      var art = el.querySelector(".art");
      if (art) {
        art.onclick = function() { openProductLink(item); };
      }
      gridEl.appendChild(el);
    });
  }
  if (isAllCollected) {
    if (goalLabel) goalLabel.textContent = "collection completed:";
    if (goalAmount) goalAmount.textContent = "500";
    if (normalBtnGroup) normalBtnGroup.style.display = "none";
    if (getRewardBtn) getRewardBtn.style.display = "block";
  } else {
    if (goalLabel) goalLabel.textContent = "Complete the set to win:";
    if (goalAmount) goalAmount.textContent = "500";
    if (normalBtnGroup) normalBtnGroup.style.display = "flex";
    if (getRewardBtn) getRewardBtn.style.display = "none";
  }
  if (fractionEl) fractionEl.textContent = a.length + "/" + n.length;
  if (trackFill) trackFill.style.width = Math.round((a.length / n.length) * 100) + "%";
})();
