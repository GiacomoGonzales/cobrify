import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Store principal de la aplicación usando Zustand
 * Maneja el estado global de facturas, clientes, productos, etc.
 */
export const useStore = create(
  persist(
    (set, get) => ({
      // Estado de facturas
      invoices: [],
      addInvoice: invoice =>
        set(state => ({ invoices: [...state.invoices, invoice] })),
      updateInvoice: (id, updatedInvoice) =>
        set(state => ({
          invoices: state.invoices.map(inv =>
            inv.id === id ? { ...inv, ...updatedInvoice } : inv
          ),
        })),
      deleteInvoice: id =>
        set(state => ({
          invoices: state.invoices.filter(inv => inv.id !== id),
        })),

      // Estado de clientes
      customers: [],
      addCustomer: customer =>
        set(state => ({ customers: [...state.customers, customer] })),
      updateCustomer: (id, updatedCustomer) =>
        set(state => ({
          customers: state.customers.map(cust =>
            cust.id === id ? { ...cust, ...updatedCustomer } : cust
          ),
        })),
      deleteCustomer: id =>
        set(state => ({
          customers: state.customers.filter(cust => cust.id !== id),
        })),

      // Estado de productos/servicios
      products: [],
      addProduct: product =>
        set(state => ({ products: [...state.products, product] })),
      updateProduct: (id, updatedProduct) =>
        set(state => ({
          products: state.products.map(prod =>
            prod.id === id ? { ...prod, ...updatedProduct } : prod
          ),
        })),
      deleteProduct: id =>
        set(state => ({
          products: state.products.filter(prod => prod.id !== id),
        })),

      // Configuración de la empresa
      companySettings: {
        ruc: '',
        businessName: '',
        address: '',
        phone: '',
        email: '',
        logo: null,
      },
      updateCompanySettings: settings =>
        set(state => ({
          companySettings: { ...state.companySettings, ...settings },
        })),

      // UI State
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      mobileMenuOpen: false,
      setMobileMenuOpen: open => set({ mobileMenuOpen: open }),
      toggleMobileMenu: () =>
        set(state => ({ mobileMenuOpen: !state.mobileMenuOpen })),
    }),
    {
      name: 'cobrify-storage',
      partialize: state => ({
        invoices: state.invoices,
        customers: state.customers,
        products: state.products,
        companySettings: state.companySettings,
      }),
    }
  )
)
