# Configurar CORS en Firebase Storage

Para que el logo aparezca en los PDFs desde cobrifyperu.com, necesitas aplicar la configuración CORS al bucket de Firebase Storage.

## Opción 1: Usar Google Cloud Console (Recomendado)

1. Ve a: https://console.cloud.google.com/storage/browser?project=cobrify-395fe
2. Haz clic en el bucket `cobrify-395fe.firebasestorage.app`
3. Ve a la pestaña **"Configuración"** (Configuration)
4. Busca la sección **"CORS"**
5. Haz clic en **"Editar configuración de CORS"** (Edit CORS configuration)
6. Copia y pega el contenido del archivo `storage.cors.json`:

```json
[
  {
    "origin": [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://cobrify-395fe.web.app",
      "https://cobrify-395fe.firebaseapp.com",
      "https://cobrifyperu.com",
      "https://www.cobrifyperu.com",
      "https://factuya.vercel.app"
    ],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type"]
  }
]
```

7. Guarda los cambios

## Opción 2: Instalar Google Cloud SDK

Si prefieres usar la línea de comandos:

1. Descarga e instala Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Ejecuta en la terminal:
   ```bash
   gcloud auth login
   gcloud config set project cobrify-395fe
   gcloud storage buckets update gs://cobrify-395fe.firebasestorage.app --cors-file=storage.cors.json
   ```

## Verificar que funciona

Después de configurar CORS:

1. Ve a https://cobrifyperu.com
2. Inicia sesión
3. Ve a Facturas
4. Haz clic en "Descargar PDF"
5. El PDF debería generarse con el logo de tu empresa

## Nota

Las reglas de Storage (storage.rules) ya están desplegadas y permiten lectura pública de los logos.
Solo falta aplicar la configuración CORS para que los navegadores permitan las solicitudes desde tu dominio.
