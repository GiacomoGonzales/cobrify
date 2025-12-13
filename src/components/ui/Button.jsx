import { cn } from '@/lib/utils'
import { useBranding } from '@/contexts/BrandingContext'
import { DEFAULT_BRANDING } from '@/services/brandingService'

const variants = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
  outline:
    'bg-white border-2 border-primary-600 text-primary-600 hover:bg-primary-50 focus:ring-primary-500',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700',
}

// Variantes sin color (para usar con branding personalizado)
const variantsNoColor = {
  primary: 'text-white focus:ring-2',
  outline: 'bg-white border-2 focus:ring-2',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  loading,
  type = 'button',
  style,
  ...props
}) {
  const { branding } = useBranding()

  // Solo aplicar branding personalizado si NO es el color default de Cobrify
  const hasCustomBranding = branding.primaryColor !== DEFAULT_BRANDING.primaryColor

  // Calcular estilos inline solo para variantes primary y outline con branding personalizado
  let customStyle = style || {}
  let variantClass = variants[variant]

  if (hasCustomBranding && (variant === 'primary' || variant === 'outline')) {
    if (variant === 'primary') {
      customStyle = {
        ...customStyle,
        backgroundColor: branding.primaryColor,
        '--tw-ring-color': branding.primaryColor,
      }
      variantClass = variantsNoColor.primary
    } else if (variant === 'outline') {
      customStyle = {
        ...customStyle,
        borderColor: branding.primaryColor,
        color: branding.primaryColor,
        '--tw-ring-color': branding.primaryColor,
      }
      variantClass = variantsNoColor.outline
    }
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass,
        sizes[size],
        className
      )}
      style={customStyle}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Cargando...
        </>
      ) : (
        children
      )}
    </button>
  )
}
