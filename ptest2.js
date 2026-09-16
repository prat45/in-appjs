
function initTempoSurvey() {
  var g=1,
  r=document.getElementById("tempoSurvey"),
  n=r.querySelectorAll(".tempo-page"),
  o=document.getElementById("tempoProgressBar"),
  c=document.getElementById("tempoPageCount"),
  i=document.getElementById("tempoBack"),
  s=document.getElementById("tempoNext"),
  d=document.getElementById("tempoFooter"),
  e=document.getElementById("tempoClose"),
  t=document.getElementById("tempoStart"),
  submitted=false;

  var EVENT_NAME="Survey_Pembaca";

  function radioValue(name){
    var el=r.querySelector('input[name="'+name+'"]:checked');
    return el ? el.value : "";
  }

  function checkboxValues(name){
    var els=r.querySelectorAll('input[name="'+name+'"]:checked');
    var values=[];
    for(var j=0;j<els.length;j++){
      values.push(els[j].value);
    }
    return values.join(", ");
  }

  function textValue(id){
    var el=document.getElementById(id);
    return el ? (el.value||"").replace(/^\s+|\s+$/g,"") : "";
  }

  function formatWithOther(mainValue,otherComment){
    if(otherComment){
      return mainValue ? mainValue+" (Detail: "+otherComment+")" : "Lainnya: "+otherComment;
    }
    return mainValue;
  }

  function toggleOther(checkId,boxId){
    var check=document.getElementById(checkId);
    var box=document.getElementById(boxId);
    if(!check||!box) return;

    check.addEventListener("change",function(){
      box.style.display=check.checked ? "block" : "none";
    });
  }

  function showPage(){
    for(var j=0;j<n.length;j++){
      n[j].classList.remove("active");
    }

    var page=r.querySelector('.tempo-page[data-page="'+g+'"]');
    if(page){
      page.classList.add("active");
    }

    if(g<=10){
      o.style.width=((g-1)/9*100)+"%";
      c.textContent=(g>1?(g-1):1)+" / 9";
    }else{
      o.style.width="100%";
      c.textContent="9 / 9";
    }

    d.style.display=(g===1||g===11)?"none":"flex";
    i.style.display=g<=2?"none":"block";
    s.textContent=g===10?"Kirim":"Berikutnya";
  }

  function validatePage(page){
    var error=null;

    if(page===2){
      error=document.getElementById("error2");
      if(!radioValue("q1")){ error.classList.add("show"); return false; }
      error.classList.remove("show");
    }

    if(page===3){
      error=document.getElementById("error3");
      if(!checkboxValues("q2")){ error.classList.add("show"); return false; }
      error.classList.remove("show");
    }

    if(page===4){
      error=document.getElementById("error4");
      if(!radioValue("q3")){ error.classList.add("show"); return false; }
      error.classList.remove("show");
    }

    if(page===5){
      error=document.getElementById("error5");
      if(!radioValue("q4")){ error.classList.add("show"); return false; }
      error.classList.remove("show");
    }

    if(page===7){
      error=document.getElementById("error7");
      if(!checkboxValues("q6")){ error.classList.add("show"); return false; }
      error.classList.remove("show");
    }

    if(page===8){
      error=document.getElementById("error8");
      if(!checkboxValues("q7")){ error.classList.add("show"); return false; }
      error.classList.remove("show");
    }

    return true;
  }

  function buildTrackingData(){
    return {
      "Attribute_1":radioValue("q1"),
      "Attribute_2":formatWithOther(checkboxValues("q2"),textValue("q2Comment")),
      "Attribute_3":radioValue("q3"),
      "Attribute_4":radioValue("q4"),
      "Attribute_5":formatWithOther(checkboxValues("q5"),textValue("q5Comment")),
      "Attribute_6":formatWithOther(checkboxValues("q6"),textValue("q6Comment")),
      "Attribute_7":formatWithOther(checkboxValues("q7"),textValue("q7Comment")),
      "Attribute_8":formatWithOther(checkboxValues("q8"),textValue("q8Comment")),
      "Attribute_9":radioValue("q9"),
      "page url":window.location.href,
      "event time":new Date().toISOString()
    };
  }

  function submitSurvey(){
    if(submitted) return;
    submitted=true;

    var data=buildTrackingData();
    var payload="";

    try{
      payload=JSON.stringify(data);
    }catch(err){
      console.error("[Tempo Survey] JSON stringify failed:",err);
      submitted=false;
      return;
    }

    try{
      if(typeof weNotification!=="undefined"&&typeof weNotification.trackEvent==="function"){
        weNotification.trackEvent(EVENT_NAME,payload);
      }else{
        console.warn("[Tempo Survey] weNotification unavailable.");
      }
    }catch(err){
      console.error("[Tempo Survey] Tracking error:",err);
      submitted=false;
      return;
    }

    g=11;
    showPage();
  }

  toggleOther("q2OtherCheck","q2OtherBox");
  toggleOther("q5OtherCheck","q5OtherBox");
  toggleOther("q6OtherCheck","q6OtherBox");
  toggleOther("q7OtherCheck","q7OtherBox");
  toggleOther("q8OtherCheck","q8OtherBox");

  t.addEventListener("click",function(){ g=2; showPage(); });
  i.addEventListener("click",function(){ if(g>2){ g--; showPage(); } });

  s.addEventListener("click",function(){
    if(!validatePage(g)) return;
    if(g!==10){ g++; showPage(); }
    else { submitSurvey(); }
  });

  e.addEventListener("click",function(){
    try{
      if(typeof weNotification!=="undefined"){
        if(typeof weNotification.dismiss==="function") weNotification.dismiss();
        else if(typeof weNotification.close==="function") weNotification.close();
      }
    }catch(err){
      console.error("[Tempo Survey] Close error:",err);
    }
  });

  showPage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTempoSurvey);
} else {
  initTempoSurvey();
}

