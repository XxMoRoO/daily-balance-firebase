export const slots = ['breakfast', 'lunch', 'snack', 'dinner'];
export const slotAr = {breakfast:'الفطار',lunch:'الغداء',snack:'السناك',dinner:'العشاء'};
export const defaultGoals = {kcal:2000, protein:140, carbs:200, fat:71};
const excluded = /طماطم|صلصة\s*طماطم|معجون\s*طماطم|سمك|تونة|سلمون|سردين|جمبري|روبيان|fish|seafood|tomato/i;
export function isMealAllowed(meal, exclusions = []) {
  const extra=exclusions.map(x=>String(x||'').trim()).filter(Boolean);
  return meal.ingredients.every(i=> !excluded.test(i.food) && !extra.some(e=>i.food.includes(e)));
}
export function nutrientsForItems(items,foodDb) {
  const total={kcal:0,protein:0,carbs:0,fat:0,fiber:0};
  items.forEach(i=>{const food=foodDb[i.food];if(!food)throw new Error('Nutrition missing: '+i.food);
    for(const k of Object.keys(total)) total[k]+=(Number(food[k])||0)*(Number(i.quantity)||0)/100;});
  return Object.fromEntries(Object.entries(total).map(([k,v])=>[k,Math.round(v*10)/10]));
}
export function mealItems(meal,amounts={}) {return meal.ingredients.map((i,n)=>({...i,quantity:Number(amounts[n] ?? i.quantity)}));}
export function nutritionForMeal(meal,db,amounts={}){return nutrientsForItems(mealItems(meal,amounts),db);}
export function addNutrition(...x){let t={kcal:0,protein:0,carbs:0,fat:0,fiber:0};for(const n of x.filter(Boolean)){for(const key of Object.keys(t))t[key]+=Number(n[key])||0;}return Object.fromEntries(Object.entries(t).map(([k,v])=>[k,Math.round(v*10)/10]));}
export function nutritionForPlan(plan,meals,db){return addNutrition(...slots.map(s=>{const item=plan[s];const meal=meals.find(m=>m.id===item?.id);return meal?nutritionForMeal(meal,db,item.amounts):null;}));}
export function calculateLogged(logged=[],manual=[]){return addNutrition(...[...Object.values(logged||{}),...(manual||[])].map(l=>l?.nutrition));}
export function dayKey(date=new Date(),timezone='Africa/Cairo'){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);let p={};parts.forEach(x=>p[x.type]=x.value);return `${p.year}-${p.month}-${p.day}`;}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return h>>>0;}
function jitter(seed,salt){return hash(String(seed)+':'+salt)/4294967295;}
export function scorePlan(plan,meals,foodDb,goals=defaultGoals,previous=[]){const n=nutritionForPlan(plan,meals,foodDb); const s=Math.abs(n.kcal-goals.kcal)/80 + Math.abs(n.protein-goals.protein)/25 + Math.abs(n.fat-goals.fat)/22*0.6 + Math.abs(n.carbs-goals.carbs)/55*0.3 + Math.max(0,25-n.fiber)/18;
let repeats=0;for(const id of slots.map(k=>plan[k]?.id)){if(previous.includes(id))repeats+=0.25;}return s+repeats;
}
export function generatePlan({meals,foodDb,goals=defaultGoals,seed='today',previous=[],locked={},exclusions=[]}) {
  const candidates={};
  for(const s of slots){ candidates[s]=meals.filter(m=>m.category===s&&isMealAllowed(m,exclusions)&&(!locked[s]||locked[s].id===m.id)); if(!candidates[s].length)throw new Error('No allowed meals in '+s); }
  const results=[];
  for(const a of candidates.breakfast)for(const b of candidates.lunch)for(const c of candidates.snack)for(const d of candidates.dinner){
    const source={breakfast:a.id,lunch:b.id,snack:c.id,dinner:d.id};const p={}; for(const s of slots)p[s]=(locked[s]?{...locked[s]}:{id:source[s],amounts:{}});
    const n=nutritionForPlan(p,meals,foodDb);
    // Kcal and protein control is soft when the library cannot hit the exact target.
    const cost=scorePlan(p,meals,foodDb,goals,previous);
    results.push({p,n,cost,tie:jitter(seed,Object.values(source).join('-'))});
  }
  results.sort((a,b)=>(a.cost+0.35*a.tie)-(b.cost+0.35*b.tie));
  const top=results.slice(0,Math.min(12,results.length));
  const chosen=top[Math.floor(jitter(seed,'pick')*top.length)];
  return {plan:chosen.p,nutrition:chosen.n,delta:{kcal:Math.round(chosen.n.kcal-goals.kcal),protein:Math.round(chosen.n.protein-goals.protein)},exact:Math.abs(chosen.n.kcal-goals.kcal)<=100 && chosen.n.protein>=130};
}