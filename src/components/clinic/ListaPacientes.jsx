/**
 * LA LISTA DE PACIENTES (modo Clínica).
 *
 * Recepción busca a la persona y la abre: toda la fila es el botón. Lo que
 * se ve es lo que hace falta para reconocerla y saber si hay que cuidarse de
 * algo —la alergia en rojo, las sesiones que le quedan— y nada de tienda
 * (pedidos, total gastado, cumpleaños). El resto está en la ficha.
 *
 * Va aparte de la lista de Clientes de siempre a propósito: General y
 * veterinaria conservan sus columnas y sus botones por fila.
 */
import { ChevronRight } from 'lucide-react'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { edadDesde, fechaCorta, ultimaAtencion } from '@/utils/fichaAtencion'

const Chips = ({ c }) => {
  const sesiones = Number(c.packagesSummary?.remaining) || 0
  if (!c.allergies && sesiones <= 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {c.allergies && (
        <span className="chip-error px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[220px]" title={`Alergias: ${c.allergies}`}>
          Alergia: {c.allergies}
        </span>
      )}
      {sesiones > 0 && (
        <span className="chip-info px-1.5 py-0.5 rounded text-[10px] font-medium">
          {sesiones} {sesiones === 1 ? 'sesión' : 'sesiones'}
        </span>
      )}
    </div>
  )
}

export default function ListaPacientes({ customers, onOpen }) {
  return (
    <>
      {/* Móvil: tarjetas */}
      <div className="lg:hidden divide-y divide-gray-100">
        {customers.map(c => {
          const edad = edadDesde(c.birthDate)
          const ultima = ultimaAtencion(c)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {[c.phone, edad != null ? `${edad} años` : null, ultima ? `Últ. atención ${fechaCorta(ultima)}` : null]
                      .filter(Boolean).join(' · ') || 'Sin teléfono'}
                  </p>
                  <Chips c={c} />
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
            </button>
          )
        })}
      </div>

      {/* Escritorio: tabla */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs py-2">Paciente</TableHead>
              <TableHead className="text-xs py-2">Documento</TableHead>
              <TableHead className="text-xs py-2">Teléfono</TableHead>
              <TableHead className="text-xs py-2">Edad</TableHead>
              <TableHead className="text-xs py-2">Última atención</TableHead>
              <TableHead className="text-xs py-2 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map(c => {
              const edad = edadDesde(c.birthDate)
              const ultima = ultimaAtencion(c)
              return (
                <TableRow
                  key={c.id}
                  onClick={() => onOpen(c)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <TableCell className="py-2">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[260px]">{c.name}</p>
                    <Chips c={c} />
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-gray-600">
                      {c.documentNumber ? `${c.documentType || ''} ${c.documentNumber}`.trim() : '-'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-gray-600">{c.phone || '-'}</span>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-gray-600">{edad != null ? `${edad} años` : '-'}</span>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-gray-600">{ultima ? fechaCorta(ultima) : '-'}</span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <ChevronRight className="w-4 h-4 text-gray-400 inline-block" />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
