import { BarChart3 } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'

export default function LogisticsReports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-indigo-600" />
          Reportes Logísticos
        </h1>
        <p className="text-gray-600 mt-1">Historial de movimientos, inventario por obra y resumen de estados</p>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Módulo en construcción</h3>
          <p className="text-gray-500">Próximamente podrás ver reportes logísticos aquí.</p>
        </CardContent>
      </Card>
    </div>
  )
}
