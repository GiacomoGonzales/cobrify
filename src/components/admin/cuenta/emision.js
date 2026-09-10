import { useState } from 'react'

/**
 * El formulario de emisión electrónica de un RUC: régimen de IGV, método
 * (QPse o SUNAT directo) y credenciales.
 *
 * Lo usan dos modales del admin: `SunatModal` (el RUC principal de la cuenta)
 * y `EmisoresModal` (cada RUC adicional). Acá vive la lógica (qué se carga y
 * qué se guarda); los campos en pantalla están en `CamposDeEmision.jsx`. Son el mismo formulario porque un
 * emisor adicional se configura exactamente igual que el negocio; tenerlo dos
 * veces habría dejado, tarde o temprano, un campo en uno y no en el otro.
 *
 * Las credenciales viven en la subcolección PROTEGIDA de cada RUC
 * (emissionSecretsService); al doc público solo van el método y el régimen.
 */

export const FORM_EMISION_VACIO = {
  emissionMethod: 'none',
  qpseUsuario: '',
  qpsePassword: '',
  qpseEnvironment: 'demo',
  solUser: '',
  solPassword: '',
  clientId: '',
  clientSecret: '',
  certificatePassword: '',
  certificateName: '',
  sunatEnvironment: 'beta',
  igvExempt: false,
  igvRate: 18,
  // 'standard' 18% · 'reduced' 10.5% Ley 31556 · 'exempt' 0% Ley 27037 · 'nrus' boleta 0113 con IGV 0
  taxType: 'standard',
}

export const normalizarQpse = env => (env === 'production' || env === 'produccion' ? 'production' : env || 'demo')
export const normalizarSunat = env => (env === 'production' || env === 'produccion' ? 'production' : env || 'beta')

// igvExempt e igvRate segun el regimen. Ley 31556: 8% IGV + 2.5% IPM = 10.5%.
// NRUS lleva igvExempt=true A PROPOSITO: para el POS, los PDFs y las notas de
// credito se comporta EXACTAMENTE como un exonerado (precios finales, sin
// desglose de IGV). La diferencia vive solo en el XML de la boleta, donde el
// generador ve taxType='nrus' y emite tipo de operacion 0113 con lineas
// GRAVADAS (afectacion 10) a tasa 0, que es lo que exige SUNAT para este
// regimen (no confundir con exonerado: eso es afectacion 20).
export const REGIMENES = {
  standard: { igvExempt: false, igvRate: 18 },
  reduced: { igvExempt: false, igvRate: 10.5 },
  exempt: { igvExempt: true, igvRate: 0 },
  nrus: { igvExempt: true, igvRate: 0 },
}

export const NOMBRE_DE_REGIMEN = {
  standard: 'General · IGV 18 %',
  reduced: 'Restaurantes · IGV 10,5 %',
  exempt: 'Amazonía · exonerado',
  nrus: 'NRUS · Nuevo RUS',
}

export const NOMBRE_DE_METODO = { qpse: 'QPse', sunat_direct: 'SUNAT directo', none: 'Sin configurar' }

/**
 * Los campos del formulario a partir de lo guardado: los secretos ya
 * fusionados (`getEmissionSecrets`) y el doc público del RUC (para el
 * régimen viejo de raíz y el `emissionMethod`).
 */
export function formDesdeConfiguracion(em, negocio = {}) {
  let metodo = 'none'
  if (em.qpse?.enabled || em.qpse?.usuario) metodo = 'qpse'
  else if (em.sunat?.enabled || em.sunat?.solUser) metodo = 'sunat_direct'
  else if (em.emissionConfig?.method) metodo = em.emissionConfig.method
  else if (em.emissionConfig?.qpse?.enabled || em.emissionConfig?.qpse?.usuario) metodo = 'qpse'
  else if (em.emissionConfig?.sunat?.enabled || em.emissionConfig?.sunat?.solUser) metodo = 'sunat_direct'
  else if (negocio?.emissionMethod) metodo = negocio.emissionMethod

  const qpse = em.qpse || em.emissionConfig?.qpse || {}
  const sunat = em.sunat || em.emissionConfig?.sunat || {}
  const tax = em.emissionConfig?.taxConfig || negocio?.emissionConfig?.taxConfig || negocio?.taxConfig || {}

  return {
    emissionMethod: metodo,
    qpseUsuario: qpse.usuario || '',
    qpsePassword: qpse.password || '',
    qpseEnvironment: normalizarQpse(qpse.environment),
    solUser: sunat.solUser || '',
    solPassword: sunat.solPassword || '',
    clientId: sunat.clientId || '',
    clientSecret: sunat.clientSecret || '',
    certificatePassword: sunat.certificatePassword || '',
    certificateName: sunat.certificateName || '',
    sunatEnvironment: normalizarSunat(sunat.environment),
    igvExempt: tax.igvExempt || false,
    igvRate: tax.igvRate || 18,
    // taxType guardado manda (un 'nrus' tambien tiene igvExempt=true y
    // derivarlo lo confundiria con 'exempt'); derivar solo en configs
    // antiguas sin taxType. Ley 31556: 10, 10.5 y 8 valen como 'reduced'.
    taxType:
      tax.taxType ||
      (tax.igvExempt ? 'exempt' : tax.igvRate === 10 || tax.igvRate === 10.5 || tax.igvRate === 8 ? 'reduced' : 'standard'),
  }
}

/** Solo la parte base64 del .p12 (sin el prefijo data:...). */
export function leerCertificadoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(lector.result.split(',')[1])
    lector.onerror = () => reject(new Error('No se pudo leer el certificado digital'))
    lector.readAsDataURL(archivo)
  })
}

/**
 * Lo que se guarda a partir del formulario: `{ method, taxConfig, qpse, sunat }`.
 * `secretos` es lo que ya había guardado ese RUC, para conservar el
 * certificado y las firmas al volver a guardar sin tocarlos.
 */
export async function emissionConfigDesdeForm(form, secretos = {}, archivoCertificado = null) {
  const regimen = REGIMENES[form.taxType] || REGIMENES.standard
  const emissionConfig = {
    method: form.emissionMethod,
    taxConfig: { igvExempt: regimen.igvExempt, igvRate: regimen.igvRate, includeIgv: !regimen.igvExempt, taxType: form.taxType },
  }

  if (form.emissionMethod === 'qpse') {
    emissionConfig.qpse = {
      enabled: true,
      usuario: form.qpseUsuario,
      password: form.qpsePassword,
      environment: form.qpseEnvironment,
      firmasDisponibles: secretos.qpse?.firmasDisponibles ?? secretos.emissionConfig?.qpse?.firmasDisponibles ?? 500,
      firmasUsadas: secretos.qpse?.firmasUsadas ?? secretos.emissionConfig?.qpse?.firmasUsadas ?? 0,
    }
    emissionConfig.sunat = { enabled: false }
  } else if (form.emissionMethod === 'sunat_direct') {
    const sunat = {
      enabled: true,
      solUser: form.solUser,
      solPassword: form.solPassword,
      clientId: form.clientId,
      clientSecret: form.clientSecret,
      certificatePassword: form.certificatePassword,
      environment: form.sunatEnvironment,
      homologated: form.sunatEnvironment === 'production',
      certificateName: form.certificateName || secretos.sunat?.certificateName || secretos.emissionConfig?.sunat?.certificateName || '',
      certificateData: secretos.sunat?.certificateData || secretos.emissionConfig?.sunat?.certificateData || null,
    }
    if (archivoCertificado) {
      sunat.certificateData = await leerCertificadoBase64(archivoCertificado)
    } else if (!form.certificateName) {
      sunat.certificateData = null
    }
    emissionConfig.sunat = sunat
    emissionConfig.qpse = { enabled: false }
  } else {
    emissionConfig.qpse = { enabled: false }
    emissionConfig.sunat = { enabled: false }
  }

  return emissionConfig
}

/** Lo que cada modal necesita tener en su estado además del formulario. */
export function useCamposDeEmision() {
  const [ver, setVer] = useState({ qpse: false, sol: false, cert: false, api: false })
  const [archivoCertificado, setArchivoCertificado] = useState(null)
  const alternarVer = campo => setVer(v => ({ ...v, [campo]: !v[campo] }))
  return { ver, alternarVer, archivoCertificado, setArchivoCertificado }
}
