import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isMealAllowed,generatePlan,nutritionForMeal,makeCustomMeal,suggestedMealBudget,evaluateNutrition} from '../public/planner.mjs';
const db=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
const exclusions=['طماطم','سمك','مأكولات بحرية'];
test('regression: meat and oven potatoes L02 is allowed because salad explicitly has no tomato',()=>{
  const meal=db.meals.find(m=>m.id==='L02');assert.ok(meal);assert.equal(isMealAllowed(meal,exclusions),true);
  const generated=generatePlan({meals:db.meals,foodDb:db.foods,locked:{lunch:{id:'L02',amounts:{}}},exclusions,seed:'regression'});
  assert.equal(generated.plan.lunch.id,'L02');assert.ok(generated.nutrition.kcal>0);
});
test('actual tomato is still forbidden',()=>{
  const meal=db.meals.find(m=>m.id==='L02');
  assert.equal(isMealAllowed({...meal,ingredients:[{food:'طماطم',quantity:50}]},exclusions),false);
});
test('a saved custom meal can be used to generate plans without arbitrary rejection',()=>{
  const newMeal=makeCustomMeal({id:'custom-test',nameAr:'فراخ ورز بطريقتي',category:'lunch',ingredients:[{food:'فراخ مشوية',quantity:180},{food:'رز مطبوخ',quantity:200}]},db.foods,exclusions);
  assert.equal(newMeal.isCustom,true);assert.ok(nutritionForMeal(newMeal,db.foods).protein>20);
  const result=generatePlan({meals:[...db.meals,newMeal],foodDb:db.foods,locked:{lunch:{id:'custom-test',amounts:{}}},exclusions,seed:'custom'});
  assert.equal(result.plan.lunch.id,'custom-test');
});
test('creator rejects forbidden food and invalid quantities',()=>{
 assert.throws(()=>makeCustomMeal({id:'c',nameAr:'وجبة طماطم',category:'dinner',ingredients:[{food:'طماطم',quantity:70}]},db.foods,exclusions));
 assert.throws(()=>makeCustomMeal({id:'c',nameAr:'وجبة صحية',category:'dinner',ingredients:[{food:'رز مطبوخ',quantity:0}]},db.foods,exclusions));
});
test('indicators show meaningful percent and overshoots',()=>{
 const limit=suggestedMealBudget({kcal:2000,protein:140,carbs:200,fat:71},'lunch');
 assert.equal(limit.kcal,700);
 const r=evaluateNutrition({kcal:910,protein:55,carbs:100,fat:35},limit);
 assert.equal(r.ratio.kcal,130);assert.ok(r.over.includes('kcal'));
});