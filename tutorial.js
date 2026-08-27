(() => {
  "use strict";
  const PREFIX="dpro_tutorial_welfare_";
  const KEYS=Object.freeze({
    step:`${PREFIX}first10_step`,
    status:`${PREFIX}first10_status`,
    positions:`${PREFIX}card_position`,
    lastRoute:`${PREFIX}last_route`
  });
  const STEPS=Object.freeze([
    {n:1,page:"member.html",anchor:"member-summary",selector:"main .hero",title:"利用状況の全体像",text:"まず現在の利用状況を確認します。利用中用具、次回訪問、対応中の相談が最初に見える構成です。"},
    {n:2,page:"member.html",anchor:"member-equipment",selector:"[data-equipment-list]",closest:".card",title:"利用中用具と相談導線",text:"利用中の用具と次回確認日を見ます。追加・交換、不具合、予定変更はここから相談導線へ進めます。"},
    {n:3,page:"inquiry.html",query:"?type=exchange",anchor:"public-inquiry-form",selector:"#public-inquiry-form",title:"公開相談受付",text:"相談者、相談種別、連絡先、相談内容を入力して送る画面です。First10では実データを入力・送信せず、項目だけ確認します。",safety:"First10は相談フォームを送信しません。実在する個人情報も入力しないでください。"},
    {n:4,page:"planning.html",anchor:"planning-login",selector:"[data-admin-gate]",title:"専門職画面の管理認証",text:"専門職画面は管理認証後に開きます。デモでは管理コード1234を入力し、Enterまたは「開く」で進みます。",loginStep:true},
    {n:5,page:"planning.html",anchor:"planning-progress",selector:".planning-progress",title:"アセスメント・計画の流れ",text:"利用者 → アセスメント → 計画 → 用具選定 → 説明・同意の5段階です。First10では流れを確認し、保存・完了操作は行いません。",safety:"保存・完了・有効化は押しません。"},
    {n:6,page:"contract.html",anchor:"contract-progress",selector:".contract-progress",title:"契約・納品準備の流れ",text:"有効計画 → 契約作成 → 説明・同意 → 個体割当 → 納品予定の順です。契約や納品データはFirst10では作成しません。",safety:"契約作成・同意・納品予定の登録は行いません。"},
    {n:7,page:"staff.html",anchor:"delivery-flow",selector:".delivery-safety-flow",title:"配送・設置の安全フロー",text:"積込確認 → 出発 → 到着 → 設置確認 → 納品完了の順です。安全確認が揃ってから貸与開始になります。",safety:"First10は配送状態や貸与状態を変更しません。"},
    {n:8,page:"aftercare.html",anchor:"aftercare-flow",selector:".aftercare-flow",title:"モニタリング・保守",text:"モニタリング → 対応判断 → 訪問対応 → 回収後処理 → 再貸出可能までを追います。転倒・けが・重大破損時は安全確保を優先します。",safety:"修理・交換・返却・回収後処理は説明だけです。"},
    {n:9,page:"billing.html",anchor:"billing-flow",selector:".billing-flow",title:"請求・入金",text:"請求生成 → エラー検証 → 締め → 請求発行 → 入金管理の順です。First10では請求生成や入金登録を実行しません。",safety:"請求生成・締め・入金登録などの更新操作は行いません。"},
    {n:10,page:"operations.html",anchor:"operations-readiness",selector:"#operations-readiness",title:"運用最終確認",text:"最後に導入・日常運用の準備状況を確認します。事業所設定、スタッフ権限、通知、帳票、監査、system-checkが運用管理の入口です。",safety:"設定保存・権限変更・通知送信などはFirst10から実行しません。"}
  ]);
  const state={card:null,highlight:null,entry:null,target:null,step:1,active:false,opener:null,drag:null,observer:null,raf:0};

  function pageName(){return(location.pathname.split("/").pop()||"index.html").toLowerCase()}
  function readStep(){const n=Number(localStorage.getItem(KEYS.step)||"1");return Math.min(10,Math.max(1,Number.isFinite(n)?n:1))}
  function readStatus(){return localStorage.getItem(KEYS.status)||"new"}
  function setProgress(step,status="active"){state.step=Math.min(10,Math.max(1,Number(step)||1));localStorage.setItem(KEYS.step,String(state.step));localStorage.setItem(KEYS.status,status);localStorage.setItem(KEYS.lastRoute,`${pageName()}${location.search}`);updateEntry()}
  function getPositions(){try{return JSON.parse(localStorage.getItem(KEYS.positions)||"{}")||{}}catch{return{}}}
  function positionKey(){return`${pageName()}:${state.step}`}
  function savePosition(x,y){const p=getPositions();p[positionKey()]={x:Math.round(x),y:Math.round(y)};localStorage.setItem(KEYS.positions,JSON.stringify(p))}
  function clearTutorialState(){Object.values(KEYS).forEach(k=>localStorage.removeItem(k))}
  function routeFor(step){const i=STEPS[step-1];return`${i.page}${i.query||""}`}
  function goToStep(step,replace=false){
    const next=STEPS[step-1];setProgress(step,"active");
    if(pageName()!==next.page||(next.query&&location.search!==next.query)){
      const u=new URL(routeFor(step),location.href);replace?location.replace(u.href):location.href=u.href;return true
    }
    renderStep();return false
  }
  function resolveTarget(item){
    let t=document.querySelector(item.selector);
    if(t&&item.closest)t=t.closest(item.closest)||t;
    if(t)t.setAttribute("data-tutorial-anchor",item.anchor);
    return t
  }
  function createUi(){
    if(state.card)return;
    const h=document.createElement("div");h.className="dpro-tutorial-highlight";h.hidden=true;h.setAttribute("aria-hidden","true");
    const c=document.createElement("section");c.className="dpro-tutorial-card";c.hidden=true;c.setAttribute("role","dialog");c.setAttribute("aria-modal","false");c.setAttribute("aria-label","DPRO First10 チュートリアル");
    c.innerHTML=`<div class="dpro-tutorial-handle" tabindex="0" role="group" aria-label="チュートリアルカード移動ハンドル。矢印キーでも移動できます"><span>First10</span><small>ドラッグして移動</small></div>
      <div class="dpro-tutorial-body"><div class="dpro-tutorial-progress"><span data-tutorial-progress></span><span data-tutorial-persona></span></div>
      <h2 data-tutorial-title tabindex="-1"></h2><p data-tutorial-text></p><div class="dpro-tutorial-safety" data-tutorial-safety hidden></div>
      <div class="dpro-tutorial-complete" data-tutorial-complete hidden></div><div class="dpro-tutorial-controls">
      <button type="button" data-tutorial-close>閉じる</button><button type="button" data-tutorial-back>戻る</button>
      <button type="button" class="is-primary" data-tutorial-next>次へ</button><button type="button" class="is-muted" data-tutorial-skip>スキップ</button>
      <button type="button" class="is-muted" data-tutorial-replay>最初から</button><a href="guide-center.html" data-tutorial-guide hidden>Guide Center</a></div></div>`;
    const e=document.createElement("button");e.type="button";e.className="dpro-tutorial-entry";e.setAttribute("aria-label","DPRO操作ガイドを開く");
    document.body.append(h,c,e);state.card=c;state.highlight=h;state.entry=e;
    const handle=c.querySelector(".dpro-tutorial-handle");handle.addEventListener("pointerdown",startDrag);handle.addEventListener("keydown",keyboardMove);
    c.querySelector("[data-tutorial-close]").addEventListener("click",()=>closeTour("paused"));
    c.querySelector("[data-tutorial-back]").addEventListener("click",previous);
    c.querySelector("[data-tutorial-next]").addEventListener("click",next);
    c.querySelector("[data-tutorial-skip]").addEventListener("click",()=>closeTour("skipped"));
    c.querySelector("[data-tutorial-replay]").addEventListener("click",replay);
    e.addEventListener("click",ev=>{state.opener=ev.currentTarget;readStatus()==="complete"?replay():resume()});
    document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&state.active){ev.preventDefault();ev.stopPropagation();closeTour("paused")}},true);
    document.addEventListener("dpro-admin-ready",onAdminReady);
    window.addEventListener("resize",scheduleLayout);window.addEventListener("orientationchange",scheduleLayout);window.addEventListener("scroll",scheduleLayout,true);
    window.visualViewport?.addEventListener("resize",scheduleLayout);window.visualViewport?.addEventListener("scroll",scheduleLayout);
    state.observer=new MutationObserver(scheduleLayout);state.observer.observe(document.documentElement,{childList:true,subtree:true});
    updateEntry()
  }
  function updateEntry(){
    if(!state.entry)return;const s=readStatus(),n=readStep();
    if(s==="complete"){state.entry.textContent="First10 再生"}else if(["active","paused","skipped"].includes(s)){state.entry.textContent=`First10 続き ${n}/10`}else{state.entry.textContent="First10 開始"}
  }
  function currentItem(){return STEPS[state.step-1]}
  function maybeAdvanceAuthenticatedLogin(){
    if(state.step!==4||pageName()!=="planning.html")return false;
    const g=document.querySelector("[data-admin-gate]"),p=document.querySelector("[data-protected-area]");
    if(Boolean((g&&g.hidden)||(p&&!p.hidden))){setProgress(5,"active");state.step=5;return true}return false
  }
  function onAdminReady(){if(!state.active||state.step!==4||pageName()!=="planning.html")return;setProgress(5,"active");setTimeout(renderStep,40)}
  function renderStep(){
    if(!state.active)return;if(maybeAdvanceAuthenticatedLogin()){setTimeout(renderStep,20);return}
    const item=currentItem();if(pageName()!==item.page){goToStep(state.step,true);return}
    const t=resolveTarget(item);state.target=t;
    const q=s=>state.card.querySelector(s);
    q("[data-tutorial-progress]").textContent=`STEP ${String(item.n).padStart(2,"0")} / 10`;
    q("[data-tutorial-persona]").textContent=item.n<=3?"利用者・家族":item.n<=6?"専門職・事務":item.n===7?"配送・設置":item.n===8?"専門相談員":"事務・管理";
    q("[data-tutorial-title]").textContent=item.title;q("[data-tutorial-text]").textContent=item.text;
    const safety=q("[data-tutorial-safety]");safety.hidden=!item.safety;safety.textContent=item.safety||"";
    q("[data-tutorial-complete]").hidden=true;q("[data-tutorial-back]").disabled=item.n===1;
    const nb=q("[data-tutorial-next]");nb.hidden=false;nb.textContent=item.n===10?"完了":"次へ";q("[data-tutorial-guide]").hidden=true;
    if(!t){safety.hidden=false;safety.textContent=item.loginStep?"管理認証後に自動で次のステップへ進みます。":"対象画面を読み込み中です。表示後に自動でハイライトします。"}else t.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"});
    state.card.hidden=false;document.body.classList.add("dpro-tutorial-open");layout();setTimeout(()=>q("[data-tutorial-title]")?.focus({preventScroll:true}),0)
  }
  function completeTour(){
    setProgress(10,"complete");const q=s=>state.card.querySelector(s),done=q("[data-tutorial-complete]");
    done.hidden=false;done.textContent="First10 完了。業務データは変更していません。";q("[data-tutorial-next]").hidden=true;q("[data-tutorial-guide]").hidden=true;
    state.highlight.hidden=true;state.target=null;updateEntry()
  }
  function next(){state.step>=10?completeTour():goToStep(state.step+1)}
  function previous(){if(state.step>1)goToStep(state.step-1)}
  function closeTour(status="paused"){
    const finalStatus=readStatus()==="complete"?"complete":status;
    setProgress(state.step,finalStatus);state.active=false;state.card.hidden=true;state.highlight.hidden=true;state.target=null;document.body.classList.remove("dpro-tutorial-open");updateEntry();
    if(state.opener&&document.contains(state.opener))state.opener.focus({preventScroll:true});else state.entry?.focus({preventScroll:true})
  }
  function resume(){
    state.active=true;state.step=readStep();setProgress(state.step,"active");const i=currentItem();
    if(pageName()!==i.page||(i.query&&location.search!==i.query)){location.href=new URL(routeFor(state.step),location.href).href;return}renderStep()
  }
  function replay(){clearTutorialState();state.step=1;state.active=true;setProgress(1,"active");if(pageName()!=="member.html"){location.href=new URL("member.html",location.href).href;return}renderStep()}
  function startDrag(ev){
    if(ev.button!==undefined&&ev.button!==0)return;const r=state.card.getBoundingClientRect();state.drag={pointerId:ev.pointerId,offsetX:ev.clientX-r.left,offsetY:ev.clientY-r.top};
    ev.currentTarget.setPointerCapture?.(ev.pointerId);ev.preventDefault();
    const move=m=>{if(!state.drag||m.pointerId!==state.drag.pointerId)return;const p=clampPosition(m.clientX-state.drag.offsetX,m.clientY-state.drag.offsetY);applyCardPosition(p.x,p.y);savePosition(p.x,p.y);m.preventDefault()};
    const end=e=>{if(!state.drag||e.pointerId!==state.drag.pointerId)return;ev.currentTarget.releasePointerCapture?.(e.pointerId);state.drag=null;ev.currentTarget.removeEventListener("pointermove",move);ev.currentTarget.removeEventListener("pointerup",end);ev.currentTarget.removeEventListener("pointercancel",end)};
    ev.currentTarget.addEventListener("pointermove",move);ev.currentTarget.addEventListener("pointerup",end);ev.currentTarget.addEventListener("pointercancel",end)
  }
  function keyboardMove(ev){
    const ks=["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];if(!ks.includes(ev.key))return;ev.preventDefault();const r=state.card.getBoundingClientRect(),a=ev.shiftKey?40:10;let x=r.left,y=r.top;
    if(ev.key==="ArrowLeft")x-=a;if(ev.key==="ArrowRight")x+=a;if(ev.key==="ArrowUp")y-=a;if(ev.key==="ArrowDown")y+=a;const p=clampPosition(x,y);applyCardPosition(p.x,p.y);savePosition(p.x,p.y)
  }
  function viewport(){const v=window.visualViewport;return{width:Math.max(1,v?.width||innerWidth||document.documentElement.clientWidth),height:Math.max(1,v?.height||innerHeight||document.documentElement.clientHeight),offsetLeft:v?.offsetLeft||0,offsetTop:v?.offsetTop||0}}
  function clampPosition(x,y){const m=8,v=viewport(),r=state.card.getBoundingClientRect(),mx=v.offsetLeft+v.width-r.width-m,my=v.offsetTop+v.height-r.height-m;return{x:Math.min(Math.max(x,v.offsetLeft+m),Math.max(v.offsetLeft+m,mx)),y:Math.min(Math.max(y,v.offsetTop+m),Math.max(v.offsetTop+m,my))}}
  function applyCardPosition(x,y){state.card.style.left=`${Math.round(x)}px`;state.card.style.top=`${Math.round(y)}px`;state.card.style.right="auto";state.card.style.bottom="auto"}
  function defaultCardPosition(tr){const m=12,v=viewport(),cr=state.card.getBoundingClientRect(),below=v.offsetTop+v.height-tr.bottom,above=tr.top-v.offsetTop;let y;if(below>=cr.height+m)y=tr.bottom+m;else if(above>=cr.height+m)y=tr.top-cr.height-m;else y=v.offsetTop+v.height-cr.height-m;let x=Math.min(Math.max(tr.left,v.offsetLeft+m),v.offsetLeft+v.width-cr.width-m);return clampPosition(x,y)}
  function updateHighlight(){
    if(!state.target||!document.contains(state.target)||state.target.hidden){state.highlight.hidden=true;return}
    const r=state.target.getBoundingClientRect(),v=viewport(),l=Math.max(v.offsetLeft+2,r.left-4),t=Math.max(v.offsetTop+2,r.top-4),rr=Math.min(v.offsetLeft+v.width-2,r.right+4),b=Math.min(v.offsetTop+v.height-2,r.bottom+4);
    if(rr<=l||b<=t){state.highlight.hidden=true;return}Object.assign(state.highlight.style,{left:`${Math.round(l)}px`,top:`${Math.round(t)}px`,width:`${Math.round(rr-l)}px`,height:`${Math.round(b-t)}px`});state.highlight.hidden=false
  }
  function layout(){
    state.raf=0;if(!state.active||state.card.hidden)return;if(state.target&&document.contains(state.target))updateHighlight();else{const t=resolveTarget(currentItem());if(t)state.target=t;updateHighlight()}
    const p=getPositions(),stored=p[positionKey()];let pos;if(stored&&Number.isFinite(stored.x)&&Number.isFinite(stored.y))pos=clampPosition(stored.x,stored.y);else if(state.target)pos=defaultCardPosition(state.target.getBoundingClientRect());else{const v=viewport(),r=state.card.getBoundingClientRect();pos=clampPosition(v.offsetLeft+v.width-r.width-12,v.offsetTop+v.height-r.height-12)}applyCardPosition(pos.x,pos.y)
  }
  function scheduleLayout(){if(!state.raf)state.raf=requestAnimationFrame(layout)}
  function exposeApi(){window.DPRO_TUTORIAL=Object.freeze({start:replay,resume,replay,close:()=>closeTour("paused"),status:()=>({step:readStep(),status:readStatus()}),keys:KEYS});document.dispatchEvent(new CustomEvent("dpro-tutorial-ready"))}
  function init(){
    createUi();exposeApi();const p=new URLSearchParams(location.search),w=p.get("tutorial")==="1",s=readStatus();state.step=readStep();
    if(pageName()==="guide-center.html"){state.active=false;updateEntry();return}if(w){replay();return}if(s==="active"){state.active=true;renderStep()}else updateEntry()
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init()
})();