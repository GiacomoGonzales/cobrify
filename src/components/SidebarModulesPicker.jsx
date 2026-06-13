import React from 'react'
import { getMenuModuleGroups } from '@/data/sidebarMenuModules'

/**
 * Selector de módulos del menú lateral (mostrar/ocultar) por modo de negocio.
 * Reutilizable: se usa en el onboarding (Crear Cuenta). `hiddenMenuItems` es el
 * array de IDs ocultos; `onChange` recibe el nuevo array completo.
 */
export default function SidebarModulesPicker({ businessMode = 'retail', hiddenMenuItems = [], onChange }) {
  const groups = getMenuModuleGroups(businessMode)

  const toggle = (id, checked) => {
    if (checked) onChange(hiddenMenuItems.filter((i) => i !== id))
    else onChange([...hiddenMenuItems, id])
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {groups.flatMap((group, gi) => [
        group.title ? (
          <div key={`hdr-${gi}`} className="sm:col-span-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">{group.title}</h4>
          </div>
        ) : null,
        ...group.items.map((item) => {
          const visible = !hiddenMenuItems.includes(item.id)
          return (
            <label
              key={item.id}
              className={`flex items-start space-x-3 cursor-pointer p-3 border rounded-lg transition-colors ${
                visible ? 'border-primary-200 bg-primary-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => toggle(item.id, e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 block">{item.label}</span>
                <span className="text-xs text-gray-500">{item.description}</span>
              </div>
            </label>
          )
        }),
      ].filter(Boolean))}
    </div>
  )
}
