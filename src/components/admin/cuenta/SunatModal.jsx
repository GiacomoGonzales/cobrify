import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getEmissionSecrets, saveEmissionSecrets } from '@/services/emissionSecretsService'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Casilla } from '@/components/admin/ui'
import { FORM_EMISION_VACIO, formDesdeConfiguracion, emissionConfigDesdeForm, useCamposDeEmision } from './emision'
import { CamposDeEmision } from './CamposDeEmision'

// Configuracion de emision electronica del RUC PRINCIPAL de una cuenta:
// regimen de IGV, metodo (QPse o SUNAT directo) y credenciales. Las
// credenciales viven en la subcoleccion PROTEGIDA (emissionSecretsService);
// al doc publico solo van el metodo y el regimen.
//
// El formulario en si (regimen, metodo, credenciales) esta en `emision.js` y
// `CamposDeEmision.jsx`, compartidos con los RUC adicionales de la ficha.

const FORM_VACIO = {
  ...FORM_EMISION_VACIO,
  // Override admin: permitir boleta/factura en el POS aunque NO haya conexion SUNAT.
  allowInvoicingWithoutSunat: false,
}

export default function SunatModal({ cuenta, onClose, onGuardado }) {
  const toast = useToast()
  const [form, setForm] = useState(FORM_VACIO)
  const { ver, alternarVer, archivoCertificado, setArchivoCertificado } = useCamposDeEmision()
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, 'businesses', cuenta.id))
        if (!snap.exists()) {
          if (vivo) setForm(FORM_VACIO)
          return
        }
        const negocio = snap.data()
        const em = await getEmissionSecrets(cuenta.id, negocio)
        if (!vivo) return
        setForm({
          ...formDesdeConfiguracion(em, negocio),
          allowInvoicingWithoutSunat: negocio.allowInvoicingWithoutSunat === true,
        })
      } catch (error) {
        console.error('Error cargando la configuración de emisión:', error)
        if (vivo) setForm(FORM_VACIO)
      } finally {
        if (vivo) setCargando(false)
      }
    }
    cargar()
    return () => { vivo = false }
  }, [cuenta.id])

  async function guardar() {
    setGuardando(true)
    try {
      const ref = doc(db, 'businesses', cuenta.id)
      const actual = await getDoc(ref)
      const datosActuales = actual.exists() ? actual.data() : {}
      // Config actual desde la subcoleccion protegida (para conservar cert/firmas al re-guardar)
      const secretos = await getEmissionSecrets(cuenta.id, datosActuales)

      const cambios = { updatedAt: Timestamp.now() }

      // Un NRUS no puede emitir facturas: se le deja Boleta y Nota de Venta en
      // el POS. Solo se escribe al MARCAR nrus; al desmarcar no se toca, para
      // no pisar una configuracion que el dueno haya afinado por su cuenta.
      if (form.taxType === 'nrus') cambios.enabledDocumentTypes = ['boleta', 'nota_venta']

      const emissionConfig = await emissionConfigDesdeForm(form, secretos, archivoCertificado)

      // Credenciales → subcoleccion protegida; al doc publico solo lo no secreto.
      await saveEmissionSecrets(cuenta.id, {
        sunat: emissionConfig.sunat,
        qpse: emissionConfig.qpse,
        emissionConfig: { qpse: emissionConfig.qpse, sunat: emissionConfig.sunat },
      })
      cambios.emissionConfig = { method: emissionConfig.method, taxConfig: emissionConfig.taxConfig }
      cambios.emissionMethod = form.emissionMethod
      cambios.allowInvoicingWithoutSunat = !!form.allowInvoicingWithoutSunat
      await updateDoc(ref, cambios)

      // EL PLAN NO SE TOCA. Antes, si el metodo elegido no coincidia con el
      // `emissionMethod` del plan, esta pantalla le CAMBIABA el plan a un
      // `qpse_1_month` o `sunat_direct_1_month` (planes viejos) y le pisaba los
      // limites. Es decir: a un cliente que pago el Anual y al que le pones
      // SUNAT directo, le borraba lo que compro.
      //
      // La premisa era falsa. Cualquier plan puede emitir por cualquiera de los
      // dos metodos; lo que se usa se decide POR CUENTA y se pacta con el
      // cliente. El servidor tampoco mira el plan: `determineEmissionRouter`
      // resuelve por `businessData.emissionMethod`.

      toast.success('Configuración de emisión guardada')
      onGuardado?.()
      onClose()
    } catch (error) {
      console.error('Error guardando la configuración de emisión:', error)
      toast.error(error.message || 'No se pudo guardar la configuración')
    } finally {
      setGuardando(false)
    }
  }

  const pie = (
    <>
      <Boton onClick={onClose} disabled={guardando}>Cancelar</Boton>
      <Boton variante="primario" onClick={guardar} disabled={guardando || cargando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </Boton>
    </>
  )

  return (
    <Modal titulo="Emisión electrónica" subtitulo={cuenta.businessName} onClose={onClose} pie={pie} ancho="lg">
      {cargando ? (
        <p className="py-8 text-center text-gray-500">Cargando configuración…</p>
      ) : (
        <div className="space-y-5">
          <Casilla
            etiqueta="Permitir boletas y facturas sin conexión SUNAT"
            ayuda="Sin método de emisión, el POS solo emite notas de venta. Con esto puede emitir boletas y facturas igual."
            checked={!!form.allowInvoicingWithoutSunat}
            onChange={e => set('allowInvoicingWithoutSunat', e.target.checked)}
          />

          <CamposDeEmision
            form={form}
            set={set}
            ver={ver}
            alternarVer={alternarVer}
            archivoCertificado={archivoCertificado}
            setArchivoCertificado={setArchivoCertificado}
          />
        </div>
      )}
    </Modal>
  )
}
