import React, { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

// ==========================
// Helper utilities
// ==========================
const numberPt = (n) => new Intl.NumberFormat("pt-PT").format(n ?? 0);
const moneyPt = (n) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format((n ?? 0));

const DEFAULT_FX = {
  EUR: 1,
  USD: 0.92,
  CNY: 0.128,
  KRW: 0.00067,
  HKD: 0.118,
  BRL: 0.18,
};

const ORIGINS = ["China", "Korea", "Hong Kong", "Brasil"];
const INCOTERMS = ["EXW", "FOB", "CIF"];
const MODES = ["Aéreo Express", "Aéreo (Carga)", "Marítimo LCL", "Marítimo FCL 20'", "Marítimo FCL 40'"];

// Default tier tables (editable in UI)
const DEFAULT_AIR_TIERS = [
  { threshold: 45, rate: 6.5 },
  { threshold: 100, rate: 5.8 },
  { threshold: 300, rate: 5.0 },
  { threshold: 500, rate: 4.6 },
  { threshold: Infinity, rate: 4.2 },
];

const DEFAULT_LCL_TIERS = [
  { threshold: 2, rate: 180 },
  { threshold: 5, rate: 150 },
  { threshold: 10, rate: 120 },
  { threshold: Infinity, rate: 100 },
];

// Container capacities (cbm) — approximate
const FCL_CAPACITY = {
  "Marítimo FCL 20'": 33.2,
  "Marítimo FCL 40'": 67.7,
};

export default function App() {
  // ==========================
  // State
  // ==========================
  // Separate origins
  const [productOrigin, setProductOrigin] = useState("China"); // país de fabrico / origem aduaneira
  const [shipOrigin, setShipOrigin] = useState("China"); // local de embarque para frete

  const [mode, setMode] = useState("Aéreo (Carga)");
  const [incoterm, setIncoterm] = useState("EXW");

  // Product & packing
  const [supplierCurrency, setSupplierCurrency] = useState("USD");
  const [unitPrice, setUnitPrice] = useState(300); // price per unit in supplier currency
  const [qty, setQty] = useState(100);
  const [unitWeightKg, setUnitWeightKg] = useState(0.8);
  const [unitLcm, setUnitLcm] = useState(17);
  const [unitWcm, setUnitWcm] = useState(8);
  const [unitHcm, setUnitHcm] = useState(5);

  // FX (to EUR)
  const [fx, setFx] = useState(DEFAULT_FX);

  // Insurance and fees
  const [insurancePct, setInsurancePct] = useState(0.5); // % over (mercadoria + frete)
  const [brokerageFee, setBrokerageFee] = useState(120); // despachante aduaneiro
  const [portTHC, setPortTHC] = useState(150); // taxas portuárias / handling
  const [otherFees, setOtherFees] = useState(50);

  // Local transport at origin (e.g., China → Hong Kong)
  const [localOriginTransport, setLocalOriginTransport] = useState(0);

  // Taxes
  const [dutyPct, setDutyPct] = useState(0); // % sobre CIF (manual)
  const [ignoreDuty, setIgnoreDuty] = useState(true); // opção de ignorar HS
  const [originTariffEnabled, setOriginTariffEnabled] = useState(false); // usar tabela por origem do produto
  const [originDutyMap, setOriginDutyMap] = useState({ China: 0, Korea: 0, "Hong Kong": 0, Brasil: 0, Outro: 0 });

  const [vatPct, setVatPct] = useState(23);
  const [vatRecoverable, setVatRecoverable] = useState(true);

  // Branding
  const [showLogo, setShowLogo] = useState(true);
  const [logoUrl, setLogoUrl] = useState("/yep-logo.png");

  // Freight models (editable)
  const [airTiers, setAirTiers] = useState(DEFAULT_AIR_TIERS);
  const [airVolFactor, setAirVolFactor] = useState(167); // kg por m³ (IATA ~167)
  const [airMinChargeKg, setAirMinChargeKg] = useState(45); // mínimo cobrado em kg
  const [airFixedFees, setAirFixedFees] = useState(60); // docs/origem/destino

  const [lclTiers, setLclTiers] = useState(DEFAULT_LCL_TIERS);
  const [lclMinCbm, setLclMinCbm] = useState(1); // mínimo em m³
  const [lclFixedFees, setLclFixedFees] = useState(120);

  const [fcl20Price, setFcl20Price] = useState(1800);
  const [fcl40Price, setFcl40Price] = useState(2300);
  const [fclFixedFees, setFclFixedFees] = useState(300);

  // ==========================
  // Derived metrics
  // ==========================
  const unitVolumeM3 = useMemo(() => (unitLcm/100) * (unitWcm/100) * (unitHcm/100), [unitLcm, unitWcm, unitHcm]);
  const totalVolumeM3 = useMemo(() => unitVolumeM3 * qty, [unitVolumeM3, qty]);
  const totalWeightKg = useMemo(() => unitWeightKg * qty, [unitWeightKg, qty]);

  // Convert supplier price to EUR
  const goodsEUR = useMemo(() => (unitPrice * qty) * (fx[supplierCurrency] ?? 1), [unitPrice, qty, supplierCurrency, fx]);

  // Freight cost model per mode — frete depende de shipOrigin (no futuro pode haver tabelas por rota)
  const calcFreight = (q) => {
    const volM3 = unitVolumeM3 * q;
    const kg = unitWeightKg * q;

    if (mode === "Aéreo Express" || mode === "Aéreo (Carga)") {
      const volWeight = volM3 * airVolFactor; // kg
      const chargeable = Math.max(kg, volWeight, airMinChargeKg);
      const rate = airTiers.find(t => chargeable <= t.threshold)?.rate ?? airTiers[airTiers.length-1].rate;
      const cost = chargeable * rate + airFixedFees;
      return { cost, basisLabel: `Peso tributável ${numberPt(chargeable)} kg @ ${rate.toFixed(2)} €/kg` };
    }
    if (mode === "Marítimo LCL") {
      const cbm = Math.max(volM3, lclMinCbm);
      const rate = lclTiers.find(t => cbm <= t.threshold)?.rate ?? lclTiers[lclTiers.length-1].rate;
      const cost = cbm * rate + lclFixedFees;
      return { cost, basisLabel: `Volume tributável ${cbm.toFixed(2)} m³ @ ${rate.toFixed(0)} €/m³` };
    }
    if (mode === "Marítimo FCL 20'") {
      const cap = FCL_CAPACITY["Marítimo FCL 20'"];
      const containers = Math.max(1, Math.ceil(volM3 / cap));
      const price = fcl20Price * containers + fclFixedFees;
      const utilization = volM3 / (containers * cap);
      return { cost: price, basisLabel: `${containers}x 20' (ocupação ${(utilization*100).toFixed(1)}%)` };
    }
    if (mode === "Marítimo FCL 40'") {
      const cap = FCL_CAPACITY["Marítimo FCL 40'"];
      const containers = Math.max(1, Math.ceil(volM3 / cap));
      const price = fcl40Price * containers + fclFixedFees;
      const utilization = volM3 / (containers * cap);
      return { cost: price, basisLabel: `${containers}x 40' (ocupação ${(utilization*100).toFixed(1)}%)` };
    }
    return { cost: 0, basisLabel: "" };
  };

  const freight = useMemo(() => calcFreight(qty), [qty, unitVolumeM3, unitWeightKg, mode, airTiers, airVolFactor, airMinChargeKg, airFixedFees, lclTiers, lclMinCbm, lclFixedFees, fcl20Price, fcl40Price, fclFixedFees, shipOrigin]);

  // Insurance on (goods + freight)
  const insuranceEUR = useMemo(() => (goodsEUR + freight.cost) * (insurancePct / 100), [goodsEUR, freight, insurancePct]);

  // Customs base (CIF): mercadoria + frete + seguro + transporte local na origem (quando pago pelo importador)
  const customsBase = useMemo(() => {
    const base = (incoterm === "CIF") ? goodsEUR : (goodsEUR + freight.cost + insuranceEUR);
    return base + localOriginTransport; // inclui pré-carriage (ex.: China→Hong Kong)
  }, [incoterm, goodsEUR, freight, insuranceEUR, localOriginTransport]);

  // Direitos: manual OU tabela por origem do produto (protótipo)
  const dutyRateFromOrigin = (originTariffEnabled ? (originDutyMap[productOrigin] ?? originDutyMap["Outro"] ?? 0) : dutyPct);
  const effectiveDutyPct = ignoreDuty ? 0 : dutyRateFromOrigin;
  const dutyEUR = useMemo(() => customsBase * (effectiveDutyPct / 100), [customsBase, effectiveDutyPct]);

  // IVA incide sobre: base aduaneira + direitos + (taxas elegíveis)
  const vatBase = useMemo(() => customsBase + dutyEUR + brokerageFee + portTHC + otherFees, [customsBase, dutyEUR, brokerageFee, portTHC, otherFees]);
  const vatEUR = useMemo(() => vatBase * (vatPct / 100), [vatBase, vatPct]);

  // Landed cost (excl. VAT if recoverable)
  const landedExVAT = useMemo(() => {
    const base = goodsEUR + localOriginTransport + freight.cost + insuranceEUR + dutyEUR + brokerageFee + portTHC + otherFees;
    return base; // IVA recuperável não entra no custo final
  }, [goodsEUR, localOriginTransport, freight, insuranceEUR, dutyEUR, brokerageFee, portTHC, otherFees]);

  const landedInclVAT = useMemo(() => landedExVAT + (vatRecoverable ? 0 : vatEUR), [landedExVAT, vatRecoverable, vatEUR]);
  const unitLanded = useMemo(() => landedInclVAT / (qty || 1), [landedInclVAT, qty]);

  // For cost composition chart (exclude VAT if recoverable)
  const composition = useMemo(() => ([
    { name: "Mercadoria", value: goodsEUR },
    { name: `Origem produto: ${productOrigin}`, value: 0 }, // marcador informativo
    { name: "Transp. Local (origem)", value: localOriginTransport },
    { name: `Frete (${shipOrigin})`, value: freight.cost },
    { name: "Seguro", value: insuranceEUR },
    { name: "Direitos", value: dutyEUR },
    { name: "Despachante", value: brokerageFee },
    { name: "THC/Porto", value: portTHC },
    { name: "Outras Taxas", value: otherFees },
  ]).filter(x => x.value > 0), [goodsEUR, productOrigin, localOriginTransport, freight, insuranceEUR, dutyEUR, brokerageFee, portTHC, otherFees, shipOrigin]);

  // Sensitivity curve: unit cost vs quantity (economia de escala)
  const sensitivityData = useMemo(() => {
    const points = [];
    const qMin = 10;
    const qMax = Math.max(2000, qty * 2);
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const q = Math.round(qMin + (i*(qMax - qMin)/steps));
      const goods = (unitPrice * q) * (fx[supplierCurrency] ?? 1);
      const fr = calcFreight(q).cost;
      const ins = ((goods + fr) * (insurancePct/100));
      const customs = (incoterm === "CIF") ? (goods + localOriginTransport) : (goods + fr + ins + localOriginTransport);
      const dutyRate = (ignoreDuty ? 0 : (originTariffEnabled ? (originDutyMap[productOrigin] ?? originDutyMap["Outro"] ?? 0) : dutyPct));
      const duty = customs * (dutyRate/100);
      const exVAT = goods + localOriginTransport + fr + ins + duty + brokerageFee + portTHC + otherFees;
      const vatB = customs + duty + brokerageFee + portTHC + otherFees;
      const vat = vatB * (vatPct/100);
      const total = exVAT + (vatRecoverable ? 0 : vat);
      points.push({ qty: q, unit: total / q });
    }
    return points;
  }, [qty, unitPrice, supplierCurrency, fx, insurancePct, incoterm, dutyPct, ignoreDuty, brokerageFee, portTHC, otherFees, vatPct, vatRecoverable, mode, localOriginTransport, airTiers, airVolFactor, airMinChargeKg, airFixedFees, lclTiers, lclMinCbm, lclFixedFees, fcl20Price, fcl40Price, fclFixedFees, unitVolumeM3, unitWeightKg, productOrigin, originTariffEnabled, originDutyMap, shipOrigin]);

  // Colors for pie slices
  const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b", "#94a3b8"]; 

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-semibold">Calculadora Interativa de Custo de Importação — AIDC (Portugal)</h1>
            {showLogo && logoUrl ? (
              <img src={logoUrl} alt="YEP logo" className="h-8 md:h-10 object-contain" />
            ) : null}
          </div>
          <p className="text-sm md:text-base text-gray-600 mt-2">Planeie o custo total por unidade (landed cost) ao importar AIDC com <strong>origem do produto</strong> separada da <strong>origem do frete</strong>. Considere Incoterms, frete, seguros, direitos (opcionais), IVA e taxas locais, com <strong>economia por volume</strong>.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Inputs */}
          <section className="space-y-4">
            {/* Origens & Modal */}
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Origem do produto (fabrico)</label>
                  <select value={productOrigin} onChange={(e)=>setProductOrigin(e.target.value)} className="w-full border rounded px-2 py-1">
                    {ORIGINS.map(o=> <option key={o} value={o}>{o}</option>)}
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Origem do frete (embarque)</label>
                  <select value={shipOrigin} onChange={(e)=>setShipOrigin(e.target.value)} className="w-full border rounded px-2 py-1">
                    {ORIGINS.map(o=> <option key={o} value={o}>{o}</option>)}
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Modal</label>
                  <select value={mode} onChange={(e)=>setMode(e.target.value)} className="w-full border rounded px-2 py-1">
                    {MODES.map(m=> <option key={m} value={m}>{m}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">Descontos automáticos por volume.</p>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Incoterm (Preço fornecedor)</label>
                  <select value={incoterm} onChange={(e)=>setIncoterm(e.target.value)} className="w-full border rounded px-2 py-1">
                    {INCOTERMS.map(i=> <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Quantidade</label>
                  <input type="number" min={1} value={qty} onChange={(e)=>setQty(Math.max(1, Number(e.target.value)))} className="w-full border rounded px-2 py-1"/>
                </div>
              </div>
            </div>

            {/* Produto & Embalagem */}
            <details className="bg-white rounded-2xl shadow p-4" open>
              <summary className="cursor-pointer select-none font-medium">Produto & Embalagem</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Preço unitário</label>
                  <div className="flex gap-2 items-center">
                    <input type="number" min={0} step={0.01} value={unitPrice} onChange={(e)=>setUnitPrice(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                    <select value={supplierCurrency} onChange={(e)=>setSupplierCurrency(e.target.value)} className="border rounded px-2 py-1">
                      {Object.keys(fx).map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Peso unit. (kg)</label>
                  <input type="number" min={0} step={0.01} value={unitWeightKg} onChange={(e)=>setUnitWeightKg(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Dimensões (cm) L</label>
                  <input type="number" min={0} step={0.1} value={unitLcm} onChange={(e)=>setUnitLcm(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="text-xs text-gray-600">W</label>
                  <input type="number" min={0} step={0.1} value={unitWcm} onChange={(e)=>setUnitWcm(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="text-xs text-gray-600">H</label>
                  <input type="number" min={0} step={0.1} value={unitHcm} onChange={(e)=>setUnitHcm(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
              </div>
              <div className="text-[11px] text-gray-500 mt-2">Volume unitário: {unitVolumeM3.toFixed(6)} m³ • Volume total: {totalVolumeM3.toFixed(3)} m³ • Peso total: {numberPt(totalWeightKg)} kg</div>
            </details>

            {/* Câmbio & Seguro */}
            <details className="bg-white rounded-2xl shadow p-4">
              <summary className="cursor-pointer select-none font-medium">Câmbio, Seguro & Taxas Fixas</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                {Object.keys(fx).map(code => (
                  <div key={code}>
                    <label className="text-xs text-gray-600">FX {code}→EUR</label>
                    <input type="number" step={0.0001} value={fx[code]} onChange={(e)=>setFx({ ...fx, [code]: Number(e.target.value) })} className="w-full border rounded px-2 py-1"/>
                  </div>
                ))}
                <div>
                  <label className="text-xs text-gray-600">Seguro (%)</label>
                  <input type="number" step={0.01} value={insurancePct} onChange={(e)=>setInsurancePct(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Despachante (€)</label>
                  <input type="number" step={1} value={brokerageFee} onChange={(e)=>setBrokerageFee(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="text-xs text-gray-600">THC/Porto (€)</label>
                  <input type="number" step={1} value={portTHC} onChange={(e)=>setPortTHC(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Outras taxas (€)</label>
                  <input type="number" step={1} value={otherFees} onChange={(e)=>setOtherFees(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
              </div>
            </details>

            {/* Branding */}
            <details className="bg-white rounded-2xl shadow p-4">
              <summary className="cursor-pointer select-none font-medium">Branding (Logo)</summary>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">URL do logotipo (PNG/SVG)</label>
                  <input type="url" placeholder="https://.../yep-logo.svg" value={logoUrl} onChange={(e)=>setLogoUrl(e.target.value)} className="w-full border rounded px-2 py-1"/>
                </div>
                <div className="flex items-end gap-2">
                  <input id="showlogo" type="checkbox" checked={showLogo} onChange={(e)=>setShowLogo(e.target.checked)} />
                  <label htmlFor="showlogo" className="text-sm">Mostrar logo no topo</label>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">Dica: use um ficheiro com fundo transparente para melhor resultado.</p>
            </details>

            {/* Frete & Transporte local */}
            <details className="bg-white rounded-2xl shadow p-4">
              <summary className="cursor-pointer select-none font-medium">Frete — Descontos por Volume & Transporte Local</summary>
              <div className="mt-3 space-y-4">
                {(mode === "Aéreo Express" || mode === "Aéreo (Carga)") && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Fator volumétrico (kg/m³)</label>
                        <input type="number" step={1} value={airVolFactor} onChange={(e)=>setAirVolFactor(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Mínimo cobrado (kg)</label>
                        <input type="number" step={1} value={airMinChargeKg} onChange={(e)=>setAirMinChargeKg(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Taxas fixas (€)</label>
                        <input type="number" step={1} value={airFixedFees} onChange={(e)=>setAirFixedFees(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Escalões de preço (€/kg)</h4>
                      <TierEditor tiers={airTiers} setTiers={setAirTiers} unitLabel="kg"/>
                    </div>
                  </div>
                )}
                {mode === "Marítimo LCL" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Mínimo (m³)</label>
                        <input type="number" step={0.1} value={lclMinCbm} onChange={(e)=>setLclMinCbm(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Taxas fixas (€)</label>
                        <input type="number" step={1} value={lclFixedFees} onChange={(e)=>setLclFixedFees(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Escalões de preço (€/m³)</h4>
                      <TierEditor tiers={lclTiers} setTiers={setLclTiers} unitLabel="m³"/>
                    </div>
                  </div>
                )}
                {(mode === "Marítimo FCL 20'" || mode === "Marítimo FCL 40'") && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {mode === "Marítimo FCL 20'" && (
                      <div>
                        <label className="text-xs text-gray-600">Preço por 20' (€)</label>
                        <input type="number" step={10} value={fcl20Price} onChange={(e)=>setFcl20Price(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                    )}
                    {mode === "Marítimo FCL 40'" && (
                      <div>
                        <label className="text-xs text-gray-600">Preço por 40' (€)</label>
                        <input type="number" step={10} value={fcl40Price} onChange={(e)=>setFcl40Price(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-600">Taxas fixas (€)</label>
                      <input type="number" step={1} value={fclFixedFees} onChange={(e)=>setFclFixedFees(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                    </div>
                    <div className="col-span-2 text-[11px] text-gray-500 flex items-end">Capacidade aproximada: {mode.includes("20") ? FCL_CAPACITY["Marítimo FCL 20'"] : FCL_CAPACITY["Marítimo FCL 40'"]} m³</div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2 md:col-span-2">
                    <label className="text-xs text-gray-600">Transporte local na origem (€)</label>
                    <input type="number" step={1} value={localOriginTransport} onChange={(e)=>setLocalOriginTransport(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                    <p className="text-[11px] text-gray-500 mt-1">Ex.: China→Hong Kong, fábrica→porto de embarque, consolidação.</p>
                  </div>
                </div>
              </div>
            </details>

            {/* Impostos */}
            <details className="bg-white rounded-2xl shadow p-4">
              <summary className="cursor-pointer select-none font-medium">Impostos</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div className="flex items-center gap-2 col-span-2">
                  <input id="ignHS" type="checkbox" checked={ignoreDuty} onChange={(e)=>setIgnoreDuty(e.target.checked)} />
                  <label htmlFor="ignHS" className="text-sm">Ignorar direitos (HS)</label>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <input id="origTar" type="checkbox" checked={originTariffEnabled} onChange={(e)=>setOriginTariffEnabled(e.target.checked)} disabled={ignoreDuty} />
                  <label htmlFor="origTar" className="text-sm">Usar tabela por <strong>origem do produto</strong></label>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Direitos (% manual)</label>
                  <input type="number" step={0.1} value={dutyPct} disabled={ignoreDuty || originTariffEnabled} onChange={(e)=>setDutyPct(Number(e.target.value))} className="w-full border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Tabela por origem do produto (%)</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-1">
                    {([...ORIGINS, "Outro"]) .map((o)=> (
                      <div key={o} className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 w-20 truncate" title={o}>{o}</span>
                        <input type="number" step={0.1} value={originDutyMap[o] ?? 0} disabled={ignoreDuty || !originTariffEnabled} onChange={(e)=>setOriginDutyMap({ ...originDutyMap, [o]: Number(e.target.value) })} className="w-full border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"/>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">Ex.: definir 0% para eletrónica abrangida pelo ITA; ajustar se houver medidas anti-dumping específicas.</div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">IVA (%)</label>
                  <input type="number" step={0.1} value={vatPct} onChange={(e)=>setVatPct(Number(e.target.value))} className="w-full border rounded px-2 py-1"/>
                </div>
                <div className="flex items-end gap-2">
                  <input id="vatrec" type="checkbox" checked={vatRecoverable} onChange={(e)=>setVatRecoverable(e.target.checked)} />
                  <label htmlFor="vatrec" className="text-sm">IVA é recuperável?</label>
                </div>
                <div className="text-[11px] text-gray-500 flex items-end col-span-2">Base do IVA: CIF (inclui transp. local na origem) + Direitos + taxas (despachante/THC/outros)</div>
              </div>
            </details>
          </section>

          {/* RIGHT: Results */}
          <section className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-xs text-gray-500">Custo total (sem IVA recuperável)</div>
                <div className="text-2xl font-semibold">{moneyPt(landedExVAT)}</div>
                <div className="text-[11px] text-gray-500 mt-1">Inclui mercadoria, transp. local, frete, seguro, direitos e taxas.</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-xs text-gray-500">Custo por unidade</div>
                <div className="text-2xl font-semibold">{moneyPt(unitLanded)}</div>
                <div className="text-[11px] text-gray-500 mt-1">{qty} un • Origem produto: {productOrigin} • Frete: {shipOrigin} • {freight.basisLabel}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-sm font-medium mb-2">Composição do custo</div>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={composition} dataKey="value" nameKey="name" outerRadius={90} label={(d)=>`${d.name}`}> 
                        {composition.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v)=>moneyPt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-sm font-medium mb-2">Impostos</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-3 rounded-lg bg-gray-50">
                    <div className="text-gray-500">Direitos (efetivo {effectiveDutyPct.toFixed(2)}%)</div>
                    <div className="text-lg font-semibold">{moneyPt(dutyEUR)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <div className="text-gray-500">IVA</div>
                    <div className="text-lg font-semibold">{moneyPt(vatEUR)}</div>
                    <div className="text-[11px] text-gray-500">{vatRecoverable ? "Recuperável (não entra no custo)" : "Não recuperável (incluído)"}</div>
                  </div>
                  <div className="col-span-2 text-[11px] text-gray-500">Base aduaneira (CIF): {moneyPt(customsBase)}</div>
                </div>
              </div>
            </div>

            {/* Sensitivity chart */}
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Economia por Volume — Custo por unidade vs Quantidade</div>
                <div className="text-[11px] text-gray-500">Amostra dinâmica até {numberPt(Math.max(2000, qty*2))} un.</div>
              </div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={sensitivityData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="qty" tickFormatter={(v)=>numberPt(v)} />
                    <YAxis tickFormatter={(v)=>moneyPt(v)} />
                    <Tooltip formatter={(v)=>moneyPt(v)} labelFormatter={(l)=>`Qtd: ${numberPt(l)}`}/>
                    <Line type="monotone" dataKey="unit" stroke="#0ea5e9" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Notas de cálculo */}
            <div className="bg-white rounded-2xl shadow p-4 text-[13px] leading-relaxed">
              <div className="font-medium mb-1">Notas e pressupostos</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li><strong>Origem do produto</strong> (país de fabrico) influencia direitos, medidas de defesa comercial e regras de origem. <strong>Origem do frete</strong> apenas afeta logística.</li>
                <li>Se não quiser considerar <strong>código harmonizado (HS)</strong>, marque "Ignorar direitos" (0%). Em alternativa use a <strong>tabela por origem</strong> para um rascunho rápido.</li>
                <li>UE calcula <strong>Direitos</strong> sobre o <strong>CIF</strong> (mercadoria + frete + seguro + pré-carriage quando pago pelo importador).</li>
                <li>O <strong>IVA de importação</strong> incide sobre (CIF + Direitos + taxas elegíveis). Se recuperável, não compõe o custo final.</li>
                <li>Frete Aéreo usa <strong>peso volumétrico</strong> (m³ × fator) e escalões por kg. LCL usa escalões por m³ com mínimo. FCL usa preço por contentor e ocupação.</li>
              </ul>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-[12px] text-gray-500">
          Este simulador é indicativo e não substitui classificação pautal (HS), regras de origem nem cotações formais. Atualize taxas e câmbio antes de decidir.
        </footer>
      </div>
    </div>
  );
}

// ==========================
// Inline TierEditor component (kept at bottom for clarity)
// ==========================
function TierEditor({ tiers, setTiers, unitLabel }) {
  return (
    <div className="space-y-2">
      {tiers.map((t, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Até {t.threshold === Infinity ? "∞" : t.threshold} {unitLabel}</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              value={t.rate}
              onChange={(e) => {
                const v = Number(e.target.value);
                const copy = tiers.slice();
                copy[idx] = { ...t, rate: v };
                setTiers(copy);
              }}
              className="w-full border rounded px-2 py-1"
            />
            <span className="text-sm">€/ {unitLabel === 'kg' ? 'kg' : 'm³'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
