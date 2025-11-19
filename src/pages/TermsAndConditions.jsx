import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2">
              <img
                src="/logo.png"
                alt="Cobrify"
                className="w-8 h-8 object-contain"
              />
              <span className="text-xl font-bold text-gray-900">Cobrify</span>
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
              Bienvenido a Cobrify. Estos Términos y Condiciones ("Términos") rigen el acceso y uso de nuestra plataforma de facturación electrónica y gestión empresarial ("Servicio") proporcionada por Cobrify ("nosotros", "nuestro" o "la Empresa").
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
                <span><strong>"Plan"</strong> se refiere a los diferentes niveles de servicio ofrecidos por Cobrify.</span>
              </li>
            </ul>
          </section>

          {/* Planes de Servicio */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Planes de Servicio</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Cobrify ofrece diferentes planes de servicio para adaptarse a las necesidades de tu negocio:
            </p>

            {/* Plan Gratuito */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center">
                <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm mr-3">GRATIS</span>
                Plan Gratuito
              </h3>
              <p className="text-gray-600 mb-4">Ideal para comenzar y probar la plataforma sin compromiso.</p>
              <ul className="space-y-2">
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Hasta 10 comprobantes electrónicos por mes</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Gestión básica de productos y clientes</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Punto de venta (POS) básico</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Reportes básicos</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Soporte por correo electrónico</span>
                </li>
              </ul>
              <p className="text-gray-600 mt-4 text-sm italic">
                * El plan gratuito tiene limitaciones en el número de comprobantes que se pueden emitir mensualmente.
              </p>
            </div>

            {/* Plan Premium */}
            <div className="bg-primary-50 rounded-lg p-6 mb-6 border-2 border-primary-500">
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center">
                <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-sm mr-3">PREMIUM</span>
                Plan Premium
              </h3>
              <p className="text-gray-600 mb-4">Para negocios que requieren funcionalidades avanzadas y sin límites.</p>
              <ul className="space-y-2">
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span><strong>Comprobantes ilimitados</strong> - Emite todos los comprobantes que necesites</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Todas las funcionalidades del plan gratuito</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Gestión avanzada de inventario y almacenes</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Control de caja completo</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Modo restaurante con gestión de mesas, mozos y cocina</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Usuarios y permisos múltiples</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Reportes avanzados y estadísticas en tiempo real</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Integración con impresoras térmicas</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Guías de remisión electrónicas</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Soporte prioritario</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Actualizaciones continuas de funcionalidades</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mt-6">
              <p className="text-blue-900 text-sm">
                <strong>Nota:</strong> Los precios y características de los planes están sujetos a cambios. Los usuarios existentes mantendrán sus tarifas durante la vigencia de su suscripción activa.
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
              Los planes de pago se renuevan automáticamente al final de cada período de facturación (mensual o anual) a menos que se cancelen antes de la fecha de renovación.
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
              El Servicio y su contenido original, características y funcionalidad son y seguirán siendo propiedad exclusiva de Cobrify y sus licenciantes. El Servicio está protegido por derechos de autor, marcas comerciales y otras leyes.
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
              En ningún caso Cobrify, sus directores, empleados, socios, agentes, proveedores o afiliados serán responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo sin limitación, pérdida de beneficios, datos, uso, buena voluntad u otras pérdidas intangibles.
            </p>
            <p className="text-gray-700 leading-relaxed">
              La responsabilidad total de Cobrify por cualquier reclamo bajo estos Términos no excederá el monto que haya pagado por el Servicio en los últimos 12 meses.
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
                <span><strong>Por correo electrónico:</strong> soporte@cobrify.com</span>
              </li>
              <li className="flex items-start">
                <Check className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                <span><strong>A través del sitio web:</strong> cobrifyperu.com</span>
              </li>
            </ul>
          </section>

          {/* Aceptación */}
          <div className="bg-primary-50 rounded-lg p-6 border border-primary-200 mt-8">
            <p className="text-gray-900 font-semibold mb-2">Aceptación de los Términos</p>
            <p className="text-gray-700 text-sm">
              Al utilizar Cobrify, usted reconoce que ha leído, entendido y acepta estar sujeto a estos Términos y Condiciones, así como a nuestra Política de Privacidad.
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
          <p className="text-sm">© 2025 Cobrify. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
