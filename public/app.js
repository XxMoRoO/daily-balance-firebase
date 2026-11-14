import {slots,slotAr,defaultGoals,generatePlan,nutritionForMeal,nutritionForPlan,calculateLogged,nutrientsForItems,mealItems,addNutrition,dayKey,suggestedMealBudget,evaluateNutrition,makeCustomMeal,isMealAllowed} from './planner.mjs';
import {firebaseConfig} from './firebase-config.js';
const root=document.getElementById('appMain');const notice=document.getElementById('notice');const modal=document.getElementById('modal');const modalContent=document.getElementById('modalContent');const toastEl=document.getElementById('toast');
const state={data:null,day:null,settings:null,progress:null,view:'today',openSlot:'lunch',date:dayKey(),firebase:null,uid:null,mode:'demo',ready:false,filter:'all',busy:false,saveQueue:Promise.resolve(),customMeals:[],loadVersion:0,saving:false};
const esc=(x='')=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfmt=(n,d=0)=>Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:d,maximumFractionDigits:d});
const raw=(n,d=0)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const clamp=(v,lo=0,hi=100)=>Math.min(hi,Math.max(lo,v));
const pct=(x,y)=>y>0?clamp(x/y*100):0;
const dateLabel=k=>new Intl.DateTimeFormat('ar-EG',{weekday:'long',day:'numeric',month:'long'}).format(new Date(k+'T12:00:00Z'));
const currentWeight=()=>{const a=state.progress?.weights||[];return a.length?a.slice().sort((x,y)=>x.date.localeCompare(y.date)).at(-1).value:state.settings.weight};
const mealById=id=>state.data.meals.find(m=>m.id===id);
const customIds=()=>new Set(state.customMeals.map(x=>x.id));
const mergeCustomMeals=()=>{state.data.meals=state.data.meals.filter(m=>!m.isCustom||customIds().has(m.id));for(const meal of state.customMeals){const ix=state.data.meals.findIndex(m=>m.id===meal.id);if(ix>=0)state.data.meals[ix]=meal;else state.data.meals.push(meal)}};
const mealNutrition=(pm)=>{const m=mealById(pm?.id);return m?nutritionForMeal(m,state.data.foods,pm.amounts):{kcal:0,protein:0,carbs:0,fat:0,fiber:0}};
const goal=(key)=>Number(state.settings.goals[key]||0);
function newSettings(){return {weight:106,height:173,age:26,sex:'male',goalWeight:86,startDate:dayKey(),activity:'light',goals:{...defaultGoals},exclusions:['طماطم','سمك','مأكولات بحرية'],wakeTime:'10:00',updatedAt:Date.now()};}
function newDay(date){const v=generatePlan({meals:state.data.meals,foodDb:state.data.foods,goals:state.settings.goals,seed:date,exclusions:state.settings.exclusions});return {date,plan:v.plan,logged:{},manual:[],tasks:{walkDone:false,walkMinutes:0,exercises:{},water:false,daylight:false},sleepHours:null,regens:0,updatedAt:Date.now()};}
function keyLocal(k){return 'daily-balance-v2:'+k}
function localRead(k){try{return JSON.parse(localStorage.getItem(keyLocal(k)))}catch{return null}}
function localSave(k,v){try{localStorage.setItem(keyLocal(k),JSON.stringify(v))}catch{toast('المتصفح لم يسمح بحفظ البيانات المحلية')}}
const collectionPath=()=>['users',state.uid];
async function loadRecord(kind,key,fallback){if(state.mode!=='cloud'){return localRead(kind+':'+key)||fallback;}
 const {doc,getDoc}=state.firebase.fs;try{const snap=await getDoc(doc(state.firebase.db,...collectionPath(),kind,key));return snap.exists()?snap.data():fallback}catch(err){toast('فشل تحميل بيانات Firebase؛ لن نستبدل بياناتك بخطة فارغة');console.error(err);throw err}}
async function persist(kind,key,val){
 const snapshot=structuredClone(val);snapshot.updatedAt=Date.now();
 if(state.mode!=='cloud'){localSave(kind+':'+key,snapshot);return true;}
 const uid=state.uid,{doc,setDoc}=state.firebase.fs,db=state.firebase.db;
 state.saveQueue=state.saveQueue.catch(()=>{}).then(async()=>{
   if(!uid||uid!==state.uid)throw Error('تم تغيير الحساب أثناء الحفظ');
   await setDoc(doc(db,'users',uid,kind,key),snapshot);
 });
 try{await state.saveQueue;return true}catch(err){console.error('Cloud write failed',err);toast('فشل الحفظ على Firebase؛ لم يتم تأكيد التغيير');throw err;}
}
const saveDay=(date=state.date,day=state.day)=>persist('days',date,day);
const saveSettings=()=>persist('settings','main',state.settings);
const saveProgress=()=>persist('progress','main',state.progress);
const saveCustomMeals=()=>persist('recipes','library',{meals:state.customMeals});
async function commitDayMutation(mutate){
 const date=state.date,copy=structuredClone(state.day);
 mutate(copy);
 await saveDay(date,copy);
 if(date===state.date){state.day=copy;render()}
 return true;
}
async function loadAll(){
 const version=++state.loadVersion,date=state.date;
 state.ready=false;
 const settings=await loadRecord('settings','main',newSettings());
 const progress=await loadRecord('progress','main',{weights:[],waists:[]});
 const recipes=await loadRecord('recipes','library',{meals:[]});
 if(version!==state.loadVersion)return;
 state.settings=settings;state.progress=progress;
 state.customMeals=Array.isArray(recipes?.meals)?recipes.meals.filter(x=>x?.isCustom&&Array.isArray(x.ingredients)):[];
 mergeCustomMeals();
 let day=await loadRecord('days',date,null);
 if(version!==state.loadVersion)return;
 if(!day){day=newDay(date);await saveDay(date,day)}
 if(version!==state.loadVersion)return;
 day.logged=day.logged||{};day.manual=day.manual||[];day.tasks=day.tasks||{};
 day.tasks.exercises=day.tasks.exercises||{};
 state.day=day;state.ready=true;render();
}
async function initFirebase(){const valid=Boolean(firebaseConfig.apiKey&&firebaseConfig.projectId&&firebaseConfig.appId);if(!valid){state.mode='demo';state.ready=true;return;}
 try{
   const appmod=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
   const amod=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
   const fs=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
   const app=appmod.initializeApp(firebaseConfig);const auth=amod.getAuth(app),db=fs.getFirestore(app);
   state.firebase={auth,db,amod,fs};
   await new Promise(resolve=>amod.onAuthStateChanged(auth,async user=>{
     const u=user?.uid||null;if(u!==state.uid){state.uid=u;state.mode=u?'cloud':'demo';await loadAll()}resolve();
   }));
 }catch(e){console.error(e);state.mode='demo';notice.hidden=false;notice.textContent='Firebase غير متاح حاليًا. استخدم وضع التجربة المحلية، وراجع إعدادات المشروع والإنترنت.';}
}
async function login(){if(!state.firebase){openModal('تفعيل المزامنة','<p>النسخة الحالية تعمل كتجربة محلية. بعد وضع إعدادات Firebase في <code>firebase-config.js</code> يمكن تسجيل الدخول والمزامنة.</p>');return}
 if(state.uid){openModal('حسابك','<p>أنت مسجل الدخول، وبياناتك تُحفظ على Firebase.</p><button class="button danger full" data-action="logout">تسجيل الخروج</button>');return}
 try{await state.firebase.amod.signInWithPopup(state.firebase.auth,new state.firebase.amod.GoogleAuthProvider())}catch(e){if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'){await state.firebase.amod.signInWithRedirect(state.firebase.auth,new state.firebase.amod.GoogleAuthProvider())}else{toast('تسجيل الدخول لم يكتمل: '+(e.code||'خطأ'))}}
}
function toast(txt){toastEl.textContent=txt;toastEl.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>toastEl.classList.remove('show'),3500)}
function openModal(title,html){document.getElementById('modalTitle').textContent=title;modalContent.innerHTML=html;modal.hidden=false;document.body.style.overflow='hidden';modalContent.querySelector('input,select,button')?.focus()}
function closeModal(){modal.hidden=true;document.body.style.overflow=''}
function progressBar(val,max,className=''){return `<div class="progress-track ${className}"><div class="progress-fill" style="width:${pct(val,max)}%"></div></div>`}
function macro(label,val,target,type=''){return `<div class="macro ${type}"><small>${label}</small><strong>${nfmt(val)} / ${nfmt(target)} <span class="text-tiny">جم</span></strong><div class="mini-track"><div class="mini-fill" style="width:${pct(val,target)}%"></div></div><small>${nfmt(pct(val,target))}% من الهدف</small></div>`}
function dailyTotals(){return calculateLogged(state.day.logged,state.day.manual)}
function dailyPlanned(){return nutritionForPlan(state.day.plan,state.data.meals,state.data.foods)}
function sectionTitle(sub,title,more=''){return `<div class="greeting"><div><div class="eyebrow">${sub}</div><h1 class="page-title">${title}</h1></div>${more}</div>`}
function nutritionCard(){const actual=dailyTotals(),planned=dailyPlanned(),remaining=goal('kcal')-actual.kcal;
 const stats=evaluateNutrition(actual,state.settings.goals);
 return `<section class="daily-strip" aria-label="ملخص التغذية اليومية">
 <div class="strip-top"><div><span class="strip-caption">السعرات النهاردة</span><div class="strip-number">${nfmt(actual.kcal)} <small>/ ${nfmt(goal('kcal'))} سعرة</small></div></div><div class="strip-aside ${remaining<0?'over':''}">${remaining<0?'زيادة '+nfmt(-remaining):'متبقي '+nfmt(remaining)}<small>الخطة ${nfmt(planned.kcal)} سعرة</small></div></div>
 ${progressBar(actual.kcal,goal('kcal'),'slim-track')}
 <div class="micro-macros">${[['protein','بروتين'],['carbs','كربوهيدرات'],['fat','دهون']].map(([k,t])=>`<div class="micro-macro ${stats.over.includes(k)?'over':''}"><span>${t}</span><b>${nfmt(actual[k])} / ${nfmt(goal(k))} جم</b><small>${stats.ratio[k]}%</small></div>`).join('')}</div>
 ${stats.over.length?'<p class="inline-warning">تجاوزت هدف بعض العناصر اليوم؛ راجع الكميات المسجّلة.</p>':''}
 </section>`}
function renderMeal(slot){const pm=state.day.plan?.[slot],meal=mealById(pm?.id);if(!meal)return `<article class="meal-card"><p class="warnbox">الوجبة دي مش متاحة في المكتبة حاليًا. راجع الوصفات أو جدّد الخطة.</p></article>`;
 const opened=state.openSlot===slot;const nut=mealNutrition(pm),logged=state.day.logged[slot];
 const ingredients=mealItems(meal,pm.amounts||{});
 return `<article class="meal-card"><div class="meal-summary" data-action="toggle-meal" data-slot="${slot}" role="button" tabindex="0" aria-expanded="${opened}"><div><div class="meal-category">${slotAr[slot]} ${logged?'<span class="pill">تم تسجيلها ✓</span>':''}</div><div class="meal-name">${esc(meal.nameAr)}</div></div><div class="meal-numbers"><b>${nfmt(nut.kcal)} سعرة</b><small>${nfmt(nut.protein)} جم بروتين ${opened?'⌃':'⌄'}</small></div></div>
 ${opened?`<div class="meal-expand"><p class="small-note">الكميات المقترحة قابلة للتعديل بالجرام. المقادير المنزلية تقريبية للكمية الأصلية.</p>${ingredients.map((i,idx)=>`<div class="ingredient"><div><b>${esc(i.food)}</b><small>${esc(i.householdEquivalent)} — للكمية الأصلية ${i.unit==='g'?'بالجرام':''}</small></div><label><input type="number" min="0" max="1500" step="5" value="${i.quantity}" data-ingredient="${idx}" data-slot="${slot}" aria-label="جرامات ${esc(i.food)}"><small>جرام</small></label></div>`).join('')}
 <div class="row between" style="margin-top:12px"><b>${nfmt(nut.kcal)} سعرة</b><span class="pill">${nfmt(nut.protein)} بروتين · ${nfmt(nut.carbs)} كارب · ${nfmt(nut.fat)} دهون</span></div>
 ${logged?`<p class="successbox">تم تسجيل ${nfmt(logged.portion*100)}% من هذه الوجبة في ${esc(logged.loggedTime||'')}، بإجمالي ${nfmt(logged.nutrition.kcal)} سعرة.</p>`:''}
 <div class="controls"><button class="button sm" data-action="log-meal" data-slot="${slot}">${logged?'تعديل التسجيل':'سجل اللي أكلته'}</button><button class="button secondary sm" data-action="swap" data-slot="${slot}">تغيير الوجبة</button>${logged?`<button class="button danger sm" data-action="unlog" data-slot="${slot}">حذف التسجيل</button>`:''}</div></div>`:''}</article>`;
}
function activityChecklist(){const week=getWeek(),walkPlan=[15,20,25,30,35,40,40,45][week-1],schedule=[5,5,5,5,5,5,6,6][week-1];const exPlan=week<3?2:3;const d=state.day.tasks;
 return `<div class="card"><div class="card-head"><h2>خطوات يومك</h2><span class="pill dim">الأسبوع ${week} من 8</span></div>
 <div class="check-row"><input id="walkDone" type="checkbox" data-check="walkDone" ${d.walkDone?'checked':''}><label for="walkDone"><b>المشي ${walkPlan} دقيقة</b><div class="task-details">الهدف الأسبوعي ${schedule} أيام • أدخل المدة الفعلية من الحركة</div></label></div>
 <div class="row between" style="margin:8px 0"><label for="walkMinutes">الدقائق الفعلية</label><input id="walkMinutes" type="number" min="0" max="600" value="${d.walkMinutes||0}" style="width:95px;padding:8px;border:1px solid var(--line);border-radius:10px" aria-label="دقائق المشي"></div>
 <div class="check-row"><input id="waterDone" type="checkbox" data-check="water" ${d.water?'checked':''}><label for="waterDone"><b>اهتم بالسوائل خلال اليوم</b><div class="task-details">حسب عطشك والجو والنشاط، من غير إجبار على رقم ثابت</div></label></div>
 <div class="check-row"><input id="daylightDone" type="checkbox" data-check="daylight" ${d.daylight?'checked':''}><label for="daylightDone"><b>اتعرض لضوء النهار</b><div class="task-details">قريب من موعد الصحيان إن أمكن</div></label></div>
 <div class="row between" style="margin-top:16px"><b>نمت كام ساعة؟</b><input id="sleepHours" type="number" min="0" max="18" step="0.5" value="${d.sleepHours??''}" placeholder="مثلاً 8" style="width:105px;padding:9px;border:1px solid var(--line);border-radius:11px"></div>
 <div class="muted-line">النوم المرن متسجل حسب يومك. الأهم انتظام نسبي و7–9 ساعات للبالغين.</div><button class="button secondary full sm" data-view="activity">تفاصيل تمارين البيت</button></div>`;
}
function getWeek(){const start=state.settings.startDate||state.date;return clamp(Math.floor((Date.parse(state.date+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000/7)+1,1,8)}
function renderToday(){return `${sectionTitle(dateLabel(state.date),'خطتك النهاردة',`<div class="date-control"><label class="date-picker-label" for="dayPicker"><span aria-hidden="true">▦</span><span>اختار اليوم</span></label><input type="date" id="dayPicker" aria-label="اختار اليوم من التقويم" value="${state.date}"></div>`)}
 <div class="today-flow">
 ${nutritionCard()}
 <section class="today-meals"><div class="section-label"><h2>خطة الوجبات</h2><button class="button secondary sm" data-action="regen">↻ خطة مختلفة</button></div>${slots.map(renderMeal).join('')}
 <p class="small-note">الوجبات المتسجلة بالفعل مش هتتغيّر لما تجدّد الخطة. السعرات الفعلية بتتحسب من اللي سجلته بس.</p>
 <div class="controls"><button class="button secondary" data-action="quickadd">+ سجل أكلة إضافية</button><button class="button outline" data-view="meals">+ كوّن وجبة</button></div>
 ${state.day.manual?.length?`<div class="card"><h3>إضافاتك اليوم</h3>${state.day.manual.map(x=>`<div class="row between" style="padding:8px 0"><span>${esc(x.name)} • ${nfmt(x.grams)} جم</span><button class="button danger sm" data-action="remove-manual" data-id="${esc(x.id)}">حذف</button></div>`).join('')}</div>`:''}
 </section>
 <section class="today-activity"><div class="section-label"><h2>المشي والحركة</h2></div>${activityChecklist()}</section>
 <div class="tip">للتوضيح: أرقام التغذية تقريبية، والمشي لا يضيف سعرات تلقائيًا إلى الميزانية.</div>
 </div>`}
function renderRecipes(){const f=state.filter;const list=state.data.meals.filter(m=>f==='all'||m.category===f);
 return `${sectionTitle('مكتبة الوصفات','اختياراتك الغذائية')}<div class="tip">وجباتك الأساسية والوجبات اللي بتكوّنها بنفسك، من غير سمك أو طماطم. القيم مبنية على تقديرات لكل 100 جم وليست حقائق معملية. راجع المقادير والملصقات قبل الاعتماد عليها.</div><button class="button create-recipe-trigger" data-action="create-recipe">+ كوّن وجبة جديدة من المكونات</button><div class="filter-bar">${[['all','الكل'],...slots.map(s=>[s,slotAr[s]])].map(([id,l])=>`<button data-action="filter" data-id="${id}" class="button ${f===id?'':'soft'} sm">${l}</button>`).join('')}</div>
 <div class="list-grid">${list.map(m=>{const n=nutritionForMeal(m,state.data.foods);return `<div class="recipe"><div class="row between"><div><span class="pill dim">${slotAr[m.category]}${m.isCustom?' • من تصميمك':''}</span><h3 style="margin-top:7px">${esc(m.nameAr)}</h3></div><strong style="color:var(--green)">${nfmt(n.kcal)} س</strong></div><div class="recipe-data"><span>${nfmt(n.protein)} جم بروتين</span><span>${nfmt(n.carbs)} جم كارب</span><span>${nfmt(n.fat)} جم دهون</span></div><div class="ingredients-preview">${m.ingredients.map(x=>esc(x.food)+' '+nfmt(x.quantity)+' جم').join(' • ')}</div><button class="button secondary full sm" data-action="recipe-info" data-id="${m.id}">تفاصيل المقادير</button></div>`}).join('')}</div>`}
const exerciseDefs=[['chair','قعدة ووقفة من كرسي','مجموعتان × 10 عدات'],['wall','ضغط على الحيطة','مجموعتان × 12 عدة'],['row','سحب رباط مقاومة أو حقيبة خفيفة','مجموعتان × 12 عدة'],['calf','رفع الكعبين','مجموعتان × 15 عدة'],['glute','Glute Bridge','مجموعتان × 12 عدة'],['bird','Bird Dog','مجموعتان × 8 لكل ناحية']];
function renderActivity(){const w=getWeek();const days=[5,5,5,5,5,5,6,6][w-1];const mins=[15,20,25,30,35,40,40,45][w-1];
 return `${sectionTitle('بدون جيم • تقدم تدريجي','حركتك كل يوم')}<div class="list-grid"><div class="card"><div class="card-head"><h2>خطة المشي</h2><span class="pill">الأسبوع ${w} / 8</span></div><div class="calorie-figure">${mins} <span>دقيقة / اليوم</span></div><p>امشي ${days} أيام هذا الأسبوع، ووزعها على فترات قصيرة لو ده أسهل.</p>${progressBar(Number(state.day.tasks.walkMinutes||0),mins)}<div class="row between" style="margin-top:15px"><label for="activityMinutes">دقائق مشي اليوم</label><input id="activityMinutes" type="number" min="0" max="600" value="${state.day.tasks.walkMinutes||0}" style="width:100px;padding:10px;border:1px solid var(--line);border-radius:12px"></div><button class="button ${state.day.tasks.walkDone?'secondary':''} full" style="margin-top:12px" data-action="complete-walk">${state.day.tasks.walkDone?'✓ تم تسجيل المشي':'تسجيل المشي ✓'}</button></div>
 <div class="card"><div class="card-head"><h2>جلسة مقاومة منزلية</h2><span class="pill dim">${w<=2?2:3} أيام أسبوعيًا</span></div>${exerciseDefs.map(([id,label,reps])=>`<div class="check-row"><input type="checkbox" id="ex-${id}" data-exercise="${id}" ${state.day.tasks.exercises?.[id]?'checked':''}><label for="ex-${id}"><b>${label}</b><div class="task-details">${reps}</div></label></div>`).join('')}<p class="small-note">بداية بإحماء خفيف 3–5 دقائق. توقف عند ألم شديد أو دوخة غير معتادة.</p></div></div>`}
function renderProgress(){const w=currentWeight(),goalWeight=state.settings.goalWeight;const start=106;const weightHistory=state.progress.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));const recent=weightHistory.slice(-7);const progressPct=clamp((start-w)/(start-goalWeight)*100);const actual=dailyTotals();
 return `${sectionTitle('اتجاهات على المدى الطويل','متابعة التقدم')}<div class="stack"><div class="card"><div class="card-head"><h2>هدف الوزن</h2><span class="pill">${nfmt(progressPct)}% من الرحلة</span></div><div class="calorie-figure">${nfmt(w,1)} <span>كجم حاليًا</span></div>${progressBar(progressPct,100)}<p class="muted-line">بداية الخطة 106 كجم ← الهدف الحالي ${nfmt(goalWeight)} كجم. الرقم اليومي مش مقياس نجاحك لوحده؛ تابع المتوسط الأسبوعي ومحيط الوسط.</p><div class="form-grid"><form id="weightForm"><label class="form-field">تسجيل وزن جديد (كجم)<input name="value" type="number" step="0.1" min="30" max="300" placeholder="مثلاً 105.5" required></label><button class="button full" type="submit">احفظ الوزن</button></form><form id="waistForm"><label class="form-field">محيط الوسط (سم)<input name="value" type="number" step="0.1" min="40" max="250" placeholder="مثلاً 118" required></label><button class="button secondary full" type="submit">احفظ القياس</button></form></div></div>
 <div class="card"><h2>آخر قياسات الوزن</h2>${recent.length?`<div class="weeks">${recent.map(x=>`<div class="week-bar"><i style="height:${clamp(20+(x.value-goalWeight)*2,8,98)}%"></i><small>${esc(x.date.slice(5))}</small></div>`).join('')}</div>${recent.map(x=>`<div class="row between" style="border-bottom:1px solid var(--line);padding:6px"><span>${esc(x.date)}</span><strong>${nfmt(x.value,1)} كجم</strong></div>`).join('')}`:'<div class="empty">لسه مفيش قياسات جديدة. سجل وزنك 3 مرات في الأسبوع لو مناسب ليك.</div>'}</div>
 <div class="card"><h2>ملخص النهاردة</h2><div class="stat-row"><div class="stat-tile"><strong>${nfmt(actual.kcal)}</strong><small>سعرة مسجلة</small></div><div class="stat-tile"><strong>${nfmt(actual.protein)}</strong><small>جم بروتين</small></div><div class="stat-tile"><strong>${nfmt(state.day.tasks.walkMinutes||0)}</strong><small>دقيقة مشي</small></div></div><p class="small-note">التطبيق لا يستطيع قياس الدهون الحشوية من الوزن أو السعرات؛ استخدم القياسات والتحاليل والمتابعة الطبية بجانب الأداة.</p></div></div>`}
function renderSettings(){const s=state.settings;return `${sectionTitle('إعدادات قابلة للتعديل','أهدافك وتفضيلاتك')}<div class="card"><form id="settingsForm"><div class="form-grid"><label class="form-field">الوزن الأساسي (كجم)<input name="weight" type="number" min="30" max="300" value="${s.weight}" required></label><label class="form-field">الطول (سم)<input name="height" type="number" min="100" max="230" value="${s.height}" required></label><label class="form-field">هدف الوزن (كجم)<input name="goalWeight" type="number" min="30" max="200" value="${s.goalWeight}" required></label><label class="form-field">بداية البرنامج<input name="startDate" type="date" value="${s.startDate||state.date}" required></label><label class="form-field">سعرات اليوم<input name="kcal" type="number" min="1200" max="5000" value="${s.goals.kcal}" required></label><label class="form-field">بروتين (جم)<input name="protein" type="number" min="30" max="300" value="${s.goals.protein}" required></label><label class="form-field">كربوهيدرات (جم)<input name="carbs" type="number" min="20" max="600" value="${s.goals.carbs}" required></label><label class="form-field">دهون (جم)<input name="fat" type="number" min="20" max="200" value="${s.goals.fat}" required></label></div><label class="form-field">الأطعمة المستبعدة (افصل بفاصلة)<input name="exclusions" value="${esc(s.exclusions.join('، '))}"></label><label class="form-field">موعد صحيان تقريبي (اختياري)<input name="wakeTime" type="time" value="${esc(s.wakeTime||'10:00')}"></label><button class="button full" type="submit">حفظ التغييرات</button></form><p class="small-note">لا تغيّر أهداف التغذية في حالة مرض كلوي أو مشاكل صحية خاصة دون مراجعة الطبيب. يوجد منع أساسي للطماطم والأسماك لا يمكن تعطيله بالتوليد الحالي.</p></div><div class="card"><h2>البيانات والخصوصية</h2><p class="small-note">${state.mode==='cloud'?'حسابك متصل بـFirebase، وتُحفظ سجلاتك الشخصية تحت معرّف المستخدم مع قواعد تمنع وصول مستخدم آخر.':'تعمل حاليًا في وضع تجربة محلية. بياناتك مخزنة في متصفح الجهاز فقط، ولا تتم مزامنتها مع أي سحابة.'}</p><div class="controls"><button class="button secondary" data-action="export">تصدير بيانات JSON</button><button class="button danger" data-action="clear-today">إعادة تعيين اليوم</button></div></div>`}
function render(){if(!state.ready||!state.data||!state.day)return;document.querySelectorAll('[data-view].nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.view===state.view));
 document.getElementById('cloudBadge').textContent=state.mode==='cloud'?'✓ Firebase متصل':'وضع محلي تجريبي';document.getElementById('cloudBadge').classList.toggle('live',state.mode==='cloud');document.getElementById('authBtn').textContent=state.uid?'✓':'◯';
 const views={today:renderToday,meals:renderRecipes,activity:renderActivity,progress:renderProgress,settings:renderSettings};root.innerHTML=views[state.view]();
}
function swapModal(slot){const curr=state.day.plan[slot]?.id;if(state.day.logged?.[slot]){toast('الوجبة متسجّلة بالفعل؛ احذف التسجيل الأول لو عايز تغيّرها');return}const choices=state.data.meals.filter(m=>m.category===slot&&isMealAllowed(m,state.settings.exclusions)).map(m=>{const n=nutritionForMeal(m,state.data.foods);return `<label class="check-row"><input type="radio" name="choose" value="${m.id}" ${m.id===curr?'checked':''}><span><b>${esc(m.nameAr)}</b><span class="task-details" style="display:block">${nfmt(n.kcal)} سعرة • ${nfmt(n.protein)} بروتين</span></span></label>`}).join('');openModal('تغيير '+slotAr[slot],`<p class="small-note">اختيار وجبة بيحاول يعيد موازنة الوجبات غير المسجلة في اليوم، والتسجيل الفعلي يفضل محفوظ.</p><form id="swapForm" data-slot="${slot}">${choices}<button class="button full" type="submit">اعتماد التغيير</button></form>`)}
function logModal(slot){const pm=state.day.plan[slot],m=mealById(pm.id),nut=mealNutrition(pm),existing=state.day.logged[slot];openModal('تسجيل '+slotAr[slot],`<form id="logForm" data-slot="${slot}"><p><b>${esc(m.nameAr)}</b> — ${nfmt(nut.kcal)} سعرة للخطة الكاملة</p><label class="form-field">قد إيه أكلت من المقادير المعروضة؟<select name="portion"><option value="1" ${existing?.portion===1?'selected':''}>100% — الكمية كاملة</option><option value="0.75" ${existing?.portion===.75?'selected':''}>75% — ثلاثة أرباع</option><option value="0.5" ${existing?.portion===.5?'selected':''}>50% — النصف</option><option value="0.25" ${existing?.portion===.25?'selected':''}>25% — الربع</option></select></label><p class="small-note">لو أكلت مكونات بنسب مختلفة، عدّل جراماتها في بطاقة الوجبة قبل التسجيل. التسجيل الجديد يستبدل القديم بدل جمعه مرتين.</p><button class="button full" type="submit">تأكيد اللي أكلته</button></form>`)}
function quickAddModal(){const options=Object.keys(state.data.foods).sort((a,b)=>a.localeCompare(b,'ar')).map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');openModal('إضافة طعام',`<form id="quickForm"><label class="form-field">اسم الطعام<select name="food" required>${options}</select></label><label class="form-field">الوزن الفعلي بالجرام<input type="number" name="grams" value="100" step="1" min="1" max="2000" required></label><p class="warnbox">قيم المكونات هنا تقديرية. راجع عبوة المنتج لو متوفرة.</p><button class="button full" type="submit">سجّل الإضافة</button></form>`)}
function customFoodRow(food='',grams=100){const opts=Object.keys(state.data.foods).sort((a,b)=>a.localeCompare(b,'ar')).map(k=>`<option value="${esc(k)}" ${food===k?'selected':''}>${esc(k)}</option>`).join('');return `<div class="custom-food-row"><label>المكوّن<select name="food" required>${opts}</select></label><label>الجرامات<input type="number" name="grams" min="1" max="2000" step="1" value="${grams}" required></label><button type="button" data-action="remove-custom-row" aria-label="حذف المكوّن">×</button></div>`}
function createRecipeModal(){openModal('كوّن وجبتك',`<form id="customRecipeForm"><p class="small-note">اختار المكونات من مكتبة الأغذية، واكتب وزن كل واحدة بالجرام. هنحسب السعرات والبروتين والكربوهيدرات والدهون فورًا.</p>
 <label class="form-field">اسم الوجبة<input name="nameAr" maxlength="80" minlength="3" placeholder="مثلاً فراخ وبطاطس من اختياري" required></label>
 <label class="form-field">نوع الوجبة<select name="category">${slots.map(s=>`<option value="${s}">${slotAr[s]}</option>`).join('')}</select></label>
 <div id="customIngredients">${customFoodRow('',150)}${customFoodRow('',100)}</div>
 <button class="button secondary full" type="button" data-action="add-custom-row">+ إضافة مكوّن</button>
 <div id="customNutritionPreview" class="custom-preview" aria-live="polite"></div>
 <button type="submit" class="button full">احفظ الوجبة في مكتبتي</button>
 </form>`);updateCustomNutritionPreview();}
function readCustomDraft(form){const f=new FormData(form);return {nameAr:String(f.get('nameAr')||''),category:String(f.get('category')||''),ingredients:f.getAll('food').map((food,i)=>({food,quantity:Number(f.getAll('grams')[i])}))}}
function updateCustomNutritionPreview(){const form=document.getElementById('customRecipeForm'),target=document.getElementById('customNutritionPreview');if(!form||!target)return;try{
 const draft=readCustomDraft(form),nutrition=nutrientsForItems(draft.ingredients,state.data.foods),budget=suggestedMealBudget(state.settings.goals,draft.category),result=evaluateNutrition(nutrition,budget);
 target.innerHTML=`<strong>مؤشرات وجبتك</strong><div class="custom-macro-grid">${[['kcal','سعرات','سعرة'],['protein','بروتين','جم'],['carbs','كربوهيدرات','جم'],['fat','دهون','جم']].map(([k,l,u])=>`<div class="custom-indicator ${result.over.includes(k)?'exceeded':''}"><span>${l}</span><b>${nfmt(nutrition[k])} / ${nfmt(budget[k])} ${u}</b>${progressBar(nutrition[k],budget[k],'tiny-track')}</div>`).join('')}</div>
 <p class="${result.significantlyOver.length?'inline-warning':'small-note'}">${result.significantlyOver.length?'تنبيه: الوجبة أعلى من الميزانية المقترحة بدرجة كبيرة. تقدر تحفظها بعد مراجعة الكميات.':result.over.length?'فيه عناصر أعلى من الميزانية المقترحة للوجبة، راجعها حسب احتياج يومك.':'الوجبة ضمن الميزانيات التقريبية المقترحة.'}</p><small>دي حدود إرشادية للوجبة، مش سقف طبي ثابت.</small>`;
 }catch(e){target.textContent='راجع المكونات والجرامات لإظهار المؤشرات.'}}
async function saveCustomRecipe(form){const draft=readCustomDraft(form),id='custom-'+crypto.randomUUID(),meal=makeCustomMeal({...draft,id},state.data.foods,state.settings.exclusions);const previous=[...state.customMeals];state.customMeals.push(meal);try{await saveCustomMeals();mergeCustomMeals();closeModal();render();toast('اتحفظت الوجبة في مكتبتك، تقدر تختارها في خطة اليوم')}catch(e){state.customMeals=previous;throw e}}
function recipeModal(id){const m=mealById(id);if(!m){toast('الوجبة مش متاحة حاليًا');return}const nut=nutritionForMeal(m,state.data.foods);openModal(m.nameAr,`<div class="row between"><strong>${nfmt(nut.kcal)} سعرة</strong><span class="pill">${nfmt(nut.protein)} جم بروتين</span></div>${m.ingredients.map(i=>`<div class="ingredient"><div><b>${esc(i.food)}</b><small>${esc(i.householdEquivalent)}</small></div><strong>${nfmt(i.quantity)} جم</strong></div>`).join('')}<p class="small-note">القيم والمقادير المنزلية تقريبية وليست قياسات مؤكدة.</p><button class="button full" data-action="close-modal">تمام</button>`)}
function downloadJson(){const data={settings:state.settings,progress:state.progress,currentDay:state.day,exportedAt:new Date().toISOString(),note:'Export includes health-related personal information; keep it private.'};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='daily-balance-export-'+state.date+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function selectDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return toast('اختار تاريخ صحيح');state.date=value;await loadAll();window.scrollTo({top:0,behavior:'smooth'})}
async function resetDay(){if(!confirm('هتمسح تسجيلات اليوم الحالي وخطته، وتعمل خطة جديدة. متأكد؟'))return;const day=newDay(state.date);await saveDay(state.date,day);state.day=day;render();toast('اتعمل يوم جديد')}
async function regen(){const locked={};for(const slot of slots)if(state.day.logged[slot])locked[slot]=state.day.plan[slot];const regens=(state.day.regens||0)+1;const r=generatePlan({meals:state.data.meals,foodDb:state.data.foods,goals:state.settings.goals,seed:state.date+'-'+regens,locked,previous:slots.map(s=>state.day.plan[s]?.id),exclusions:state.settings.exclusions});const next={...state.day,plan:r.plan,regens};await saveDay(state.date,next);state.day=next;render();toast(r.exact?'الخطة اتجددت واتحفظت':'خطة جديدة محفوظة؛ راجع فرق الماكروز')}
async function setSwap(slot,id){
 if(!slots.includes(slot)||typeof id!=='string')throw Error('اختيار غير صحيح');
 const selected=mealById(id);
 if(!selected||selected.category!==slot||!isMealAllowed(selected,state.settings.exclusions))throw Error('الوجبة مش متاحة بالنظام الحالي');
 if(state.day.logged?.[slot]){toast('لا يمكن تغيير وجبة مسجّلة؛ احذف تسجيلها الأول');return}
 const locked={};for(const s of slots){if(s===slot)locked[s]={id,amounts:{}};else if(state.day.logged[s])locked[s]=state.day.plan[s];}
 const result=generatePlan({meals:state.data.meals,foodDb:state.data.foods,goals:state.settings.goals,seed:state.date+'-swap-'+id+'-'+Date.now(),locked,exclusions:state.settings.exclusions});
 const next={...state.day,plan:result.plan},date=state.date;
 await saveDay(date,next);state.day=next;state.openSlot=slot;closeModal();render();toast('تم حفظ التغيير على '+(state.mode==='cloud'?'Firebase':'الجهاز'));
}
async function logMeal(slot,portion){const pm=state.day.plan[slot],m=mealById(pm.id);const items=mealItems(m,pm.amounts).map(i=>({...i,quantity:Math.round(i.quantity*portion*10)/10}));const log={name:m.nameAr,mealId:m.id,portion,items,nutrition:nutrientsForItems(items,state.data.foods),loggedTime:new Date().toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'}),loggedAt:Date.now()};await commitDayMutation(next=>{next.logged[slot]=log});closeModal();toast('اتسجلت الكمية اللي أكلتها واتحفظت')}
async function handleAction(btn){const a=btn.dataset.action,slot=btn.dataset.slot;
 if(a==='toggle-meal'){state.openSlot=state.openSlot===slot?'':slot;render()}if(a==='regen')await regen();if(a==='swap')swapModal(slot);if(a==='log-meal')logModal(slot);if(a==='unlog'){await commitDayMutation(next=>{delete next.logged[slot]});toast('تم حذف التسجيل')}
 if(a==='quickadd')quickAddModal();if(a==='create-recipe')createRecipeModal();if(a==='add-custom-row'){document.getElementById('customIngredients')?.insertAdjacentHTML('beforeend',customFoodRow('',100));updateCustomNutritionPreview()}if(a==='remove-custom-row'){if(document.querySelectorAll('.custom-food-row').length<=1)return toast('الوجبة لازم تحتوي على مكوّن واحد على الأقل');btn.closest('.custom-food-row')?.remove();updateCustomNutritionPreview()};if(a==='filter'){state.filter=btn.dataset.id;render()}if(a==='recipe-info')recipeModal(btn.dataset.id);if(a==='remove-manual'){await commitDayMutation(next=>{next.manual=next.manual.filter(x=>x.id!==btn.dataset.id)})}
 if(a==='complete-walk'){await commitDayMutation(next=>{next.tasks.walkDone=!next.tasks.walkDone})}if(a==='export')downloadJson();if(a==='clear-today')await resetDay();if(a==='close-modal')closeModal();if(a==='logout'&&state.firebase){await state.firebase.amod.signOut(state.firebase.auth);closeModal();toast('خرجت من حسابك')}}
async function onSubmit(e){const f=e.target;if(!f.id||!['swapForm','logForm','quickForm','weightForm','waistForm','settingsForm','customRecipeForm'].includes(f.id))return;e.preventDefault();const fd=new FormData(f);
 if(f.id==='swapForm')return setSwap(f.dataset.slot,fd.get('choose'));if(f.id==='customRecipeForm'){try{return await saveCustomRecipe(f)}catch(err){toast(err.message||'تعذر حفظ الوجبة');throw err}}
 if(f.id==='logForm')return logMeal(f.dataset.slot,Number(fd.get('portion')));
 if(f.id==='quickForm'){const food=fd.get('food'),grams=Number(fd.get('grams'));if(!state.data.foods[food]||!Number.isFinite(grams)||grams<=0||grams>2000)return toast('جرامات غير صحيحة');const nutrition=nutrientsForItems([{food,quantity:grams}],state.data.foods);await commitDayMutation(next=>{next.manual.push({id:crypto.randomUUID(),name:food,grams,nutrition,createdAt:Date.now()})});closeModal();return toast('تمت الإضافة للسعرات الفعلية')}
 if(f.id==='weightForm'||f.id==='waistForm'){const val=Number(fd.get('value'));if(!Number.isFinite(val))return;const key=f.id==='weightForm'?'weights':'waists';const arr=state.progress[key];const idx=arr.findIndex(x=>x.date===state.date);const ent={date:state.date,value:val};if(idx>=0)arr[idx]=ent;else arr.push(ent);await saveProgress();render();return toast('اتحفظ القياس')}
 if(f.id==='settingsForm'){const names=['weight','height','goalWeight'];for(const k of names)state.settings[k]=Number(fd.get(k));for(const k of ['kcal','protein','carbs','fat'])state.settings.goals[k]=Number(fd.get(k));state.settings.startDate=String(fd.get('startDate'));state.settings.wakeTime=String(fd.get('wakeTime'));state.settings.exclusions=String(fd.get('exclusions')||'').split(/[,،]/).map(x=>x.trim()).filter(Boolean);await saveSettings();render();return toast('تم تحديث الأهداف. إعادة توليد اليوم اختيارية.')}
}
async function onChange(e){const t=e.target;if(t.id==='dayPicker'){selectDate(t.value).catch(err=>{console.error(err);toast('تعذر فتح اليوم')});return}if(t.closest('#customRecipeForm')){updateCustomNutritionPreview();return}
 if(t.matches('[data-ingredient]')){const slot=t.dataset.slot,idx=t.dataset.ingredient,v=Number(t.value);if(state.day.logged?.[slot]){toast('عدل التسجيل أو امسحه قبل تغيير جرامات الوجبة');render();return}if(v>=0&&v<=1500){await commitDayMutation(next=>{const pm=next.plan[slot];pm.amounts=pm.amounts||{};pm.amounts[idx]=v})}else toast('راجع قيمة الجرامات');}
 if(t.matches('[data-check]')){await commitDayMutation(next=>{next.tasks[t.dataset.check]=t.checked})}
 if(t.matches('[data-exercise]')){await commitDayMutation(next=>{next.tasks.exercises[t.dataset.exercise]=t.checked})}
 if(t.id==='walkMinutes'||t.id==='activityMinutes'){await commitDayMutation(next=>{next.tasks.walkMinutes=clamp(Number(t.value),0,600)})}
 if(t.id==='sleepHours'){const v=t.value===''?null:Number(t.value);await commitDayMutation(next=>{next.tasks.sleepHours=v})}
}
function setupEvents(){document.addEventListener('click',async e=>{if(e.target===modal)closeModal();const btn=e.target.closest('[data-view], [data-action]');if(!btn)return;if(btn.dataset.view){state.view=btn.dataset.view;render();window.scrollTo(0,0)}else if(btn.dataset.action){try{await handleAction(btn)}catch(err){console.error(err);toast('حصل خطأ أثناء التحديث')}}});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Enter'&&e.target.matches('.meal-summary')){e.preventDefault();e.target.click()}});document.addEventListener('submit',e=>{onSubmit(e).catch(err=>{console.error(err);toast('لم يتم حفظ الإجراء')})});document.addEventListener('change',e=>{onChange(e).catch(err=>{console.error(err);toast('الحفظ فشل، لم نغيّر بياناتك')})});document.addEventListener('input',e=>{if(e.target.closest('#customRecipeForm'))updateCustomNutritionPreview()});document.getElementById('closeModal').addEventListener('click',closeModal);document.getElementById('authBtn').addEventListener('click',login);}
async function start(){try{const response=await fetch('./data.json');if(!response.ok)throw Error('Cannot read meals');state.data=await response.json();setupEvents();await initFirebase();if(!state.settings)await loadAll();if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});window.addEventListener('online',()=>toast('رجع الاتصال بالإنترنت'))}catch(err){console.error(err);root.innerHTML='<div class="card"><h2>حصل خطأ في تحميل التطبيق</h2><p>شغّل المشروع من سيرفر محلي بدل فتح ملف HTML مباشرة.</p></div>'}}
start();