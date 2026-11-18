import type { createGuestSimulation, Guest } from './simulation';
import type { createResort } from '../lifts/resort';
import { skillNames } from './routing';

export function bindGuestPanel(root:HTMLElement, actions:{find():void;close():void;follow():void;pace(n:number):void}) {
  const el=(id:string)=>root.querySelector<HTMLElement>('#'+id)!;
  const panel=el('guest-panel'), toggle=el('guest-toggle');
  const info=el('guest-info');
  const pace=el('guest-pace') as HTMLSelectElement;
  toggle.onclick=()=>{
    panel.hidden=!panel.hidden;
    toggle.setAttribute('aria-expanded',String(!panel.hidden));
  };
  el('guest-close').onclick=actions.close;
  el('guest-find').onclick=actions.find;
  el('guest-follow').onclick=actions.follow;
  pace.onchange=()=>actions.pace(Number(pace.value));
  return {
    show(){
      panel.hidden=false;
      toggle.setAttribute('aria-expanded','true');
    },
    update(sim:ReturnType<typeof createGuestSimulation>,resort:ReturnType<typeof createResort>,g?:Guest,following=false){
      const data=sim.stats();
      el('guest-population').textContent=String(data.guests);
      el('guest-waiting').textContent=String(data.waiting);
      el('guest-riding').textContent=String(data.riding);
      el('guest-skiing').textContent=String(data.skiing);
      el('guest-runs').textContent=String(data.runs);
      el('guest-circuits').textContent=String(data.circuits);
      el('guest-empty').hidden=!!data.circuits;
      if (!data.circuits) el('guest-empty').textContent = data.circuitHint;
      (el('guest-find') as HTMLButtonElement).disabled=!data.guests;
      info.hidden=!g;
      if(!g)return;
      el('guest-name').textContent='Guest '+String(g.id).padStart(2,'0');
      el('guest-activity').textContent=g.activity;
      const onLift=g.activity==='Riding'||g.activity==='Boarding';
      el('guest-outlook').textContent=onLift && !resort.lifts.get(g.circuit.lift.id)?.running
        ? 'Waiting for lift to restart' : g.activity==='Resting' ? 'Waiting for a safe route' : '';
      el('guest-outlook').hidden=!el('guest-outlook').textContent;
      el('guest-skill').textContent=skillNames[g.skill];
      el('guest-lift').textContent=resort.lifts.get(g.circuit.lift.id)?.name??'—';
      el('guest-trail').textContent=resort.trails.get(g.circuit.trails[g.leg]?.id)?.name??'—';
      el('guest-own-runs').textContent=String(g.runs);
      el('guest-satisfaction').textContent=Math.round(g.satisfaction)+'%';
      el('guest-ticket').textContent=g.ticket === undefined ? '—' : '$'+g.ticket+' paid';
      el('guest-experience').textContent=g.experience;
      el('guest-follow').textContent=following?'Exit follow':'Follow Guest';
    }
  };
}
