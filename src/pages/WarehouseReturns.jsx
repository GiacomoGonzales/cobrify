import { ArrowDownToLine } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'

export default function WarehouseReturns() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowDownToLine className="w-7 h-7 text-indigo-600" />
          Retornos a Almacén
        </h1>
        <p className="text-gray-600 mt-1">Registra retornos de materiales y herramientas desde obras</p>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <ArrowDownToLine className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Módulo en construcción</h3>
          <p className="text-gray-500">Próximamente podrás registrar retornos a almacén aquí.</p>
        </CardContent>
      </Card>
    </div>
  )
}
