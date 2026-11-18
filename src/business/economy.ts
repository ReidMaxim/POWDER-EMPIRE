import type { GroundPoint, LiftAlignment } from '../lifts/alignment.ts';

export const economy = {
  minPrice: 10, maxPrice: 150, defaultPrice: 45, openingHour: 9, closingHour: 16,
  clockRate: 60, entranceCost: 3500, minDemand: .017, maxDemand: .32,
  baseHourly: 14, hourlyPerMeter: .063, hourlyPerChair: .58,
  guestCap: {low:20, standard:24, high:32}, startingRating: 75, ratingWeight: .28,
  maxQueue: 12, maxRunsPerVisit: 2, premiumThreshold: 85, premiumSensitivity: 65, goodQueueSeconds: 24, queuePenaltyRate: .18, blockedPenaltyRate: .35,
  longApproachSeconds: 35, longApproachPenalty: 4, runReward: 5, costlyTicketPenalty: .32, initialSatisfaction: 76, seatCapacityReserve: .55
} as const;

export type DayState = 'ready' | 'open' | 'closed' | 'ending' | 'report';
export interface Ledger {
  admissions: number; revenue: number; expenses: number; runs: number; ratings: number; departed: number;
}
export interface BusinessSave {
  entrance?: GroundPoint; price: number; day: number; time: number; phase: DayState;
  ledger: Ledger; reputation: number; expenseFraction: number; arrivalCredit: number; cashHold: boolean;
  endingCash?: number;
}
export const dayLength = (economy.closingHour-economy.openingHour)*3600;
const emptyLedger = (): Ledger => ({admissions:0,revenue:0,expenses:0,runs:0,ratings:0,departed:0});
export function freshBusiness(): BusinessSave {
  return {price:economy.defaultPrice,day:1,time:0,phase:'ready',ledger:emptyLedger(),
    reputation:economy.startingRating,expenseFraction:0,arrivalCredit:1,cashHold:false};
}

const natural = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
const fraction = (n: unknown, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
export function readBusiness(value: unknown): BusinessSave {
  if (!value || typeof value !== 'object') return freshBusiness();
  const raw = value as Partial<BusinessSave>, clean = freshBusiness(), ledger = raw.ledger;
  if (natural(raw.price,economy.maxPrice) && raw.price >= economy.minPrice) clean.price = raw.price;
  if (natural(raw.day) && raw.day > 0) clean.day = raw.day;
  if (fraction(raw.time,dayLength)) clean.time = raw.time;
  if (raw.phase && ['ready','open','closed','ending','report'].includes(raw.phase)) clean.phase = raw.phase;
  if (ledger && natural(ledger.admissions) && natural(ledger.revenue) && natural(ledger.expenses) &&
    natural(ledger.runs) && natural(ledger.departed,ledger.admissions) && fraction(ledger.ratings,100*ledger.admissions)) {
    clean.ledger = {...ledger};
  }
  if (fraction(raw.reputation,100)) clean.reputation = raw.reputation;
  if (fraction(raw.expenseFraction,1) && raw.expenseFraction < 1) clean.expenseFraction = raw.expenseFraction;
  if (fraction(raw.arrivalCredit,1)) clean.arrivalCredit = raw.arrivalCredit;
  if (raw.entrance && Number.isFinite(raw.entrance.x) && Number.isFinite(raw.entrance.z)) {
    clean.entrance = {x:raw.entrance.x,z:raw.entrance.z};
  }
  if (!clean.entrance && clean.phase === 'open') clean.phase = 'closed';
  clean.cashHold = raw.cashHold === true;
  if (natural(raw.endingCash)) clean.endingCash = raw.endingCash;
  return clean;
}

export const hourlyCost = (lift: LiftAlignment) =>
  Math.round(economy.baseHourly + lift.uphillLength*economy.hourlyPerMeter + lift.chairCount*economy.hourlyPerChair);

export const clampRating = (rating: number) => Math.max(0,Math.min(100,rating));
export const valuePrice = (circuits: number, abilityLevels: number) => 35 + Math.min(10,circuits)*4 + abilityLevels*6;
export function demand(price: number, circuits: number, abilityLevels: number, reputation: number, seatsPerSecond: number) {
  if (!circuits || !seatsPerSecond) return 0;
  const appeal = Math.min(economy.maxDemand,economy.minDemand + Math.sqrt(circuits)*.023 + abilityLevels*.015);
  const priceFactor = Math.exp(-(price-economy.defaultPrice)/valuePrice(circuits,abilityLevels) -
    Math.max(0,price-economy.premiumThreshold)/economy.premiumSensitivity);
  return Math.min(appeal * priceFactor * (.45 + reputation/100*.65), seatsPerSecond*economy.seatCapacityReserve);
}

export function createBusiness(save: BusinessSave, wallet: { balance(): number; change(amount: number): void }) {
  const data = readBusiness(save);
  let revision = 0;
  const mark = () => { revision++; };
  return {
    data,
    get revision() { return revision; },
    snapshot: (): BusinessSave => ({...data,ledger:{...data.ledger},...(data.entrance ? {entrance:{...data.entrance}} : {})}),
    setPrice(value: number) {
      if (!Number.isInteger(value) || value < economy.minPrice || value > economy.maxPrice) return false;
      data.price = value; mark(); return true;
    },
    open(hasAccess: boolean) {
      if (!hasAccess || !data.entrance || data.phase === 'ending' || data.phase === 'report' || data.time >= dayLength ||
        wallet.balance() < 1) return false;
      data.phase = 'open'; data.cashHold = false; mark(); return true;
    },
    close() {
      if (data.phase !== 'open') return false;
      data.phase = 'closed'; mark(); return true;
    },
    endDay() {
      if (data.phase !== 'closed') return false;
      data.phase = 'ending'; mark(); return true;
    },
    nextDay() {
      if (data.phase !== 'report') return false;
      Object.assign(data,{day:data.day+1,time:0,phase:'ready',ledger:emptyLedger(),arrivalCredit:1});
      delete data.endingCash;
      mark(); return true;
    },
    sell(rating: number) {
      if (data.phase !== 'open' || data.arrivalCredit < 1 || !data.entrance) return false;
      data.arrivalCredit = 0;
      wallet.change(data.price);
      data.ledger.revenue += data.price;
      data.ledger.ratings += clampRating(rating);
      data.ledger.admissions++; mark(); return true;
    },
    completedRun() { data.ledger.runs++; mark(); },
    ratingChange(change: number) {
      data.ledger.ratings = Math.max(0,Math.min(data.ledger.admissions*100,data.ledger.ratings+change));
    },
    departure() { data.ledger.departed++; mark(); },
    advance(seconds: number, hourly: number, active: number, guestsPerSecond: number) {
      const elapsed = Math.min(.25,Math.max(0,seconds));
      if (!Number.isFinite(elapsed) || data.phase === 'ready' || data.phase === 'report') return;
      const onClock = data.phase !== 'ending';
      const scheduled = onClock ? Math.min(elapsed,(dayLength-data.time)/economy.clockRate) : 0;
      data.time = Math.min(dayLength,data.time+scheduled*economy.clockRate);
      const billing = active ? elapsed : data.phase === 'open' ? scheduled : 0;
      const bill = data.expenseFraction + hourly*billing*economy.clockRate/3600;
      const owed = Math.floor(bill+1e-9);
      data.expenseFraction = Math.max(0,bill-owed);
      if (owed) {
        const paid = Math.min(wallet.balance(),owed);
        if (paid) { wallet.change(-paid); data.ledger.expenses += paid; mark(); }
        if (!wallet.balance() && !data.cashHold) {
          data.cashHold = true;
          if (data.phase === 'open') data.phase = 'closed';
          mark();
        }
      }
      if (data.time >= dayLength && data.phase !== 'ending') { data.phase = 'ending'; mark(); }
      if (data.phase === 'open') data.arrivalCredit = Math.min(1,data.arrivalCredit + guestsPerSecond*elapsed);
      if (data.phase === 'ending' && !active) {
        data.endingCash = wallet.balance();
        if (data.ledger.admissions) {
          const average = data.ledger.ratings/data.ledger.admissions;
          data.reputation += (average-data.reputation)*economy.ratingWeight;
        }
        data.phase = 'report'; mark();
      }
    }
  };
}
