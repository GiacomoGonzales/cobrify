/**
 * Test de validación SUNAT para xmlGenerator.js
 * Verifica que los XMLs generados cumplan las fórmulas de validación de SUNAT:
 * - 4287: AlternativeConditionPrice = (LineExtensionAmount + IGV) / Quantity
 * - 4288: LineExtensionAmount = (Quantity × PriceAmount) - AllowanceCharge.Amount
 * - 4309: Suma de LineExtensionAmount de líneas = LineExtensionAmount global
 * - 4310: Suma de IGV de líneas = IGV global
 *
 * Ejecutar: node --experimental-vm-modules test-xml-validation.mjs
 */

import { generateInvoiceXML } from './src/utils/xmlGenerator.js'

// ============================
// Datos base del negocio
// ============================
const businessData = {
  ruc: '20123456789',
  businessName: 'EMPRESA TEST S.A.C.',
  tradeName: 'TEST',
  address: 'Av. Test 123',
  department: 'LIMA',
  province: 'LIMA',
  district: 'LIMA',
  urbanization: '',
  emissionConfig: {
    taxConfig: {
      igvRate: 18,
      igvExempt: false,
      taxType: 'standard'
    }
  }
}

// ============================
// Helper: extraer valores del XML
// ============================
function extractLineValues(xml) {
  const lines = []
  // Split por InvoiceLine
  const lineParts = xml.split('<cac:InvoiceLine>')
  for (let i = 1; i < lineParts.length; i++) {
    const part = lineParts[i].split('</cac:InvoiceLine>')[0]

    const qty = parseFloat(part.match(/<cbc:InvoicedQuantity[^>]*>([\d.]+)/)?.[1] || 0)
    const lineExtension = parseFloat(part.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)/)?.[1] || 0)

    // AlternativeConditionPrice
    const altPrice = parseFloat(part.match(/<cac:AlternativeConditionPrice>\s*<cbc:PriceAmount[^>]*>([\d.]+)/)?.[1] || 0)

    // AllowanceCharge Amount (item discount)
    const allowanceMatch = part.match(/<cac:AllowanceCharge>[\s\S]*?<cbc:Amount[^>]*>([\d.]+)/)
    const allowanceCharge = allowanceMatch ? parseFloat(allowanceMatch[1]) : 0

    // TaxAmount (line IGV)
    const lineIgv = parseFloat(part.match(/<cac:TaxTotal>\s*<cbc:TaxAmount[^>]*>([\d.]+)/)?.[1] || 0)

    // cac:Price/PriceAmount (unit price without IGV)
    const priceAmount = parseFloat(part.match(/<cac:Price>\s*<cbc:PriceAmount[^>]*>([\d.]+)/)?.[1] || 0)

    // Percent
    const percent = parseFloat(part.match(/<cbc:Percent>([\d.]+)/)?.[1] || 0)

    // TaxExemptionReasonCode
    const taxAffectation = part.match(/<cbc:TaxExemptionReasonCode[^>]*>(\d+)/)?.[1] || '10'

    lines.push({ qty, lineExtension, altPrice, allowanceCharge, lineIgv, priceAmount, percent, taxAffectation })
  }
  return lines
}

function extractGlobalValues(xml) {
  // Get the TaxTotal BEFORE InvoiceLine (document level)
  const beforeItems = xml.split('<cac:InvoiceLine>')[0]

  // Document-level TaxAmount
  const taxTotalMatch = beforeItems.match(/<cac:TaxTotal>\s*<cbc:TaxAmount[^>]*>([\d.]+)/)
  const totalIgv = taxTotalMatch ? parseFloat(taxTotalMatch[1]) : 0

  // LegalMonetaryTotal
  const lineExtTotal = parseFloat(beforeItems.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)/)?.[1] || 0)
  const payableAmount = parseFloat(xml.match(/<cbc:PayableAmount[^>]*>([\d.]+)/)?.[1] || 0)

  return { totalIgv, lineExtTotal, payableAmount }
}

function validate(testName, xml) {
  const lines = extractLineValues(xml)
  const global = extractGlobalValues(xml)
  let allPass = true
  const errors = []

  // Validate each line
  lines.forEach((line, i) => {
    // 4287: AlternativeConditionPrice = (LineExtensionAmount + IGV) / Qty
    if (line.taxAffectation === '10') {
      const expected4287 = (line.lineExtension + line.lineIgv) / line.qty
      const diff4287 = Math.abs(line.altPrice - expected4287)
      if (diff4287 > 0.02) {
        errors.push(`  Line ${i+1} - 4287 FAIL: AltPrice=${line.altPrice}, expected=${expected4287.toFixed(2)} (diff=${diff4287.toFixed(4)})`)
        allPass = false
      }
    }

    // 4288: LineExtensionAmount = (Qty × PriceAmount) - AllowanceCharge
    const expected4288 = Math.round((line.qty * line.priceAmount - line.allowanceCharge) * 100) / 100
    const diff4288 = Math.abs(line.lineExtension - expected4288)
    if (diff4288 > 0.02) {
      errors.push(`  Line ${i+1} - 4288 FAIL: LineExt=${line.lineExtension}, expected=${expected4288.toFixed(2)} (diff=${diff4288.toFixed(4)})`)
      allPass = false
    }
  })

  // 4309: Sum of line LineExtensionAmounts = global LineExtensionAmount
  const sumLineExt = lines.reduce((s, l) => s + l.lineExtension, 0)
  const diff4309 = Math.abs(sumLineExt - global.lineExtTotal)
  if (diff4309 > 0.02) {
    errors.push(`  4309 FAIL: Sum LineExt=${sumLineExt.toFixed(2)}, Global=${global.lineExtTotal} (diff=${diff4309.toFixed(4)})`)
    allPass = false
  }

  // 4310: Sum of line IGVs = global IGV
  const sumIgv = lines.reduce((s, l) => s + l.lineIgv, 0)
  const diff4310 = Math.abs(sumIgv - global.totalIgv)
  if (diff4310 > 0.02) {
    errors.push(`  4310 FAIL: Sum IGV=${sumIgv.toFixed(2)}, Global=${global.totalIgv} (diff=${diff4310.toFixed(4)})`)
    allPass = false
  }

  if (allPass) {
    console.log(`✅ ${testName}`)
    lines.forEach((l, i) => {
      console.log(`   Line ${i+1}: Ext=${l.lineExtension} IGV=${l.lineIgv} Alt=${l.altPrice} Price=${l.priceAmount} Disc=${l.allowanceCharge} %=${l.percent} Aff=${l.taxAffectation}`)
    })
    console.log(`   Global: LineExt=${global.lineExtTotal} IGV=${global.totalIgv} Payable=${global.payableAmount}`)
  } else {
    console.log(`❌ ${testName}`)
    errors.forEach(e => console.log(e))
    lines.forEach((l, i) => {
      console.log(`   Line ${i+1}: Ext=${l.lineExtension} IGV=${l.lineIgv} Alt=${l.altPrice} Price=${l.priceAmount} Disc=${l.allowanceCharge} %=${l.percent} Aff=${l.taxAffectation}`)
    })
    console.log(`   Global: LineExt=${global.lineExtTotal} IGV=${global.totalIgv} Payable=${global.payableAmount}`)
  }

  return allPass
}

// ============================
// ESCENARIOS DE TEST
// ============================

let allTests = true

// --- TEST 1: Boleta normal, 1 item, 18%, sin descuento ---
console.log('\n========================================')
console.log('TEST 1: Boleta normal, 1 item, 18%, sin descuento')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 1,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'Producto A', quantity: 1, unitPrice: 100, unit: 'NIU', taxAffectation: '10' }
    ],
    subtotal: 84.75,
    igv: 15.25,
    total: 100,
    discount: 0,
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Boleta normal 1 item 18%', xml)) allTests = false
}

// --- TEST 2: Boleta 2 items, ambos 18%, sin descuento ---
console.log('\n========================================')
console.log('TEST 2: Boleta 2 items, ambos 18%, sin descuento')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 2,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'Producto A', quantity: 2, unitPrice: 50, unit: 'NIU', taxAffectation: '10' },
      { name: 'Producto B', quantity: 1, unitPrice: 30, unit: 'NIU', taxAffectation: '10' }
    ],
    subtotal: 110.17,
    igv: 19.83,
    total: 130,
    discount: 0,
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Boleta 2 items 18% sin descuento', xml)) allTests = false
}

// --- TEST 3: Boleta con descuento GLOBAL, sin item discount ---
console.log('\n========================================')
console.log('TEST 3: Boleta con descuento GLOBAL (10 soles), sin item discount')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 3,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'Producto A', quantity: 1, unitPrice: 100, unit: 'NIU', taxAffectation: '10' },
      { name: 'Producto B', quantity: 1, unitPrice: 50, unit: 'NIU', taxAffectation: '10' }
    ],
    subtotal: 118.64,
    igv: 21.36,
    total: 140,
    discount: 10,
    globalDiscount: 10,
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Boleta descuento global 18%', xml)) allTests = false
}

// --- TEST 4: Boleta con ITEM DISCOUNT (el caso problemático) ---
console.log('\n========================================')
console.log('TEST 4: Boleta con ITEM DISCOUNT (25 soles en Polera)')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 4,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'MENU', quantity: 1, unitPrice: 10, unit: 'NIU', taxAffectation: '10', igvRate: 10 },
      { name: 'Polera', quantity: 1, unitPrice: 40, unit: 'NIU', taxAffectation: '10', igvRate: 18, itemDiscount: 25 }
    ],
    subtotal: 21.80,
    igv: 3.20,
    total: 25,
    discount: 25,
    globalDiscount: 0,
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Boleta item discount + tasas mixtas', xml)) allTests = false
}

// --- TEST 5: Tasas mixtas (18% + 10%), SIN descuento ---
console.log('\n========================================')
console.log('TEST 5: Tasas mixtas (18% + 10%), SIN descuento')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 5,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'Hamburguesa', quantity: 2, unitPrice: 15, unit: 'NIU', taxAffectation: '10', igvRate: 10 },
      { name: 'Camiseta', quantity: 1, unitPrice: 59, unit: 'NIU', taxAffectation: '10', igvRate: 18 }
    ],
    subtotal: 77.27,
    igv: 11.73,
    total: 89,
    discount: 0,
    globalDiscount: 0,
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Tasas mixtas sin descuento', xml)) allTests = false
}

// --- TEST 6: Producto exonerado + gravado ---
console.log('\n========================================')
console.log('TEST 6: Producto exonerado + gravado')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 6,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'Producto Gravado', quantity: 1, unitPrice: 100, unit: 'NIU', taxAffectation: '10' },
      { name: 'Producto Exonerado', quantity: 1, unitPrice: 50, unit: 'NIU', taxAffectation: '20' }
    ],
    subtotal: 134.75,
    igv: 15.25,
    total: 150,
    discount: 0,
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Gravado + Exonerado', xml)) allTests = false
}

// --- TEST 7: Factura antigua SIN globalDiscount (backward compat) ---
console.log('\n========================================')
console.log('TEST 7: Factura antigua SIN campo globalDiscount (backward compat)')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'factura',
    series: 'F001',
    correlativeNumber: 7,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'RUC', documentNumber: '20123456780', name: 'EMPRESA CLIENTE', businessName: 'EMPRESA CLIENTE S.A.C.' },
    items: [
      { name: 'Servicio', quantity: 1, unitPrice: 200, unit: 'ZZ', taxAffectation: '10' }
    ],
    subtotal: 169.49,
    igv: 30.51,
    total: 200,
    discount: 0,
    // SIN globalDiscount — simula factura antigua
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Factura antigua sin globalDiscount', xml)) allTests = false
}

// --- TEST 8: Factura antigua CON descuento, SIN globalDiscount ---
console.log('\n========================================')
console.log('TEST 8: Factura antigua CON descuento, SIN globalDiscount (backward compat)')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'factura',
    series: 'F001',
    correlativeNumber: 8,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'RUC', documentNumber: '20123456780', name: 'EMPRESA CLIENTE', businessName: 'EMPRESA CLIENTE S.A.C.' },
    items: [
      { name: 'Producto A', quantity: 1, unitPrice: 100, unit: 'NIU', taxAffectation: '10' },
      { name: 'Producto B', quantity: 1, unitPrice: 50, unit: 'NIU', taxAffectation: '10' }
    ],
    subtotal: 118.64,
    igv: 21.36,
    total: 140,
    discount: 10,
    // SIN globalDiscount — simula factura antigua con descuento global
    taxConfig: { igvRate: 18, igvExempt: false }
  }, businessData)

  if (!validate('Factura antigua con descuento sin globalDiscount', xml)) allTests = false
}

// --- TEST 9: Ley de la Selva (exonerado forzado) ---
console.log('\n========================================')
console.log('TEST 9: Ley de la Selva (igvExempt=true)')
console.log('========================================')
{
  const xml = generateInvoiceXML({
    documentType: 'boleta',
    series: 'B001',
    correlativeNumber: 9,
    issueDate: '2026-02-08',
    currency: 'PEN',
    customer: { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE TEST' },
    items: [
      { name: 'Producto Selva', quantity: 3, unitPrice: 20, unit: 'NIU', taxAffectation: '10', igvRate: 18 }
    ],
    subtotal: 60,
    igv: 0,
    total: 60,
    discount: 0,
    taxConfig: { igvRate: 18, igvExempt: true, exemptionReason: 'Ley de la Selva' }
  }, businessData)

  if (!validate('Ley de la Selva (exonerado)', xml)) allTests = false
}

// ============================
// RESULTADO FINAL
// ============================
console.log('\n========================================')
if (allTests) {
  console.log('🎉 TODOS LOS TESTS PASARON')
} else {
  console.log('💥 ALGUNOS TESTS FALLARON')
  process.exit(1)
}
console.log('========================================\n')
