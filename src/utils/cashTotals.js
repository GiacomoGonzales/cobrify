/**
 * "Total dinero" de un cierre de caja: el efectivo esperado del cajón MÁS los
 * saldos esperados de las billeteras digitales (Yape, Plin).
 *
 * Criterio ÚNICO para todas las vistas del cierre — pantalla, historial, ticket
 * web, ticket térmico, PDF y Excel. Antes vivía copiado en dos sitios con
 * fórmulas escritas por separado; en cuanto una se tocara, el mismo cierre
 * mostraría números distintos según por dónde se mirara.
 *
 * Solo PEN: el efectivo en dólares se cuadra en su propio bloque.
 *
 * @param {object} session Sesión de caja cerrada (o datos equivalentes)
 * @returns {{ expectedCash:number, expectedYape:number, expectedPlin:number,
 *             hasYape:boolean, hasPlin:boolean, hasWallets:boolean,
 *             totalMoney:number }}
 */
export function getSessionMoneyTotals(session) {
  const n = (v) => Number(v) || 0
  const s = session || {}

  const expectedCash = n(s.expectedAmount)

  // Yape: si el cierre guardó el esperado, manda ese; si no (cierres viejos),
  // se reconstruye con la misma fórmula que usa el arqueo.
  const yapeOpening = n(s.openingAmountYape)
  const yapeSales = n(s.salesYape)
  const yapeIncome = n(s.totalIncomeYape)
  const yapeExpense = n(s.totalExpenseYape)
  const yapeClosing = n(s.closingYape)
  const hasYape = yapeOpening > 0 || yapeSales > 0 || yapeIncome > 0 || yapeExpense > 0 || yapeClosing > 0
  const expectedYape = s.expectedAmountYape !== undefined && s.expectedAmountYape !== null
    ? n(s.expectedAmountYape)
    : (yapeOpening + yapeSales + yapeIncome - yapeExpense)

  const plinOpening = n(s.openingAmountPlin)
  const plinSales = n(s.salesPlin)
  const plinIncome = n(s.totalIncomePlin)
  const plinExpense = n(s.totalExpensePlin)
  const plinClosing = n(s.closingPlin)
  const hasPlin = plinOpening > 0 || plinSales > 0 || plinIncome > 0 || plinExpense > 0 || plinClosing > 0
  const expectedPlin = s.expectedAmountPlin !== undefined && s.expectedAmountPlin !== null
    ? n(s.expectedAmountPlin)
    : (plinOpening + plinSales + plinIncome - plinExpense)

  const totalMoney = expectedCash
    + (hasYape ? expectedYape : 0)
    + (hasPlin ? expectedPlin : 0)

  return {
    expectedCash,
    expectedYape,
    expectedPlin,
    hasYape,
    hasPlin,
    hasWallets: hasYape || hasPlin,
    totalMoney,
  }
}
