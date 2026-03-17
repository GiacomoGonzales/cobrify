import { db } from '@/lib/firebase'
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore'

// =====================
// HOTEL ROOMS
// =====================

export const createRoom = async (businessId, roomData) => {
  try {
    const roomsRef = collection(db, 'businesses', businessId, 'hotelRooms')
    const newRoom = {
      number: roomData.number || '',
      name: roomData.name || '',
      type: roomData.type || 'simple', // simple, doble, matrimonial, suite, familiar
      floor: roomData.floor || '',
      rate: roomData.rate || 0,
      status: 'available', // available, occupied, cleaning, maintenance
      capacity: roomData.capacity || 1,
      amenities: roomData.amenities || '',
      notes: roomData.notes || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
    const docRef = await addDoc(roomsRef, newRoom)
    return { success: true, data: { id: docRef.id, ...newRoom } }
  } catch (error) {
    console.error('Error al crear habitación:', error)
    return { success: false, error: error.message }
  }
}

export const getRooms = async (businessId) => {
  try {
    const roomsRef = collection(db, 'businesses', businessId, 'hotelRooms')
    const q = query(roomsRef, orderBy('number', 'asc'))
    const snapshot = await getDocs(q)
    const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return { success: true, data: rooms }
  } catch (error) {
    console.error('Error al obtener habitaciones:', error)
    return { success: false, error: error.message }
  }
}

export const updateRoom = async (businessId, roomId, updates) => {
  try {
    const roomRef = doc(db, 'businesses', businessId, 'hotelRooms', roomId)
    await updateDoc(roomRef, { ...updates, updatedAt: serverTimestamp() })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar habitación:', error)
    return { success: false, error: error.message }
  }
}

export const deleteRoom = async (businessId, roomId) => {
  try {
    const roomRef = doc(db, 'businesses', businessId, 'hotelRooms', roomId)
    await deleteDoc(roomRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar habitación:', error)
    return { success: false, error: error.message }
  }
}

export const updateRoomStatus = async (businessId, roomId, status) => {
  try {
    const roomRef = doc(db, 'businesses', businessId, 'hotelRooms', roomId)
    await updateDoc(roomRef, { status, updatedAt: serverTimestamp() })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar estado de habitación:', error)
    return { success: false, error: error.message }
  }
}

// =====================
// RESERVATIONS
// =====================

export const createReservation = async (businessId, reservationData) => {
  try {
    const reservationsRef = collection(db, 'businesses', businessId, 'hotelReservations')
    const newReservation = {
      guestName: reservationData.guestName || '',
      guestDocument: reservationData.guestDocument || '',
      guestDocumentType: reservationData.guestDocumentType || 'DNI',
      guestPhone: reservationData.guestPhone || '',
      guestEmail: reservationData.guestEmail || '',
      roomId: reservationData.roomId || '',
      roomNumber: reservationData.roomNumber || '',
      checkIn: reservationData.checkIn || '',
      checkOut: reservationData.checkOut || '',
      nights: reservationData.nights || 0,
      ratePerNight: reservationData.ratePerNight || 0,
      totalAmount: reservationData.totalAmount || 0,
      status: 'confirmed', // confirmed, checked_in, checked_out, cancelled, no_show
      notes: reservationData.notes || '',
      extras: reservationData.extras || [],
      paymentStatus: reservationData.paymentStatus || 'pending', // pending, partial, paid
      amountPaid: reservationData.amountPaid || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
    const docRef = await addDoc(reservationsRef, newReservation)
    return { success: true, data: { id: docRef.id, ...newReservation } }
  } catch (error) {
    console.error('Error al crear reservación:', error)
    return { success: false, error: error.message }
  }
}

export const getReservations = async (businessId) => {
  try {
    const reservationsRef = collection(db, 'businesses', businessId, 'hotelReservations')
    const q = query(reservationsRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    const reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return { success: true, data: reservations }
  } catch (error) {
    console.error('Error al obtener reservaciones:', error)
    return { success: false, error: error.message }
  }
}

export const getActiveReservations = async (businessId) => {
  try {
    const reservationsRef = collection(db, 'businesses', businessId, 'hotelReservations')
    const q = query(
      reservationsRef,
      where('status', 'in', ['confirmed', 'checked_in']),
      orderBy('checkIn', 'asc')
    )
    const snapshot = await getDocs(q)
    const reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return { success: true, data: reservations }
  } catch (error) {
    console.error('Error al obtener reservaciones activas:', error)
    return { success: false, error: error.message }
  }
}

export const updateReservation = async (businessId, reservationId, updates) => {
  try {
    const reservationRef = doc(db, 'businesses', businessId, 'hotelReservations', reservationId)
    await updateDoc(reservationRef, { ...updates, updatedAt: serverTimestamp() })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar reservación:', error)
    return { success: false, error: error.message }
  }
}

export const deleteReservation = async (businessId, reservationId) => {
  try {
    const reservationRef = doc(db, 'businesses', businessId, 'hotelReservations', reservationId)
    await deleteDoc(reservationRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar reservación:', error)
    return { success: false, error: error.message }
  }
}

export const checkIn = async (businessId, reservationId, roomId) => {
  try {
    // Update reservation status
    const reservationRef = doc(db, 'businesses', businessId, 'hotelReservations', reservationId)
    await updateDoc(reservationRef, {
      status: 'checked_in',
      updatedAt: serverTimestamp()
    })

    // Update room status to occupied
    const roomRef = doc(db, 'businesses', businessId, 'hotelRooms', roomId)
    await updateDoc(roomRef, {
      status: 'occupied',
      updatedAt: serverTimestamp()
    })

    return { success: true }
  } catch (error) {
    console.error('Error al hacer check-in:', error)
    return { success: false, error: error.message }
  }
}

export const checkOut = async (businessId, reservationId, roomId) => {
  try {
    // Get folio charges total
    const totalResult = await getReservationTotal(businessId, reservationId)
    const chargesTotal = totalResult.success ? totalResult.data : 0

    // Update reservation status and total
    const reservationRef = doc(db, 'businesses', businessId, 'hotelReservations', reservationId)
    await updateDoc(reservationRef, {
      status: 'checked_out',
      totalAmount: chargesTotal,
      updatedAt: serverTimestamp()
    })

    // Update room status to cleaning
    const roomRef = doc(db, 'businesses', businessId, 'hotelRooms', roomId)
    await updateDoc(roomRef, {
      status: 'cleaning',
      updatedAt: serverTimestamp()
    })

    return { success: true, data: { totalAmount: chargesTotal } }
  } catch (error) {
    console.error('Error al hacer check-out:', error)
    return { success: false, error: error.message }
  }
}

// =====================
// HOTEL SERVICES/AREAS
// =====================

export const createService = async (businessId, serviceData) => {
  try {
    const servicesRef = collection(db, 'businesses', businessId, 'hotelServices')
    const newService = {
      name: serviceData.name || '',
      type: serviceData.type || 'other', // pool, games, events, other
      rate: serviceData.rate || 0,
      rateType: serviceData.rateType || 'fixed', // per_person, per_hour, fixed
      capacity: serviceData.capacity || 0,
      status: serviceData.status || 'active', // active, inactive
      notes: serviceData.notes || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
    const docRef = await addDoc(servicesRef, newService)
    return { success: true, data: { id: docRef.id, ...newService } }
  } catch (error) {
    console.error('Error al crear servicio:', error)
    return { success: false, error: error.message }
  }
}

export const getServices = async (businessId) => {
  try {
    const servicesRef = collection(db, 'businesses', businessId, 'hotelServices')
    const q = query(servicesRef, orderBy('name', 'asc'))
    const snapshot = await getDocs(q)
    const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return { success: true, data: services }
  } catch (error) {
    console.error('Error al obtener servicios:', error)
    return { success: false, error: error.message }
  }
}

export const updateService = async (businessId, serviceId, updates) => {
  try {
    const serviceRef = doc(db, 'businesses', businessId, 'hotelServices', serviceId)
    await updateDoc(serviceRef, { ...updates, updatedAt: serverTimestamp() })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar servicio:', error)
    return { success: false, error: error.message }
  }
}

export const deleteService = async (businessId, serviceId) => {
  try {
    const serviceRef = doc(db, 'businesses', businessId, 'hotelServices', serviceId)
    await deleteDoc(serviceRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar servicio:', error)
    return { success: false, error: error.message }
  }
}

// =====================
// FOLIO CHARGES
// =====================

export const addCharge = async (businessId, chargeData) => {
  try {
    const chargesRef = collection(db, 'businesses', businessId, 'hotelFolioCharges')
    const newCharge = {
      reservationId: chargeData.reservationId || '',
      roomId: chargeData.roomId || '',
      roomNumber: chargeData.roomNumber || '',
      guestName: chargeData.guestName || '',
      chargeType: chargeData.chargeType || 'other', // room_night, restaurant, pool, minibar, laundry, service, other
      description: chargeData.description || '',
      amount: chargeData.amount || 0,
      date: chargeData.date || new Date().toISOString().split('T')[0],
      createdBy: chargeData.createdBy || '',
      createdAt: serverTimestamp()
    }
    const docRef = await addDoc(chargesRef, newCharge)
    return { success: true, data: { id: docRef.id, ...newCharge } }
  } catch (error) {
    console.error('Error al agregar cargo:', error)
    return { success: false, error: error.message }
  }
}

export const getChargesByReservation = async (businessId, reservationId) => {
  try {
    const chargesRef = collection(db, 'businesses', businessId, 'hotelFolioCharges')
    const q = query(
      chargesRef,
      where('reservationId', '==', reservationId),
      orderBy('createdAt', 'asc')
    )
    const snapshot = await getDocs(q)
    const charges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return { success: true, data: charges }
  } catch (error) {
    console.error('Error al obtener cargos:', error)
    return { success: false, error: error.message }
  }
}

export const deleteCharge = async (businessId, chargeId) => {
  try {
    const chargeRef = doc(db, 'businesses', businessId, 'hotelFolioCharges', chargeId)
    await deleteDoc(chargeRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar cargo:', error)
    return { success: false, error: error.message }
  }
}

export const getReservationTotal = async (businessId, reservationId) => {
  try {
    const chargesResult = await getChargesByReservation(businessId, reservationId)
    if (!chargesResult.success) {
      return { success: false, error: chargesResult.error }
    }
    const total = chargesResult.data.reduce((sum, charge) => sum + (charge.amount || 0), 0)
    return { success: true, data: total }
  } catch (error) {
    console.error('Error al calcular total de reservación:', error)
    return { success: false, error: error.message }
  }
}
