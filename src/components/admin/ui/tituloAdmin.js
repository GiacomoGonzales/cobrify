import { createContext, useContext, useEffect } from 'react'

// La cabecera del admin muestra el nombre de la pagina segun el menu. Una
// pagina puede reemplazarlo (la ficha pone el nombre de la cuenta) con
// useTituloAdmin; al salir de la pagina la cabecera vuelve al titulo del menu.
export const TituloAdminContext = createContext({ setTitulo: () => {} })

export function useTituloAdmin(titulo) {
  const { setTitulo } = useContext(TituloAdminContext)
  useEffect(() => {
    if (titulo === undefined) return
    setTitulo(titulo)
    return () => setTitulo(null)
  }, [titulo, setTitulo])
}
