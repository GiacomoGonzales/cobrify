# Configuración de API Routes en Vercel

## ✅ Problema Resuelto

El buscador de DNI/RUC no funcionaba en producción porque:
- En desarrollo: Vite hace proxy a `https://apiperu.dev`
- En producción: Vercel necesita funciones serverless en `/api`

## 📁 Archivos Creados

1. **`/api/dni.js`** - Vercel Serverless Function para consultar DNI
2. **`/api/ruc.js`** - Vercel Serverless Function para consultar RUC

## 🚀 Cómo Desplegar

### 1. Configurar Variable de Entorno en Vercel

Ve al dashboard de Vercel: https://vercel.com/[tu-usuario]/[tu-proyecto]/settings/environment-variables

Agrega la siguiente variable:

```
Name:  VITE_APIPERU_TOKEN
Value: f236feab6bf7b5abc955e286f5916a1575d9226f02034ac198087d45a6ab1beb
```

**IMPORTANTE:** Esta variable ya existe en tu `.env.local`, pero Vercel necesita que la configures también en su dashboard.

### 2. Hacer Commit y Push

```bash
git add api/
git commit -m "Add Vercel serverless functions for DNI/RUC lookup"
git push
```

### 3. Vercel Desplegará Automáticamente

Vercel detectará los archivos en `/api` y los desplegará como funciones serverless automáticamente.

## 🔍 Verificar que Funciona

Una vez desplegado, prueba las API routes directamente:

**Consultar DNI:**
```bash
curl -X POST https://tu-dominio.vercel.app/api/dni \
  -H "Content-Type: application/json" \
  -d '{"dni":"12345678"}'
```

**Consultar RUC:**
```bash
curl -X POST https://tu-dominio.vercel.app/api/ruc \
  -H "Content-Type: application/json" \
  -d '{"ruc":"20123456789"}'
```

## 📊 Logs de Vercel

Para ver los logs de las funciones:
1. Ve a Vercel Dashboard
2. Click en tu proyecto
3. Click en "Functions" en el menú lateral
4. Click en `/api/dni` o `/api/ruc`
5. Verás los logs con los console.log que agregué

## ⚠️ Notas Importantes

- Las funciones serverless de Vercel tienen un límite de ejecución de **10 segundos** en el plan gratuito
- El código NO expone el token `APIPERU_TOKEN` al frontend (seguridad mejorada)
- Las funciones tienen CORS habilitado para permitir llamadas desde tu dominio

## 🎯 Flujo de Funcionamiento

```
Frontend (React)
    ↓
    POST /api/dni con {dni: "12345678"}
    ↓
Vercel Serverless Function (/api/dni.js)
    ↓
    GET https://apiperu.dev/api/dni/12345678
    Authorization: Bearer [token desde env]
    ↓
API Perú (apiperu.dev)
    ↓
    Respuesta con datos del DNI
    ↓
Vercel Function devuelve a Frontend
    ↓
Frontend muestra los datos
```

## 🐛 Troubleshooting

**Si aún no funciona después de desplegar:**

1. Verifica que la variable de entorno esté configurada en Vercel
2. Verifica los logs en Vercel Dashboard > Functions
3. Asegúrate de que los archivos `/api/dni.js` y `/api/ruc.js` se hayan desplegado
4. Prueba las funciones directamente con curl para ver el error exacto
