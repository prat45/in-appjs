
!function(){
  "use strict";
  var o = 100,
      e = 500,
      t = "stamp_buy_now_click",
      n = [
        {pid:"167896f",name:"Laundry liquid",image:"https://images.pexels.com/photos/5218021/pexels-photo-5218021.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"item2",name:"Fabric enhancer",image:"https://images.pexels.com/photos/5217887/pexels-photo-5217887.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"dishwash",name:"Dishwash",image:"https://images.pexels.com/photos/10574059/pexels-photo-10574059.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"toothpaste",name:"Toothpaste",image:"https://images.pexels.com/photos/5613566/pexels-photo-5613566.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"handwash",name:"Handwash",image:"https://images.pexels.com/photos/10568476/pexels-photo-10568476.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"shower_gel",name:"Shower gel",image:"https://images.pexels.com/photos/7263030/pexels-photo-7263030.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"shampoo",name:"Shampoo",image:"https://images.pexels.com/photos/3735627/pexels-photo-3735627.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"sunscreen",name:"Sunscreen",image:"https://images.pexels.com/photos/11010801/pexels-photo-11010801.jpeg?auto=compress&cs=tinysrgb&w=400"},
        {pid:"seasoning",name:"Seasoning",image:"https://images.pexels.com/photos/15777497/pexels-photo-15777497.jpeg?auto=compress&cs=tinysrgb&w=400"}
      ],
      i = window.WE_CUSTOM_DATA || {};

  function s(val){
    if (val === undefined || val === null) return true;
    var str = String(val).trim().toLowerCase();
    return str === "" || str.indexOf("{{") !== -1 || str === "nil" || str === "null" || str === "undefined" || str === "[object object]";
  }

  function parseMap(raw){
    if (s(raw)) return {};
    if (typeof raw === "object") return raw;
    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch(err){
      return {};
    }
  }

  var parsedData = parseMap(i.CampaignData);

  var a = (function(data){
    if (!data || s(data)) return [];
    var list = data.product_id || (data[i.CampaignId] && data[i.CampaignId].product_id);
    if (!list) return [];
    var items = Array.isArray(list) ? list : String(list).replace(/[\[\]"]/g, "").split(",");
    var targetPids = n.map(function(item){ return String(item.pid).trim(); });
    return items.map(function(item){ return String(item).trim(); })
                .filter(function(pid){ return pid && targetPids.indexOf(pid) !== -1; })
                .filter(function(pid, idx, arr){ return arr.indexOf(pid) === idx; });
  })(parsedData);

  var p = document.getElementById("grid"),
      r = document.getElementById("goalAmount"),
      c = document.getElementById("fraction"),
      m = document.getElementById("trackFill"),
      g = document.getElementById("ctaBtn");

  if (g){
    g.addEventListener("click", function(){
      try {
        if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function"){
          weNotification.trackEvent(t, JSON.stringify({campaign_id: i.CampaignId, collected_count: a.length}));
        }
      } catch(err){
        console.log("WebEngage tracking error:", err);
      }
      try {
        if (typeof weNotification !== "undefined" && typeof weNotification.close === "function"){
          weNotification.close();
        }
      } catch(err){
        console.log("WebEngage close error:", err);
      }
    });
  }

  p.innerHTML = "";
  n.forEach(function(item){
    var isCollected = -1 !== a.indexOf(String(item.pid));
    var el = document.createElement("div");
    el.className = "stamp" + (isCollected ? " collected" : "");
    el.innerHTML = '<div class="name">' + item.name + '</div><div class="art"><img src="' + item.image + '" alt="' + item.name + '"></div><div class="pts"><span class="coin">U</span>+' + o + '</div>';
    p.appendChild(el);
  });

  r.textContent = e;
  c.textContent = a.length + "/" + n.length;
  m.style.width = Math.round((a.length / n.length) * 100) + "%";
}();
