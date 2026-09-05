import {
  Mail, Calendar, ShieldCheck, Warehouse, Store, UserCheck, Bike, Wallet,
  Eye, EyeOff, Key, Edit2, Archive, ArchiveRestore, Trash2, FileText, CreditCard,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'

/**
 * La ficha de un usuario secundario: todo lo que tiene y todo lo que se le
 * puede hacer, en un solo lugar.
 *
 * Antes cada fila de la lista terminaba en cinco íconos de colores sin texto.
 * Nadie sabía cuál era cuál, y el que desactiva está pegado al que elimina —
 * un cliente desactivó a su cajero creyendo que hacía otra cosa y después
 * reportó que "no podía entrar". Acá cada acción dice qué hace, y la que borra
 * queda separada del resto.
 *
 * Solo muestra y avisa: quien decide qué pasa es la página, que le pasa los
 * manejadores.
 */

const Dato = ({ icono: Icono, etiqueta, children }) => (
  <div className="flex items-start gap-3 py-2.5">
    <Icono className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-xs text-gray-500">{etiqueta}</p>
      <div className="text-sm text-gray-900 break-words">{children}</div>
    </div>
  </div>
)

const Accion = ({ icono: Icono, children, onClick, destructiva = false, descripcion }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
      destructiva ? 'hover:bg-red-50 text-red-700' : 'hover:bg-gray-50 text-gray-800'
    }`}
  >
    <Icono className={`w-4 h-4 mt-0.5 flex-shrink-0 ${destructiva ? 'text-red-500' : 'text-gray-400'}`} />
    <span className="min-w-0">
      <span className="block text-sm font-medium">{children}</span>
      {descripcion && <span className="block text-xs text-gray-500 mt-0.5">{descripcion}</span>}
    </span>
  </button>
)

export default function DetalleUsuarioModal({
  usuario,
  onClose,
  paginasDisponibles = [],
  almacenes = [],
  formatearFecha,
  esInmobiliaria = false,
  onToggleEstado,
  onResetPassword,
  onEditar,
  onArchivar,
  onDesarchivar,
  onEliminar,
}) {
  if (!usuario) return null

  const nombresDePaginas = (usuario.allowedPages || [])
    .map(id => paginasDisponibles.find(p => p.id === id)?.name || id)
  const todasLasPaginas = nombresDePaginas.length === 0

  const nombresDeAlmacenes = (usuario.allowedWarehouses || [])
    .map(id => almacenes.find(w => w.id === id)?.name || id)
  const todosLosAlmacenes = nombresDeAlmacenes.length === 0

  const permisos = usuario.dataPermissions
  const creado = usuario.createdAt
    ? formatearFecha(usuario.createdAt.toDate ? usuario.createdAt.toDate() : usuario.createdAt)
    : null

  return (
    <Modal isOpen={!!usuario} onClose={onClose} title={usuario.displayName || 'Usuario'} size="2xl">
      <div className="space-y-5">
        {/* Encabezado: quién es y cómo está */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={usuario.isActive ? 'success' : 'default'}>
            {usuario.isActive ? 'Activo' : 'Desactivado'}
          </Badge>
          {usuario.archived && <Badge variant="default">Archivado</Badge>}
          {usuario.independentCashRegister && <Badge variant="info">Caja propia</Badge>}
        </div>

        {!usuario.isActive && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
            Está desactivado, así que <strong>no puede entrar al sistema</strong>. Sus datos y permisos
            siguen intactos: al activarlo vuelve a entrar como antes.
          </div>
        )}

        {/* Los datos */}
        <div className="border border-gray-200 rounded-xl px-4 divide-y divide-gray-100">
          <Dato icono={Mail} etiqueta="Correo con el que entra">{usuario.email}</Dato>

          <Dato icono={ShieldCheck} etiqueta="Páginas que puede abrir">
            {todasLasPaginas
              ? 'Todas las del sistema'
              : (
                <span className="flex flex-wrap gap-1 mt-1">
                  {nombresDePaginas.map(nombre => (
                    <span key={nombre} className="chip-neutro px-2 py-0.5 rounded text-xs">{nombre}</span>
                  ))}
                </span>
              )}
          </Dato>

          <Dato icono={Warehouse} etiqueta="Almacenes">
            {todosLosAlmacenes
              ? 'Todos'
              : (
                <span className="flex flex-wrap gap-1 mt-1">
                  {nombresDeAlmacenes.map(nombre => (
                    <span key={nombre} className="chip-neutro px-2 py-0.5 rounded text-xs">{nombre}</span>
                  ))}
                </span>
              )}
          </Dato>

          {usuario.assignedSellerName && (
            <Dato icono={Store} etiqueta="Vendedor asignado">
              {usuario.assignedSellerName}
              <span className="block text-xs text-gray-500">Solo ve sus propias ventas</span>
            </Dato>
          )}

          {usuario.assignedMotoristaName && (
            <Dato icono={Bike} etiqueta="Repartidor asignado">
              {usuario.assignedMotoristaName}
              <span className="block text-xs text-gray-500">Solo ve sus propias entregas</span>
            </Dato>
          )}

          {usuario.defaultWaiterName && (
            <Dato icono={UserCheck} etiqueta="Mozo por defecto">{usuario.defaultWaiterName}</Dato>
          )}

          {esInmobiliaria && usuario.agentName && (
            <Dato icono={UserCheck} etiqueta="Agente">{usuario.agentName}</Dato>
          )}

          {(usuario.allowedDocumentTypes?.length > 0 || usuario.allowedPaymentMethods?.length > 0) && (
            <Dato icono={FileText} etiqueta="Restricciones en el Punto de Venta">
              {usuario.allowedDocumentTypes?.length > 0 && (
                <span className="block">Comprobantes: {usuario.allowedDocumentTypes.join(', ')}</span>
              )}
              {usuario.allowedPaymentMethods?.length > 0 && (
                <span className="block">Pagos: {usuario.allowedPaymentMethods.join(', ')}</span>
              )}
            </Dato>
          )}

          {permisos && (
            <Dato icono={CreditCard} etiqueta="Qué datos ve">
              {[
                `${permisos.verTotales === false ? 'No ve' : 'Ve'} los totales`,
                `${permisos.verCostos === false ? 'No ve' : 'Ve'} los costos`,
                `${permisos.exportar === false ? 'No puede' : 'Puede'} exportar`,
              ].join(' · ')}
            </Dato>
          )}

          <Dato icono={Wallet} etiqueta="Caja">
            {usuario.independentCashRegister
              ? 'Abre y cierra su propia caja'
              : 'Comparte la caja del dueño'}
          </Dato>

          {creado && <Dato icono={Calendar} etiqueta="Creado">{creado}</Dato>}
        </div>

        {/* Las acciones */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 px-1">Acciones</p>
          <div className="border border-gray-200 rounded-xl p-1 divide-y divide-gray-100">
            <Accion
              icono={usuario.isActive ? EyeOff : Eye}
              onClick={() => onToggleEstado(usuario)}
              descripcion={usuario.isActive
                ? 'No podrá entrar hasta que lo actives de nuevo. Se deshace cuando quieras.'
                : 'Vuelve a poder entrar con su mismo correo y contraseña.'}
            >
              {usuario.isActive ? 'Desactivar' : 'Activar'}
            </Accion>

            <Accion
              icono={Key}
              onClick={() => onResetPassword(usuario)}
              descripcion="Le pones una contraseña nueva sin necesitar la anterior."
            >
              Cambiar contraseña
            </Accion>

            <Accion
              icono={Edit2}
              onClick={() => onEditar(usuario)}
              descripcion="Cambiar su nombre, sus páginas, almacenes y permisos."
            >
              Editar permisos
            </Accion>

            {usuario.archived ? (
              <Accion
                icono={ArchiveRestore}
                onClick={() => onDesarchivar(usuario)}
                descripcion="Vuelve a aparecer en la lista principal."
              >
                Desarchivar
              </Accion>
            ) : (
              <Accion
                icono={Archive}
                onClick={() => onArchivar(usuario)}
                descripcion="Sale de la lista sin borrarse. Para personal que ya no trabaja."
              >
                Archivar
              </Accion>
            )}

            <Accion
              icono={Trash2}
              destructiva
              onClick={() => onEliminar(usuario)}
              descripcion="Borra su acceso y sus permisos para siempre. Si solo quieres que no entre, usa Desactivar."
            >
              Eliminar usuario
            </Accion>
          </div>
        </div>
      </div>
    </Modal>
  )
}
