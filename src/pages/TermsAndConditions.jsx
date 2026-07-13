import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { useBranding } from '@/contexts/BrandingContext'

export default function TermsAndConditions() {
  const { branding } = useBranding()
  const companyName = branding.companyName || 'Cobrify'
  const logoUrl = branding.logoUrl || '/logo.png'
  const primaryColor = branding.primaryColor || '#10B981'

  // Contacto dinámico: usar datos del branding o fallbacks
  const contactEmail = branding.supportEmail || branding.contactEmail || 'soporte@cobrify.com'
  const contactWebsite = branding.websiteUrl || (window.location.hostname !== 'localhost' ? window.location.hostname : 'cobrifyperu.com')

  // Planes de suscripción. Precio base en Soles (sin IGV) + precio con IGV (18%).
  const plans = [
    {
      name: 'Plan Básico',
      period: '/mes',
      price: '19.90',
      priceIgv: '23.50',
      badge: null,
      highlight: false,
      desc: 'Diseñado para microempresas. Incluye hasta 100 comprobantes electrónicos al mes (boletas y facturas) y notas de venta ilimitadas.',
    },
    {
      name: 'Plan Mensual',
      period: '/mes',
      price: '29.90',
      priceIgv: '35.30',
      badge: null,
      highlight: false,
      desc: 'Pago mes a mes, sin compromisos largos. Incluye todas las funcionalidades completas.',
    },
    {
      name: 'Plan Semestral',
      period: '/6 meses',
      price: '149.90',
      priceIgv: '176.90',
      badge: 'MÁS POPULAR',
      highlight: true,
      desc: 'Pago cada 6 meses. Las mismas funcionalidades completas; solo cambia el período de suscripción.',
    },
    {
      name: 'Plan Anual',
      period: '/año',
      price: '199.90',
      priceIgv: '235.90',
      badge: 'MEJOR AHORRO',
      highlight: false,
      desc: 'Pago anual. Las mismas funcionalidades completas; solo cambia el período de suscripción.',
    },
    {
      name: 'Plan Todo Ilimitado',
      period: '/año',
      price: '299.90',
      priceIgv: '353.90',
      badge: 'SIN CERTIFICADO PROPIO',
      highlight: false,
      desc: 'Facturación ilimitada a SUNAT sin necesidad de contar con tu propio certificado digital tributario (CDT). Pago anual.',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2">
              <img
                src={logoUrl}
                alt={companyName}
                className="w-8 h-8 object-contain"
              />
              <span className="text-xl font-bold" style={{ color: primaryColor }}>{companyName}</span>
            </Link>
            <Link
              to="/"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al inicio</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-gray-600 mb-8">
            Última actualización: {new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {/* Introducción */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introducción</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Bienvenido a {companyName}. Estos Términos y Condiciones ("Términos") rigen el acceso y uso de nuestra plataforma de facturación electrónica y gestión empresarial ("Servicio") proporcionada por {companyName} ("nosotros", "nuestro" o "la Empresa").
            </p>
            <p className="text-gray-700 leading-relaxed">
              Al acceder o utilizar nuestro Servicio, usted acepta estar sujeto a estos Términos. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestro Servicio.
            </p>
          </section>

          {/* Definiciones */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Definiciones</h2>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>"Usuario"</strong> se refiere a cualquier persona o entidad que accede o utiliza el Servicio.</span>
              </li>
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>"Cuenta"</strong> significa una cuenta única creada para acceder al Servicio.</span>
              </li>
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>"Contenido"</strong> se refiere a texto, imágenes, datos, información y otros materiales subidos, descargados o que aparecen en el Servicio.</span>
              </li>
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>"Plan"</strong> se refiere a los diferentes niveles de servicio ofrecidos por {companyName}.</span>
              </li>
            </ul>
          </section>

          {/* Planes de Servicio */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Planes de Servicio</h2>

            <p className="text-gray-700 leading-relaxed mb-6">
              {companyName} ofrece los siguientes planes de suscripción. Salvo el Plan Básico —pensado para microempresas—, todos los planes incluyen las mismas funcionalidades completas y solo se diferencian en el período de suscripción. Las notas de venta son ilimitadas en todos los planes, sin excepción.
            </p>

            {/* Tarjetas de planes */}
            <div className="space-y-4 mb-6">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-lg p-6 border-2 ${plan.highlight ? 'bg-primary-50 border-primary-500' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                      {plan.badge && (
                        <span className="bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-xs font-bold">{plan.badge}</span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-3xl font-bold text-gray-900">S/{plan.price}</p>
                      <p className="text-sm text-gray-500">{plan.period}</p>
                      <p className="text-xs text-gray-500 mt-1">S/{plan.priceIgv} con IGV</p>
                    </div>
                  </div>
                  <p className="text-gray-600">{plan.desc}</p>
                </div>
              ))}
            </div>

            {/* Características incluidas en todos los planes */}
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h4 className="font-bold text-gray-900 mb-4">Todas las suscripciones incluyen:</h4>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  'Facturación electrónica SUNAT (boletas y facturas)',
                  'Notas de venta ilimitadas',
                  'Control de stock completo',
                  'Múltiples usuarios',
                  'Soporte prioritario',
                  'Software a medida',
                  '100% Web (sin instalación)',
                  'App para iPhone y Android',
                  'Reportes avanzados exportables',
                  'Catálogo digital',
                  'Adaptado a cualquier negocio',
                ].map((feature) => (
                  <div key={feature} className="flex items-start">
                    <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Nota: certificado digital y límites de facturación */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mt-6">
              <p className="text-gray-700 text-sm">
                <strong>Sobre la facturación ilimitada y el certificado digital:</strong> La facturación ilimitada a SUNAT requiere contar con un certificado digital tributario (CDT) propio. Si no cuentas con certificado propio, el límite es de 500 comprobantes electrónicos mensuales (boletas y facturas). El <strong>Plan Todo Ilimitado</strong> incluye facturación ilimitada sin necesidad de tu propio certificado. El <strong>Plan Básico</strong> está limitado a 100 comprobantes electrónicos mensuales. En todos los casos, las notas de venta son ilimitadas.
              </p>
            </div>

            {/* Nota: precios e IGV */}
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 mt-4">
              <p className="text-yellow-900 text-sm">
                <strong>Nota:</strong> Los precios están expresados en Soles Peruanos (PEN). El precio base no incluye IGV; junto a cada plan se indica el precio con IGV (18%). Los precios están sujetos a cambios; los usuarios con suscripción activa mantendrán su tarifa durante la vigencia de su plan contratado.
              </p>
            </div>
          </section>

          {/* Uso del Servicio */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Uso del Servicio</h2>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">4.1 Elegibilidad</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Para usar nuestro Servicio, debe tener al menos 18 años de edad y tener la capacidad legal para celebrar contratos vinculantes. Al crear una Cuenta, declara y garantiza que cumple con este requisito.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mb-3">4.2 Registro de Cuenta</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Para acceder a ciertas funciones del Servicio, debe registrarse para obtener una Cuenta. Acepta proporcionar información precisa, actual y completa durante el proceso de registro y actualizar dicha información para mantenerla precisa y completa.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mb-3">4.3 Seguridad de la Cuenta</h3>
            <p className="text-gray-700 leading-relaxed">
              Es responsable de mantener la confidencialidad de su Cuenta y contraseña. Acepta notificarnos inmediatamente cualquier uso no autorizado de su Cuenta.
            </p>
          </section>

          {/* Facturación y Pagos */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Facturación y Pagos</h2>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">5.1 Planes de Pago</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Los planes de pago se renuevan automáticamente al final de cada período de suscripción (mensual, semestral o anual, según el plan contratado) a menos que se cancelen antes de la fecha de renovación.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mb-3">5.2 Cambios en los Precios</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Nos reservamos el derecho de modificar nuestros precios. Le notificaremos con al menos 30 días de anticipación sobre cualquier cambio de precio que afecte su suscripción.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mb-3">5.3 Reembolsos</h3>
            <p className="text-gray-700 leading-relaxed">
              Los pagos son no reembolsables excepto cuando lo requiera la ley o según se especifique en nuestra Política de Reembolsos.
            </p>
          </section>

          {/* Propiedad Intelectual */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Propiedad Intelectual</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              El Servicio y su contenido original, características y funcionalidad son y seguirán siendo propiedad exclusiva de {companyName} y sus licenciantes. El Servicio está protegido por derechos de autor, marcas comerciales y otras leyes.
            </p>
            <p className="text-gray-700 leading-relaxed">
              No puede modificar, reproducir, distribuir, crear trabajos derivados de, exhibir públicamente, realizar públicamente, republicar, descargar, almacenar o transmitir cualquier material de nuestro Servicio sin nuestro consentimiento previo por escrito.
            </p>
          </section>

          {/* Protección de Datos */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Protección de Datos y Privacidad</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              La recopilación y uso de su información personal se rige por nuestra{' '}
              <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 underline">
                Política de Privacidad
              </a>.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Nos comprometemos a proteger sus datos y cumplir con las leyes aplicables de protección de datos, incluyendo la Ley de Protección de Datos Personales del Perú (Ley N° 29733).
            </p>
          </section>

          {/* Limitación de Responsabilidad */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Limitación de Responsabilidad</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              En ningún caso {companyName}, sus directores, empleados, socios, agentes, proveedores o afiliados serán responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo sin limitación, pérdida de beneficios, datos, uso, buena voluntad u otras pérdidas intangibles.
            </p>
            <p className="text-gray-700 leading-relaxed">
              La responsabilidad total de {companyName} por cualquier reclamo bajo estos Términos no excederá el monto que haya pagado por el Servicio en los últimos 12 meses.
            </p>
          </section>

          {/* Terminación */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Terminación</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Podemos terminar o suspender su Cuenta inmediatamente, sin previo aviso o responsabilidad, por cualquier motivo, incluyendo sin limitación si usted incumple los Términos.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Puede cancelar su suscripción en cualquier momento desde la configuración de su cuenta. Al cancelar, su acceso al Servicio continuará hasta el final del período de facturación actual.
            </p>
          </section>

          {/* Ley Aplicable */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Ley Aplicable</h2>
            <p className="text-gray-700 leading-relaxed">
              Estos Términos se regirán e interpretarán de acuerdo con las leyes de la República del Perú, sin tener en cuenta sus disposiciones sobre conflictos de leyes.
            </p>
          </section>

          {/* Modificaciones */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Modificaciones a los Términos</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Nos reservamos el derecho, a nuestra sola discreción, de modificar o reemplazar estos Términos en cualquier momento. Si una revisión es material, intentaremos proporcionar un aviso de al menos 30 días antes de que entren en vigencia los nuevos términos.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Al continuar accediendo o utilizando nuestro Servicio después de que las revisiones entren en vigencia, acepta estar sujeto a los términos revisados.
            </p>
          </section>

          {/* Contacto */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contacto</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Si tiene alguna pregunta sobre estos Términos, contáctenos:
            </p>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>Por correo electrónico:</strong> <a href={`mailto:${contactEmail}`} className="text-primary-600 hover:underline">{contactEmail}</a></span>
              </li>
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>A través del sitio web:</strong> <a href={`https://${contactWebsite}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{contactWebsite}</a></span>
              </li>
            </ul>
          </section>

          {/* Aceptación */}
          <div className="bg-primary-50 rounded-lg p-6 border border-primary-200 mt-8">
            <p className="text-gray-900 font-semibold mb-2">Aceptación de los Términos</p>
            <p className="text-gray-700 text-sm">
              Al utilizar {companyName}, usted reconoce que ha leído, entendido y acepta estar sujeto a estos Términos y Condiciones, así como a nuestra Política de Privacidad.
            </p>
          </div>
        </div>

        {/* Back to home button */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center space-x-2 text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al inicio</span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
