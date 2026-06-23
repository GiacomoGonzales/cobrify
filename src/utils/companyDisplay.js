/**
 * Datos de empresa EFECTIVOS para mostrar en un documento (comprobante, cotización,
 * guía, ticket) o en el catálogo.
 *
 * Cada SUCURSAL puede tener su propio logo, nombre comercial, dirección y teléfono
 * (independientes del negocio), igual que tiene su propio modo. Cuando un documento
 * se emite desde una sucursal, esos datos se "congelan" en el doc como campos
 * `branchLogoUrl` / `branchTradeName` / `branchName` / `branchAddress` / `branchPhone`.
 *
 * Esta función prefiere esos campos de la sucursal y cae a los datos GLOBALES del
 * negocio (companySettings) cuando la sucursal no los define o el documento es de la
 * Sucursal Principal (que = el doc del negocio).
 *
 * El RUC y la razón social NUNCA se overridean (son del RUC, legalmente uno solo).
 *
 * @param {Object} companySettings - datos globales del negocio (businesses/{id})
 * @param {Object} snap - documento o snapshot con posibles campos branch* (invoice,
 *   quotation, guide, o el objeto de la sucursal activa con {logoUrl,tradeName,...})
 * @returns {{logoUrl:(string|null), name:string, address:string, phone:string}}
 */
export function resolveBranchCompanyInfo(companySettings = {}, snap = {}) {
  const cs = companySettings || {}
  const s = snap || {}
  return {
    logoUrl: s.branchLogoUrl || cs.logoUrl || null,
    // Nombre a mostrar: nombre comercial PROPIO de la sucursal (si la sucursal definió
    // uno) > nombre comercial del negocio > razón social > nombre interno de la sucursal
    // (último recurso). Antes el nombre interno de la sucursal ("Tienda Tacna") ganaba
    // sobre el nombre comercial del negocio, por lo que los comprobantes de una sucursal
    // mostraban "Tienda Tacna" en vez de "GRUPO ASSAD". El nombre interno de la sucursal
    // es una etiqueta de ubicación, no un nombre comercial: solo se usa si no hay nada más.
    name: s.branchTradeName || cs.name || cs.businessName || s.branchName || '',
    address: s.branchAddress || cs.address || '',
    phone: s.branchPhone || cs.phone || '',
  }
}

/**
 * Construye el snapshot de datos de sucursal para guardar en un documento al emitir.
 * Acepta el objeto de la sucursal activa (branch) y devuelve los campos branch*.
 * Si no hay sucursal (Sucursal Principal), devuelve nulls → el doc usará lo global.
 *
 * @param {Object|null} branch - objeto de la sucursal activa (o null = Principal)
 * @returns {{branchId,branchName,branchTradeName,branchLogoUrl,branchAddress,branchPhone}}
 */
export function buildBranchSnapshot(branch) {
  const b = branch || null
  return {
    branchId: b?.id || null,
    branchName: b?.name || null,
    branchTradeName: b?.tradeName || null,
    branchLogoUrl: b?.logoUrl || null,
    branchAddress: b?.address || null,
    branchPhone: b?.phone || null,
  }
}
