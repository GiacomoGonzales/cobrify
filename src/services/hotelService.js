import { db } from '@/lib/firebase'
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
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

// =====================
// NIGHT AUDIT
// =====================

export const runNightAudit = async (businessId, auditDate, performedBy) => {
  try {
    const today = auditDate || new Date().toISOString().split('T')[0]

    // Verificar si ya se corrió la auditoría para esta fecha
    const auditsRef = collection(db, 'businesses', businessId, 'hotelNightAudits')
    const existingQuery = query(auditsRef, where('date', '==', today))
    const existingSnap = await getDocs(existingQuery)
    if (!existingSnap.empty) {
      return { success: false, error: `La auditoría nocturna del ${today} ya fue ejecutada` }
    }

    // Obtener reservas con check-in activo
    const reservationsRef = collection(db, 'businesses', businessId, 'hotelReservations')
    const activeQuery = query(reservationsRef, where('status', '==', 'checked_in'))
    const activeSnap = await getDocs(activeQuery)
    const activeReservations = activeSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    const charges = []
    for (const res of activeReservations) {
      // Calcular tarifa (aplicar temporada si existe)
      const rate = await getEffectiveRate(businessId, res.roomId, today, res.ratePerNight || 0)

      const charge = {
        reservationId: res.id,
        roomId: res.roomId,
        roomNumber: res.roomNumber,
        guestName: res.guestName,
        chargeType: 'room_night',
        description: `Noche ${today}`,
        amount: rate,
        date: today,
        createdBy: performedBy || 'night_audit',
        createdAt: serverTimestamp(),
      }
      const chargesRef = collection(db, 'businesses', businessId, 'hotelFolioCharges')
      await addDoc(chargesRef, charge)
      charges.push(charge)
    }

    // Registrar la auditoría
    await addDoc(auditsRef, {
      date: today,
      performedBy: performedBy || 'system',
      reservationsProcessed: activeReservations.length,
      totalCharged: charges.reduce((s, c) => s + c.amount, 0),
      details: charges.map(c => ({
        roomNumber: c.roomNumber,
        guestName: c.guestName,
        amount: c.amount,
      })),
      createdAt: serverTimestamp(),
    })

    return {
      success: true,
      data: {
        date: today,
        processed: activeReservations.length,
        totalCharged: charges.reduce((s, c) => s + c.amount, 0),
        charges,
      }
    }
  } catch (error) {
    console.error('Error en auditoría nocturna:', error)
    return { success: false, error: error.message }
  }
}

export const getNightAudits = async (businessId) => {
  try {
    const auditsRef = collection(db, 'businesses', businessId, 'hotelNightAudits')
    const q = query(auditsRef, orderBy('date', 'desc'))
    const snap = await getDocs(q)
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al obtener auditorías:', error)
    return { success: false, error: error.message }
  }
}

// =====================
// SEASONAL RATES
// =====================

export const getSeasonalRates = async (businessId) => {
  try {
    const ratesRef = collection(db, 'businesses', businessId, 'hotelSeasonalRates')
    const snap = await getDocs(ratesRef)
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al obtener tarifas por temporada:', error)
    return { success: false, error: error.message }
  }
}

export const saveSeasonalRate = async (businessId, rateData) => {
  try {
    const ratesRef = collection(db, 'businesses', businessId, 'hotelSeasonalRates')
    if (rateData.id) {
      const rateDoc = doc(db, 'businesses', businessId, 'hotelSeasonalRates', rateData.id)
      await updateDoc(rateDoc, { ...rateData, updatedAt: serverTimestamp() })
      return { success: true, id: rateData.id }
    }
    const newDoc = await addDoc(ratesRef, { ...rateData, createdAt: serverTimestamp() })
    return { success: true, id: newDoc.id }
  } catch (error) {
    console.error('Error al guardar tarifa:', error)
    return { success: false, error: error.message }
  }
}

export const deleteSeasonalRate = async (businessId, rateId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'hotelSeasonalRates', rateId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar tarifa:', error)
    return { success: false, error: error.message }
  }
}

// Obtener tarifa efectiva considerando temporada
export const getEffectiveRate = async (businessId, roomId, date, baseRate) => {
  try {
    const ratesResult = await getSeasonalRates(businessId)
    if (!ratesResult.success || ratesResult.data.length === 0) return baseRate

    const checkDate = new Date(date + 'T12:00:00')
    for (const season of ratesResult.data) {
      const start = new Date(season.startDate + 'T00:00:00')
      const end = new Date(season.endDate + 'T23:59:59')
      if (checkDate >= start && checkDate <= end) {
        // Verificar si aplica a esta habitación (o a todas)
        if (season.roomIds && season.roomIds.length > 0 && !season.roomIds.includes(roomId)) continue
        if (season.rateType === 'fixed') return season.rate
        if (season.rateType === 'multiplier') return baseRate * season.rate
        if (season.rateType === 'surcharge') return baseRate + season.rate
      }
    }
    return baseRate
  } catch (error) {
    console.warn('Error al calcular tarifa efectiva:', error)
    return baseRate
  }
}
