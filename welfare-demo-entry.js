(()=>{'use strict';
  const c=window.DPRO_CONFIG||{};
  const safe=c.systemCode==='WELFARE-EQUIP'&&c.demoMode===true&&c.productionGuard===true&&c.officeCode==='dpro_welfare_equipment_demo'&&c.adminCode==='1234'&&c.apiBaseUrl==='https://dpro-welfare-equipment-line-api.dpromstk2000.workers.dev';
  const page=location.pathname.split('/').pop()||'index.html';
  const labels={'member.html':'利用者・家族','owner.html':'管理者PC','owner-ipad.html':'専門相談員iPad','staff-login.html':'配送スタッフ','planning.html':'計画','contract.html':'契約・納品','aftercare.html':'保守','billing.html':'請求・入金','operations.html':'運用設定','staff.html':'配送・設置','index.html':'相談受付','inquiry.html':'相談受付'};
  function init(){
    const gate=document.querySelector('[data-admin-gate]');
    const demoStaff=[...document.querySelectorAll('[data-demo-staff]')];
    if(!safe){for(const b of demoStaff){b.hidden=true;b.style.setProperty('display','none','important');}return;}
    if(!labels[page]||document.getElementById('welfareDemoNav'))return;
    const style=document.createElement('style');style.textContent=`#welfareDemoNav{box-sizing:border-box;width:calc(100% - 24px);max-width:1160px;margin:12px auto;padding:12px 16px;border:1px solid #b9dfd1;border-radius:14px;background:#f2fbf6;color:#103c31}#welfareDemoNav strong{display:block;font-size:17px}#welfareDemoNav p{font-size:13px;line-height:1.5;margin:4px 0 9px}#welfareDemoNav .demo-roles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#welfareDemoNav a{display:flex;justify-content:center;align-items:center;min-height:44px;border:1px solid #9ccabc;border-radius:9px;background:#fff;color:#134e3e;text-decoration:none;font-size:14px;font-weight:800;text-align:center;padding:6px;line-height:1.4}#welfareDemoNav a[aria-current=page]{background:#0b5342;color:#fff}#welfareQuickBox{padding:14px;margin:12px 0;border:1px solid #a8dbca;border-radius:12px;background:#effaf5;color:#123d31}#welfareQuickBox p{font-size:14px;line-height:1.5;margin:0 0 9px}#welfareQuickLogin{width:100%;min-height:48px;padding:10px;border:0;border-radius:9px;background:#087552;color:#fff;font:inherit;font-size:16px;font-weight:850;cursor:pointer}#welfareQuickLogin:disabled{opacity:.65}#welfareManual summary{cursor:pointer;padding:10px 0}#welfareDemoNav a:focus-visible,#welfareQuickLogin:focus-visible,#welfareManual summary:focus-visible{outline:3px solid #0b7557;outline-offset:3px}@media(max-width:600px){#welfareDemoNav .demo-roles{grid-template-columns:repeat(2,minmax(0,1fr))}}[hidden]{display:none!important}`;document.head.append(style);
    const nav=document.createElement('nav');nav.id='welfareDemoNav';nav.setAttribute('aria-label','公開DEMO画面切り替え');
    const title=document.createElement('strong');title.textContent='DPRO 福祉用具｜公開操作DEMO';nav.append(title);
    const note=document.createElement('p');note.textContent='登録不要。架空データで体験できます。実在する利用者情報・書類は入力しないでください。';nav.append(note);
    const links=document.createElement('div');links.className='demo-roles';for(const path of ['member.html','owner.html','owner-ipad.html','staff-login.html']){const a=document.createElement('a');a.href=path+'?demo=1';a.textContent=labels[path];if(page===path||(page==='staff.html'&&path==='staff-login.html'))a.setAttribute('aria-current','page');links.append(a)}nav.append(links);
    const main=document.querySelector('main');if(main)main.before(nav);else document.body.prepend(nav);
    if(page==='member.html'){const p=document.createElement('p');p.textContent='この家族画面は架空の利用状況のサンプルです。管理者・スタッフ画面は各DEMOボタンから操作できます。';nav.append(p);return;}
    if(page==='staff-login.html'){
      const form=document.getElementById('staff-login-form'),fill=document.querySelector('[data-demo-staff="ST003"]'),submit=form?.querySelector('button[type="submit"]');if(!form||!fill||!submit)return;
      const b=document.createElement('button');b.id='welfareQuickLogin';b.type='button';b.textContent='配送スタッフDEMOを体験する';form.before(b);
      b.addEventListener('click',()=>{if(submit.disabled)return;fill.click();const f=new FormData(form);if(f.get('staff_code')!=='ST003'||f.get('pin')!=='3333')return;form.elements.destination.value='staff.html';form.requestSubmit(submit);});
      const sync=()=>{b.disabled=submit.disabled;b.textContent=submit.disabled?'DEMOに接続中…':'配送スタッフDEMOを体験する'};new MutationObserver(sync).observe(submit,{attributes:true,attributeFilter:['disabled']});sync();return;
    }
    if(!gate)return;
    const input=gate.querySelector('[data-admin-code]'),login=gate.querySelector('[data-admin-login]'),row=login?.closest('.admin-code-row');if(!input||!login||!row)return;
    const box=document.createElement('div');box.id='welfareQuickBox';const p=document.createElement('p');p.textContent=page==='staff.html'?'配送スタッフ専用のデモ認証で体験できます。':'管理コードの手入力は不要です。デモ専用の認証で開きます。';box.append(p);
    const b=document.createElement('button');b.id='welfareQuickLogin';b.type='button';b.textContent=labels[page]+' DEMOを体験する';box.append(b);row.before(box);
    const details=document.createElement('details');details.id='welfareManual';const summary=document.createElement('summary');summary.textContent='手動ログイン（必要な場合のみ）';details.append(summary);row.before(details);details.append(row);
    if(page==='staff.html'){b.addEventListener('click',()=>{location.href='staff-login.html?demo=1';});return;}
    b.addEventListener('click',()=>{if(login.disabled||!window.DPRO_API?.login)return;input.value='1234';login.click();});
    const sync=()=>{b.disabled=login.disabled;b.textContent=login.disabled?'DEMOに接続中…':labels[page]+' DEMOを体験する'};new MutationObserver(sync).observe(login,{attributes:true,attributeFilter:['disabled']});sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
