/* ===== Spin the Wheel engine (based on WebEngage spin-the-wheel/script.js) ===== */
var WE_CFG = {
    width: 420, height: 450,          // SVG viewBox
    cx: 210, cy: 240,                 // wheel centre
    ringR: 194.5, ringW: 11,          // outer rust ring
    sliceR: 178,                      // slice radius (white gap between ring and slices)
    labelR: 116,                      // distance of label centre from wheel centre
    restIndex: 1,                     // slice under the pointer before spinning (₹500 Aza Cash, as in the design)
    fullTurns: 6,                     // full rotations per spin
    duration: 5200,                   // spin time in ms
    resultDelay: 1500,                // pause on the result before the popup (ms)
    rust: "#B93B1C"
};

var sliceAngle = 360 / weDATA.length,
    restRotation = -(sliceAngle * WE_CFG.restIndex + sliceAngle / 2),
    currentRot = restRotation,
    picked = null,
    oldpick = [],
    isSpinning = false;

if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    WE_CFG.duration = 1800; WE_CFG.fullTurns = 2;
}

/* ---- Draw ---- */
var svg = d3.select("#weSpinWheel").append("svg")
        .attr("viewBox", "0 0 " + WE_CFG.width + " " + WE_CFG.height)
        .attr("aria-label", "Spin the wheel")
        .data([weDATA]),
    defs = svg.append("defs");

weDATA.forEach(function (item, i) {
    var g = defs.append("linearGradient").attr("id", "weGrad" + i).attr("x1", "0").attr("x2", "1").attr("y1", "0").attr("y2", "0");
    g.append("stop").attr("offset", "0").attr("stop-color", d3.rgb(item.color).brighter(0.18).toString());
    g.append("stop").attr("offset", "1").attr("stop-color", item.color);
});
var shadow = defs.append("filter").attr("id", "weShadow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
shadow.append("feDropShadow").attr("dx", 0).attr("dy", 2).attr("stdDeviation", 3).attr("flood-color", WE_CFG.rust).attr("flood-opacity", 0.35);

// outer ring
svg.append("circle").attr("cx", WE_CFG.cx).attr("cy", WE_CFG.cy).attr("r", WE_CFG.ringR)
    .attr("fill", "#ffffff").attr("stroke", WE_CFG.rust).attr("stroke-width", WE_CFG.ringW);

var container = svg.append("g").attr("class", "spinner").attr("transform", "translate(" + WE_CFG.cx + "," + WE_CFG.cy + ")"),
    vis = container.append("g").attr("class", "spi").attr("transform", "rotate(" + restRotation + ")"),
    pie = d3.layout.pie().sort(null).value(function () { return 1; }),
    arc = d3.svg.arc().innerRadius(0).outerRadius(WE_CFG.sliceR),
    arcs = vis.selectAll("g.slice").data(pie).enter().append("g")
        .attr("class", "slice").attr("data-index", function (d, i) { return i; });

arcs.append("path")
    .attr("fill", function (d, i) { return "url(#weGrad" + i + ")"; })
    .attr("d", arc);

var LINE_H = 19;
arcs.append("text")
    .attr("transform", function (d) {
        var mid = (d.startAngle + d.endAngle) / 2 * 180 / Math.PI;
        return "rotate(" + mid + ")translate(0," + (-WE_CFG.labelR) + ")";
    })
    .attr("text-anchor", "middle")
    .style({ "font-size": "16px", "font-weight": "800", "letter-spacing": "0.01em" })
    .attr("fill", function (d) { return d.data.weTextColor || "#1F1410"; })
    .each(function (d) {
        var lines = d.data.weLines || [d.data.weName.toUpperCase()], t = d3.select(this);
        lines.forEach(function (line, k) {
            t.append("tspan").attr("x", 0).attr("y", (k - (lines.length - 1) / 2) * LINE_H).attr("dy", "0.36em").text(line);
        });
    });

// pointer (map-pin) at the top - also a spin trigger
var pointer = svg.append("g").attr("class", "wePointer weSpinTrigger")
        .attr("transform", "translate(" + WE_CFG.cx + "," + (WE_CFG.cy - WE_CFG.ringR - WE_CFG.ringW / 2 - 3) + ")"),
    pointerInner = pointer.append("g").attr("class", "wePointerInner");
pointerInner.append("path")
    .attr("d", "M0,43 C-4,39 -24,19 -24,0 A24,24 0 1 1 24,0 C24,19 4,39 0,43 Z")
    .attr("fill", WE_CFG.rust).attr("stroke", "#ffffff").attr("stroke-width", 5)
    .attr("stroke-linejoin", "round").style("paint-order", "stroke");
pointerInner.append("circle").attr("r", 11).attr("fill", "#ffffff");

// centre arrow button - main spin trigger
var trigger = svg.append("g").attr("class", "weSpinTrigger weCenter")
    .attr("transform", "translate(" + WE_CFG.cx + "," + WE_CFG.cy + ")")
    .attr("role", "button").attr("tabindex", 0).attr("aria-label", "Spin the wheel");
trigger.append("circle").attr("class", "weHalo").attr("r", 36).attr("fill", "#ffffff").attr("fill-opacity", 0.75);
trigger.append("circle").attr("class", "weBtn").attr("r", 27).attr("fill", WE_CFG.rust).attr("filter", "url(#weShadow)");
trigger.append("path").attr("d", "M-6,-10 L11,0 L-6,10 Z")
    .attr("fill", "#ffffff").attr("stroke", "#ffffff").attr("stroke-width", 6).attr("stroke-linejoin", "round");

svg.selectAll(".weSpinTrigger")
    .on("click", function () { spin(); })
    .on("keydown", function () {
        var e = d3.event;
        if (e.key === "Enter" || e.key === " " || e.keyCode === 13 || e.keyCode === 32) { e.preventDefault(); spin(); }
    });

/* ---- Spin ---- */
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

function tickPointer() {
    pointerInner.attr("transform", "rotate(-14)")
        .transition().duration(140).ease("cubic-out").attr("transform", "rotate(0)");
}

function spin() {
    if (isSpinning || oldpick.length >= weDATA.length) return;

    // weighted random pick among slices not won yet (a respin never repeats a slice)
    var weights = {};
    for (var n = 0; n < weDATA.length; n++) if (oldpick.indexOf(n) === -1) weights[n] = weDATA[n].wePercWght;
    picked = Number(weightedRandom(weights)());
    oldpick.push(picked);
    isSpinning = true;
    svg.classed("is-spinning", true);

    // final angle puts the centre of the picked slice under the pointer (+ a small offset that stays inside the slice)
    var sliceCentre = sliceAngle * picked + sliceAngle / 2,
        jitter = (Math.random() * 2 - 1) * sliceAngle * 0.3,
        start = restRotation,
        target = 360 * (WE_CFG.fullTurns + 1) - sliceCentre + jitter,
        lastSeg = Math.floor((start + sliceAngle / 2) / sliceAngle);

    vis.attr("transform", "rotate(" + start + ")")
        .transition().duration(WE_CFG.duration).ease(easeOutQuart)
        .attrTween("transform", function () {
            var interp = d3.interpolate(start, target);
            return function (t) {
                var rot = interp(t), seg = Math.floor((rot + sliceAngle / 2) / sliceAngle);
                if (seg !== lastSeg) { lastSeg = seg; tickPointer(); }
                return "rotate(" + rot + ")";
            };
        })
        .each("end", function () {
            currentRot = target;
            var item = weDATA[picked];
            document.querySelector("span#prize").innerText = item.weName;
            document.querySelector("code > p").innerText = item.weCode || "";
            vis.selectAll("g.slice").classed("is-winner", function (d, i) { return i === picked; });
            setTimeout(function () { showResult(item); }, WE_CFG.resultDelay);
        });
}

function showResult(item) {
    var spinCont = document.querySelector(".spinContainer");
    spinCont.classList.remove("show");
    spinCont.classList.add("hide");
    vis.selectAll("g.slice").classed("is-winner", false);
    vis.attr("transform", "rotate(" + restRotation + ")");
    isSpinning = false;
    svg.classed("is-spinning", false);

    var allUsed = oldpick.length == weDATA.length;
    if ("yes" === item.weWin) {
        try { weNotification.trackEvent("In-app Template - Spin Clicked", JSON.stringify({ Win: item.weWin, "Coupon Code": item.weCode, "Respin count": oldpick.length }), !1); } catch (t) { }
        document.querySelector(".weWinCont").classList.add("show");
        var winRespin = document.querySelector(".weWinCont .respin-button");
        if (winRespin) winRespin.style.display = allUsed ? "none" : "";
    } else if ("no" === item.weWin) {
        try { weNotification.trackEvent("In-app Template - Spin Clicked", JSON.stringify({ Win: item.weWin, "Respin count": oldpick.length }), !1); } catch (n) { }
        document.querySelector(".welostCont").classList.add("show");
        var lostRespin = document.querySelector(".welostCont .respin-button");
        if (lostRespin) lostRespin.style.display = allUsed ? "none" : "";
    }
}

function backToWheel(resultSelector) {
    document.querySelector(resultSelector).classList.remove("show");
    var spinCont = document.querySelector(".spinContainer");
    spinCont.classList.remove("hide");
    spinCont.classList.add("show");
}

// Respin buttons are optional - handlers attach only if the button markup is present
var weWinRespinBtn = document.querySelector(".weWinCont .respin-button");
if (weWinRespinBtn) weWinRespinBtn.addEventListener("click", function () {
    backToWheel(".weWinCont");
});
var weLostRespinBtn = document.querySelector(".welostCont .respin-button");
if (weLostRespinBtn) weLostRespinBtn.addEventListener("click", function () {
    try { weNotification.trackEvent("In-app Template - Spin Clicked", JSON.stringify({ Win: weDATA[picked].weWin, Respin: !0, "Respin count": oldpick.length }), !1); } catch (t) { }
    backToWheel(".welostCont");
});

function weightedRandom(t) {
    var e, n, i = [];
    for (e in t) for (n = 0; n < 10 * t[e]; n++) i.push(e);
    return function () { return i[Math.floor(Math.random() * i.length)]; };
}

/* ---- Copy coupon ---- */
async function copyCode() {
    var t = document.querySelector("code > p"), text = t.innerText;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else { // fallback for in-app webviews without the Clipboard API
            var ta = document.createElement("textarea");
            ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
            document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        }
        document.querySelector("code span").style.display = "inline-block";
        setTimeout(function () { document.querySelector("code span").style.display = "none"; }, 1e3);
        weNotification.trackEvent("In-app Template - Copy Clicked", JSON.stringify({ "Coupon Code": text }), !1);
    } catch (e) { }
}
