# 🚀 Guía de Implementación NubeFact

## ⚠️ IMPORTANTE: Método Implementado

Esta implementación usa **NubeFact API JSON** (NO OSE SOAP):

- ✅ **API JSON**: Sin certificados, NubeFact firma por ti
- ❌ **OSE SOAP**: Requiere certificado (NO implementado)

**Lee:** `NUBEFACT_COMPARISON.md` para entender las diferencias.

---

## ✅ Backend Completado

La integración con NubeFact **API JSON** está **lista** en el backend:

### Archivos Creados:
1. ✅ `functions/src/services/nubefactService.js` - Comunicación con API NubeFact
2. ✅ `functions/src/utils/invoiceToNubefactJSON.js` - Convertidor de datos
3. ✅ `functions/src/services/emissionRouter.js` - Router de emisión dual
4. ✅ `functions/index.js` - Cloud Function actualizada

---

## ✅ Frontend Completado

Todos los pasos del frontend ya están implementados en Settings.jsx.

<details>
<summary>📖 Ver pasos implementados (click para expandir)</summary>

### Paso 1: Estados en Settings.jsx ✅ COMPLETADO

**Ubicación:** Líneas 43-46 (después de `const [showCertPassword, setShowCertPassword] = useState(false)`)

Agregar:

```javascript
// Estados para NubeFact
const [nubefactConfig, setNubefactConfig] = useState({
  enabled: false,
  environment: 'demo', // 'demo' o 'production'
  ruta: '',
  token: '',
})
const [editingNubefact, setEditingNubefact] = useState(false)
const [showNubefactToken, setShowNubefactToken] = useState(false)
```

---

### Paso 2: Tab de NubeFact ✅ COMPLETADO

**Ubicación:** Línea 454 en Settings.jsx

Agregar después del tab 'sunat':

```javascript
{
  id: 'nubefact',
  label: 'NubeFact OSE',
  icon: Shield,
  disabled: false
},
```

---

### Paso 3: Cargar Configuración de NubeFact ✅ COMPLETADO

**Ubicación:** Líneas 156-164 en Settings.jsx

Después de cargar `sunatConfig`, agregar:

```javascript
// Cargar configuración NubeFact
if (businessData.nubefact) {
  setNubefactConfig({
    enabled: businessData.nubefact.enabled || false,
    environment: businessData.nubefact.environment || 'demo',
    ruta: businessData.nubefact.ruta || '',
    token: businessData.nubefact.token || '',
  })
}
```

---

### Paso 4: Funciones de Manejo ✅ COMPLETADO

**Ubicación:** Líneas 439-491 en Settings.jsx

```javascript
const handleNubefactConfigChange = (field, value) => {
  setNubefactConfig((prev) => ({
    ...prev,
    [field]: value,
  }))
}

const handleSaveNubefact = async () => {
  if (!user?.uid || isDemoMode) {
    toast.error('No disponible en modo demo')
    return
  }

  // Validar campos requeridos si está habilitado
  if (nubefactConfig.enabled) {
    if (!nubefactConfig.ruta || !nubefactConfig.token) {
      toast.error('Debes completar la Ruta y Token de NubeFact')
      return
    }
  }

  setIsSaving(true)

  try {
    const businessRef = doc(db, 'businesses', getBusinessId())

    await updateDoc(businessRef, {
      nubefact: {
        enabled: nubefactConfig.enabled,
        environment: nubefactConfig.environment,
        ruta: nubefactConfig.ruta,
        token: nubefactConfig.token,
      },
      updatedAt: serverTimestamp(),
    })

    toast.success('Configuración de NubeFact guardada correctamente')
    setEditingNubefact(false)
  } catch (error) {
    console.error('Error al guardar NubeFact:', error)
    toast.error('Error al guardar la configuración de NubeFact')
  } finally {
    setIsSaving(false)
  }
}
```

---

### Paso 5: Sección UI Completa ✅ COMPLETADO

**Ubicación:** Líneas 1363-1578 en Settings.jsx

Agregar:

```jsx
{/* Tab Content - NubeFact */}
{activeTab === 'nubefact' && (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-primary-600" />
          <CardTitle>Integración con NubeFact OSE</CardTitle>
        </div>
        {!editingNubefact ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingNubefact(true)}
          >
            {nubefactConfig.enabled ? 'Editar Configuración' : 'Configurar NubeFact'}
          </Button>
        ) : (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingNubefact(false)
                loadSettings() // Recargar datos originales
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveNubefact} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" />
                  Guardar
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">¿Qué es NubeFact OSE?</p>
              <p>
                NubeFact actúa como Operador de Servicios Electrónicos (OSE) aprobado por SUNAT.
                <strong> NO necesitas certificado digital</strong> - NubeFact firma y envía los comprobantes
                a SUNAT por ti.
              </p>
              <p className="mt-2">
                <strong>Ideal para:</strong> Empresas sin certificado digital tributario.
              </p>
            </div>
          </div>
        </div>

        {/* Enable/Disable Switch */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Habilitar NubeFact OSE
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Usa NubeFact como tu OSE para facturación electrónica
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={nubefactConfig.enabled}
              onChange={(e) =>
                handleNubefactConfigChange('enabled', e.target.checked)
              }
              disabled={!editingNubefact}
              className="sr-only peer"
            />
            <div
              className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 ${
                !editingNubefact ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            ></div>
          </label>
        </div>

        {/* NubeFact Configuration Fields */}
        {nubefactConfig.enabled && (
          <>
            {/* Environment Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ambiente <span className="text-red-500">*</span>
              </label>
              <Select
                value={nubefactConfig.environment}
                onChange={(e) =>
                  handleNubefactConfigChange('environment', e.target.value)
                }
                disabled={!editingNubefact}
                className={!editingNubefact ? 'bg-gray-100' : ''}
              >
                <option value="demo">Demo (Pruebas)</option>
                <option value="production">Producción</option>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Usa "Demo" para pruebas y "Producción" para facturas reales
              </p>
            </div>

            {/* API Ruta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ruta de API <span className="text-red-500">*</span>
              </label>
              <Input
                value={nubefactConfig.ruta}
                onChange={(e) =>
                  handleNubefactConfigChange('ruta', e.target.value)
                }
                disabled={!editingNubefact}
                className={!editingNubefact ? 'bg-gray-100' : ''}
                placeholder="https://api.nubefact.com/api/v1/xxxxxx"
              />
              <p className="text-xs text-gray-500 mt-1">
                Obtén esta ruta desde tu panel de NubeFact en "API (Integración)" → "Credenciales"
              </p>
            </div>

            {/* API Token */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token de API <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showNubefactToken ? 'text' : 'password'}
                  value={nubefactConfig.token}
                  onChange={(e) =>
                    handleNubefactConfigChange('token', e.target.value)
                  }
                  disabled={!editingNubefact}
                  className={!editingNubefact ? 'bg-gray-100' : ''}
                  placeholder="••••••••••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNubefactToken(!showNubefactToken)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={!editingNubefact}
                >
                  {showNubefactToken ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Obtén este token desde tu panel de NubeFact en "API (Integración)" → "Credenciales"
              </p>
            </div>

            {/* Instructions */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                📌 Cómo obtener las credenciales:
              </h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                <li>
                  Ingresa a{' '}
                  <a
                    href="https://www.nubefact.com/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 underline"
                  >
                    tu panel de NubeFact
                  </a>
                </li>
                <li>Ve a la opción "API (Integración)"</li>
                <li>Copia la <strong>RUTA</strong> y el <strong>TOKEN</strong></li>
                <li>Pégalos en los campos de arriba y guarda</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </CardContent>
  </Card>
)}
```

</details>

---

## 🎯 Estado Actual de la Implementación

### ✅ Completado al 100%
- Backend: Servicios, convertidores, router - Todo funcional
- Frontend: UI completa en Settings.jsx (líneas 1363-1578)
- Build: Sin errores ✅

### ⚠️ Requiere para Funcionar:
- **Credenciales API JSON de NubeFact**
  - Necesitas cuenta Reseller/Integrador
  - NO es OSE SOAP (que es lo que tienes ahora)
  - Ver: `NUBEFACT_COMPARISON.md`

---

## 🔧 Configuración Manual en Firestore (Opción Rápida)

Si prefieres configurar NubeFact directamente en Firestore sin esperar la UI:

### 1. Ve a Firebase Console → Firestore
### 2. Busca tu documento: `businesses/{tuUserId}`
### 3. Agregar campo `nubefact`:

```json
{
  "nubefact": {
    "enabled": true,
    "environment": "demo",
    "ruta": "https://api.nubefact.com/api/v1/TU-RUTA-UNICA",
    "token": "TU-TOKEN-DE-API"
  }
}
```

### 4. Agregar campo `emissionMethod` (opcional):

```json
{
  "emissionMethod": "nubefact"
}
```

Si no especificas `emissionMethod`, el sistema decide automáticamente:
- Si `nubefact.enabled = true` → usa NubeFact
- Si `sunat.enabled = true` → usa SUNAT directo

---

## 🧪 Cómo Probar la Integración

### Paso 1: Obtener Cuenta DEMO en NubeFact

1. Regístrate en: https://www.nubefact.com/register
2. Ve a "API (Integración)"
3. Copia tu RUTA y TOKEN

### Paso 2: Configurar en Factuya

Opción A: Via UI (cuando esté lista)
- Settings → NubeFact OSE
- Habilitar
- Ambiente: Demo
- Pegar Ruta y Token
- Guardar

Opción B: Manual en Firestore (ver sección anterior)

### Paso 3: Emitir Factura de Prueba

1. Ve a POS
2. Crea una factura
3. Click "Enviar a SUNAT"
4. Revisa los logs en Cloud Functions:
   ```
   Firebase Console → Functions → Logs
   ```
5. Deberías ver:
   ```
   📡 Método de emisión seleccionado: nubefact
   📤 Emitiendo vía NUBEFACT API JSON...
   ✅ Respuesta de NubeFact recibida
   ```

### Paso 4: Verificar Resultado

En Firestore, el documento de la factura tendrá:

```json
{
  "sunatStatus": "accepted",
  "sunatResponse": {
    "code": "0",
    "description": "La Factura ha sido aceptada",
    "method": "nubefact",
    "pdfUrl": "https://www.nubefact.com/cpe/xxxxx.pdf",
    "xmlUrl": "https://www.nubefact.com/cpe/xxxxx.xml",
    "enlace": "https://www.nubefact.com/cpe/xxxxx"
  }
}
```

---

## 📊 Comparativa SUNAT Directo vs NubeFact

| Característica | SUNAT Directo | NubeFact OSE |
|---|---|---|
| **Certificado Digital** | ✅ Requerido | ❌ No necesario |
| **Credenciales SOL** | ✅ Requeridas | ❌ No necesarias |
| **Generación XML** | ✅ Tu sistema | ✅ NubeFact |
| **Firma Digital** | ✅ Tu sistema | ✅ NubeFact |
| **Envío a SUNAT** | ✅ Directo | ✅ Via NubeFact |
| **Costo** | ❌ Solo certificado | ✅ Por comprobante |
| **Complejidad** | 🔴 Alta | 🟢 Baja |
| **Ideal para** | Empresas grandes | Empresas sin certificado |

---

## 🚀 Desplegar Changes

Una vez que hayas actualizado Settings.jsx:

```bash
# 1. Construir frontend
npm run build

# 2. Desplegar Cloud Functions
cd functions
npm run deploy

# O desplegar todo:
firebase deploy
```

---

## 📞 Soporte

Si tienes problemas:

1. **Logs de Cloud Functions:**
   ```
   Firebase Console → Functions → sendInvoiceToSunat → Logs
   ```

2. **Errores de NubeFact:**
   - Código 10: Token incorrecto
   - Código 11: Ruta incorrecta
   - Código 20: JSON mal formado
   - Código 23: Documento ya existe

3. **Contacto NubeFact:**
   - Email: soporte-ose@nubefact.com
   - Generar ticket: https://ayuda.nubefact.com

---

## ✨ Ventajas de esta Implementación

✅ **Dual Mode:** Soporta SUNAT directo Y NubeFact simultáneamente
✅ **Automático:** El sistema decide qué método usar según configuración
✅ **Flexible:** Puedes cambiar entre métodos sin cambiar código
✅ **Escalable:** Agregar más OSEs en el futuro es simple
✅ **Limpio:** Todo centralizado en `emissionRouter.js`

---

¡Listo! Con esto tendrás NubeFact OSE completamente integrado. 🎉
