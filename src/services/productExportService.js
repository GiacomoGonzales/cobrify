import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Exportar productos en formato compatible con importación
 * Este formato permite reimportar los productos después de editarlos
 */
export const exportProductsForImport = async (products, categories, businessMode = 'retail') => {
  const workbook = XLSX.utils.book_new();

  // Helper para obtener nombre de categoría por ID
  const getCategoryName = (categoryId) => {
    if (!categoryId) return '';
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  };

  // Mapear afectación IGV a texto
  const getTaxAffectationText = (taxAffectation) => {
    switch (taxAffectation) {
      case '20': return 'EXONERADO';
      case '30': return 'INAFECTO';
      default: return 'GRAVADO';
    }
  };

  // Preparar datos según el modo de negocio
  let productData = [];

  if (businessMode === 'pharmacy') {
    // Formato farmacia con campos específicos
    productData = products.map(product => ({
      sku: product.sku || '',
      codigo_barras: product.code || '',
      nombre: product.name || '',
      descripcion: product.description || '',
      nombre_generico: product.genericName || '',
      concentracion: product.concentration || '',
      presentacion: product.presentation || '',
      laboratorio: product.laboratoryName || '',
      marca: product.marca || '',
      principio_activo: product.activeIngredient || '',
      accion_terapeutica: product.therapeuticAction || '',
      condicion_venta: product.saleCondition || '',
      registro_sanitario: product.sanitaryRegistry || '',
      ubicacion: product.location || '',
      costo: product.cost || '',
      precio: product.price || 0,
      precio2: product.price2 || '',
      precio3: product.price3 || '',
      precio4: product.price4 || '',
      stock: product.stock ?? '',
      trackStock: product.trackStock === false ? 'NO' : 'SI',
      unidad: product.unit || 'UNIDAD',
      categoria: getCategoryName(product.category),
      afectacion_igv: getTaxAffectationText(product.taxAffectation),
    }));
  } else {
    // Formato retail estándar
    productData = products.map(product => ({
      sku: product.sku || '',
      codigo_barras: product.code || '',
      nombre: product.name || '',
      descripcion: product.description || '',
      costo: product.cost || '',
      precio: product.price || 0,
      precio2: product.price2 || '',
      precio3: product.price3 || '',
      precio4: product.price4 || '',
      stock: product.stock ?? '',
      trackStock: product.trackStock === false ? 'NO' : 'SI',
      unidad: product.unit || 'UNIDAD',
      categoria: getCategoryName(product.category),
      afectacion_igv: getTaxAffectationText(product.taxAffectation),
    }));
  }

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.json_to_sheet(productData);

  // Configurar anchos de columna
  if (businessMode === 'pharmacy') {
    worksheet['!cols'] = [
      { wch: 12 }, // sku
      { wch: 16 }, // codigo_barras
      { wch: 30 }, // nombre
      { wch: 30 }, // descripcion
      { wch: 18 }, // nombre_generico
      { wch: 12 }, // concentracion
      { wch: 12 }, // presentacion
      { wch: 15 }, // laboratorio
      { wch: 20 }, // principio_activo
      { wch: 15 }, // accion_terapeutica
      { wch: 15 }, // condicion_venta
      { wch: 15 }, // registro_sanitario
      { wch: 12 }, // ubicacion
      { wch: 10 }, // costo
      { wch: 10 }, // precio
      { wch: 10 }, // precio2
      { wch: 10 }, // precio3
      { wch: 10 }, // precio4
      { wch: 10 }, // stock
      { wch: 12 }, // trackStock
      { wch: 12 }, // unidad
      { wch: 20 }, // categoria
      { wch: 15 }, // afectacion_igv
    ];
  } else {
    worksheet['!cols'] = [
      { wch: 15 }, // sku
      { wch: 18 }, // codigo_barras
      { wch: 35 }, // nombre
      { wch: 40 }, // descripcion
      { wch: 10 }, // costo
      { wch: 10 }, // precio
      { wch: 10 }, // precio2
      { wch: 10 }, // precio3
      { wch: 10 }, // precio4
      { wch: 10 }, // stock
      { wch: 12 }, // trackStock
      { wch: 12 }, // unidad
      { wch: 20 }, // categoria
      { wch: 15 }, // afectacion_igv
    ];
  }

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
      product.price || 0,
      product.stock || 0,
      product.minStock || 0,
      stockStatus,
      product.createdAt ? format(product.createdAt.toDate(), 'dd/MM/yyyy', { locale: es }) : 'N/A'
    ]);
  });

  // Agregar estadísticas al final
  const totalStock = products.reduce((sum, product) => sum + (product.stock || 0), 0);
  const totalValue = products.reduce((sum, product) => sum + ((product.price || 0) * (product.stock || 0)), 0);
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
