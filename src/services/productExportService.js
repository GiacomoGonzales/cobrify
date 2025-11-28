import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Generar reporte de productos en Excel
 */
export const generateProductsExcel = (products, categories, businessData) => {
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

  // Descargar archivo
  XLSX.writeFile(workbook, fileName);
};
