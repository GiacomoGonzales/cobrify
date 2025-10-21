# 🔥 Configuración de Firebase para Cobrify

Esta guía te ayudará a configurar Firebase y desplegar tu aplicación en Vercel.

## Paso 1: Crear proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en "Agregar proyecto" o "Add project"
3. Ingresa el nombre del proyecto: `cobrify` (o el que prefieras)
4. Sigue los pasos del asistente

## Paso 2: Agregar una aplicación web

1. En la página principal de tu proyecto, haz clic en el ícono web `</>`
2. Registra tu app con el nombre: `Cobrify Web`
3. **NO marques** "Also set up Firebase Hosting" (lo haremos con Vercel)
4. Copia las credenciales que aparecen (las necesitarás en el siguiente paso)

## Paso 3: Configurar variables de entorno

1. Abre el archivo `.env.local` en la raíz del proyecto
2. Reemplaza los valores con las credenciales de tu proyecto Firebase:

```env
VITE_FIREBASE_API_KEY=AIzaSyXxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto-id
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

3. Guarda el archivo

## Paso 4: Activar Authentication en Firebase

1. En Firebase Console, ve a **Build > Authentication**
2. Haz clic en "Get started"
3. En la pestaña "Sign-in method", habilita:
   - **Email/Password** (recomendado)
   - Opcionalmente: Google, Facebook, etc.

### Crear un usuario de prueba:

1. Ve a la pestaña "Users" en Authentication
2. Haz clic en "Add user"
3. Ingresa email y contraseña
4. ¡Listo! Ya puedes iniciar sesión

## Paso 5: Configurar Firestore Database

1. En Firebase Console, ve a **Build > Firestore Database**
2. Haz clic en "Create database"
3. Selecciona:
   - **Modo de prueba** (para desarrollo)
   - Ubicación: `southamerica-east1` (São Paulo, Brasil - más cercano a Perú)
4. Haz clic en "Enable"

### Reglas de seguridad (opcional pero recomendado):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir lectura/escritura solo a usuarios autenticados
    match /{document=**} {
      allow read, write: if request.auth != null;
    }

    // Regla específica: cada usuario solo puede acceder a sus propios datos
    match /invoices/{invoiceId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }

    match /customers/{customerId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }

    match /products/{productId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

## Paso 6: Activar Storage (opcional)

1. Ve a **Build > Storage**
2. Haz clic en "Get started"
3. Acepta las reglas predeterminadas
4. Selecciona la misma ubicación que Firestore

## Paso 7: Probar en desarrollo

```bash
# Asegúrate de que .env.local tiene las variables correctas
npm run dev
```

Abre `http://localhost:3001` y prueba:
- Crear una cuenta
- Iniciar sesión
- Crear facturas, clientes, productos

## Paso 8: Desplegar en Vercel

### A. Preparar el proyecto

1. Asegúrate de que tu código esté en GitHub:
```bash
git add .
git commit -m "Add Firebase integration"
git push origin main
```

### B. Crear proyecto en Vercel

1. Ve a [Vercel](https://vercel.com)
2. Haz clic en "Add New" > "Project"
3. Importa tu repositorio de GitHub
4. Vercel detectará automáticamente Vite

### C. Configurar variables de entorno en Vercel

1. En la página de configuración del proyecto, ve a "Environment Variables"
2. Agrega las siguientes variables (una por una):

```
VITE_FIREBASE_API_KEY = tu_api_key
VITE_FIREBASE_AUTH_DOMAIN = tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID = tu_proyecto_id
VITE_FIREBASE_STORAGE_BUCKET = tu_proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID = tu_sender_id
VITE_FIREBASE_APP_ID = tu_app_id
VITE_FIREBASE_MEASUREMENT_ID = G-XXXXXXXXXX
```

3. Asegúrate de marcar todas las opciones:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

### D. Desplegar

1. Haz clic en "Deploy"
2. Vercel construirá y desplegará tu aplicación
3. Una vez completado, obtendrás una URL como: `https://cobrify.vercel.app`

### E. Configurar dominio en Firebase (importante)

1. Ve a Firebase Console > Authentication > Settings
2. En "Authorized domains", agrega tu dominio de Vercel:
   - `tu-proyecto.vercel.app`
   - Si tienes dominio personalizado, agrégalo también

## 🎉 ¡Listo!

Tu aplicación está desplegada y funcionando con Firebase. Ahora puedes:

- ✅ Crear usuarios desde el login
- ✅ Guardar facturas en Firestore
- ✅ Gestionar clientes y productos
- ✅ Acceder desde cualquier dispositivo

## Estructura de datos en Firestore

```
firestore/
├── invoices/
│   ├── [invoiceId]
│   │   ├── userId: string
│   │   ├── number: string
│   │   ├── customer: object
│   │   ├── items: array
│   │   ├── total: number
│   │   ├── createdAt: timestamp
│   │   └── updatedAt: timestamp
│
├── customers/
│   ├── [customerId]
│   │   ├── userId: string
│   │   ├── name: string
│   │   ├── documentNumber: string
│   │   ├── email: string
│   │   ├── createdAt: timestamp
│   │   └── updatedAt: timestamp
│
├── products/
│   ├── [productId]
│   │   ├── userId: string
│   │   ├── name: string
│   │   ├── price: number
│   │   ├── stock: number
│   │   ├── createdAt: timestamp
│   │   └── updatedAt: timestamp
│
└── companySettings/
    └── [userId]
        ├── ruc: string
        ├── businessName: string
        ├── address: string
        └── updatedAt: timestamp
```

## Comandos útiles

```bash
# Desarrollo local
npm run dev

# Compilar para producción
npm run build

# Vista previa de producción
npm run preview

# Deploy manual en Vercel (requiere Vercel CLI)
vercel
```

## Solución de problemas

### Error: "Firebase config not found"
- Verifica que `.env.local` existe y tiene todas las variables
- Reinicia el servidor de desarrollo (`Ctrl+C` y `npm run dev`)

### Error: "Permission denied" en Firestore
- Verifica las reglas de seguridad en Firestore
- Asegúrate de que el usuario está autenticado

### Error de autenticación en producción
- Agrega tu dominio de Vercel a "Authorized domains" en Firebase

## Recursos adicionales

- [Firebase Docs](https://firebase.google.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [Vite Env Variables](https://vitejs.dev/guide/env-and-mode.html)
