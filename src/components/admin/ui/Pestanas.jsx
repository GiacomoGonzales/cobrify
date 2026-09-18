// Pestañas de una página: el control segmentado de Comprobantes, para que
// todas se vean igual. Va debajo del resumen y encima del buscador.
//
// Cada opción es { id, etiqueta, aviso }. `aviso` es un número en rojo —solo
// lo malo, como los RUC sin pago o vencidos— y no se pinta si es 0.
export default function Pestanas({ opciones, valor, onCambiar }) {
  return (
    <div role="tablist" className="flex w-full sm:w-auto sm:self-start rounded-md border border-gray-300 bg-white p-0.5">
      {opciones.map(o => {
        const activa = o.id === valor
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onCambiar(o.id)}
            className={`inline-flex h-7 flex-1 sm:flex-none min-w-0 items-center justify-center gap-1.5 px-2 sm:px-3 rounded text-[12px] sm:text-[12.5px] whitespace-nowrap ${activa ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {o.etiqueta}
            {o.aviso > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-center text-[10.5px] font-medium leading-4 text-white tabular-nums">
                {o.aviso}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
