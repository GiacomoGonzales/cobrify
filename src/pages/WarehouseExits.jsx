import { ArrowUpFromLine } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'

export default function WarehouseExits() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowUpFromLine className="w-7 h-7 text-indigo-600" />
          Salidas de Almacén
        </h1>
        <p className="text-gray-600 mt-1">Registra salidas de materiales y herramientas hacia obras</p>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <ArrowUpFromLine className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Módulo en construcción</h3>
          <p className="text-gray-500">Próximamente podrás registrar salidas de almacén aquí.</p>
        </CardContent>
      </Card>
    </div>
  )
}
