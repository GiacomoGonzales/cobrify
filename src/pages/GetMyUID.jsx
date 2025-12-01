import { useAuth } from '@/contexts/AuthContext';
import { Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function GetMyUID() {
  const { user, isAdmin } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Obtener mi User ID (UID)
        </h1>

        {user ? (
          <div className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">
                Email
              </label>
              <p className="text-lg font-semibold text-gray-900">{user.email}</p>
            </div>

            {/* UID */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">
                User ID (UID)
              </label>
              <div className="flex items-center gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-lg">
                <code className="flex-1 text-sm font-mono text-gray-900 break-all">
                  {user.uid}
                </code>
                <button
                  onClick={() => copyToClipboard(user.uid)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Estado Admin */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-900 mb-2">
                Estado de Administrador:
              </p>
              <p className="text-lg font-bold">
                {isAdmin ? (
                  <span className="text-green-600">✅ Eres Administrador</span>
                ) : (
                  <span className="text-red-600">❌ NO eres Administrador</span>
                )}
              </p>
            </div>

            {/* Instrucciones */}
            {!isAdmin && (
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3 text-lg">
                  📋 Cómo convertirte en Administrador:
                </h3>
                <ol className="space-y-3 text-blue-800">
                  <li className="flex gap-2">
                    <span className="font-bold">1.</span>
                    <div>
                      <strong>Copia tu UID</strong> con el botón de arriba
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">2.</span>
                    <div>
                      Ve a{' '}
                      <a
                        href="https://console.firebase.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        Firebase Console
                      </a>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">3.</span>
                    <div>
                      Ve a <strong>Firestore Database</strong>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">4.</span>
                    <div>
                      Haz clic en <strong>"Iniciar colección"</strong> (o el botón +)
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">5.</span>
                    <div>
                      Nombre de colección: <code className="bg-white px-2 py-1 rounded">admins</code>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">6.</span>
                    <div>
                      <strong>ID del documento:</strong> Pega tu UID copiado
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">7.</span>
                    <div>
                      Agrega estos 3 campos:
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="bg-white p-2 rounded">
                          <strong>email</strong> (string): {user.email}
                        </div>
                        <div className="bg-white p-2 rounded">
                          <strong>role</strong> (string): admin
                        </div>
                        <div className="bg-white p-2 rounded">
                          <strong>createdAt</strong> (timestamp): [Usar hora del servidor]
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">8.</span>
                    <div>
                      Haz clic en <strong>"Guardar"</strong>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">9.</span>
                    <div>
                      Recarga esta página (F5)
                    </div>
                  </li>
                </ol>
              </div>
            )}

            {isAdmin && (
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-3 text-lg">
                  🎉 ¡Ya eres Administrador!
                </h3>
                <p className="text-green-800 mb-3">
                  Ahora puedes acceder al panel de gestión de usuarios.
                </p>
                <a
                  href="/app/admin/dashboard"
                  className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Ir al Panel de Admin →
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">Cargando información del usuario...</p>
          </div>
        )}
      </div>
    </div>
  );
}
