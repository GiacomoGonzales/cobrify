import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Exportar productos en formato compatible con importación.
 * El formato y orden de columnas coincide con la plantilla del importador,
 * por lo que el archivo exportado se puede reimportar directamente.
 *
 * Productos con variantes: emite UNA fila por variante (formato multi-fila),
 * con los campos del padre solo en la primera fila para mantener la
 * cuenta limpia. SKU/codigo_barras del padre van vacíos (cada variante
 * tiene su propio SKU).
 */
export const exportProductsForImport = async (products, categories, businessMode = 'retail') => {
  const workbook = XLSX.utils.book_new();

  // Helper categoría/subcategoría
  const getCategoryAndSubcategory = (categoryId) => {
    if (!categoryId) return { categoria: '', subcategoria: '' };
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return { categoria: '', subcategoria: '' };
    if (category.parentId) {
      const parent = categories.find(cat => cat.id === category.parentId);
      return { categoria: parent ? parent.name : '', subcategoria: category.name };
    }
    return { categoria: category.name, subcategoria: '' };
  };

  // Texto de afectación IGV
  const getTaxAffectationText = (taxAffectation) => {
    switch (taxAffectation) {
      case '20': return 'EXONERADO';
      case '30': return 'INAFECTO';
      default: return 'GRAVADO';
    }
  };

  // Sanitiza números (evita NaN/undefined en celdas)
  const safeNum = (val) => {
    if (val === undefined || val === null || val === '') return '';
    const n = Number(val);
    return isNaN(n) ? '' : n;
  };

  // Convierte fechas (Firestore Timestamp / Date / string) a YYYY-MM-DD
  const formatDate = (val) => {
    if (!val) return '';
    let d;
    if (val?.toDate) d = val.toDate();
    else if (val instanceof Date) d = val;
    else d = new Date(val);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Yes/No en formato del importador
  const yn = (v) => v ? 'SI' : 'NO';

  /**
   * Construye las filas de un producto: una si no tiene variantes,
   * múltiples (una por variante) si las tiene.
   */
  const buildRowsForProduct = (product) => {
    const { categoria, subcategoria } = getCategoryAndSubcategory(product.category);
    const presentations = Array.isArray(product.presentations) ? product.presentations : [];
    const p1 = presentations[0] || {};
    const p2 = presentations[1] || {};
    const p3 = presentations[2] || {};

    // Campos farmacia (solo se llenan en modo pharmacy)
    const pharmacyFields = businessMode === 'pharmacy' ? {
      nombre_generico: product.genericName || '',
      concentracion: product.concentration || '',
      presentacion: product.presentation || '',
      laboratorio: product.laboratoryName || '',
      principio_activo: product.activeIngredient || '',
      accion_terapeutica: product.therapeuticAction || '',
      condicion_venta: product.saleCondition || '',
      registro_sanitario: product.sanitaryRegistry || '',
    } : {};

    // Producto SIN variantes — fila única
    if (!product.hasVariants || !Array.isArray(product.variants) || product.variants.length === 0) {
      return [{
        sku: product.sku || '',
        codigo_barras: product.code || '',
        nombre: product.name || '',
        descripcion: product.description || '',
        marca: product.marca || '',
        categoria,
        subcategoria,
        unidad: product.unit || 'UNIDAD',
        ...pharmacyFields,
        costo: safeNum(product.cost),
        precio: safeNum(product.price),
        precio2: safeNum(product.price2),
        precio3: safeNum(product.price3),
        precio4: safeNum(product.price4),
        stock: safeNum(product.stock),
        trackStock: product.trackStock === false ? 'NO' : 'SI',
        permitir_decimales: yn(product.allowDecimalQuantity),
        control_vencimiento: yn(product.trackExpiration),
        fecha_vencimiento: formatDate(product.expirationDate),
        control_series: yn(product.trackSerials),
        mostrar_en_catalogo: product.catalogVisible === false ? 'NO' : 'SI',
        precio_comparacion: safeNum(product.catalogComparePrice),
        imagen_url: product.imageUrl || '',
        peso: safeNum(product.weight),
        ubicacion: product.location || '',
        afectacion_igv: getTaxAffectationText(product.taxAffectation),
        tasa_igv: safeNum(product.igvRate),
        presentacion1_nombre: p1.name || '',
        presentacion1_cantidad: safeNum(p1.factor),
        presentacion1_precio: safeNum(p1.price),
        presentacion2_nombre: p2.name || '',
        presentacion2_cantidad: safeNum(p2.factor),
        presentacion2_precio: safeNum(p2.price),
        presentacion3_nombre: p3.name || '',
        presentacion3_cantidad: safeNum(p3.factor),
        presentacion3_precio: safeNum(p3.price),
        variante_atributo: '',
        variante_valor: '',
        variante_sku: '',
        variante_precio: '',
        variante_stock: '',
      }];
    }

    // Producto CON variantes — una fila por variante.
    // El padre NO lleva sku/code/precio/stock (eso va en cada variante).
    // Los demás campos solo se repiten en la primera fila para mantener limpio.
    return product.variants.map((variant, idx) => {
      const isFirst = idx === 0;
      const attrs = variant.attributes || {};
      const attrKeys = Object.keys(attrs);
      const attrNames = attrKeys.join(',');
      const attrValues = attrKeys.map(k => attrs[k]).join(',');

      return {
        sku: '',                      // padre sin SKU
        codigo_barras: '',            // padre sin barcode
        nombre: product.name || '',   // siempre el mismo nombre — agrupa al reimportar
        descripcion: isFirst ? (product.description || '') : '',
        marca: isFirst ? (product.marca || '') : '',
        categoria: isFirst ? categoria : '',
        subcategoria: isFirst ? subcategoria : '',
        unidad: isFirst ? (product.unit || 'UNIDAD') : '',
        ...(isFirst ? pharmacyFields : Object.fromEntries(Object.keys(pharmacyFields).map(k => [k, '']))),
        costo: isFirst ? safeNum(product.cost) : '',
        precio: '',                   // sin precio padre
        precio2: '', precio3: '', precio4: '',
        stock: '',                    // sin stock padre
        trackStock: isFirst ? (product.trackStock === false ? 'NO' : 'SI') : '',
        permitir_decimales: isFirst ? yn(product.allowDecimalQuantity) : '',
        control_vencimiento: isFirst ? yn(product.trackExpiration) : '',
        fecha_vencimiento: isFirst ? formatDate(product.expirationDate) : '',
        control_series: isFirst ? yn(product.trackSerials) : '',
        mostrar_en_catalogo: isFirst ? (product.catalogVisible === false ? 'NO' : 'SI') : '',
        precio_comparacion: isFirst ? safeNum(product.catalogComparePrice) : '',
        imagen_url: isFirst ? (product.imageUrl || '') : '',
        peso: isFirst ? safeNum(product.weight) : '',
        ubicacion: isFirst ? (product.location || '') : '',
        afectacion_igv: isFirst ? getTaxAffectationText(product.taxAffectation) : '',
        tasa_igv: isFirst ? safeNum(product.igvRate) : '',
        presentacion1_nombre: isFirst ? (p1.name || '') : '',
        presentacion1_cantidad: isFirst ? safeNum(p1.factor) : '',
        presentacion1_precio: isFirst ? safeNum(p1.price) : '',
        presentacion2_nombre: isFirst ? (p2.name || '') : '',
        presentacion2_cantidad: isFirst ? safeNum(p2.factor) : '',
        presentacion2_precio: isFirst ? safeNum(p2.price) : '',
        presentacion3_nombre: isFirst ? (p3.name || '') : '',
        presentacion3_cantidad: isFirst ? safeNum(p3.factor) : '',
        presentacion3_precio: isFirst ? safeNum(p3.price) : '',
        variante_atributo: attrNames,
        variante_valor: attrValues,
        variante_sku: variant.sku || '',
        variante_precio: safeNum(variant.price),
        variante_stock: safeNum(variant.stock),
      };
    });
  };

  // Construir todas las filas (puede haber más filas que productos por las variantes)
  const productData = products.flatMap(p => buildRowsForProduct(p));

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.json_to_sheet(productData);

  // Anchos de columna razonables para legibilidad
  const baseCols = [
    { wch: 18 }, // sku
    { wch: 16 }, // codigo_barras
    { wch: 35 }, // nombre
    { wch: 40 }, // descripcion
    { wch: 15 }, // marca
    { wch: 20 }, // categoria
    { wch: 20 }, // subcategoria
    { wch: 10 }, // unidad
  ];
  const pharmaCols = businessMode === 'pharmacy' ? [
    { wch: 18 }, // nombre_generico
    { wch: 14 }, // concentracion
    { wch: 14 }, // presentacion
    { wch: 18 }, // laboratorio
    { wch: 22 }, // principio_activo
    { wch: 18 }, // accion_terapeutica
    { wch: 14 }, // condicion_venta
    { wch: 16 }, // registro_sanitario
  ] : [];
  const restCols = [
    { wch: 10 }, // costo
    { wch: 10 }, // precio
    { wch: 10 }, // precio2
    { wch: 10 }, // precio3
    { wch: 10 }, // precio4
    { wch: 10 }, // stock
    { wch: 12 }, // trackStock
    { wch: 18 }, // permitir_decimales
    { wch: 18 }, // control_vencimiento
    { wch: 16 }, // fecha_vencimiento
    { wch: 14 }, // control_series
    { wch: 18 }, // mostrar_en_catalogo
    { wch: 16 }, // precio_comparacion
    { wch: 30 }, // imagen_url
    { wch: 8 },  // peso
    { wch: 14 }, // ubicacion
    { wch: 14 }, // afectacion_igv
    { wch: 10 }, // tasa_igv
    { wch: 18 }, { wch: 16 }, { wch: 12 }, // presentacion1
    { wch: 18 }, { wch: 16 }, { wch: 12 }, // presentacion2
    { wch: 18 }, { wch: 16 }, { wch: 12 }, // presentacion3
    { wch: 18 }, // variante_atributo
    { wch: 16 }, // variante_valor
    { wch: 18 }, // variante_sku
    { wch: 12 }, // variante_precio
    { wch: 12 }, // variante_stock
  ];
  worksheet['!cols'] = [...baseCols, ...pharmaCols, ...restCols];

  XLSX.utils.book_append_sheet(workbook, worksheet, businessMode === 'pharmacy' ? 'Medicamentos' : 'Productos');

  // Generar nombre de archivo
  const fileName = `Productos_Exportados_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar/compartir archivo
  const isNativePlatform = Capacitor.isNativePlatform();

  if (isNativePlatform) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

      const result = await Filesystem.writeFile({
        path: fileName,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true
      });

      await Share.share({
        title: fileName,
        text: 'Productos exportados (compatible con importación)',
        url: result.uri,
        dialogTitle: 'Compartir productos'
      });

      return { success: true, uri: result.uri };
    } catch (error) {
      console.error('Error al exportar Excel en móvil:', error);
      throw error;
    }
  } else {
    XLSX.writeFile(workbook, fileName);
    return { success: true };
  }
};

/**
 * Generar reporte de productos en Excel (formato detallado con estadísticas)
 */
export const generateProductsExcel = async (products, categories, businessData, branchLabel = null, warehouseLabel = null) => {
  const workbook = XLSX.utils.book_new();

  // Helper para obtener nombre de categoría por ID
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Sin categoría';
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : 'Sin categoría';
  };

  // Helper para obtener la jerarquía completa de la categoría
  const getCategoryHierarchy = (categoryId) => {
    if (!categoryId) return 'Sin categoría';

    const hierarchy = [];
    let currentId = categoryId;

    while (currentId) {
      const category = categories.find(cat => cat.id === currentId);
      if (!category) break;
      hierarchy.unshift(category.name);
      currentId = category.parentId;
    }

    return hierarchy.length > 0 ? hierarchy.join(' > ') : 'Sin categoría';
  };

  // Preparar datos de los productos
  const productData = [
    ['LISTADO DE PRODUCTOS'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Sucursal:', branchLabel || 'Todas'],
    ['Almacén:', warehouseLabel || 'Todos'],
    ['Fecha de Generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
    ['Total de Productos:', products.length],
    [''],
    ['INVENTARIO DE PRODUCTOS'],
    [''],
  ];

  // Encabezados de la tabla
  productData.push([
    'SKU',
    'Código de Barras',
    'Nombre',
    'Categoría',
    'Descripción',
    'Unidad',
    'Precio Unitario',
    'Stock',
    'Stock Mínimo',
    'Estado Stock',
    'Fecha de Creación'
  ]);

  // Agregar datos de cada producto
  products.forEach(product => {
    const unitLabels = {
      'UNIDAD': 'Unidad',
      'CAJA': 'Caja',
      'KG': 'Kilogramo',
      'LITRO': 'Litro',
      'METRO': 'Metro',
      'HORA': 'Hora',
      'SERVICIO': 'Servicio'
    };

    // Determinar estado del stock
    let stockStatus = 'Normal';
    if (product.stock === 0) {
      stockStatus = 'Sin stock';
    } else if (product.minStock && product.stock <= product.minStock) {
      stockStatus = 'Stock bajo';
    }

    productData.push([
      product.sku || '',
      product.code || '',
      product.name || 'N/A',
      getCategoryHierarchy(product.category),
      product.description || '',
      unitLabels[product.unit] || product.unit || 'Unidad',
      product.hasVariants && product.variants?.length > 0 ? (Number(product.variants[0].price) || 0) : (Number(product.price) || 0),
      Number(product.stock) || 0,
      Number(product.minStock) || 0,
      stockStatus,
      product.createdAt?.toDate ? format(product.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A'
    ]);
  });

  // Agregar estadísticas al final
  const totalStock = products.reduce((sum, product) => sum + (Number(product.stock) || 0), 0);
  const totalValue = products.reduce((sum, product) => {
    const price = product.hasVariants && product.variants?.length > 0 ? (Number(product.variants[0].price) || 0) : (Number(product.price) || 0);
    return sum + (price * (Number(product.stock) || 0));
  }, 0);
  const lowStockProducts = products.filter(p => p.minStock && p.stock <= p.minStock).length;
  const outOfStockProducts = products.filter(p => p.stock === 0).length;

  productData.push(['']);
  productData.push(['ESTADÍSTICAS DE INVENTARIO']);
  productData.push(['Total de Productos:', products.length]);
  productData.push(['Productos sin Stock:', outOfStockProducts]);
  productData.push(['Productos con Stock Bajo:', lowStockProducts]);
  productData.push(['Total de Unidades en Stock:', totalStock]);
  productData.push(['Valor Total del Inventario:', totalValue]);

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.aoa_to_sheet(productData);

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 15 },  // SKU
    { width: 18 },  // Código de Barras
    { width: 30 },  // Nombre
    { width: 25 },  // Categoría
    { width: 35 },  // Descripción
    { width: 12 },  // Unidad
    { width: 15 },  // Precio Unitario
    { width: 10 },  // Stock
    { width: 12 },  // Stock Mínimo
    { width: 15 },  // Estado Stock
    { width: 15 },  // Fecha de Creación
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');

  // Si hay categorías, crear una hoja adicional con el árbol de categorías
  if (categories && categories.length > 0) {
    const categoryData = [
      ['ESTRUCTURA DE CATEGORÍAS'],
      [''],
      ['Categoría', 'Tipo', 'Productos en Categoría'],
      [''],
    ];

    // Función para contar productos en una categoría (incluyendo subcategorías)
    const countProductsInCategory = (categoryId) => {
      let count = products.filter(p => p.category === categoryId).length;

      // Contar productos en subcategorías
      const subcategories = categories.filter(cat => cat.parentId === categoryId);
      subcategories.forEach(subcat => {
        count += countProductsInCategory(subcat.id);
      });

      return count;
    };

    // Agregar categorías raíz y sus subcategorías
    const rootCategories = categories.filter(cat => !cat.parentId);

    rootCategories.forEach(rootCat => {
      const productCount = countProductsInCategory(rootCat.id);
      categoryData.push([rootCat.name, 'Categoría Principal', productCount]);

      // Agregar subcategorías
      const subcategories = categories.filter(cat => cat.parentId === rootCat.id);
      subcategories.forEach(subcat => {
        const subProductCount = countProductsInCategory(subcat.id);
        categoryData.push([`  └─ ${subcat.name}`, 'Subcategoría', subProductCount]);
      });
    });

    const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
    categorySheet['!cols'] = [
      { width: 35 },  // Categoría
      { width: 20 },  // Tipo
      { width: 20 },  // Productos en Categoría
    ];

    XLSX.utils.book_append_sheet(workbook, categorySheet, 'Categorías');
  }

  // Generar nombre de archivo
  const fileName = `Productos_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;

  // Descargar/compartir archivo
  const isNativePlatform = Capacitor.isNativePlatform();

  if (isNativePlatform) {
    try {
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

      const result = await Filesystem.writeFile({
        path: fileName,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true
      });

      console.log('Excel guardado en:', result.uri);

      await Share.share({
        title: fileName,
        text: 'Listado de productos',
        url: result.uri,
        dialogTitle: 'Compartir listado de productos'
      });

      return { success: true, uri: result.uri };
    } catch (error) {
      console.error('Error al exportar Excel en móvil:', error);
      throw error;
    }
  } else {
    XLSX.writeFile(workbook, fileName);
    return { success: true };
  }
};

/**
 * Exporta productos en formato simple para Self Mapping de Rappi.
 *
 * El merchant usa este Excel para copiar los SKUs de Cobrify al Portal Partners
 * de Rappi (asignándolos manualmente a cada producto Rappi). Solo incluye los
 * campos que necesita ver el merchant para hacer el mapeo: SKU, nombre, precio,
 * descripción y categoría.
 */
export const exportProductsForRappi = async (products, categories) => {
  const workbook = XLSX.utils.book_new();

  const getCategoryName = (categoryId) => {
    if (!categoryId) return '';
    const category = categories.find(c => c.id === categoryId);
    if (!category) return '';
    if (category.parentId) {
      const parent = categories.find(c => c.id === category.parentId);
      return parent ? `${parent.name} > ${category.name}` : category.name;
    }
    return category.name;
  };

  const headers = ['SKU', 'Nombre', 'Precio', 'Descripción', 'Categoría'];
  const rows = [headers];

  for (const product of products) {
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant, idx) => {
        rows.push([
          variant.sku || '',
          idx === 0
            ? `${product.name}${variant.attributes ? ' - ' + Object.values(variant.attributes).join(' / ') : ''}`
            : `${product.name} - ${Object.values(variant.attributes || {}).join(' / ')}`,
          variant.price ?? product.price ?? 0,
          product.description || '',
          getCategoryName(product.categoryId || product.category),
        ]);
      });
    } else {
      rows.push([
        product.sku || product.code || '',
        product.name || '',
        product.price ?? 0,
        product.description || '',
        getCategoryName(product.categoryId || product.category),
      ]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { width: 18 },
    { width: 40 },
    { width: 12 },
    { width: 50 },
    { width: 25 },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Productos para Rappi');

  const fileName = `Productos_Rappi_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  const isNativePlatform = Capacitor.isNativePlatform();

  if (isNativePlatform) {
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    const result = await Filesystem.writeFile({
      path: fileName,
      data: excelBuffer,
      directory: Directory.Documents,
      recursive: true,
    });
    await Share.share({
      title: fileName,
      text: 'Productos para Self Mapping en Rappi',
      url: result.uri,
      dialogTitle: 'Compartir listado de SKUs',
    });
    return { success: true, uri: result.uri };
  } else {
    XLSX.writeFile(workbook, fileName);
    return { success: true };
  }
};
