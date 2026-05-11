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
import ProductImagesManager, { productToImageItems, resolveImageUrls } from '@/components/product/ProductImagesManager'

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
  const [trackSerials, setTrackSerials] = useState(false)
  const [catalogVisible, setCatalogVisible] = useState(false)
  const [catalogComparePrice, setCatalogComparePrice] = useState('')
  // Auto-precio según cantidad (para POS y catálogo) — opt-in por producto.
  // Si está OFF: en POS aparece el modal de elegir precio como hoy.
  // Si está ON: se agrega directo y el precio se ajusta solo según la cantidad.
  const [useAutoPriceByQty, setUseAutoPriceByQty] = useState(false)
  const [priceMinQtys, setPriceMinQtys] = useState({ price2: '', price3: '', price4: '' })
  const isIgvExempt = businessSettings?.emissionConfig?.taxConfig?.igvExempt === true
  const taxType = businessSettings?.emissionConfig?.taxConfig?.taxType || (isIgvExempt ? 'exempt' : 'standard')
  const [taxAffectation, setTaxAffectation] = useState(isIgvExempt ? '20' : '10')
  const [igvRate, setIgvRate] = useState(businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18)
  const [isScanningBarcode, setIsScanningBarcode] = useState(false)
  const [warehouseInitialStocks, setWarehouseInitialStocks] = useState({})

  // Image state (multi-imagen, máx 5)
  const [productImages, setProductImages] = useState([])
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

  // Product location state (for enableProductLocation preference, all modes)
  const [productLocation, setProductLocation] = useState('')

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
      setTrackSerials(initialData.trackSerials || false)
      setCatalogVisible(initialData.catalogVisible || false)
      setCatalogComparePrice(initialData.catalogComparePrice?.toString() || '')
      setUseAutoPriceByQty(initialData.useAutoPriceByQty === true)
      setPriceMinQtys({
        price2: initialData.priceMinQtys?.price2?.toString() || '',
        price3: initialData.priceMinQtys?.price3?.toString() || '',
        price4: initialData.priceMinQtys?.price4?.toString() || '',
      })
      setTaxAffectation(initialData.taxAffectation || '10')
      setIgvRate(initialData.igvRate ?? (businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18))
      setPresentations(initialData.presentations || [])
      setProductLocation(initialData.location || '')
      setProductImages(productToImageItems(initialData))
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
      setUseAutoPriceByQty(false)
      setPriceMinQtys({ price2: '', price3: '', price4: '' })
      setTaxAffectation(isIgvExempt ? '20' : '10')
      setIgvRate(businessSettings?.emissionConfig?.taxConfig?.igvRate ?? 18)
      setWarehouseInitialStocks({})
      setPresentations([])
      setProductImages([])
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
      setProductLocation('')
    }
  }, [isOpen, initialData, reset])

  // Cleanup: la limpieza de blobs la hace ProductImagesManager internamente

  // Barcode scanning
  const scanningRef = useRef(false)

  useEffect(() => {
    return () => {
      if (scanningRef.current) {
        BarcodeScanner.stopScan().catch(() => {})
        scanningRef.current = false
      }
    }
  }, [])

  const handleScanBarcode = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('El escaneo de códigos solo está disponible en la app móvil')
      return
    }

    if (scanningRef.current) return
    scanningRef.current = true
    setIsScanningBarcode(true)

    try {
      // Verificar si el módulo de Google Barcode Scanner está disponible (solo Android)
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) {
          toast.info('Instalando módulo de escáner... Por favor espera')
          await BarcodeScanner.installGoogleBarcodeScannerModule()
          toast.success('Módulo instalado. Intenta escanear de nuevo.')
          return
        }
      }

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
      await BarcodeScanner.stopScan().catch(() => {})

      if (result.barcodes && result.barcodes.length > 0) {
        const code = result.barcodes[0].rawValue
        setValue('code', code)
        toast.success(`Código escaneado: ${code}`)
      }
    } catch (error) {
      console.error('Error scanning barcode:', error)
      await BarcodeScanner.stopScan().catch(() => {})
      if (error.message?.includes('canceled')) {
        // User cancelled
      } else {
        toast.error('Error al escanear código')
      }
    } finally {
      scanningRef.current = false
      setIsScanningBarcode(false)
    }
  }

  // Form submission
  const handleFormSubmit = async (formData) => {
    // Build the complete product data
    // Auto-precio por cantidad: solo persistir si el toggle está activo.
    // Si está OFF, dejamos useAutoPriceByQty:false y priceMinQtys:null para
    // que la UI/POS sigan con el comportamiento clásico (modal de selección).
    const cleanMinQtys = useAutoPriceByQty
      ? Object.fromEntries(
          ['price2', 'price3', 'price4']
            .map((k) => [k, parseInt(priceMinQtys[k])])
            .filter(([, v]) => Number.isFinite(v) && v >= 1)
        )
      : null

    const productData = {
      ...formData,
      noStock,
      allowDecimalQuantity,
      trackExpiration,
      trackSerials,
      catalogVisible,
      catalogComparePrice: catalogVisible && catalogComparePrice ? parseFloat(catalogComparePrice) : null,
      useAutoPriceByQty,
      priceMinQtys: cleanMinQtys && Object.keys(cleanMinQtys).length > 0 ? cleanMinQtys : null,
      taxAffectation,
      ...(taxType === 'standard' && taxAffectation === '10' && { igvRate }),
      presentations: showPresentations ? presentations : [],
      warehouseInitialStocks: showWarehouseStock ? warehouseInitialStocks : {},
    }

    // Product location (works in all modes when enabled)
    productData.location = businessMode === 'pharmacy' ? (pharmacyData.location || null) : (productLocation || null)

    // Include pharmacy data if in pharmacy mode
    if (businessMode === 'pharmacy') {
      productData.genericName = pharmacyData.genericName || null
      productData.concentration = pharmacyData.concentration || null
      productData.presentation = pharmacyData.presentation || null
      productData.laboratoryId = pharmacyData.laboratoryId || null
      productData.laboratoryName = pharmacyData.laboratoryName || null
      productData.marca = pharmacyData.marca || null
      // batchNumber removido - los lotes se gestionan via Compras o ajustes de inventario
      productData.activeIngredient = pharmacyData.activeIngredient || null
      productData.therapeuticAction = pharmacyData.therapeuticAction || null
      productData.saleCondition = pharmacyData.saleCondition || 'sin_receta'
      productData.requiresPrescription = pharmacyData.saleCondition !== 'sin_receta'
      productData.sanitaryRegistry = pharmacyData.sanitaryRegistry || null
    }

    // Handle multi-image: upload pending files, preserve existing URLs
    if (canUseProductImages) {
      try {
        const hasPending = productImages.some(img => img.file)
        if (hasPending) setUploadingImage(true)
        const businessId = getBusinessId()
        if (!businessId) {
          throw new Error('No se pudo identificar el negocio')
        }
        const tempProductId = initialData?.id || `temp_${Date.now()}`
        const urls = await resolveImageUrls(productImages, (file) =>
          uploadProductImage(businessId, tempProductId, file)
        )
        productData.imageUrls = urls
        productData.imageUrl = urls[0] || null
      } catch (error) {
        console.error('Error uploading image:', error)
        toast.error('Error al subir las imágenes. El producto se guardará sin imagen.')
        productData.imageUrls = []
        productData.imageUrl = null
      } finally {
        setUploadingImage(false)
      }
    }

    // Call parent onSubmit
    await onSubmit(productData)
  }

  const handleClose = () => {
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span className="text-red-500">*</span>
                <span className="text-xs font-normal text-gray-500 ml-1">(puedes presionar ENTER para saltar de línea)</span>
              </label>
              <textarea
                placeholder="Nombre del producto o servicio"
                rows={2}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                {...register('name')}
              />
              {errors.name?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Imágenes (multi, máx 5) */}
            {canUseProductImages && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Imágenes <span className="text-xs font-normal text-gray-500">(máx 5, arrastra para reordenar)</span>
                </label>
                <div className="relative">
                  <ProductImagesManager
                    images={productImages}
                    onChange={setProductImages}
                    maxImages={5}
                  />
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción (Opcional)
              </label>
              <textarea
                {...register('description')}
                rows={2}
                placeholder="Descripción breve del producto o servicio"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
              />
            </div>

            {/* Marca - disponible en todos los modos */}
            {businessMode !== 'pharmacy' && (
              <Input
                label="Marca (Opcional)"
                placeholder="Ej: Esika, Nike, Samsung"
                {...register('marca')}
              />
            )}

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

            {/* Ubicación del producto (habilitado desde Preferencias) */}
            {businessSettings?.enableProductLocation && businessMode !== 'pharmacy' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ubicación del Producto
                </label>
                <input
                  type="text"
                  value={productLocation}
                  onChange={(e) => setProductLocation(e.target.value)}
                  placeholder="Ej: P1-3A-4R (Pasillo 1, Estante 3A, Fila 4)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Ubicación física en el almacén</p>
              </div>
            )}
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
                step="any"
                required
                placeholder="0.00"
                error={errors.price?.message}
                {...register('price')}
              />

              <div>
                <Input
                  label="Costo"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  error={errors.cost?.message}
                  {...register('cost')}
                />
                <p className="text-xs text-gray-500 mt-0.5">Opcional</p>
              </div>

              {/* Precios adicionales - solo si está habilitado */}
              {showMultiplePrices && businessSettings?.multiplePricesEnabled && (
                <>
                  <div>
                    <Input
                      label={businessSettings?.priceLabels?.price2 || 'Precio 2'}
                      type="number"
                      step="any"
                      placeholder="0.00 (opcional)"
                      error={errors.price2?.message}
                      {...register('price2')}
                    />
                    {useAutoPriceByQty && (
                      <Input
                        type="number"
                        min="1"
                        placeholder="Mínimo unidades"
                        value={priceMinQtys.price2}
                        onChange={(e) => setPriceMinQtys((p) => ({ ...p, price2: e.target.value }))}
                        className="mt-1.5 text-xs"
                      />
                    )}
                  </div>
                  <div>
                    <Input
                      label={businessSettings?.priceLabels?.price3 || 'Precio 3'}
                      type="number"
                      step="any"
                      placeholder="0.00 (opcional)"
                      error={errors.price3?.message}
                      {...register('price3')}
                    />
                    {useAutoPriceByQty && (
                      <Input
                        type="number"
                        min="1"
                        placeholder="Mínimo unidades"
                        value={priceMinQtys.price3}
                        onChange={(e) => setPriceMinQtys((p) => ({ ...p, price3: e.target.value }))}
                        className="mt-1.5 text-xs"
                      />
                    )}
                  </div>
                  <div>
                    <Input
                      label={businessSettings?.priceLabels?.price4 || 'Precio 4'}
                      type="number"
                      step="any"
                      placeholder="0.00 (opcional)"
                      error={errors.price4?.message}
                      {...register('price4')}
                    />
                    {useAutoPriceByQty && (
                      <Input
                        type="number"
                        min="1"
                        placeholder="Mínimo unidades"
                        value={priceMinQtys.price4}
                        onChange={(e) => setPriceMinQtys((p) => ({ ...p, price4: e.target.value }))}
                        className="mt-1.5 text-xs"
                      />
                    )}
                  </div>

                  {/* Toggle: auto-precio según cantidad. Ocupa las 2 columnas. */}
                  <div className="col-span-2 mt-2 border-t border-gray-100 pt-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useAutoPriceByQty}
                        onChange={(e) => setUseAutoPriceByQty(e.target.checked)}
                        className="mt-0.5 rounded text-primary-600"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">
                          Aplicar precio automático según cantidad
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          En el POS y catálogo, el precio cambia solo cuando el cliente alcanza la cantidad mínima. Si está apagado, el cajero elige el precio manualmente al agregar.
                        </p>
                      </div>
                    </label>
                  </div>
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
                        } else if (val === '10-10.5') {
                          setTaxAffectation('10')
                          setIgvRate(10.5)
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
                      <option value="10-10.5">Gravado (10.5% - Ley Restaurantes)</option>
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
                  step="any"
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
                  <option value="Corticoide">Corticoide</option>
                  <option value="Antibiótico">Antibiótico</option>
                  <option value="Antihistamínico">Antihistamínico</option>
                  <option value="Antigripal">Antigripal</option>
                  <option value="Antihipertensivo">Antihipertensivo</option>
                  <option value="Antiácido">Antiácido</option>
                  <option value="Antidiarreico">Antidiarreico</option>
                  <option value="Antidepresivo">Antidepresivo</option>
                  <option value="Antiparasitario">Antiparasitario</option>
                  <option value="Antifúngico">Antifúngico</option>
                  <option value="Antipirético">Antipirético</option>
                  <option value="Antiemético">Antiemético</option>
                  <option value="Antitusivo">Antitusivo</option>
                  <option value="Mucolítico">Mucolítico</option>
                  <option value="Expectorante">Expectorante</option>
                  <option value="Broncodilatador">Broncodilatador</option>
                  <option value="Diurético">Diurético</option>
                  <option value="Laxante">Laxante</option>
                  <option value="Vitamina/Suplemento">Vitamina/Suplemento</option>
                  <option value="Dermatológico">Dermatológico</option>
                  <option value="Oftálmico">Oftálmico</option>
                  <option value="Ótico">Ótico</option>
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
                  step="any"
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

            {!noStock && (
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackSerials}
                  onChange={e => setTrackSerials(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Control de N° de serie</span>
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
