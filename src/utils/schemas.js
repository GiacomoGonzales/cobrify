import { z } from 'zod'
import { validateRUC, validateDNI, ID_TYPES } from './peruUtils'

/**
 * Schemas de validación con Zod para formularios
 */

// Schema para Login
export const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

// Schema para Registro
export const registerSchema = z
  .object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Correo electrónico inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmPassword: z.string().min(6, 'Confirma tu contraseña'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

// Schema para Cliente
export const customerSchema = z.object({
  documentType: z.enum([ID_TYPES.DNI, ID_TYPES.RUC, ID_TYPES.CE, ID_TYPES.PASSPORT], {
    required_error: 'Tipo de documento es requerido',
  }),
  documentNumber: z.string().min(1, 'Número de documento es requerido'),
  businessName: z.string().optional().or(z.literal('')),
  name: z.string().min(1, 'Nombre es requerido'),
  email: z.string().email('Correo electrónico inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  // Validar número de documento según el tipo
  if (data.documentType === ID_TYPES.RUC && !validateRUC(data.documentNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'RUC inválido (debe tener 11 dígitos)',
      path: ['documentNumber'],
    })
  }
  if (data.documentType === ID_TYPES.DNI && !validateDNI(data.documentNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DNI inválido (debe tener 8 dígitos)',
      path: ['documentNumber'],
    })
  }
})

// Schema para Producto/Servicio
export const productSchema = z.object({
  code: z.string().min(1, 'Código es requerido'),
  name: z.string().min(1, 'Nombre es requerido'),
  description: z.string().optional(),
  price: z
    .number({ required_error: 'Precio es requerido' })
    .positive('El precio debe ser mayor a 0')
    .or(
      z
        .string()
        .min(1, 'Precio es requerido')
        .transform(val => parseFloat(val))
        .pipe(z.number().positive('El precio debe ser mayor a 0'))
    ),
  unit: z.string().default('UNIDAD'),
  category: z.string().optional(),
  stock: z
    .union([
      z.number().int().nonnegative('El stock no puede ser negativo'),
      z
        .string()
        .transform(val => {
          if (val === '' || val === null || val === undefined) return null
          const num = parseInt(val)
          return isNaN(num) ? null : num
        })
        .nullable(),
    ])
    .nullable()
    .optional(),
  noStock: z.boolean().optional(),
})

// Schema para Item de Factura
export const invoiceItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1, 'Descripción es requerida'),
  quantity: z
    .number({ required_error: 'Cantidad es requerida' })
    .positive('La cantidad debe ser mayor a 0')
    .or(
      z
        .string()
        .min(1, 'Cantidad es requerida')
        .transform(val => parseFloat(val))
        .pipe(z.number().positive('La cantidad debe ser mayor a 0'))
    ),
  unitPrice: z
    .number({ required_error: 'Precio unitario es requerido' })
    .positive('El precio debe ser mayor a 0')
    .or(
      z
        .string()
        .min(1, 'Precio es requerido')
        .transform(val => parseFloat(val))
        .pipe(z.number().positive('El precio debe ser mayor a 0'))
    ),
  unit: z.string().default('UNIDAD'),
})

// Schema para Factura
export const invoiceSchema = z.object({
  documentType: z.enum(['01', '03', 'nota_venta'], {
    required_error: 'Tipo de comprobante es requerido',
  }),
  series: z.string().min(1, 'Serie es requerida'),
  number: z.number().int().positive('Número debe ser mayor a 0').or(
    z
      .string()
      .min(1, 'Número es requerido')
      .transform(val => parseInt(val))
      .pipe(z.number().int().positive('Número debe ser mayor a 0'))
  ),
  issueDate: z.date({ required_error: 'Fecha de emisión es requerida' }).or(
    z
      .string()
      .min(1, 'Fecha es requerida')
      .transform(val => new Date(val))
  ),
  dueDate: z
    .date()
    .optional()
    .or(
      z
        .string()
        .transform(val => (val ? new Date(val) : undefined))
        .optional()
    ),
  customerId: z.string().min(1, 'Cliente es requerido'),
  items: z
    .array(invoiceItemSchema)
    .min(1, 'Debe agregar al menos un item')
    .refine(items => items.every(item => item.quantity > 0), {
      message: 'Todos los items deben tener cantidad mayor a 0',
    }),
  notes: z.string().optional(),
  paymentMethod: z.string().default('EFECTIVO'),
  currency: z.string().default('PEN'),
})

// Schema para Configuración de Empresa
export const companySettingsSchema = z.object({
  ruc: z
    .string()
    .length(11, 'RUC debe tener 11 dígitos')
    .refine(validateRUC, 'RUC inválido'),
  businessName: z.string().min(1, 'Razón social es requerida'),
  tradeName: z.string().optional(),
  address: z.string().min(1, 'Dirección es requerida'),
  // Campos de ubicación geográfica para SUNAT
  urbanization: z.string().optional(), // Urbanización (opcional)
  department: z.string().min(1, 'Departamento es requerido'),
  province: z.string().min(1, 'Provincia es requerida'),
  district: z.string().min(1, 'Distrito es requerido'),
  ubigeo: z.string().length(6, 'Ubigeo debe tener 6 dígitos').regex(/^\d{6}$/, 'Ubigeo debe ser numérico').optional(),
  phone: z.string().optional(),
  email: z.string().email('Correo electrónico inválido'),
  website: z.string().url('URL inválida').optional().or(z.literal('')),
  logo: z.string().optional(),
})

// Schema para Configuración de Serie
export const seriesConfigSchema = z.object({
  documentType: z.enum(['01', '03', 'nota_venta']),
  series: z.string().length(4, 'Serie debe tener 4 caracteres'),
  nextNumber: z.number().int().positive('Número debe ser mayor a 0'),
  prefix: z.string().optional(),
})
