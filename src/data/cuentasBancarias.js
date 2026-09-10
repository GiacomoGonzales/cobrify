/**
 * Los catálogos de una cuenta bancaria del negocio: banco, tipo y moneda.
 *
 * Los usan Mi Empresa (las cuentas del RUC principal) y la ficha del admin
 * (las cuentas de cada RUC adicional). Estaban dentro de Mi Empresa; al
 * necesitarlos en dos pantallas pasan a un solo sitio.
 */

export const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'Pichincha', 'Banco de la Nación', 'Otro']

export const TIPOS_CUENTA = [
  { value: 'corriente', label: 'Corriente' },
  { value: 'ahorros', label: 'Ahorros' },
  { value: 'detracciones', label: 'Detracciones' },
]

export const MONEDAS = [
  { value: 'PEN', label: 'Soles' },
  { value: 'USD', label: 'Dólares' },
]

export const CUENTA_VACIA = { bank: '', accountType: 'corriente', currency: 'PEN', accountNumber: '', cci: '' }

export const etiquetaTipoCuenta = (valor) => TIPOS_CUENTA.find(t => t.value === valor)?.label || 'Corriente'
export const etiquetaMoneda = (valor) => (valor === 'PEN' ? 'Soles' : 'Dólares')
