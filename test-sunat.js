/**
 * Script de prueba independiente para SUNAT
 *
 * Este script prueba la firma XML y envío a SUNAT sin depender de Firebase
 */

import { readFileSync, writeFileSync } from 'fs'
import { signXML } from './functions/src/utils/xmlSigner.js'
import { sendToSunat } from './functions/src/utils/sunatClient.js'
import { generateInvoiceXML } from './functions/src/utils/xmlGenerator.js'

async function testSunat() {
  try {
    console.log('🧪 Iniciando prueba de integración SUNAT...\n')

    // 1. Generar XML de prueba
    console.log('📄 Generando XML de prueba...')

    const invoiceData = {
      documentType: 'boleta',
      series: 'B001',
      correlativeNumber: 13,
      issueDate: new Date(),
      currency: 'PEN',
      subtotal: 100.00,
      igv: 18.00,
      total: 118.00,
      customer: {
        documentType: 'DNI',
        documentNumber: '12345678',
        name: 'Cliente de Prueba'
      },
      items: [
        {
          productId: 'PROD001',
          description: 'Producto de prueba',
          quantity: 1,
          unitPrice: 100.00,
          unit: 'NIU'
        }
      ]
    }

    const businessData = {
      ruc: '20613750551',
      businessName: 'EMPRESA DE PRUEBA S.A.C.',
      tradeName: 'PRUEBA SAC',
      address: 'AV. PRUEBA 123',
      district: 'LIMA',
      province: 'LIMA',
      department: 'LIMA',
      urbanization: 'URB. PRUEBA'
    }

    const xmlContent = generateInvoiceXML(invoiceData, businessData)

    // Guardar XML sin firmar para análisis
    writeFileSync('./temp_xml/20613750551-03-B001-00000013.xml', xmlContent, 'utf-8')
    console.log('✅ XML generado correctamente\n')

    // 2. Configuración del certificado
    // INSTRUCCIÓN: Copia tu archivo .p12 a la raíz del proyecto con el nombre 'certificado.p12'
    console.log('🔑 Cargando certificado digital...')
    const certificateBuffer = readFileSync('./certificado.p12')
    const certificateBase64 = certificateBuffer.toString('base64')
    console.log(`✅ Certificado cargado (${certificateBase64.length} caracteres)\n`)

    const certificateConfig = {
      certificate: certificateBase64,
      certificatePassword: 'Roma2020' // Tu contraseña
    }

    // 3. Firmar XML
    console.log('🔐 Firmando XML...')
    const signedXml = await signXML(xmlContent, certificateConfig)
    console.log('✅ XML firmado exitosamente\n')

    // Guardar XML firmado para análisis
    writeFileSync('./temp_xml/signed.xml', signedXml, 'utf-8')
    console.log('💾 XML firmado guardado en ./temp_xml/signed.xml\n')

    // 4. Configuración SUNAT
    const sunatConfig = {
      ruc: '20613750551',
      solUser: 'ENIENDUG',
      solPassword: 'opitakeen',
      environment: 'beta',
      documentType: 'boleta',
      series: 'B001',
      number: 13
    }

    // 5. Enviar a SUNAT
    console.log('📤 Enviando a SUNAT Beta...')
    const result = await sendToSunat(signedXml, sunatConfig)

    console.log('\n🎉 RESULTADO:')
    console.log('Aceptado:', result.accepted)
    console.log('Código:', result.code)
    console.log('Descripción:', result.description)

    if (result.accepted) {
      console.log('\n✅ ¡Éxito! La factura fue aceptada por SUNAT')
    } else {
      console.log('\n❌ SUNAT rechazó el documento')
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// Ejecutar prueba
testSunat()
