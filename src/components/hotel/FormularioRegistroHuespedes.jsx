import { Plus, Trash2 } from 'lucide-react'
import { MAX_HUESPEDES, MOTIVOS_DE_VIAJE, TIPOS_DE_DOCUMENTO, SEXOS, huespedVacio } from '@/utils/registroDeHuespedes'

/**
 * El formulario del REGISTRO DE HUÉSPEDES (utils/registroDeHuespedes). Lo usan
 * la página pública que llena el huésped y el hotel desde la reserva, así los
 * dos piden lo mismo. Sin contextos de la app: solo props.
 *
 * @param {{ valor: object, onCambio: (nuevo: object) => void, deshabilitado?: boolean }} props
 */
const CAMPO = 'w-full h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-gray-400 focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500'
const ETIQUETA = 'block text-xs font-medium text-gray-600 mb-1'

function Campo({ id, etiqueta, requerido = false, children }) {
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
        {requerido && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}

export default function FormularioRegistroHuespedes({ valor, onCambio, deshabilitado = false }) {
  const cambiar = (campo, v) => onCambio({ ...valor, [campo]: v })
  const cambiarHuesped = (i, campo, v) =>
    onCambio({ ...valor, huespedes: valor.huespedes.map((h, j) => (j === i ? { ...h, [campo]: v } : h)) })
  const agregar = () => onCambio({ ...valor, huespedes: [...valor.huespedes, huespedVacio()] })
  const quitar = (i) => onCambio({ ...valor, huespedes: valor.huespedes.filter((_, j) => j !== i) })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo id="reg-hora" etiqueta="Hora de llegada" requerido>
          <input
            id="reg-hora"
            type="time"
            value={valor.horaLlegada}
            onChange={(e) => cambiar('horaLlegada', e.target.value)}
            disabled={deshabilitado}
            className={CAMPO}
          />
        </Campo>
        <Campo id="reg-motivo" etiqueta="Motivo del viaje" requerido>
          <select
            id="reg-motivo"
            value={valor.motivoViaje}
            onChange={(e) => cambiar('motivoViaje', e.target.value)}
            disabled={deshabilitado}
            className={CAMPO}
          >
            <option value="">Elige</option>
            {MOTIVOS_DE_VIAJE.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Campo>
        <Campo id="reg-menores" etiqueta="Menores de edad" requerido>
          <select
            id="reg-menores"
            value={String(valor.menores)}
            onChange={(e) => cambiar('menores', Number(e.target.value))}
            disabled={deshabilitado}
            className={CAMPO}
          >
            <option value="0">Ninguno</option>
            {Array.from({ length: MAX_HUESPEDES - 1 }, (_, k) => k + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? 'menor' : 'menores'}</option>
            ))}
          </select>
        </Campo>
      </div>

      {valor.huespedes.map((h, i) => {
        const titular = i === 0
        const pre = `reg-h${i}`
        return (
          <div key={i} role="group" aria-labelledby={`${pre}-titulo`} className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id={`${pre}-titulo`} className="text-sm font-semibold text-gray-900">
                {titular ? 'Titular de la reserva' : `Huésped ${i + 1}`}
              </h3>
              {!titular && !deshabilitado && (
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                  aria-label={`Quitar al huésped ${i + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo id={`${pre}-nombres`} etiqueta="Nombres" requerido>
                <input id={`${pre}-nombres`} type="text" value={h.nombres} maxLength={60} autoComplete={titular ? 'given-name' : 'off'}
                  onChange={(e) => cambiarHuesped(i, 'nombres', e.target.value)} disabled={deshabilitado} className={`${CAMPO} uppercase`} />
              </Campo>
              <Campo id={`${pre}-apellidos`} etiqueta="Apellidos" requerido>
                <input id={`${pre}-apellidos`} type="text" value={h.apellidos} maxLength={60} autoComplete={titular ? 'family-name' : 'off'}
                  onChange={(e) => cambiarHuesped(i, 'apellidos', e.target.value)} disabled={deshabilitado} className={`${CAMPO} uppercase`} />
              </Campo>
              <Campo id={`${pre}-tipo`} etiqueta="Tipo de documento" requerido>
                <select id={`${pre}-tipo`} value={h.tipoDocumento} onChange={(e) => cambiarHuesped(i, 'tipoDocumento', e.target.value)}
                  disabled={deshabilitado} className={CAMPO}>
                  {TIPOS_DE_DOCUMENTO.map((t) => <option key={t} value={t}>{t === 'CE' ? 'Carné de extranjería' : t}</option>)}
                </select>
              </Campo>
              <Campo id={`${pre}-doc`} etiqueta="Número de documento" requerido>
                <input id={`${pre}-doc`} type="text" value={h.documento} maxLength={15}
                  inputMode={h.tipoDocumento === 'DNI' ? 'numeric' : 'text'}
                  onChange={(e) => cambiarHuesped(i, 'documento', e.target.value)} disabled={deshabilitado} className={`${CAMPO} uppercase`} />
              </Campo>
              <Campo id={`${pre}-nac`} etiqueta="Fecha de nacimiento" requerido>
                <input id={`${pre}-nac`} type="date" value={h.fechaNacimiento} min="1900-01-01"
                  onChange={(e) => cambiarHuesped(i, 'fechaNacimiento', e.target.value)} disabled={deshabilitado} className={CAMPO} />
              </Campo>
              <Campo id={`${pre}-sexo`} etiqueta="Sexo" requerido={titular}>
                <select id={`${pre}-sexo`} value={h.sexo} onChange={(e) => cambiarHuesped(i, 'sexo', e.target.value)}
                  disabled={deshabilitado} className={CAMPO}>
                  <option value="">Elige</option>
                  {SEXOS.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
                </select>
              </Campo>
              <Campo id={`${pre}-pais`} etiqueta="País" requerido={titular}>
                <input id={`${pre}-pais`} type="text" value={h.pais} maxLength={40} placeholder="Ej: PERÚ" autoComplete={titular ? 'country-name' : 'off'}
                  onChange={(e) => cambiarHuesped(i, 'pais', e.target.value)} disabled={deshabilitado} className={`${CAMPO} uppercase`} />
              </Campo>
              <Campo id={`${pre}-ciudad`} etiqueta="Ciudad" requerido={titular}>
                <input id={`${pre}-ciudad`} type="text" value={h.ciudad} maxLength={60}
                  onChange={(e) => cambiarHuesped(i, 'ciudad', e.target.value)} disabled={deshabilitado} className={`${CAMPO} uppercase`} />
              </Campo>
              {titular && (
                <>
                  <Campo id={`${pre}-cel`} etiqueta="Celular">
                    <input id={`${pre}-cel`} type="tel" inputMode="tel" autoComplete="tel" value={h.celular} maxLength={20}
                      onChange={(e) => cambiarHuesped(i, 'celular', e.target.value)} disabled={deshabilitado} className={CAMPO} />
                  </Campo>
                  <Campo id={`${pre}-correo`} etiqueta="Correo">
                    <input id={`${pre}-correo`} type="email" autoComplete="email" value={h.correo} maxLength={80}
                      onChange={(e) => cambiarHuesped(i, 'correo', e.target.value)} disabled={deshabilitado} className={CAMPO} />
                  </Campo>
                </>
              )}
            </div>
          </div>
        )
      })}

      {valor.huespedes.length < MAX_HUESPEDES && !deshabilitado && (
        <button
          type="button"
          onClick={agregar}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Plus className="w-4 h-4" />
          Agregar huésped
        </button>
      )}
    </div>
  )
}
