'use strict';
// User-approved changes are in-memory for this run, never a reset of spent usage.
function createTaskBudget(initial=2) {
 let ceiling=Number(initial),warnedAt=null;
 if(!Number.isFinite(ceiling)||ceiling<=0||ceiling>100)throw Error('Invalid task budget.');
 return {
  get ceiling(){return ceiling;},
  remaining(spent){if(!Number.isFinite(spent)||spent<0)throw Error('Unknown task usage.');return Math.max(0,ceiling-spent);},
  async beforeStep(spent,choose,guard=async()=>{}){
   this.remaining(spent);await guard();
   if(spent>=ceiling*0.8&&warnedAt!==ceiling){
    warnedAt=ceiling;const add=await choose({spent,ceiling,additions:[2,5,10].filter(n=>ceiling+n<=100)});await guard();
    if([2,5,10].includes(add)&&ceiling+add<=100)ceiling+=add;
   }
   if(this.remaining(spent)<=0)throw Object.assign(Error('Agent budget exhausted'),{code:'agent_budget',spent,budget:ceiling});
   return ceiling;
  }
 };
}
module.exports={createTaskBudget};
