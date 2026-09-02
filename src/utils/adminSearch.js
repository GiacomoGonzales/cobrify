import { buildSearchHaystack } from '@/lib/utils'

/**
 * Texto buscable de una CUENTA del panel de administración — criterio único
 * para Usuarios, Vencimientos, Pagos, Notificaciones, Resellers y Gestión.
 *
 * Cada pantalla armaba su propia lista de campos con un `includes()` de la
 * frase completa, sin quitar tildes ni partir por palabras. En la práctica eso
 * significaba que:
 *
 *   - pegar un correo con un espacio al final ("juan@correo.com ") no
 *     encontraba nada, porque buscaba ese espacio dentro del correo;
 *   - escribir la razón social en otro orden ("TUEROS COMERCIAL" cuando el
 *     negocio es "COMERCIAL TUEROS") tampoco;
 *   - escribirla sin tildes ("compania" por "COMPAÑÍA") tampoco.
 *
 * Con el haystack pre-normalizado y `matchesPrebuilt`, la consulta se parte en
 * palabras y todas tienen que aparecer, en cualquier orden. Los espacios de
 * sobra dejan de importar: son separadores, no texto a buscar.
 *
 * Los campos que no existan en un objeto se ignoran solos, así que la misma
 * función sirve para los registros completos de Usuarios y para los livianos de
 * Pagos o Vencimientos, que solo traen correo y razón social.
 *
 * @param {object} u Cuenta (usuario, suscripción, pago o reseller)
 * @returns {string} haystack normalizado (minúsculas, sin tildes)
 */
export function buildAccountHaystack(u) {
  if (!u) return ''

  // RUC y teléfonos se guardan de mil formas ("20 123 456 789", "999-888-777").
  // Se indexa también la versión de puros dígitos para que el admin los pueda
  // pegar tal como se los mandaron por WhatsApp.
  const soloDigitos = (v) => {
    const d = String(v || '').replace(/\D/g, '')
    return d.length >= 4 ? d : ''
  }

  // Sub-usuarios: buscar por el correo del cajero para llegar a la cuenta del
  // dueño. Es el camino que se recorre en soporte —el cliente escribe desde el
  // usuario secundario— y hasta ahora había que adivinar de quién dependía.
  const deSubUsuarios = Array.isArray(u.subUsers)
    ? u.subUsers.flatMap(s => s ? [s.email, s.displayName] : [])
    : []

  return buildSearchHaystack(
    // Identidad
    u.email,
    u.businessName,
    u.companyName,      // resellers
    u.contactName,
    String(u.userNumber || ''),
    String(u.codigoCliente || ''),   // código de cliente (1000001…)
    u.rubroNombre,                   // "ferretería", "botica"… confirmado o sugerido
    u.id,
    u.userId,
    // Documentos y teléfonos
    u.ruc,
    soloDigitos(u.ruc),
    u.phone,
    soloDigitos(u.phone),
    u.contactPhone,
    soloDigitos(u.contactPhone),
    // Dónde está
    u.address,
    u.department,
    u.province,
    u.district,
    u.mainBranchName,
    // Comercial
    u.planName,
    u.plan,
    u.resellerName,
    // Catálogo online: se busca por el link que el cliente manda
    u.catalogSlug,
    u.customDomain,
    ...deSubUsuarios,
  )
}
