import assert from "node:assert/strict";
import { mergeEquivalent, chartModel, esc, renderFinancingChart, renderPlazoTabs } from "./financing-chart.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Datos de prueba representativos para plazo 12 y 24
const sampleOptions = [
  {
    methodKey: "credito",
    label: "Tarjeta de Crédito Tradicional",
    n: 12,
    capital: 1_000_000,
    cuota: 99_500,
    intereses: 194_000,
    total: 1_194_000,
  },
  {
    methodKey: "cmr",
    label: "Tarjeta CMR",
    n: 12,
    capital: 900_000,
    cuota: 89_550,
    intereses: 174_600,
    total: 1_074_600,
  },
  {
    methodKey: "libre",
    label: "Crédito de Libre Inversión",
    n: 12,
    capital: 1_000_000,
    cuota: 94_500,
    intereses: 134_000,
    total: 1_134_000,
  },
  {
    methodKey: "cmr",
    label: "Tarjeta CMR",
    n: 24,
    capital: 900_000,
    cuota: 51_000,
    intereses: 324_000,
    total: 1_224_000,
  },
];

console.log("Iniciando tests de financing-chart...");

// 1. Filtrado por plazo n y orden ascendente por total
{
  const res12 = chartModel(sampleOptions, 12);
  assert.equal(res12.rows.length, 3, "Debe filtrar solo las 3 opciones con n=12");

  // Orden ascendente por total: cmr (1_074_600) < libre (1_134_000) < credito (1_194_000)
  assert.equal(res12.rows[0].methodKey, "cmr");
  assert.equal(res12.rows[1].methodKey, "libre");
  assert.equal(res12.rows[2].methodKey, "credito");

  assert.ok(res12.rows[0].total <= res12.rows[1].total);
  assert.ok(res12.rows[1].total <= res12.rows[2].total);
  assert.equal(res12.maxTotal, 1_194_000);
  console.log("✓ Test 1: Filtrado y orden ascendente OK");
}

// 2. Porcentajes suman 100
{
  const res = chartModel(sampleOptions, 12);
  for (const row of res.rows) {
    close(row.capitalPct + row.interesPct, 100, 1e-9);
    assert.ok(row.capitalPct > 0 && row.capitalPct <= 100);
    assert.ok(row.interesPct >= 0 && row.interesPct < 100);
  }

  // Caso con números decimales periódicos (ej: 1/3 capital, 2/3 intereses)
  const periodicOption = [
    { methodKey: "test", label: "Test", n: 12, capital: 1, intereses: 2, total: 3 },
  ];
  const periodicRes = chartModel(periodicOption, 12);
  close(periodicRes.rows[0].capitalPct + periodicRes.rows[0].interesPct, 100, 1e-9);
  console.log("✓ Test 2: Porcentajes suman 100 OK");
}

// 3. Mejor marcado (isBest con y sin recommendedKey)
{
  // Con recommendedKey explícito
  const resWithKey = chartModel(sampleOptions, 12, "cmr");
  const cmrRow = resWithKey.rows.find((r) => r.methodKey === "cmr");
  const libreRow = resWithKey.rows.find((r) => r.methodKey === "libre");
  const creditoRow = resWithKey.rows.find((r) => r.methodKey === "credito");

  assert.equal(cmrRow.isBest, true, "cmr debe estar marcado como isBest");
  assert.equal(libreRow.isBest, false, "libre no debe ser isBest");
  assert.equal(creditoRow.isBest, false, "credito no debe ser isBest");

  // Sin recommendedKey (debe tomar la opción con menor total)
  const resWithoutKey = chartModel(sampleOptions, 12);
  assert.equal(resWithoutKey.rows[0].isBest, true, "Primera opción ordenada debe ser isBest");
  assert.equal(resWithoutKey.rows[1].isBest, false);
  assert.equal(resWithoutKey.rows[2].isBest, false);
  console.log("✓ Test 3: Mejor marcado OK");
}

// 4. Lista vacía o sin coincidencias de plazo
{
  const emptyRes = chartModel([], 12);
  assert.deepEqual(emptyRes, { maxTotal: 0, rows: [] });

  const nullRes = chartModel(null, 12);
  assert.deepEqual(nullRes, { maxTotal: 0, rows: [] });

  const noMatchRes = chartModel(sampleOptions, 36);
  assert.deepEqual(noMatchRes, { maxTotal: 0, rows: [] });
  console.log("✓ Test 4: Lista vacía OK");
}

// 5. Intereses 0 (sin NaN ni división por cero)
{
  const zeroInterestOption = [
    { methodKey: "tasa0", label: "0% Interés", n: 12, capital: 1_200_000, intereses: 0, total: 1_200_000 },
  ];
  const zeroRes = chartModel(zeroInterestOption, 12);
  assert.equal(zeroRes.rows.length, 1);
  const row = zeroRes.rows[0];

  assert.equal(row.intereses, 0);
  assert.equal(row.capitalPct, 100);
  assert.equal(row.interesPct, 0);
  close(row.capitalPct + row.interesPct, 100);
  assert.equal(row.widthPct, 100);
  assert.equal(row.isBest, true);
  assert.equal(row.extraVsBest, 0);
  assert.ok(!Number.isNaN(row.capitalPct));
  assert.ok(!Number.isNaN(row.interesPct));
  assert.ok(!Number.isNaN(row.widthPct));
  console.log("✓ Test 5: Intereses 0 OK");
}

// 6. extraVsBest y widthPct
{
  const res = chartModel(sampleOptions, 12, "cmr");
  const cmrRow = res.rows[0];
  const libreRow = res.rows[1];
  const creditoRow = res.rows[2];

  assert.equal(cmrRow.extraVsBest, 0, "La mejor opción tiene extraVsBest = 0");
  assert.equal(libreRow.extraVsBest, 1_134_000 - 1_074_600); // 59_400
  assert.equal(creditoRow.extraVsBest, 1_194_000 - 1_074_600); // 119_400

  // widthPct relativo a maxTotal (1_194_000)
  close(creditoRow.widthPct, 100, 1e-6); // maxTotal tiene 100%
  close(cmrRow.widthPct, (1_074_600 / 1_194_000) * 100, 1e-6);
  console.log("✓ Test 6: extraVsBest y widthPct OK");
}

// 7. Renderizado seguro (sin fallos en Node con mock simple)
{
  const mockContainer = { innerHTML: "", querySelectorAll: () => [] };
  renderFinancingChart(mockContainer, sampleOptions, { n: 12, recommendedKey: "cmr" });
  assert.ok(mockContainer.innerHTML.includes("Capital vs. intereses a 12 meses"));
  assert.ok(mockContainer.innerHTML.includes("role=\"img\""));
  assert.ok(mockContainer.innerHTML.includes("Más inteligente"));
  assert.ok(mockContainer.innerHTML.includes("details"));

  // Plazo tabs
  renderPlazoTabs(mockContainer, [12, 24, 36], 12, () => {});
  assert.ok(mockContainer.innerHTML.includes('aria-pressed="true"'));
  assert.ok(mockContainer.innerHTML.includes('aria-pressed="false"'));
  assert.ok(mockContainer.innerHTML.includes("12 meses"));
  console.log("✓ Test 7: Renderizado DOM mock OK");
}

// 8. Escaping XSS
{
  assert.equal(esc("<script>alert('xss')</script>"), "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  console.log("✓ Test 8: Escaping OK");
}

console.log("\nTodos los tests pasaron exitosamente!");

{
  const o = [{methodKey:"a",label:"Tarjeta Nu",n:12,capital:100,total:120},{methodKey:"b",label:"Tarjeta Bancolombia",n:12,capital:100,total:120},{methodKey:"c",label:"Libre",n:12,capital:100,total:110}];
  const m = mergeEquivalent(o, "b");
  assert.equal(m.length, 2); assert.equal(m[0].methodKey, "b"); assert.ok(m[0].label.includes("Nu"));
  console.log("✓ mergeEquivalent OK");
}
