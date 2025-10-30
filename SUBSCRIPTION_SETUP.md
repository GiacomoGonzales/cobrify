# 📋 Guía de Configuración del Sistema de Suscripciones

Esta guía te ayudará a configurar el sistema de gestión de suscripciones manual para Cobrify.

## 🚀 Pasos de Implementación

### 1. Desplegar las Reglas de Firestore

Las reglas de Firestore han sido actualizadas para incluir verificación de suscripciones. Debes desplegarlas:

```bash
firebase deploy --only firestore:rules
```

**Importante:** Antes de desplegar, asegúrate de tener configurado Firebase CLI y estar autenticado.

### 2. Crear tu Usuario como Administrador

Para poder gestionar otros usuarios, primero debes convertirte en administrador:

#### Opción A: Desde la Consola de Firebase (Recomendado)

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Firestore Database**
4. Haz clic en **Iniciar colección** (o + Agregar colección)
5. Nombre de la colección: `admins`
6. ID del documento: **TU_USER_ID** (lo puedes obtener de Firebase Authentication)
7. Agrega los siguientes campos:
   - `email`: tu email (String)
   - `role`: "admin" (String)
   - `createdAt`: [timestamp actual] (Timestamp)

#### Opción B: Programáticamente (Desarrollo)

1. Abre la aplicación en el navegador
2. Inicia sesión con tu cuenta
3. Abre la consola del navegador (F12)
4. Ejecuta:
   ```javascript
   import('./src/utils/migrateUsers.js').then(m => m.createAdminUser('TU_USER_ID'))
   ```

**Para obtener tu USER_ID:**
- Ve a Firebase Console → Authentication
- Encuentra tu usuario y copia el UID

### 3. Migrar Usuarios Existentes

Si ya tienes usuarios registrados en tu sistema, necesitas crear suscripciones para ellos:

#### Opción A: Automática (Recomendado si tienes muchos usuarios)

1. Abre la aplicación en el navegador
2. Inicia sesión como administrador
3. Abre la consola del navegador (F12)
4. Ejecuta:
   ```javascript
   import('./src/utils/migrateUsers.js').then(m => m.migrateExistingUsers())
   ```

Esto creará automáticamente una suscripción para cada negocio existente con:
- Plan: Básico
- Duración: 30 días
- Estado: Activo

#### Opción B: Manual (Para pocos usuarios)

1. Ve a Firebase Console → Firestore Database
2. Crea una colección llamada `subscriptions`
3. Para cada usuario, crea un documento con ID = su UserID
4. Usa esta estructura:

```javascript
{
  userId: "USER_ID_AQUI",
  email: "email@usuario.com",
  businessName: "Nombre del Negocio",
  plan: "basic",
  status: "active",
  startDate: [Timestamp ahora],
  currentPeriodStart: [Timestamp ahora],
  currentPeriodEnd: [Timestamp +30 días],
  trialEndsAt: null,
  lastPaymentDate: null,
  nextPaymentDate: [Timestamp +30 días],
  paymentMethod: null,
  monthlyPrice: 49,
  accessBlocked: false,
  blockReason: null,
  blockedAt: null,
  limits: {
    maxInvoicesPerMonth: 100,
    maxCustomers: 50,
    maxProducts: 200,
    sunatIntegration: true,
    multiUser: false
  },
  usage: {
    invoicesThisMonth: 0,
    totalCustomers: 0,
    totalProducts: 0
  },
  paymentHistory: [],
  notes: "",
  createdAt: [Timestamp ahora],
  updatedAt: [Timestamp ahora]
}
```

### 4. Configurar Información de Contacto

Actualiza la información de contacto en las siguientes páginas:

#### `src/pages/AccountSuspended.jsx`
```javascript
// Línea ~127
<a href="https://wa.me/51TU_NUMERO">+51 TU NUMERO</a>
// Línea ~135
<a href="mailto:TU_EMAIL@cobrify.com">TU_EMAIL@cobrify.com</a>
```

#### `src/pages/MySubscription.jsx`
```javascript
// Línea ~229
<a href="https://wa.me/51TU_NUMERO">+51 TU NUMERO</a>
// Línea ~237
<a href="mailto:TU_EMAIL@cobrify.com">TU_EMAIL@cobrify.com</a>
```

### 5. Verificar el Deployment

Después de desplegar, verifica que todo funcione:

```bash
# Instalar dependencias si es necesario
npm install

# Ejecutar en desarrollo
npm run dev

# O construir para producción
npm run build
firebase deploy
```

## 📖 Uso del Sistema

### Como Administrador

1. **Acceder al Panel**
   - Inicia sesión
   - Ve al menú lateral
   - Haz clic en "Gestión de Usuarios" (badge amarillo "Admin")

2. **Gestionar Usuarios**
   - **Ver detalles**: Click en el ícono de ojo 👁️
   - **Suspender cuenta**: Click en el candado cerrado 🔒
   - **Reactivar cuenta**: Click en el candado abierto 🔓
   - **Registrar pago**: Click en el símbolo de dólar 💵
   - **Editar plan**: Click en el ícono de edición ✏️

3. **Registrar un Pago**
   - Click en 💵 al lado del usuario
   - Ingresa el monto recibido
   - Selecciona el método de pago
   - Ingresa los días de extensión (30 por defecto = 1 mes)
   - Click en "Registrar Pago"
   - El usuario será reactivado automáticamente

4. **Suspender un Usuario**
   - Click en 🔒 al lado del usuario
   - Confirma la acción
   - El usuario será bloqueado inmediatamente
   - No podrá acceder hasta que pagues y reactives su cuenta

### Como Usuario Normal

1. **Ver Mi Suscripción**
   - Ve al menú lateral
   - Click en "Mi Suscripción"
   - Verás: plan actual, fecha de vencimiento, historial de pagos

2. **Si tu Cuenta es Suspendida**
   - Serás redirigido automáticamente a una pantalla de suspensión
   - Verás información de contacto
   - Debes contactar al administrador para reactivar

## 🎯 Planes Disponibles

### Prueba Gratuita (free)
- Precio: S/ 0
- Duración: 14 días
- Facturas/mes: 10
- Clientes: 5
- Productos: 20
- Integración SUNAT: ❌
- Multi-usuario: ❌

### Básico (basic)
- Precio: S/ 49/mes
- Facturas/mes: 100
- Clientes: 50
- Productos: 200
- Integración SUNAT: ✅
- Multi-usuario: ❌

### Premium (premium)
- Precio: S/ 99/mes
- Facturas/mes: 500
- Clientes: 200
- Productos: 1,000
- Integración SUNAT: ✅
- Multi-usuario: ✅

### Empresarial (enterprise)
- Precio: S/ 199/mes
- Facturas/mes: Ilimitado
- Clientes: Ilimitado
- Productos: Ilimitado
- Integración SUNAT: ✅
- Multi-usuario: ✅

## 🔧 Personalización

### Cambiar Precios de Planes

Edita `src/services/subscriptionService.js`:

```javascript
export const PLANS = {
  basic: {
    name: "Básico",
    price: 49, // Cambia este valor
    // ...
  }
  // ...
}
```

### Agregar Nuevas Formas de Pago

En `src/pages/admin/UserManagement.jsx`, línea ~479:

```javascript
<select value={paymentMethod} ...>
  <option value="Transferencia">Transferencia</option>
  <option value="Efectivo">Efectivo</option>
  <option value="Yape/Plin">Yape/Plin</option>
  <option value="Tarjeta">Tarjeta</option>
  {/* Agrega más opciones aquí */}
</select>
```

## 🛡️ Seguridad

### Reglas de Firestore

Las reglas ahora verifican:
1. ✅ Usuario autenticado
2. ✅ Usuario es el propietario de los datos
3. ✅ Suscripción activa y no bloqueada
4. ✅ Solo admins pueden modificar suscripciones

### Restricciones

- Solo administradores pueden:
  - Ver todas las suscripciones
  - Modificar suscripciones
  - Bloquear/desbloquear usuarios
  - Cambiar planes

- Los usuarios pueden:
  - Ver solo SU propia suscripción
  - No pueden modificar su suscripción

## 📞 Soporte

Si encuentras algún problema durante la configuración:

1. Verifica que Firebase CLI esté instalado: `firebase --version`
2. Verifica que estés autenticado: `firebase login`
3. Revisa la consola del navegador para errores
4. Revisa los logs de Firebase Console

## 🚨 Troubleshooting

### Error: "Permission denied"
- Verifica que las reglas de Firestore estén desplegadas
- Verifica que el usuario tenga suscripción activa
- Verifica que seas administrador si intentas acceder a `/admin/users`

### Error: "Subscription not found"
- Ejecuta la migración de usuarios
- Verifica que exista el documento en `subscriptions/{userId}`

### El usuario no puede acceder después de pagar
- Verifica que `accessBlocked` sea `false`
- Verifica que `status` sea `active`
- Verifica que `currentPeriodEnd` sea una fecha futura

## ✅ Checklist de Deployment

- [ ] Actualizar información de contacto (WhatsApp, Email)
- [ ] Desplegar reglas de Firestore
- [ ] Crear tu usuario como admin
- [ ] Migrar usuarios existentes
- [ ] Probar flujo de suspensión
- [ ] Probar flujo de registro de pago
- [ ] Probar flujo de reactivación
- [ ] Verificar que usuarios normales no vean panel admin
- [ ] Verificar que usuarios suspendidos no puedan acceder

---

**¡Listo!** Tu sistema de gestión de suscripciones manual está configurado y listo para usar.
