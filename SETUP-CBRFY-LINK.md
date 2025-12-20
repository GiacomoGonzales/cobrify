# Configuración de cbrfy.link - URL Shortener

Este documento describe los pasos para configurar el dominio cbrfy.link como acortador de URLs para Cobrify.

## 1. Crear el sitio en Firebase Hosting

Ejecutar en la terminal:

```bash
firebase hosting:sites:create cbrfy-link
```

## 2. Desplegar las Cloud Functions

```bash
firebase deploy --only functions:createShortUrl,functions:redirectShortUrl
```

## 3. Permitir invocación pública de las funciones

```bash
gcloud functions add-invoker-policy-binding createShortUrl \
  --region=us-central1 \
  --member="allUsers"

gcloud functions add-invoker-policy-binding redirectShortUrl \
  --region=us-central1 \
  --member="allUsers"
```

## 4. Desplegar el hosting del shortener

```bash
firebase deploy --only hosting:cbrfy-link
```

## 5. Configurar dominio personalizado en Firebase

1. Ir a Firebase Console > Hosting
2. Click en "Add custom domain" para el sitio cbrfy-link
3. Ingresar: `cbrfy.link`
4. Firebase proporcionará los registros DNS necesarios

## 6. Configurar DNS en Namecheap

En el panel de Namecheap para cbrfy.link:

### Opción A: Usando registros A (recomendado)

| Type  | Host | Value           | TTL       |
|-------|------|-----------------|-----------|
| A     | @    | 151.101.1.195   | Automatic |
| A     | @    | 151.101.65.195  | Automatic |

### Opción B: Si Firebase da IPs diferentes

Firebase proporcionará las IPs exactas durante el paso 5. Usar esas IPs.

### Registro TXT para verificación

Firebase también pedirá un registro TXT para verificar propiedad:

| Type | Host                      | Value                    | TTL       |
|------|---------------------------|--------------------------|-----------|
| TXT  | _acme-challenge           | (proporcionado por Firebase) | Automatic |

## 7. Verificar funcionamiento

Una vez propagado el DNS (puede tomar hasta 48 horas):

1. Visitar https://cbrfy.link - debería mostrar página de bienvenida
2. Crear una URL corta de prueba:

```bash
curl -X POST https://us-central1-cobrify-395fe.cloudfunctions.net/createShortUrl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'
```

3. Visitar la URL corta retornada (ej: https://cbrfy.link/abc123)

## Estructura de Firestore

Las URLs cortas se guardan en la colección `shortUrls`:

```javascript
{
  code: "abc123",           // Document ID
  originalUrl: "https://...",
  businessId: "...",        // Opcional
  invoiceId: "...",         // Opcional
  createdAt: Timestamp,
  hits: 0,
  lastAccessedAt: Timestamp // Se actualiza en cada acceso
}
```

## Índice de Firestore requerido

Para buscar URLs existentes, crear índice:

**Colección:** `shortUrls`
**Campo:** `originalUrl` (Ascending)

## Troubleshooting

### La función retorna 403
- Verificar que se ejecutó el comando de `add-invoker-policy-binding`
- Puede tomar unos minutos en propagarse

### El dominio no resuelve
- Verificar registros DNS en Namecheap
- Esperar propagación DNS (hasta 48 horas)
- Usar `nslookup cbrfy.link` para verificar

### La redirección no funciona
- Verificar que la función `redirectShortUrl` está desplegada
- Revisar logs: `firebase functions:log --only redirectShortUrl`
