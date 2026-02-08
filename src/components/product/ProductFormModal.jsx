import React, { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, X, Upload, Camera, ScanBarcode, Package, Plus, Trash2 } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { productSchema } from '@/utils/schemas'
import { uploadProductImage, deleteProductImage, createImagePreview, revokeImagePreview } from '@/services/productImageService'
import { getNextSkuNumber } from '@/services/firestoreService'

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
export const UNITS = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'ZZ', label: 'Servicio' },
  { value: 'KGM', label: 'Kilogramo' },
  { value: 'GRM', label: 'Gramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MTR', label: 'Metro' },
  { value: 'MTK', label: 'Metro cuadrado' },
  { value: 'MTQ', label: 'Metro cúbico' },
  { value: 'BX', label: 'Caja' },
  { value: 'PK', label: 'Paquete' },
  { value: 'SET', label: 'Juego' },
  { value: 'HUR', label: 'Hora' },
  { value: 'DZN', label: 'Docena' },
  { value: 'PR', label: 'Par' },
  { value: 'MIL', label: 'Millar' },
  { value: 'TNE', label: 'Tonelada' },
  { value: 'BJ', label: 'Balde' },
  { value: 'BLL', label: 'Barril' },
  { value: 'BG', label: 'Bolsa' },
  { value: 'BO', label: 'Botella' },
  { value: 'CT', label: 'Cartón' },
  { value: 'CMK', label: 'Centímetro cuadrado' },
  { value: 'CMQ', label: 'Centímetro cúbico' },
  { value: 'CMT', label: 'Centímetro' },
  { value: 'CEN', label: 'Ciento de unidades' },
  { value: 'CY', label: 'Cilindro' },
  { value: 'BE', label: 'Fardo' },
  { value: 'GLL', label: 'Galón' },
  { value: 'GLI', label: 'Galón inglés' },
  { value: 'LEF', label: 'Hoja' },
  { value: 'KTM', label: 'Kilómetro' },
  { value: 'KWH', label: 'Kilovatio hora' },
  { value: 'KT', label: 'Kit' },
  { value: 'CA', label: 'Lata' },
  { value: 'LBR', label: 'Libra' },
  { value: 'MWH', label: 'Megavatio hora' },
  { value: 'MGM', label: 'Miligramo' },
  { value: 'MLT', label: 'Mililitro' },
  { value: 'MMT', label: 'Milímetro' },
  { value: 'MMK', label: 'Milímetro cuadrado' },
  { value: 'MMQ', label: 'Milímetro cúbico' },
  { value: 'UM', label: 'Millón de unidades' },
  { value: 'ONZ', label: 'Onza' },
  { value: 'PF', label: 'Paleta' },
  { value: 'FOT', label: 'Pie' },
  { value: 'FTK', label: 'Pie cuadrado' },
  { value: 'FTQ', label: 'Pie cúbico' },
  { value: 'C62', label: 'Pieza' },
  { value: 'PG', label: 'Placa' },
  { value: 'ST', label: 'Pliego' },
  { value: 'INH', label: 'Pulgada' },
  { value: 'TU', label: 'Tubo' },
  { value: 'YRD', label: 'Yarda' },
  { value: 'QD', label: 'Cuarto de docena' },
  { value: 'HD', label: 'Media docena' },
  { value: 'JG', label: 'Jarra' },
  { value: 'JR', label: 'Frasco' },
  { value: 'CH', label: 'Envase' },
  { value: 'AV', label: 'Cápsula' },
  { value: 'SA', label: 'Saco' },
  { value: 'BT', label: 'Tornillo' },
  { value: 'U2', label: 'Tableta/Blister' },
  { value: 'DZP', label: 'Docena de paquetes' },
]

// Helper functions for categories
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  return cats.map((cat, index) => ({
    id: `cat-${index}`,
    name: cat,
    parentId: null
  }))
}

export const getRootCategories = (categories) => {
  const migrated = migrateLegacyCategories(categories)
  return migrated.filter(cat => !cat.parentId)
}

export const getSubcategories = (categories, parentId) => {
  const migrated = migrateLegacyCategories(categories)
  return migrated.filter(cat => cat.parentId === parentId)
}

/**
 * ProductFormModal - Componente reutilizable para crear/editar productos
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Si el modal está abierto
 * @param {function} props.onClose - Callback al cerrar
 * @param {function} props.onSubmit - Callback al enviar (recibe data del producto)
 * @param {Object} props.initialData - Datos iniciales para edición (opcional)
 * @param {Array} props.categories - Array de categorías disponibles
 * @param {Array} props.warehouses - Array de almacenes (opcional)
 * @param {string} props.title - Título del modal (default: 'Nuevo Producto')
 * @param {string} props.submitLabel - Texto del botón submit (default: 'Crear Producto')
 * @param {boolean} props.isSubmitting - Estado de carga del submit
 * @param {Object} props.options - Opciones para mostrar/ocultar secciones
 * @param {boolean} props.options.showImages - Mostrar campo de imagen
 * @param {boolean} props.options.showSku - Mostrar campo SKU
 * @param {boolean} props.options.showMultiplePrices - Mostrar precios múltiples
 * @param {boolean} props.options.showIgvAffectation - Mostrar selector de IGV
 * @param {boolean} props.options.showWarehouseStock - Mostrar stock por almacén
 * @param {boolean} props.options.showPresentations - Mostrar presentaciones
 * @param {boolean} props.options.showExpiration - Mostrar fecha de vencimiento
 * @param {boolean} props.options.showDecimalQuantity - Mostrar opción decimales
 * @param {boolean} props.options.showCatalogVisibility - Mostrar opción catálogo
 * @param {string} props.stockLabel - Etiqueta para el campo de stock (default: 'Stock Inicial')
 * @param {string} props.stockHelperText - Texto de ayuda para stock
 * @param {boolean} props.hideStockField - Ocultar campo de stock (para compras donde el stock viene del item)
 */
const ProductFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  categories = [],
  warehouses = [],
  title = 'Nuevo Producto',
  submitLabel = 'Crear Producto',
  isSubmitting = false,
  options = {},
  stockLabel = 'Stock Inicial',
  stockHelperText = 'Cantidad inicial',
  hideStockField = false,
  businessMode = null,
  laboratories = [],
}) => {
  const { user, businessSettings, hasFeature, getBusinessId } = useAppContext()
  const toast = useToast()

  // Default options
  const {
    showImages = false,
    showSku = false,
    showMultiplePrices = false,
    showIgvAffectation = true,
    showWarehouseStock = false,
    showPresentations = false,
    showExpiration = false,
    showDecimalQuantity = false,
    showCatalogVisibility = false,
  } = options

  // Form state
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: '',
      sku: '',
      name: '',
      description: '',
      price: '',
      price2: '',
      price3: '',
      price4: '',
      cost: '',
      weight: '',
      unit: 'NIU',
      category: '',
      stock: '',
      initialStock: '',
      expirationDate: '',
    },
  })

  // Local state
  const [noStock, setNoStock] = useState(false)
  const [allowDecimalQuantity, setAllowDecimalQuantity] = useState(false)
  const [trackExpiration, setTrackExpiration] = useState(false)
  const [catalogVisible, setCatalogVisible] = useState(false)
  const isIgvExempt = businessSettings?.emissionConfig?.taxConfig?.igvExempt === true
  const taxType = businessSettings?.emissionConfig?.taxConfig?.taxType || (isIgvExempt ? 'exempt' : 'standard')
  const [taxAffectation, setTaxAffectation] = useState(isIgvExempt ? '20' : '10')
  const [igvRate, setIgvRate] = useState(businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18)
  const [isScanningBarcode, setIsScanningBarcode] = useState(false)
  const [warehouseInitialStocks, setWarehouseInitialStocks] = useState({})

  // Image state
  const [productImage, setProductImage] = useState(null)
  const [productImagePreview, setProductImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Presentations state
  const [presentations, setPresentations] = useState([])
  const [newPresentation, setNewPresentation] = useState({ name: '', factor: '', price: '' })

  // Pharmacy mode state
  const [pharmacyData, setPharmacyData] = useState({
    genericName: '',
    concentration: '',
    presentation: '',
    laboratoryId: '',
    laboratoryName: '',
    marca: '',
    batchNumber: '',
    activeIngredient: '',
    therapeuticAction: '',
    saleCondition: 'sin_receta',
    sanitaryRegistry: '',
    location: '',
  })

  // Check if product images are enabled
  const canUseProductImages = showImages && (hasFeature?.('productImages') || businessSettings?.enableProductImages)

  // Track previous isOpen to only reset when modal transitions from closed to open
  const prevIsOpenRef = useRef(false)

  // Reset form only when modal opens (not on every parent re-render)
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current
    prevIsOpenRef.current = isOpen

    if (!justOpened) return

    if (initialData) {
      // Editing mode
      reset({
        code: initialData.code || '',
        sku: initialData.sku || '',
        name: initialData.name || '',
        description: initialData.description || '',
        price: initialData.price?.toString() || '',
        price2: initialData.price2?.toString() || '',
        price3: initialData.price3?.toString() || '',
        price4: initialData.price4?.toString() || '',
        cost: initialData.cost?.toString() || '',
        weight: initialData.weight?.toString() || '',
        unit: initialData.unit || 'NIU',
        category: initialData.category || '',
        stock: initialData.stock?.toString() || '',
        initialStock: initialData.initialStock?.toString() || '',
        expirationDate: initialData.expirationDate || '',
      })
      setNoStock(initialData.noStock || false)
      setAllowDecimalQuantity(initialData.allowDecimalQuantity || false)
      setTrackExpiration(initialData.trackExpiration || false)
      setCatalogVisible(initialData.catalogVisible || false)
      setTaxAffectation(initialData.taxAffectation || '10')
      setIgvRate(initialData.igvRate ?? (businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18))
      setPresentations(initialData.presentations || [])
      if (initialData.imageUrl) {
        setProductImagePreview(initialData.imageUrl)
      }
    } else {
      // Create mode - reset to defaults
      reset({
        code: '',
        sku: '',
        name: '',
        description: '',
        price: '',
        price2: '',
        price3: '',
        price4: '',
        cost: '',
        unit: 'NIU',
        category: '',
        stock: '',
        initialStock: '',
        expirationDate: '',
      })
      setNoStock(false)
      setAllowDecimalQuantity(false)
      setTrackExpiration(false)
      setCatalogVisible(false)
      setTaxAffectation(isIgvExempt ? '20' : '10')
      setIgvRate(businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18)
      setWarehouseInitialStocks({})
      setPresentations([])
      setProductImage(null)
      setProductImagePreview(null)
      setPharmacyData({
        genericName: '',
        concentration: '',
        presentation: '',
        laboratoryId: '',
        laboratoryName: '',
        marca: '',
        batchNumber: '',
        activeIngredient: '',
        therapeuticAction: '',
        saleCondition: 'sin_receta',
        sanitaryRegistry: '',
        location: '',
      })
    }
  }, [isOpen, initialData, reset])

  // Cleanup image preview on unmount
  useEffect(() => {
    return () => {
      if (productImagePreview && productImagePreview.startsWith('blob:')) {
        revokeImagePreview(productImagePreview)
      }
    }
  }, [productImagePreview])

  // Barcode scanning
  const handleScanBarcode = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('El escaneo de códigos solo está disponible en la app móvil')
      return
    }

    try {
      setIsScanningBarcode(true)

      // Check permissions
      const { camera } = await BarcodeScanner.checkPermissions()
      if (camera !== 'granted') {
        const { camera: newPermission } = await BarcodeScanner.requestPermissions()
        if (newPermission !== 'granted') {
          toast.error('Se necesita permiso de cámara para escanear')
          return
        }
      }

      // Scan
      const result = await BarcodeScanner.scan()
      if (result.barcodes && result.barcodes.length > 0) {
        const code = result.barcodes[0].rawValue
        setValue('code', code)
        toast.success(`Código escaneado: ${code}`)
      }
    } catch (error) {
      console.error('Error scanning barcode:', error)
      if (error.message?.includes('canceled')) {
        // User cancelled
      } else {
        toast.error('Error al escanear código')
      }
    } finally {
      setIsScanningBarcode(false)
    }
  }

  // Image handling
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      toast.error('Formato no válido. Usa JPG, PNG, WebP o GIF')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar 5MB')
      return
    }

    // Clear previous preview
    if (productImagePreview && productImagePreview.startsWith('blob:')) {
      revokeImagePreview(productImagePreview)
    }

    // Create preview and store file
    setProductImage(file)
    setProductImagePreview(createImagePreview(file))
  }

  const handleTakePhoto = async () => {
    if (!Capacitor.isNativePlatform()) return

    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      })

      if (photo.webPath) {
        // Fetch the photo and convert to blob
        const response = await fetch(photo.webPath)
        const blob = await response.blob()
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })

        setProductImage(file)
        setProductImagePreview(photo.webPath)
      }
    } catch (error) {
      if (!error.message?.includes('cancelled')) {
        console.error('Error taking photo:', error)
        toast.error('Error al tomar foto')
      }
    }
  }

  const handleImageRemove = () => {
    if (productImagePreview && productImagePreview.startsWith('blob:')) {
      revokeImagePreview(productImagePreview)
    }
    setProductImage(null)
    setProductImagePreview(null)
  }

  // Form submission
  const handleFormSubmit = async (formData) => {
    // Build the complete product data
    const productData = {
      ...formData,
      noStock,
      allowDecimalQuantity,
      trackExpiration,
      catalogVisible,
      taxAffectation,
      ...(taxType === 'standard' && taxAffectation === '10' && { igvRate }),
      presentations: showPresentations ? presentations : [],
      warehouseInitialStocks: showWarehouseStock ? warehouseInitialStocks : {},
    }

    // Include pharmacy data if in pharmacy mode
    if (businessMode === 'pharmacy') {
      productData.genericName = pharmacyData.genericName || null
      productData.concentration = pharmacyData.concentration || null
      productData.presentation = pharmacyData.presentation || null
      productData.laboratoryId = pharmacyData.laboratoryId || null
      productData.laboratoryName = pharmacyData.laboratoryName || null
      productData.marca = pharmacyData.marca || null
      productData.batchNumber = pharmacyData.batchNumber || null
      productData.activeIngredient = pharmacyData.activeIngredient || null
      productData.therapeuticAction = pharmacyData.therapeuticAction || null
      productData.saleCondition = pharmacyData.saleCondition || 'sin_receta'
      productData.requiresPrescription = pharmacyData.saleCondition !== 'sin_receta'
      productData.sanitaryRegistry = pharmacyData.sanitaryRegistry || null
      productData.location = pharmacyData.location || null
    }

    // Handle image upload if there's a new image
    if (productImage && canUseProductImages) {
      try {
        setUploadingImage(true)
        const businessId = getBusinessId()
        if (!businessId) {
          throw new Error('No se pudo identificar el negocio')
        }
        // Use existing product ID or generate a temporary one
        const tempProductId = initialData?.id || `temp_${Date.now()}`
        const imageUrl = await uploadProductImage(businessId, tempProductId, productImage)
        productData.imageUrl = imageUrl
      } catch (error) {
        console.error('Error uploading image:', error)
        toast.error('Error al subir la imagen. El producto se guardará sin imagen.')
      } finally {
        setUploadingImage(false)
      }
    } else if (productImagePreview && !productImage) {
      // Keep existing image URL
      productData.imageUrl = productImagePreview
    }

    // Call parent onSubmit
    await onSubmit(productData)
  }

  const handleClose = () => {
    // Cleanup
    if (productImagePreview && productImagePreview.startsWith('blob:')) {
      revokeImagePreview(productImagePreview)
    }
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="5xl"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* ═══════════════════════════════════════════════════════════════════
            LAYOUT: 2 columnas en desktop, 1 en móvil
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-5 lg:space-y-0">

          {/* ═══════════════════════════════════════════════════════════════
              COLUMNA IZQUIERDA: INFORMACIÓN BÁSICA
          ═══════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Información Básica
            </h3>

            {/* Nombre del producto */}
            <Input
              label="Nombre"
              required
              placeholder="Nombre del producto o servicio"
              error={errors.name?.message}
              {...register('name')}
            />

            {/* Imagen y Descripción en fila */}
            <div className="flex gap-4">
              {/* Image upload - only shown if feature is enabled */}
              {canUseProductImages && (
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Imagen</label>
                  <div className="relative">
                    {productImagePreview ? (
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300 group">
                        <img
                          src={productImagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleImageRemove}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <label className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                          Cambiar
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <label className="cursor-pointer block w-24 h-12 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-gray-100 flex items-center justify-center bg-gray-50 transition-colors">
                          <div className="text-center flex items-center gap-1.5">
                            <Upload className="w-4 h-4 text-gray-400" />
                            <span className="text-xs text-gray-500">Subir</span>
                          </div>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                        </label>
                        {Capacitor.isNativePlatform() && (
                          <button
                            type="button"
                            onClick={handleTakePhoto}
                            className="w-24 h-12 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-gray-100 flex items-center justify-center bg-gray-50 transition-colors"
                          >
                            <div className="text-center flex items-center gap-1.5">
                              <Camera className="w-4 h-4 text-gray-400" />
                              <span className="text-xs text-gray-500">Foto</span>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                    {uploadingImage && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Descripción */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción (Opcional)
                </label>
                <textarea
                  {...register('description')}
                  rows={canUseProductImages ? 3 : 2}
                  placeholder="Descripción breve del producto o servicio"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                />
              </div>
            </div>

            {/* SKU */}
            {showSku && (
              <div>
                <Input
                  label="SKU / Código Interno"
                  placeholder="SKU-001"
                  error={errors.sku?.message}
                  {...register('sku')}
                  helperText="Código interno de tu negocio"
                />
                {businessSettings?.autoSku && !initialData && (
                  <button
                    type="button"
                    onClick={async () => {
                      const nextSku = await getNextSkuNumber(getBusinessId())
                      setValue('sku', nextSku)
                    }}
                    className="mt-1 text-xs text-primary-600 hover:text-primary-800 font-medium hover:underline"
                  >
                    Generar SKU automático
                  </button>
                )}
              </div>
            )}

            {/* Código de Barras con botón de escanear */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código de Barras
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="7501234567890"
                  className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.code ? 'border-red-500' : 'border-gray-300'}`}
                  {...register('code')}
                />
                <button
                  type="button"
                  onClick={handleScanBarcode}
                  disabled={isScanningBarcode}
                  className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  title="Escanear código de barras"
                >
                  {isScanningBarcode ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">Escanear</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">EAN, UPC u otro</p>
              {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              COLUMNA DERECHA: PRECIOS, CLASIFICACIÓN E INVENTARIO
          ═══════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
              Precios y Clasificación
            </h3>

            {/* Precios - 2 columnas dentro de la columna derecha */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={showMultiplePrices && businessSettings?.multiplePricesEnabled
                  ? (businessSettings?.priceLabels?.price1 || 'Precio 1')
                  : "Precio de Venta"}
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                error={errors.price?.message}
                {...register('price')}
              />

              <div>
                <Input
                  label="Costo"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  error={errors.cost?.message}
                  {...register('cost')}
                />
                <p className="text-xs text-gray-500 mt-0.5">Opcional</p>
              </div>

              {/* Precios adicionales - solo si está habilitado */}
              {showMultiplePrices && businessSettings?.multiplePricesEnabled && (
                <>
                  <Input
                    label={businessSettings?.priceLabels?.price2 || 'Precio 2'}
                    type="number"
                    step="0.01"
                    placeholder="0.00 (opcional)"
                    error={errors.price2?.message}
                    {...register('price2')}
                  />
                  <Input
                    label={businessSettings?.priceLabels?.price3 || 'Precio 3'}
                    type="number"
                    step="0.01"
                    placeholder="0.00 (opcional)"
                    error={errors.price3?.message}
                    {...register('price3')}
                  />
                  <Input
                    label={businessSettings?.priceLabels?.price4 || 'Precio 4'}
                    type="number"
                    step="0.01"
                    placeholder="0.00 (opcional)"
                    error={errors.price4?.message}
                    {...register('price4')}
                  />
                </>
              )}

              <Select
                label="Unidad"
                required
                error={errors.unit?.message}
                {...register('unit')}
              >
                {UNITS.map(unit => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </Select>

              {/* Afectación IGV */}
              {showIgvAffectation && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Afectación IGV
                  </label>
                  {taxType === 'standard' ? (
                    <select
                      value={taxAffectation === '10' ? `10-${igvRate}` : taxAffectation}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '10-18') {
                          setTaxAffectation('10')
                          setIgvRate(18)
                        } else if (val === '10-10') {
                          setTaxAffectation('10')
                          setIgvRate(10)
                        } else if (val === '20') {
                          setTaxAffectation('20')
                          setIgvRate(0)
                        } else if (val === '30') {
                          setTaxAffectation('30')
                          setIgvRate(0)
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="10-18">Gravado (18%)</option>
                      <option value="10-10">Gravado (10% - Ley Restaurantes)</option>
                      <option value="20">Exonerado</option>
                      <option value="30">Inafecto</option>
                    </select>
                  ) : (
                    <select
                      value={taxAffectation}
                      onChange={(e) => setTaxAffectation(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="10">Gravado</option>
                      <option value="20">Exonerado</option>
                      <option value="30">Inafecto</option>
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Peso y Categoría */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Peso (kg)"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  error={errors.weight?.message}
                  {...register('weight')}
                />
                <p className="text-xs text-gray-500 mt-0.5">Opcional</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoría
                </label>
                <select
                  {...register('category')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sin categoría</option>
                  {getRootCategories(categories).map(cat => (
                    <React.Fragment key={cat.id}>
                      <option value={cat.id}>{cat.name}</option>
                      {getSubcategories(categories, cat.id).map(subcat => (
                        <option key={subcat.id} value={subcat.id}>└─ {subcat.name}</option>
                      ))}
                    </React.Fragment>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>{/* fin grid 2 columnas */}

        {/* ═══════════════════════════════════════════════════════════════════
            SECCIONES DE ANCHO COMPLETO (debajo del grid)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-5 mt-5">

        {/* ═══════════════════════════════════════════════════════════════════
            SECCIÓN: INFORMACIÓN FARMACÉUTICA (solo modo farmacia)
        ═══════════════════════════════════════════════════════════════════ */}
        {businessMode === 'pharmacy' && (
          <div className="space-y-4 bg-green-50/50 border border-green-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Información Farmacéutica
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nombre Genérico (DCI) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Genérico (DCI)
                </label>
                <input
                  type="text"
                  value={pharmacyData.genericName}
                  onChange={(e) => setPharmacyData({...pharmacyData, genericName: e.target.value})}
                  placeholder="Ej: Paracetamol"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Denominación Común Internacional</p>
              </div>

              {/* Concentración */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Concentración
                </label>
                <input
                  type="text"
                  value={pharmacyData.concentration}
                  onChange={(e) => setPharmacyData({...pharmacyData, concentration: e.target.value})}
                  placeholder="Ej: 500mg, 100ml"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>

              {/* Presentación farmacéutica */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Presentación
                </label>
                <input
                  type="text"
                  value={pharmacyData.presentation}
                  onChange={(e) => setPharmacyData({...pharmacyData, presentation: e.target.value})}
                  placeholder="Ej: Tabletas x 100, Jarabe 120ml"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>

              {/* Laboratorio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Laboratorio
                </label>
                <select
                  value={pharmacyData.laboratoryId}
                  onChange={(e) => {
                    const lab = laboratories.find(l => l.id === e.target.value)
                    setPharmacyData({
                      ...pharmacyData,
                      laboratoryId: e.target.value,
                      laboratoryName: lab?.name || ''
                    })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                >
                  <option value="">Seleccionar laboratorio</option>
                  {laboratories.map(lab => (
                    <option key={lab.id} value={lab.id}>{lab.name}</option>
                  ))}
                </select>
                {laboratories.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No hay laboratorios registrados. Agrégalos desde el menú Laboratorios.</p>
                )}
              </div>

              {/* Marca */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marca
                </label>
                <input
                  type="text"
                  value={pharmacyData.marca}
                  onChange={(e) => setPharmacyData({...pharmacyData, marca: e.target.value})}
                  placeholder="Ej: Panadol, Aspirina"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>

              {/* Número de Lote */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Lote
                </label>
                <input
                  type="text"
                  value={pharmacyData.batchNumber}
                  onChange={(e) => setPharmacyData({...pharmacyData, batchNumber: e.target.value})}
                  placeholder="Ej: LOT2024001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>

              {/* Principio Activo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Principio Activo
                </label>
                <input
                  type="text"
                  value={pharmacyData.activeIngredient}
                  onChange={(e) => setPharmacyData({...pharmacyData, activeIngredient: e.target.value})}
                  placeholder="Ej: Paracetamol, Ibuprofeno"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>

              {/* Acción Terapéutica */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Acción Terapéutica
                </label>
                <select
                  value={pharmacyData.therapeuticAction}
                  onChange={(e) => setPharmacyData({...pharmacyData, therapeuticAction: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                >
                  <option value="">Seleccionar acción</option>
                  <option value="Analgésico">Analgésico</option>
                  <option value="Antiinflamatorio">Antiinflamatorio</option>
                  <option value="Antibiótico">Antibiótico</option>
                  <option value="Antialérgico">Antialérgico</option>
                  <option value="Antihipertensivo">Antihipertensivo</option>
                  <option value="Antiácido">Antiácido</option>
                  <option value="Antidiarreico">Antidiarreico</option>
                  <option value="Antidepresivo">Antidepresivo</option>
                  <option value="Antiparasitario">Antiparasitario</option>
                  <option value="Antifúngico">Antifúngico</option>
                  <option value="Antipirético">Antipirético</option>
                  <option value="Antiemético">Antiemético</option>
                  <option value="Antitusivo">Antitusivo</option>
                  <option value="Broncodilatador">Broncodilatador</option>
                  <option value="Diurético">Diurético</option>
                  <option value="Laxante">Laxante</option>
                  <option value="Vitamina/Suplemento">Vitamina/Suplemento</option>
                  <option value="Dermatológico">Dermatológico</option>
                  <option value="Oftálmico">Oftálmico</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              {/* Condición de Venta */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condición de Venta
                </label>
                <select
                  value={pharmacyData.saleCondition}
                  onChange={(e) => setPharmacyData({...pharmacyData, saleCondition: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                >
                  <option value="sin_receta">Venta libre (sin receta)</option>
                  <option value="con_receta">Con receta médica</option>
                  <option value="receta_retenida">Receta retenida</option>
                </select>
              </div>

              {/* Registro Sanitario */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registro Sanitario DIGEMID
                </label>
                <input
                  type="text"
                  value={pharmacyData.sanitaryRegistry}
                  onChange={(e) => setPharmacyData({...pharmacyData, sanitaryRegistry: e.target.value})}
                  placeholder="Ej: N-12345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>

              {/* Ubicación en estante */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ubicación (Estante/Anaquel)
                </label>
                <input
                  type="text"
                  value={pharmacyData.location}
                  onChange={(e) => setPharmacyData({...pharmacyData, location: e.target.value})}
                  placeholder="Ej: A1-E3, Vitrina 2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SECCIÓN: PRESENTACIONES DE VENTA (opcional)
        ═══════════════════════════════════════════════════════════════════ */}
        {showPresentations && businessSettings?.presentationsEnabled && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Presentaciones de Venta
            </h3>

            <p className="text-xs text-gray-500">
              Define cómo se puede vender este producto (unidad, pack, caja, etc.)
            </p>

            {/* Lista de presentaciones */}
            {presentations.length > 0 && (
              <div className="space-y-2">
                {presentations.map((pres, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-xs text-gray-500">Nombre</span>
                        <p className="text-sm font-medium">{pres.name}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Factor</span>
                        <p className="text-sm font-medium">×{pres.factor}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Precio</span>
                        <p className="text-sm font-medium">S/ {parseFloat(pres.price).toFixed(2)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = presentations.filter((_, i) => i !== idx)
                        setPresentations(updated)
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Agregar nueva presentación */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: Caja x24"
                  value={newPresentation.name}
                  onChange={(e) => setNewPresentation(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="w-20">
                <label className="block text-xs font-medium text-gray-700 mb-1">Factor</label>
                <input
                  type="number"
                  placeholder="24"
                  min="1"
                  value={newPresentation.factor}
                  onChange={(e) => setNewPresentation(prev => ({ ...prev, factor: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-700 mb-1">Precio</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newPresentation.price}
                  onChange={(e) => setNewPresentation(prev => ({ ...prev, price: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newPresentation.name.trim()) {
                    toast.error('Ingresa un nombre para la presentación')
                    return
                  }
                  if (!newPresentation.factor || parseInt(newPresentation.factor) < 1) {
                    toast.error('El factor debe ser al menos 1')
                    return
                  }
                  if (!newPresentation.price || parseFloat(newPresentation.price) <= 0) {
                    toast.error('Ingresa un precio válido')
                    return
                  }
                  setPresentations([...presentations, {
                    name: newPresentation.name.trim(),
                    factor: parseInt(newPresentation.factor),
                    price: parseFloat(newPresentation.price)
                  }])
                  setNewPresentation({ name: '', factor: '', price: '' })
                }}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SECCIÓN 3: INVENTARIO (oculta si hideStockField es true)
        ═══════════════════════════════════════════════════════════════════ */}
        {!hideStockField && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Inventario
          </h3>

          {/* Checkboxes de opciones */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={noStock}
                onChange={e => {
                  setNoStock(e.target.checked)
                  if (e.target.checked) setValue('stock', '')
                }}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="ml-2 text-sm text-gray-700">No manejar stock</span>
            </label>

            {showDecimalQuantity && (
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDecimalQuantity}
                  onChange={e => setAllowDecimalQuantity(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Permitir decimales</span>
              </label>
            )}

            {showExpiration && (
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackExpiration}
                  onChange={e => {
                    setTrackExpiration(e.target.checked)
                    if (!e.target.checked) setValue('expirationDate', '')
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Control de vencimiento</span>
              </label>
            )}

            {showCatalogVisibility && (
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={catalogVisible}
                  onChange={e => setCatalogVisible(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <span className="ml-2 text-sm text-gray-700">Mostrar en catálogo</span>
              </label>
            )}
          </div>

          {/* Campos de Stock (solo si controla stock) */}
          {!noStock && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
              {/* Stock por Almacén (solo si hay almacenes y está habilitado) */}
              {showWarehouseStock && warehouses.length > 0 && !initialData ? (
                <div className="col-span-full">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {stockLabel} por Almacén
                  </label>
                  <div className="space-y-2">
                    {warehouses.filter(wh => wh.isActive).map((wh) => (
                      <div key={wh.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-700">
                            {wh.name}
                          </span>
                          {wh.isDefault && (
                            <span className="ml-2 text-xs text-primary-600">(Principal)</span>
                          )}
                        </div>
                        <div className="w-28">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={warehouseInitialStocks[wh.id] || ''}
                            onChange={(e) => setWarehouseInitialStocks(prev => ({
                              ...prev,
                              [wh.id]: e.target.value
                            }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12">uds.</span>
                      </div>
                    ))}
                  </div>
                  {/* Total */}
                  {Object.values(warehouseInitialStocks).some(v => v && parseInt(v) > 0) && (
                    <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Stock Total:</span>
                      <span className="text-sm font-bold text-primary-600">
                        {Object.values(warehouseInitialStocks).reduce((sum, v) => sum + (parseInt(v) || 0), 0)} unidades
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <Input
                  label={stockLabel}
                  type="number"
                  placeholder="0"
                  error={errors.stock?.message}
                  {...register('stock')}
                  helperText={stockHelperText}
                />
              )}

              {/* Fecha de Vencimiento (solo si está activado) */}
              {showExpiration && trackExpiration && (
                <Input
                  label="Fecha de Vencimiento"
                  type="date"
                  error={errors.expirationDate?.message}
                  {...register('expirationDate')}
                />
              )}
            </div>
          )}

          {/* Fecha de vencimiento fuera del bloque de stock si no controla stock pero sí vencimiento */}
          {noStock && showExpiration && trackExpiration && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <Input
                label="Fecha de Vencimiento"
                type="date"
                error={errors.expirationDate?.message}
                {...register('expirationDate')}
              />
            </div>
          )}
        </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            BOTONES
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting || uploadingImage}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || uploadingImage}>
            {isSubmitting || uploadingImage ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {uploadingImage ? 'Subiendo imagen...' : 'Guardando...'}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>

        </div>{/* fin secciones ancho completo */}
      </form>
    </Modal>
  )
}

export default ProductFormModal
