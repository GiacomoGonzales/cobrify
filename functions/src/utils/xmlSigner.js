import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

/**
 * Firma XML con certificado digital según especificaciones SUNAT
 *
 * Utiliza XMLDSig (XML Digital Signature) con:
 * - Algoritmo de firma: RSA-SHA256
 * - Canonicalización: Exclusive XML Canonicalization
 * - Digest: SHA-256
 *
 * Referencias:
 * - XML Signature: https://www.w3.org/TR/xmldsig-core/
 * - Especificaciones SUNAT: https://cpe.sunat.gob.pe/
 */
export async function signXML(xmlContent, certificateConfig) {
  try {
    const { certificatePassword, certificate } = certificateConfig

    if (!certificate) {
      throw new Error('Certificado digital no encontrado. Debe subir un certificado .pfx o .p12 en la configuración SUNAT.')
    }

    console.log('🔐 Decodificando certificado PFX...')

    // Limpiar prefijo Data URL si existe (compatibilidad con certificados antiguos)
    let cleanCertificate = certificate
    if (certificate.includes(',')) {
      // Si contiene coma, probablemente tiene prefijo Data URL
      const parts = certificate.split(',')
      if (parts[0].startsWith('data:')) {
        console.log('🧹 Removiendo prefijo Data URL del certificado...')
        cleanCertificate = parts[1]
      }
    }

    // Decodificar certificado PFX desde base64
    const pfxData = forge.util.decode64(cleanCertificate)

    // Parsear PFX
    const p12Asn1 = forge.asn1.fromDer(pfxData)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword)

    // Obtener clave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    if (!keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length === 0) {
      throw new Error('No se encontró la clave privada en el certificado')
    }
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0]
    const privateKey = keyBag.key

    // Obtener certificado X.509
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    if (!bags[forge.pki.oids.certBag] || bags[forge.pki.oids.certBag].length === 0) {
      throw new Error('No se encontró el certificado X.509 en el archivo')
    }
    const certBag = bags[forge.pki.oids.certBag][0]
    const cert = certBag.cert

    // Convertir clave privada a PEM
    const privateKeyPem = forge.pki.privateKeyToPem(privateKey)

    // Convertir certificado a PEM
    const certPem = forge.pki.certificateToPem(cert)

    console.log('✅ Certificado y clave privada extraídos correctamente')

    // Detectar el tipo de documento (Invoice, CreditNote, DebitNote)
    let rootElement = 'Invoice' // Default
    if (xmlContent.includes('<CreditNote') || xmlContent.includes('CreditNote-2')) {
      rootElement = 'CreditNote'
    } else if (xmlContent.includes('<DebitNote') || xmlContent.includes('DebitNote-2')) {
      rootElement = 'DebitNote'
    }
    console.log(`📄 Tipo de documento detectado: ${rootElement}`)

    // Crear firma XMLDSig usando xml-crypto
    const sig = new SignedXml({
      privateKey: privateKeyPem,
      publicCert: certPem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' // C14N básico (no exclusive)
    })

    // Agregar referencia al documento completo con URI vacío (sin IDs)
    // IMPORTANTE: El orden de los transforms importa
    sig.addReference({
      xpath: `//*[local-name()='${rootElement}']`,
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' // C14N básico
      ],
      uri: '', // URI vacío = firmar todo el documento sin agregar IDs
      isEmptyUri: true // Indica explícitamente que el URI es vacío
    })

    // Configurar KeyInfo para incluir el certificado X.509
    sig.keyInfoProvider = {
      getKeyInfo: () => {
        const certBase64 = certPem
          .replace('-----BEGIN CERTIFICATE-----', '')
          .replace('-----END CERTIFICATE-----', '')
          .replace(/\n/g, '')
          .trim()

        return `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`
      }
    }

    // Calcular la firma
    sig.computeSignature(xmlContent, {
      prefix: 'ds',
      location: { reference: "//*[local-name()='ExtensionContent']", action: 'append' }
    })

    // Obtener XML firmado
    const signedXml = sig.getSignedXml()

    console.log('✅ XML firmado exitosamente con XMLDSig')

    return signedXml

  } catch (error) {
    console.error('❌ Error al firmar XML:', error)
    if (error.message.includes('password')) {
      throw new Error('Contraseña del certificado incorrecta')
    }
    throw new Error(`Error al firmar XML: ${error.message}`)
  }
}

/**
 * Valida que un certificado sea válido y no haya expirado
 */
export function validateCertificate(certificateData, password) {
  try {
    // Limpiar prefijo Data URL si existe
    let cleanCertificate = certificateData
    if (certificateData.includes(',')) {
      const parts = certificateData.split(',')
      if (parts[0].startsWith('data:')) {
        cleanCertificate = parts[1]
      }
    }

    const pfxData = forge.util.decode64(cleanCertificate)
    const p12Asn1 = forge.asn1.fromDer(pfxData)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)

    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = bags[forge.pki.oids.certBag][0]
    const cert = certBag.cert

    // Verificar fechas de validez
    const now = new Date()
    const notBefore = cert.validity.notBefore
    const notAfter = cert.validity.notAfter

    if (now < notBefore) {
      return {
        valid: false,
        error: 'El certificado aún no es válido'
      }
    }

    if (now > notAfter) {
      return {
        valid: false,
        error: 'El certificado ha expirado'
      }
    }

    return {
      valid: true,
      subject: cert.subject.getField('CN').value,
      issuer: cert.issuer.getField('CN').value,
      notBefore: notBefore,
      notAfter: notAfter
    }

  } catch (error) {
    return {
      valid: false,
      error: `Error al validar certificado: ${error.message}`
    }
  }
}
