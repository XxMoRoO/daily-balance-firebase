import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generatePlan,nutritionForMeal,nutrientsForItems,calculateLogged,isMealAllowed,dayKey} from '../public/planner.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
test('meal computation scales ingredients correctly',()=>{
 const item=data.meals[0];const v=nutritionForMeal(item,data.foods);const o=nutritionForMeal(item,data.foods,{0:item.ingredients[0].quantity*2});assert.ok(o.kcal>v.kcal);assert.ok(o.protein>v.protein);
});
test('daily planner respects all slots, exclusions and deterministic seed',()=>{
 const opts={meals:data.meals,foodDb:data.foods,seed:'2026-11-13'};
 const a=generatePlan(opts),b=generatePlan(opts);assert.deepEqual(a,b);
 for(const s of ['breakfast','lunch','snack','dinner'])assert.ok(a.plan[s].id);assert.ok(a.nutrition.kcal>1500);
});
test('locking a meal keeps it during regeneration',()=>{const p=generatePlan({meals:data.meals,foodDb:data.foods,locked:{lunch:{id:'L03',amounts:{}}}});assert.equal(p.plan.lunch.id,'L03');});
test('forbidden recipes filtered',()=>{assert.equal(isMealAllowed({ingredients:[{food:'طماطم'}]}),false);assert.equal(isMealAllowed({ingredients:[{food:'فراخ مطهية'}]}),true);});
test('tracking actual consumption does not double-count planned food',()=>{const v=calculateLogged({breakfast:{nutrition:{kcal:350,protein:30}}},[{nutrition:{kcal:100,protein:5}}]);assert.equal(v.kcal,450);assert.equal(v.protein,35);});
test('Cairo dates use local clock regardless of UTC',()=>{const v=dayKey(new Date('2026-11-13T23:10:00Z'));assert.equal(v,'2026-11-14');});