import { useRef, useState } from 'react'
import { Upload, X, Loader2, ImagePlus } from 'lucide-react'

/**
 * Zona de imagen para Configuración: la FOTO es el control.
 *
 * Se toca la imagen para elegir archivo, se puede arrastrar y soltar encima,
 * y se quita con una X que aparece al pasar el mouse (en táctil queda siempre
 * visible, porque ahí no hay hover que revele nada). Reemplaza al par de
 * botones "Cambiar / Quitar", que ocupaban más espacio del que valían y no
 * decían dónde soltar un archivo.
 *
 * No sube nada por su cuenta: recibe `onFile` y el padre decide cómo
 * comprimir y a qué carpeta va. Así el mismo control sirve para el logo, la
 * portada o cualquier imagen futura sin duplicar la lógica de subida.
 */
export default function ImageDropZone({
  value,                 // URL actual (vacío = sin imagen)
  onFile,                // (File) => Promise<void>  — sube y guarda
  onClear,               // () => void
  uploading = false,
  className = 'w-28 h-28',   // tamaño de la caja
  label = 'Subir imagen',
  hint = '',
  accept = 'image/png,image/jpeg,image/webp',
  objectFit = 'contain',
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [arrastrando, setArrastrando] = useState(false)

  const abrir = () => { if (!uploading && !disabled) inputRef.current?.click() }

  const tomar = async (file) => {
    if (!file || uploading || disabled) return
    if (!file.type?.startsWith('image/')) return
    await onFile(file)
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={abrir}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() } }}
        onDragOver={(e) => { e.preventDefault(); if (!uploading && !disabled) setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          tomar(e.dataTransfer.files?.[0])
        }}
        className={`group relative ${className} rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed border-gray-200'
            : arrastrando ? 'border-primary-500 bg-primary-50 cursor-copy'
            : value ? 'border-transparent bg-gray-50 hover:border-gray-300 cursor-pointer'
            : 'border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-50/40 cursor-pointer'
        }`}
        title={value ? 'Toca para cambiar la imagen' : 'Toca o arrastra una imagen'}
      >
        {value ? (
          <>
            <img src={value} alt="" className={`w-full h-full object-${objectFit} p-1`} />
            {/* Velo de "cambiar" al pasar el mouse: en la imagen, no en un botón aparte */}
            <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="flex items-center gap-1.5 text-white text-xs font-medium">
                <Upload className="w-3.5 h-3.5" /> Cambiar
              </span>
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center pointer-events-none">
            <ImagePlus className={`w-5 h-5 ${arrastrando ? 'text-primary-600' : 'text-gray-400'}`} />
            <span className={`text-[11px] leading-tight ${arrastrando ? 'text-primary-700' : 'text-gray-500'}`}>
              {arrastrando ? 'Suelta aquí' : label}
            </span>
          </span>
        )}

        {uploading && (
          <span className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
          </span>
        )}

        {value && !uploading && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear() }}
            /* En táctil no hay hover: ahí la X se queda visible siempre. */
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 shadow flex items-center justify-center text-gray-500 hover:text-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            aria-label="Quitar imagen"
            title="Quitar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={uploading || disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            await tomar(file)
          }}
        />
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1.5 max-w-[16rem]">{hint}</p>}
    </div>
  )
}
