/**
 * Utilidades para manejar múltiples mascotas por cliente (veterinaria)
 *
 * Estructura de mascota:
 * { id, name, species, breed, age, weight, notes }
 *
 * Compatibilidad: los campos legacy (petName, petSpecies, etc.) se migran
 * automáticamente al array pets[] en la primera lectura.
 */

export const generatePetId = () => `pet-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`

/**
 * Normaliza los datos de mascotas de un cliente.
 * Si tiene pets[], lo devuelve. Si tiene petName (legacy), lo convierte a array.
 */
export const normalizePets = (customer) => {
  if (!customer) return []

  if (customer.pets && Array.isArray(customer.pets) && customer.pets.length > 0) {
    return customer.pets
  }

  // Migración legacy: campo petName → array de 1 mascota
  if (customer.petName) {
    return [{
      id: 'legacy-pet',
      name: customer.petName,
      species: customer.petSpecies || '',
      breed: customer.petBreed || '',
      age: customer.petAge || '',
      weight: customer.petWeight || '',
      notes: customer.petNotes || '',
    }]
  }

  return []
}

/**
 * Devuelve la mascota principal (primera del array) o null
 */
export const getPrimaryPet = (customer) => {
  const pets = normalizePets(customer)
  return pets.length > 0 ? pets[0] : null
}

/**
 * Crea un objeto mascota vacío con ID generado
 */
export const createEmptyPet = () => ({
  id: generatePetId(),
  name: '',
  species: '',
  breed: '',
  age: '',
  weight: '',
  notes: '',
})
