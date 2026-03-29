import { useState, useEffect } from 'react'
import { HardHat, Plus, Search, MapPin, Calendar, MoreVertical, Edit, Trash2, CheckCircle, Clock, XCircle } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

export default function Projects() {
  const { getBusinessId } = useAppContext()
  const { toast } = useToast()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-7 h-7 text-indigo-600" />
            Proyectos / Obras
          </h1>
          <p className="text-gray-600 mt-1">Gestiona tus proyectos y obras activas</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <HardHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Módulo en construcción</h3>
          <p className="text-gray-500">Próximamente podrás gestionar tus proyectos y obras aquí.</p>
        </CardContent>
      </Card>
    </div>
  )
}
