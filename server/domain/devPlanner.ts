// Residential development duration planner (Q-11 part a): the calculation engine, server-side and pure.
// Ported from the owner's stand-alone planning tool, which stays the behavioural reference: given a project
// (villas, townhouses or apartment buildings), crews and sales assumptions, it returns the pre-development
// timeline, a line-of-balance construction schedule with its critical path, three scenarios (min / likely / max),
// the monthly direct-labour histogram and the sales curve. No I/O and no clock: dates are the caller's job,
// everything here is in days or months from the project start. The test pins the 120-villa example to the tool.

export type ProjectType = "villa" | "townhouse" | "apartments";
export type Scenario = "min" | "likely" | "max";

export type UnitModel = { name: string; count: number; bua: number; floors: number; plot: number };
export type BuildingType = { name: string; count: number; floors: number; floorArea: number; unitsPerFloor: number; basement: number };
export type RateOverride = { prod?: number; crew?: number; crews?: number; fixed?: number };

export type PlannerInput = {
  type: ProjectType;
  workingDaysPerWeek: number; // 5, 6 or 7
  risk: number; // productivity factor of the max scenario (0.85 low, 0.78 medium, 0.7 high)
  season: boolean; // summer midday ban and Ramadan
  roads?: number | null; // m², estimated when absent
  networks?: number | null; // linear metres, estimated when absent
  villaModels: UnitModel[];
  townhouseModels: UnitModel[];
  buildings: BuildingType[];
  boqTotals?: Partial<Record<BoqCategory, number>>; // project totals per category, from a BOQ
  labourMode: "fronts" | "cap" | "target";
  fronts: number; // structure crews; the other trades are balanced on them
  cap: number; // max workers on site (labourMode "cap")
  targetMonths: number; // construction duration wanted (labourMode "target")
  salesMode: "offplan" | "ready";
  salesPerMonth: number;
  launchMultiplier: number; // sales speed multiple during the first two months
  overrides?: Record<string, RateOverride>;
};

type Lib = { n: string; u: string; prod?: number; fixed?: number; crew: number; out: 0 | 1; trade: string; minCycle?: number };
// prod = output per crew per working day; crew = workers in one crew; out = outdoor (heat-affected)
export const ACTIVITY_LIBRARY: Record<string, Lib> = {
  exc: { n: "الحفر والردم", u: "م³", prod: 250, crew: 4, out: 1, trade: "معدات وحفر" },
  fdn: { n: "الأساسات والخرسانة تحت الأرض", u: "م³", prod: 8, crew: 14, out: 1, trade: "هيكل خرساني", minCycle: 6 },
  frame: { n: "الهيكل الخرساني (أعمدة وأسقف)", u: "م³", prod: 7, crew: 14, out: 1, trade: "هيكل خرساني" },
  block: { n: "أعمال البلوك", u: "م²", prod: 40, crew: 6, out: 0, trade: "بلوك ولياسة" },
  wp: { n: "العزل المائي والحراري", u: "م²", prod: 60, crew: 4, out: 1, trade: "عزل" },
  mep1: { n: "تأسيس الكهرباء والسباكة والتكييف", u: "م²", prod: 25, crew: 6, out: 0, trade: "كهروميكانيك" },
  plaster: { n: "اللياسة", u: "م²", prod: 50, crew: 6, out: 0, trade: "بلوك ولياسة" },
  ceil: { n: "الأسقف الجبسية", u: "م²", prod: 25, crew: 4, out: 0, trade: "تشطيبات" },
  tiles: { n: "البلاط والسيراميك والرخام", u: "م²", prod: 24, crew: 5, out: 0, trade: "تشطيبات" },
  facade: { n: "الواجهات (حجر/دهان خارجي)", u: "م²", prod: 30, crew: 5, out: 1, trade: "واجهات" },
  paint: { n: "الدهانات الداخلية", u: "م²", prod: 45, crew: 4, out: 0, trade: "تشطيبات" },
  open: { n: "الأبواب والنوافذ والنجارة", u: "فتحة", prod: 4, crew: 3, out: 0, trade: "نجارة وألمنيوم" },
  mep2: { n: "التركيبات النهائية الكهروميكانيكية", u: "م²", prod: 45, crew: 5, out: 0, trade: "كهروميكانيك" },
  lift: { n: "المصاعد", u: "مصعد", prod: 1 / 60, crew: 4, out: 0, trade: "مصاعد" },
  fence: { n: "الأسوار والأعمال الخارجية للوحدة", u: "م.ط", prod: 10, crew: 6, out: 1, trade: "أعمال خارجية" },
  test: { n: "الاختبارات والتشغيل", u: "وحدة", prod: 1 / 3, crew: 3, out: 0, trade: "كهروميكانيك" },
  snag: { n: "الملاحظات والاستلام الداخلي", u: "وحدة", prod: 1 / 2, crew: 3, out: 0, trade: "جودة واستلام" },
  shore: { n: "سند جوانب الحفر (القبو)", u: "م²", prod: 20, crew: 8, out: 1, trade: "معدات وحفر" },
  raft: { n: "اللبشة وهيكل القبو", u: "م³", prod: 22, crew: 16, out: 1, trade: "هيكل خرساني" },
  roof: { n: "أعمال السطح", u: "م²", prod: 60, crew: 5, out: 1, trade: "عزل" },
  mob: { n: "التعبئة وتجهيز الموقع", u: "يوم", fixed: 30, crew: 10, out: 1, trade: "إدارة الموقع" },
  net: { n: "البنية التحتية: الشبكات (مياه، صرف، كهرباء، اتصالات)", u: "م.ط", prod: 35, crew: 8, out: 1, trade: "بنية تحتية" },
  roads: { n: "الطرق والأرصفة والإنارة", u: "م²", prod: 500, crew: 10, out: 1, trade: "بنية تحتية" },
  land: { n: "اللاندسكيب والمرافق العامة", u: "م²", prod: 150, crew: 8, out: 1, trade: "أعمال خارجية" },
  util: { n: "توصيل الخدمات من الجهات (كهرباء ومياه)", u: "يوم", fixed: 60, crew: 0, out: 0, trade: "—" },
  occ: { n: "شهادة إتمام البناء والإشغال", u: "يوم", fixed: 30, crew: 0, out: 0, trade: "—" },
  hand: { n: "تسليم الوحدات للملاك", u: "وحدة", prod: 6, crew: 4, out: 0, trade: "جودة واستلام" },
};

// Pre-development, months: [min, likely, max]
export const PRE_DEVELOPMENT = [
  { id: "feas", n: "دراسة الجدوى والتمويل", m: [1, 1.5, 3] },
  { id: "concept", n: "التصميم المفاهيمي والابتدائي", m: [1.5, 2, 3] },
  { id: "detail", n: "التصاميم التنفيذية ووثائق الطرح", m: [2, 3, 4.5] },
  { id: "permit", n: "رخصة البناء (بلدي)", m: [1, 1.5, 3] },
  { id: "wafi", n: "ترخيص البيع على الخارطة (وافي) وحساب الضمان", m: [1.5, 2, 4] },
  { id: "tender", n: "طرح المقاولات وترسية المقاول", m: [1, 1.5, 2.5] },
] as const;

export const BOQ_CATEGORIES = ["excavation", "concrete", "block", "waterproof", "plaster", "ceiling", "tiles", "facade", "paint", "openings", "roads", "networks", "fence", "landscape", "shoring", "skip"] as const;
export type BoqCategory = (typeof BOQ_CATEGORIES)[number];
const ACTIVITY_CATEGORY: Record<string, BoqCategory> = { exc: "excavation", block: "block", wp: "waterproof", roof: "waterproof", plaster: "plaster", ceil: "ceiling", tiles: "tiles", facade: "facade", paint: "paint", open: "openings", roads: "roads", net: "networks", fence: "fence", land: "landscape", shore: "shoring" };
const KEYWORDS: Array<[BoqCategory, RegExp]> = [
  ["skip", /(حديد|تسليح|rebar|reinforc|steel bar|شدة|formwork|طوبار)/i],
  ["shoring", /(سند|shoring|خوازيق|pile)/i],
  ["excavation", /(حفر|ردم|excavat|backfill|earth)/i],
  ["concrete", /(خرسان|concrete|صب|لبشة|raft|slab|سقف خرس|column|أعمدة)/i],
  ["block", /(بلوك|طوب|block|masonry|brick)/i],
  ["waterproof", /(عزل|waterproof|insulat|membrane)/i],
  ["facade", /(واجه|حجر|cladding|facade|خارجي|external paint|external plaster)/i],
  ["plaster", /(لياس|plaster|render)/i],
  ["ceiling", /(جبس|gypsum|ceiling|أسقف معلقة)/i],
  ["tiles", /(بلاط|سيراميك|بورسلين|رخام|tile|ceramic|porcelain|marble|granite)/i],
  ["paint", /(دهان|paint|emulsion)/i],
  ["openings", /(باب|أبواب|نافذ|نوافذ|شباك|ألمنيوم|المنيوم|door|window|alumin)/i],
  ["roads", /(أسفلت|اسفلت|طرق|رصف|بلدورة|asphalt|road|paving|kerb)/i],
  ["networks", /(شبك|مواسير|أنابيب|pipe|network|sewer|drain|كيابل|cable duct)/i],
  ["fence", /(سور|fence|boundary)/i],
  ["landscape", /(زراع|لاندسكيب|landscape|irrigat|حدائق)/i],
];
/** The BOQ category a line description belongs to, or null when none matches. */
export function guessBoqCategory(description: string): BoqCategory | null {
  for (const [category, pattern] of KEYWORDS) if (pattern.test(description)) return category;
  return null;
}

export type Activity = {
  id: string; set: "u" | "b" | "f" | "s"; N: number; q: number; minCycle: number; name: string; unit: string; trade: string; out: 0 | 1;
  fromBoq?: boolean; dRef?: number; dLik?: number;
  crews: number; crewSize: number; workers: number; d: number; D: number; r: number; S: number; F: number; driver: string | null; crit: boolean;
};

const MONTH = 30.44;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const weightedAverage = <T extends { count: number }>(list: T[], f: (x: T) => number) => {
  let total = 0, weight = 0;
  for (const x of list) { const c = Number(x.count) || 0; total += c * f(x); weight += c; }
  return weight ? total / weight : 0;
};
const given = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function saleUnits(input: PlannerInput) {
  if (input.type === "apartments") {
    let buildings = 0, floors = 0, units = 0;
    for (const b of input.buildings) { const c = Number(b.count) || 0; buildings += c; floors += c * (Number(b.floors) || 0); units += c * (Number(b.floors) || 0) * (Number(b.unitsPerFloor) || 0); }
    return { saleUnits: units, buildings, floors, villas: 0 };
  }
  const models = input.type === "villa" ? input.villaModels : input.townhouseModels;
  const n = models.reduce((a, x) => a + (Number(x.count) || 0), 0);
  return { saleUnits: n, villas: n, buildings: 0, floors: 0 };
}

function buildActivities(input: PlannerInput) {
  const acts: Array<Omit<Activity, "name" | "unit" | "trade" | "out" | "crews" | "crewSize" | "workers" | "d" | "D" | "r" | "S" | "F" | "driver" | "crit"> & Partial<Activity>> = [];
  const U = saleUnits(input);
  const add = (id: string, set: Activity["set"], N: number, q: number, minCycle = 0) => acts.push({ id, set, N, q, minCycle });
  if (input.type !== "apartments") {
    const m = input.type === "villa" ? input.villaModels : input.townhouseModels; const N = U.villas;
    const A = weightedAverage(m, x => Number(x.bua) || 0), f = Math.max(1, weightedAverage(m, x => Number(x.floors) || 1)), P = weightedAverage(m, x => Number(x.plot) || 0), Fp = A / f;
    const th = input.type === "townhouse";
    add("exc", "u", N, Fp * 1.8); add("fdn", "u", N, Fp * 0.35); add("frame", "u", N, A * 0.32, Math.round(f * 9));
    add("block", "u", N, A * 1.2); add("wp", "u", N, Fp * 1.1); add("mep1", "u", N, A); add("plaster", "u", N, A * 3.6);
    add("ceil", "u", N, A * 0.5); add("tiles", "u", N, A * 1.2); add("facade", "u", N, A * (th ? 0.55 : 0.8)); add("paint", "u", N, A * 3.0);
    add("open", "u", N, A / 18); add("mep2", "u", N, A); add("fence", "u", N, 4 * Math.sqrt(P || 1) * (th ? 0.45 : 1));
    add("test", "u", N, 1); add("snag", "u", N, 1);
    const roads = given(input.roads) ? input.roads : Math.round(N * (P || 300) * 0.35);
    const net = given(input.networks) ? input.networks : Math.round(N * 25);
    add("mob", "s", 1, 1); add("net", "s", 1, net); add("roads", "s", 1, roads); add("land", "s", 1, Math.round(roads * 0.4));
    add("util", "s", 1, 1); add("occ", "s", 1, 1); add("hand", "s", 1, N);
  } else {
    const B = input.buildings; const NB = U.buildings, NF = U.floors;
    const Af = weightedAverage(B.map(x => ({ ...x, count: (Number(x.count) || 0) * (Number(x.floors) || 0) })), x => Number(x.floorArea) || 0);
    const fl = weightedAverage(B, x => Number(x.floors) || 1), bas = weightedAverage(B, x => (Number(x.basement) ? 1 : 0));
    const fp = weightedAverage(B, x => Number(x.floorArea) || 0);
    add("exc", "b", NB, fp * (bas >= 0.5 ? 4.5 : 2)); if (bas >= 0.5) add("shore", "b", NB, 4 * Math.sqrt(fp) * 4.5);
    add("raft", "b", NB, fp * (bas >= 0.5 ? 1.4 : 0.55));
    add("frame", "f", NF, Af * 0.42, 7);
    add("block", "f", NF, Af * 1.3); add("mep1", "f", NF, Af); add("plaster", "f", NF, Af * 3.4); add("ceil", "f", NF, Af * 0.6);
    add("tiles", "f", NF, Af * 1.15); add("facade", "f", NF, Af * 0.7); add("paint", "f", NF, Af * 3.0); add("open", "f", NF, Af / 15); add("mep2", "f", NF, Af);
    add("roof", "b", NB, fp * 1.1); add("lift", "b", NB, Math.max(1, Math.ceil(fl / 6)));
    add("test", "b", NB, 1); add("snag", "f", NF, 1);
    const roads = given(input.roads) ? input.roads : Math.round(NB * 1200);
    const net = given(input.networks) ? input.networks : Math.round(NB * 140);
    add("mob", "s", 1, 1); add("net", "s", 1, net); add("roads", "s", 1, roads); add("land", "s", 1, Math.round(roads * 0.35));
    add("util", "s", 1, 1); add("occ", "s", 1, 1); add("hand", "s", 1, U.saleUnits);
  }
  // BOQ: project totals per category replace the estimate, spread over the repetitive units
  const tot = input.boqTotals ?? {};
  if (Object.keys(tot).length) {
    const conc = tot.concrete;
    // Concrete splits between foundations and frame by their estimated shares, both taken before either is replaced
    // (the reference tool replaced foundations first and then split on the new figure, so the two did not add up to the BOQ).
    const estimate = (id: string) => { const x = acts.find(y => y.id === id); return x ? x.q * x.N : 0; };
    const frameEst = estimate("frame"), belowEst = estimate("fdn") + estimate("raft");
    for (const a of acts) {
      let T: number | null = null;
      if (a.id === "frame" && given(conc)) T = (conc * frameEst) / (frameEst + belowEst);
      else if ((a.id === "fdn" || a.id === "raft") && given(conc)) T = (conc * belowEst) / (frameEst + belowEst);
      else if (ACTIVITY_CATEGORY[a.id] && given(tot[ACTIVITY_CATEGORY[a.id]])) T = tot[ACTIVITY_CATEGORY[a.id]]!;
      if (T !== null) { a.q = a.N ? T / a.N : T; a.fromBoq = true; }
    }
  }
  for (const a of acts) { const L = ACTIVITY_LIBRARY[a.id]; a.name = L.n; a.unit = L.u; a.trade = L.trade; a.out = L.out; a.minCycle = a.minCycle || L.minCycle || 0; }
  return acts as Activity[];
}

type Dep = [string, "fs" | "ss" | "lob" | "gen", number];
function dependencies(type: ProjectType): Record<string, Dep[]> {
  const site: Record<string, Dep[]> = { util: [["net", "fs", 0]], occ: [["snag", "fs", 0], ["roads", "fs", 0], ["land", "fs", 0], ["util", "fs", 0]], hand: [["occ", "fs", 0]], roads: [["net", "ss", 0.6]], land: [["roads", "ss", 0.5]] };
  if (type !== "apartments") return {
    exc: [["mob", "fs", 0]], fdn: [["exc", "lob", 2]], frame: [["fdn", "lob", 3]], block: [["frame", "lob", 7]], wp: [["frame", "lob", 5]],
    mep1: [["block", "lob", 2]], plaster: [["mep1", "lob", 2]], ceil: [["plaster", "lob", 2]], tiles: [["plaster", "lob", 3]], facade: [["plaster", "lob", 2]],
    paint: [["tiles", "lob", 2], ["ceil", "lob", 1]], open: [["tiles", "lob", 2]], mep2: [["paint", "lob", 1], ["open", "lob", 0]], fence: [["frame", "lob", 10]],
    test: [["mep2", "lob", 1]], snag: [["test", "lob", 0], ["facade", "lob", 0], ["fence", "lob", 0]],
    net: [["frame", "ss", 0.35]], ...site,
  };
  return {
    exc: [["mob", "fs", 0]], shore: [["exc", "ss", 0.1]], raft: [["exc", "lob", 3], ["shore", "lob", 0]], frame: [["raft", "gen", 7]],
    block: [["frame", "lob", 10]], mep1: [["block", "lob", 3]], plaster: [["mep1", "lob", 3]], ceil: [["plaster", "lob", 2]], tiles: [["plaster", "lob", 3]],
    facade: [["frame", "lob", 14]], paint: [["tiles", "lob", 2], ["ceil", "lob", 1]], open: [["tiles", "lob", 2]], mep2: [["paint", "lob", 1], ["open", "lob", 0]],
    roof: [["frame", "gen", 5]], lift: [["frame", "gen", 5]], test: [["mep2", "gen", 3], ["lift", "lob", 0]], snag: [["test", "gen", 0], ["facade", "lob", 0]],
    net: [["frame", "ss", 0.4]], ...site,
  };
}

function engine(input: PlannerInput) {
  const ov = (id: string) => input.overrides?.[id] ?? {};
  const seasonFactor = (out: number) => { if (!input.season) return 1; const ramadan = 1 - (1 / 12) * 0.15; return out ? ramadan * (1 - 0.25 * 0.24) : ramadan; };
  const calFactor = () => (7 / (input.workingDaysPerWeek || 6)) * 1.03;
  const rate = (a: Activity, scen: Scenario) => { const o = ov(a.id); const base = o.prod ?? ACTIVITY_LIBRARY[a.id].prod!; const sf = scen === "min" ? 1.15 : scen === "max" ? input.risk : 1; return base * sf * seasonFactor(a.out); };
  const fixedDays = (a: Activity, scen: Scenario) => { const b = ov(a.id).fixed ?? ACTIVITY_LIBRARY[a.id].fixed!; return b * (scen === "min" ? 0.75 : scen === "max" ? 1.8 : 1); };
  const crewSize = (a: Activity) => ov(a.id).crew ?? ACTIVITY_LIBRARY[a.id].crew;
  const baseCrews = (a: Activity): { c: number; fixed?: boolean } => {
    const o = ov(a.id); if (given(o.crews)) return { c: o.crews, fixed: true };
    const F = input.fronts || 1;
    if (a.set === "s") { const map: Record<string, number> = { mob: 1, net: Math.max(1, Math.ceil(F / 2)), roads: Math.max(1, Math.ceil(F / 3)), land: Math.max(1, Math.ceil(F / 3)), util: 0, occ: 0, hand: Math.max(1, Math.ceil(F / 3)) }; return { c: map[a.id] ?? 1 }; }
    if (a.set === "b") return { c: Math.max(1, Math.min(a.N, Math.ceil(F / 2))) };
    if (a.dRef && a.dLik) return { c: Math.max(1, Math.ceil((F * a.dLik) / a.dRef)) }; // line of balance on the structure
    return { c: F };
  };

  const schedule = (scen: Scenario, mult: number) => {
    const acts = buildActivities(input).filter(a => a.N !== 0);
    const D = dependencies(input.type); const by: Record<string, Activity> = {};
    const fr = acts.find(x => x.id === "frame");
    const unitLik = (x: Activity) => { const L = ACTIVITY_LIBRARY[x.id]; if (L.fixed != null) return 0; const p = ov(x.id).prod ?? L.prod!; return Math.max(x.minCycle || 0, x.q / p); };
    const dRef = fr ? unitLik(fr) : 0;
    for (const a of acts) if (a.set !== "s" && fr && a.set === fr.set) { a.dRef = dRef; a.dLik = unitLik(a); }
    for (const a of acts) {
      const L = ACTIVITY_LIBRARY[a.id]; const bc = baseCrews(a);
      let crews = bc.fixed ? bc.c : Math.max(L.crew ? 1 : 0, Math.round(bc.c * (a.set === "s" ? Math.max(1, Math.sqrt(mult)) : mult)));
      if (a.set !== "s") crews = clamp(crews, 1, a.N);
      a.crews = crews; a.crewSize = crewSize(a); a.workers = crews * a.crewSize;
      if (L.fixed != null) { a.d = fixedDays(a, scen); a.D = a.d; a.r = Infinity; }
      else if (a.set === "s") { const p = rate(a, scen); a.d = a.q / (p * Math.max(1, crews)); a.D = a.d; a.r = Infinity; }
      else { const p = rate(a, scen); a.d = Math.max(a.minCycle || 0, a.q / p); a.r = crews / a.d; a.D = (a.N - 1) / a.r + a.d; }
      by[a.id] = a;
    }
    for (const a of acts) { // forward pass in list order
      let S0 = 0; a.driver = null;
      for (const [pid, t, lag] of D[a.id] ?? []) {
        const p = by[pid]; if (!p) continue; let s: number;
        if (t === "fs") s = p.F + lag;
        else if (t === "ss") s = p.S + p.D * lag;
        else if (t === "lob" && p.set === a.set && p.r !== Infinity && a.r !== Infinity) s = a.r >= p.r ? p.S + p.d + lag + (a.N - 1) * (1 / p.r - 1 / a.r) : p.S + p.d + lag;
        else s = Math.max(p.S + p.d + lag, p.F + lag + (a.d || 0) - a.D);
        if (s > S0) { S0 = s; a.driver = pid; }
      }
      a.S = S0; a.F = S0 + a.D;
    }
    const crit = new Set<string>(); let cur: Activity | null = by.hand; let guard = 0;
    while (cur && guard++ < 60) { crit.add(cur.id); cur = cur.driver ? by[cur.driver] : null; }
    for (const a of acts) a.crit = crit.has(a.id);
    return { acts, by, buildWorkingDays: by.hand.F };
  };

  const preDevelopment = (scen: Scenario) => {
    const i = scen === "min" ? 0 : scen === "max" ? 2 : 1; const off = input.salesMode === "offplan";
    const sz = 1 + clamp((saleUnits(input).saleUnits - 100) / 800, 0, 0.6); // bigger projects take a little longer to design
    const m = Object.fromEntries(PRE_DEVELOPMENT.map(p => [p.id, p.m[i] * (p.id === "detail" || p.id === "concept" ? sz : 1)])) as Record<string, number>;
    const t: Record<string, [number, number]> = {}; // months from project start
    t.feas = [0, m.feas]; t.concept = [t.feas[1] * 0.7, t.feas[1] * 0.7 + m.concept];
    t.detail = [t.concept[1] - 0.3, t.concept[1] - 0.3 + m.detail];
    t.permit = [t.detail[0] + m.detail * 0.6, t.detail[0] + m.detail * 0.6 + m.permit];
    t.tender = [t.detail[1] - 0.5, t.detail[1] - 0.5 + m.tender];
    if (off) t.wafi = [t.permit[1], t.permit[1] + m.wafi];
    return { t, buildStartMonths: Math.max(t.permit[1], t.tender[1]), offplan: off };
  };

  const plan = (scen: Scenario, mult: number) => {
    const pre = preDevelopment(scen); const sc = schedule(scen, mult); const cf = calFactor();
    const buildStartDays = pre.buildStartMonths * MONTH; const buildCalendarDays = sc.buildWorkingDays * cf;
    return { pre, sc, cf, buildStartDays, buildCalendarDays, totalDays: buildStartDays + buildCalendarDays };
  };

  const labour = (sc: ReturnType<typeof schedule>, cf: number) => {
    const months = Math.ceil((sc.by.hand.F * cf) / MONTH) + 1; const hist = new Array<number>(months).fill(0);
    for (const a of sc.acts) { if (!a.workers) continue; const s = Math.floor((a.S * cf) / MONTH), e = Math.floor((a.F * cf) / MONTH); for (let k = s; k <= e && k < months; k++) hist[k] += a.workers; }
    return { hist, peak: Math.max(0, ...hist) };
  };

  const solveMultiplier = (): { m: number; feasible: boolean } => {
    if (input.labourMode === "fronts") return { m: 1, feasible: true };
    const evaluate = (m: number) => { const p = plan("likely", m); return { peak: labour(p.sc, p.cf).peak, months: p.buildCalendarDays / MONTH }; };
    let lo = 0.15, hi = 12, best: number | null = null;
    if (input.labourMode === "cap") {
      for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2; if (evaluate(mid).peak <= input.cap) { best = mid; lo = mid; } else hi = mid; }
      return best === null ? { m: 0.15, feasible: false } : { m: best, feasible: true };
    }
    for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2; if (evaluate(mid).months <= input.targetMonths) { best = mid; hi = mid; } else lo = mid; }
    return best === null ? { m: 12, feasible: false } : { m: best, feasible: true };
  };

  const sales = (p: ReturnType<typeof plan>) => {
    const U = saleUnits(input).saleUnits; const v = input.salesPerMonth || 1, w = input.launchMultiplier || 1;
    const launchMonth = input.salesMode === "offplan"
      ? Math.max(p.pre.t.wafi ? p.pre.t.wafi[1] : p.pre.buildStartMonths, p.pre.t.detail[0] + 3)
      : p.pre.buildStartMonths + (p.buildCalendarDays / MONTH) * 0.6;
    let sold = 0, m = 0; const curve: number[] = [];
    while (sold < U && m < 240) { sold = Math.min(U, sold + (m < 2 ? v * w : v)); curve.push(sold); m++; }
    return { units: U, launchMonth, sellingMonths: m, endMonth: launchMonth + m, curve, prelaunch: [Math.max(0, launchMonth - 3), launchMonth] as [number, number] };
  };

  return { plan, labour, solveMultiplier, sales };
}

/** Plans the whole development: three scenarios, the labour histogram (likely) and the sales curve (likely). */
export function planDevelopment(input: PlannerInput) {
  const e = engine(input);
  const solved = e.solveMultiplier();
  const scenarios = { min: e.plan("min", solved.m), likely: e.plan("likely", solved.m), max: e.plan("max", solved.m) };
  const labour = e.labour(scenarios.likely.sc, scenarios.likely.cf);
  return { crewMultiplier: solved.m, labourTargetFeasible: solved.feasible, scenarios, labour, sales: e.sales(scenarios.likely), units: saleUnits(input) };
}

/** The tool's 120-villa example, the reference the test pins. */
export function exampleInput(): PlannerInput {
  return {
    type: "villa", workingDaysPerWeek: 6, risk: 0.78, season: true, roads: null, networks: null,
    villaModels: [{ name: "نموذج A", count: 40, bua: 420, floors: 2, plot: 450 }, { name: "نموذج B", count: 50, bua: 360, floors: 2, plot: 400 }, { name: "نموذج C", count: 30, bua: 300, floors: 2, plot: 350 }],
    townhouseModels: [{ name: "طرفي", count: 30, bua: 280, floors: 2, plot: 240 }, { name: "وسطي", count: 70, bua: 250, floors: 2, plot: 200 }],
    buildings: [{ name: "عمارة نوع 1", count: 6, floors: 5, floorArea: 650, unitsPerFloor: 4, basement: 1 }],
    labourMode: "fronts", fronts: 10, cap: 450, targetMonths: 18, salesMode: "offplan", salesPerMonth: 8, launchMultiplier: 1.6,
  };
}
