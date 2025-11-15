#!/usr/bin/env python3
"""
Script para aplicar configuración CORS a Firebase Storage
Requiere: pip install google-cloud-storage
"""

import json
from google.cloud import storage
from google.oauth2 import service_account

# Configuración CORS
cors_configuration = [
    {
        "origin": [
            "https://cobrifyperu.com",
            "https://www.cobrifyperu.com",
            "https://factuya.vercel.app",
            "https://cobrify-395fe.web.app",
            "https://cobrify-395fe.firebaseapp.com",
            "http://localhost:3000"
        ],
        "method": ["GET", "HEAD"],
        "maxAgeSeconds": 3600,
        "responseHeader": ["Content-Type"]
    }
]

bucket_name = "cobrify-395fe.firebasestorage.app"

print("🔧 Aplicando configuración CORS a Firebase Storage...")
print(f"📦 Bucket: {bucket_name}")
print(f"🌐 Orígenes permitidos: {cors_configuration[0]['origin']}")

try:
    # Inicializar cliente de Storage
    storage_client = storage.Client(project="cobrify-395fe")

    # Obtener el bucket
    bucket = storage_client.bucket(bucket_name)

    # Aplicar configuración CORS
    bucket.cors = cors_configuration
    bucket.patch()

    print("\n✅ ¡CORS configurado exitosamente!")
    print("\n📋 Configuración aplicada:")
    print(json.dumps(cors_configuration, indent=2))
    print("\n⏳ Espera 1-2 minutos para que se propague")
    print("🎉 Luego prueba descargar un PDF desde cobrifyperu.com")

except Exception as e:
    print(f"\n❌ Error: {str(e)}")
    print("\n💡 Soluciones alternativas:")
    print("1. Asegúrate de estar autenticado: gcloud auth application-default login")
    print("2. O usa la consola web de Google Cloud")
    print("3. O instala Google Cloud SDK: https://cloud.google.com/sdk/docs/install")
