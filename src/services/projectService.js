import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'

/**
 * Servicio de gestión de Proyectos / Obras
 * Colección: businesses/{businessId}/projects
 */

export const getProjects = async (businessId) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'projects'),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: projects }
  } catch (error) {
    console.error('Error al obtener proyectos:', error)
    return { success: false, error: error.message }
  }
}

export const createProject = async (businessId, projectData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', businessId, 'projects'), {
      ...projectData,
      status: projectData.status || 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear proyecto:', error)
    return { success: false, error: error.message }
  }
}

export const updateProject = async (businessId, projectId, updates) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'projects', projectId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar proyecto:', error)
    return { success: false, error: error.message }
  }
}

export const deleteProject = async (businessId, projectId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'projects', projectId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar proyecto:', error)
    return { success: false, error: error.message }
  }
}
