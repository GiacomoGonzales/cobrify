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
      // Tarifas: la habitación puede tener AMBAS configuradas. El modo de cobro
      // se decide al crear cada reserva. Si ratePerHour es 0, la habitación
      // solo soporta reservas por noche.
      rate: roomData.rate || 0,
      ratePerHour: Number(roomData.ratePerHour) || 0,
      // Modo predeterminado: sugerido al crear una nueva reserva. Si la
      // habitación tiene ambas tarifas, el operador puede cambiarlo en el form.
      pricingMode: roomData.pricingMode === 'hourly' ? 'hourly' : 'nightly',
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
    // Aceptar tanto nombres canónicos (guestDocument/checkIn) como los del form (documentNumber/checkInDate)
    const guestDocument = reservationData.guestDocument || reservationData.documentNumber || ''
    const guestDocumentType = reservationData.guestDocumentType || reservationData.documentType || 'DNI'
    const guestPhone = reservationData.guestPhone || reservationData.phone || ''
    const guestEmail = reservationData.guestEmail || reservationData.email || ''
    const checkIn = reservationData.checkIn || reservationData.checkInDate || ''
    const checkOut = reservationData.checkOut || reservationData.checkOutDate || ''
    const totalAmount = reservationData.totalAmount || reservationData.total || 0

    // Modo de tarificación: snapshot al momento de crear la reserva. Las reservas
    // existentes sin este campo se interpretan como 'nightly' (compat).
    const pricingMode = reservationData.pricingMode === 'hourly' ? 'hourly' : 'nightly'
    const checkInTime = reservationData.checkInTime || ''
    const checkOutTime = reservationData.checkOutTime || ''
    const hours = Number(reservationData.hours) || 0
    const ratePerHour = Number(reservationData.ratePerHour) || 0

    const newReservation = {
      guestName: reservationData.guestName || '',
      // Canónico
      guestDocument,
      guestDocumentType,
      guestPhone,
      guestEmail,
      checkIn,
      checkOut,
      // Alias form-friendly (para que la UI pueda leer cualquiera de los dos)
      documentNumber: guestDocument,
      documentType: guestDocumentType,
      phone: guestPhone,
      email: guestEmail,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      // Tarificación por hora (solo si pricingMode === 'hourly')
      pricingMode,
      checkInTime,
      checkOutTime,
      hours,
      ratePerHour,
      // Resto
      roomId: reservationData.roomId || '',
      roomNumber: reservationData.roomNumber || '',
      roomName: reservationData.roomName || '',
      nights: reservationData.nights || 0,
      ratePerNight: reservationData.ratePerNight || 0,
      totalAmount,
      total: totalAmount,
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

// Deshacer un check-in hecho por error: vuelve la reserva a "confirmada", libera la
// habitación y quita los cargos de noche/hora agregados al ingresar (los consumos se conservan).
export const undoCheckIn = async (businessId, reservationId, roomId) => {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'hotelReservations', reservationId), {
      status: 'confirmed',
      updatedAt: serverTimestamp(),
    })
    if (roomId) {
      await updateRoomStatus(businessId, roomId, 'available')
    }
    const chargesResult = await getChargesByReservation(businessId, reservationId)
    const toDelete = (chargesResult.data || []).filter(
      c => (c.chargeType === 'room_night' || c.chargeType === 'room_hourly') && !c.invoiceId
    )
    for (const c of toDelete) {
      await deleteDoc(doc(db, 'businesses', businessId, 'hotelFolioCharges', c.id))
    }
    return { success: true }
  } catch (error) {
    console.error('Error al deshacer check-in:', error)
    return { success: false, error: error.message }
  }
}

// Genera array de fechas ISO (YYYY-MM-DD) para cada noche entre checkIn y checkOut (exclusivo)
const getNightDateRange = (checkInStr, checkOutStr) => {
  const dates = []
  if (!checkInStr || !checkOutStr) return dates
  const start = new Date(checkInStr + 'T12:00:00')
  const end = new Date(checkOutStr + 'T12:00:00')
  const cur = new Date(start)
  while (cur < end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export const checkIn = async (businessId, reservationId, roomId) => {
  try {
    // Obtener datos de la reserva para generar cargos (por noche o por hora)
    const reservationRef = doc(db, 'businesses', businessId, 'hotelReservations', reservationId)
    const reservationSnap = await getDoc(reservationRef)
    if (reservationSnap.exists()) {
      const reservation = reservationSnap.data()
      const checkInDate = reservation.checkIn || reservation.checkInDate
      const checkOutDate = reservation.checkOut || reservation.checkOutDate
      const guestName = reservation.guestName || ''
      const roomNumber = reservation.roomNumber || ''
      const pricingMode = reservation.pricingMode === 'hourly' ? 'hourly' : 'nightly'

      const chargesRef = collection(db, 'businesses', businessId, 'hotelFolioCharges')

      if (pricingMode === 'hourly') {
        // Tarificación por hora: un único cargo por la duración total de la estadía.
        const hours = Number(reservation.hours || 0)
        const ratePerHour = Number(reservation.ratePerHour || 0)
        const totalAmount = Number(reservation.totalAmount || reservation.total || hours * ratePerHour)
        if (hours > 0 && totalAmount > 0) {
          // Evitar duplicados si ya hay un cargo room_hourly para esta reserva.
          const existingResult = await getChargesByReservation(businessId, reservationId)
          const hasHourlyCharge = (existingResult.data || []).some(c => c.chargeType === 'room_hourly')
          if (!hasHourlyCharge) {
            const ciTime = reservation.checkInTime || ''
            const coTime = reservation.checkOutTime || ''
            const timeRange = ciTime && coTime ? ` (${ciTime} - ${coTime})` : ''
            await addDoc(chargesRef, {
              reservationId,
              roomId,
              roomNumber,
              guestName,
              chargeType: 'room_hourly',
              description: `Estadía ${hours} hora${hours !== 1 ? 's' : ''}${timeRange}`,
              amount: totalAmount,
              date: checkInDate || new Date().toISOString().split('T')[0],
              createdBy: 'checkin',
              createdAt: serverTimestamp(),
            })
          }
        }
      } else {
        // Tarificación por noche: un cargo por cada noche (comportamiento original).
        const baseRate = Number(reservation.ratePerNight || 0)
        if (checkInDate && checkOutDate && baseRate > 0) {
          const existingResult = await getChargesByReservation(businessId, reservationId)
          const existingDates = new Set(
            (existingResult.data || [])
              .filter(c => c.chargeType === 'room_night')
              .map(c => c.date)
          )

          // Personas adicionales: cargo por noche por cada huesped que supera los incluidos
          // (snapshot guardado en la reserva). Se suma a la tarifa de cada noche del folio.
          const ciBaseGuests = Number(reservation.baseGuests ?? 1)
          const ciExtraGuestRate = Number(reservation.extraGuestRate ?? 0)
          const ciExtraGuests = Math.max(0, (Number(reservation.guests) || 0) - ciBaseGuests)
          const ciExtraPerNight = ciExtraGuests * ciExtraGuestRate

          const dates = getNightDateRange(checkInDate, checkOutDate)
          for (const date of dates) {
            if (existingDates.has(date)) continue
            const rate = await getEffectiveRate(businessId, roomId, date, baseRate)
            await addDoc(chargesRef, {
              reservationId,
              roomId,
              roomNumber,
              guestName,
              chargeType: 'room_night',
              description: ciExtraGuests > 0 ? `Noche ${date} (+${ciExtraGuests} pers.)` : `Noche ${date}`,
              amount: rate + ciExtraPerNight,
              date,
              createdBy: 'checkin',
              createdAt: serverTimestamp(),
            })
          }
        }
      }
    }

    // Actualizar estado de reserva y habitación
    await updateDoc(reservationRef, {
      status: 'checked_in',
      updatedAt: serverTimestamp()
    })
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
    // Eliminar cargos de noches futuras no utilizadas y no facturadas (early check-out)
    const today = new Date().toISOString().split('T')[0]
    const existingResult = await getChargesByReservation(businessId, reservationId)
    const toDelete = (existingResult.data || []).filter(c =>
      c.chargeType === 'room_night' && !c.invoiceId && c.date >= today
    )
    for (const charge of toDelete) {
      const ref = doc(db, 'businesses', businessId, 'hotelFolioCharges', charge.id)
      await deleteDoc(ref)
    }

    // Recalcular total después de eliminaciones
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
    // Sin orderBy para no requerir índice compuesto; ordenamos en memoria
    const q = query(chargesRef, where('reservationId', '==', reservationId))
    const snapshot = await getDocs(q)
    const charges = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? 0
        const bTime = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? 0
        return aTime - bTime
      })
    return { success: true, data: charges }
  } catch (error) {
    console.error('Error al obtener cargos:', error)
    return { success: false, error: error.message }
  }
}

// Marca un conjunto de cargos del folio como facturados, vinculándolos a una invoice
export const markChargesAsInvoiced = async (businessId, chargeIds, invoiceId, invoiceNumber = '') => {
  try {
    if (!Array.isArray(chargeIds) || chargeIds.length === 0) {
      return { success: true, updated: 0 }
    }
    const updates = chargeIds.map(id => {
      const ref = doc(db, 'businesses', businessId, 'hotelFolioCharges', id)
      return updateDoc(ref, {
        invoiceId,
        invoiceNumber,
        invoicedAt: serverTimestamp(),
      })
    })
    await Promise.all(updates)
    return { success: true, updated: chargeIds.length }
  } catch (error) {
    console.error('Error al marcar cargos como facturados:', error)
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
      // Las reservas por hora se cobran una sola vez en check-in, no por noche.
      if (res.pricingMode === 'hourly') continue

      // Evitar duplicar: las noches se agregan al folio al hacer check-in, así que si la
      // noche de hoy ya está cargada, no se vuelve a cobrar.
      const existingForRes = await getChargesByReservation(businessId, res.id)
      const alreadyCharged = (existingForRes.data || []).some(c => c.chargeType === 'room_night' && c.date === today)
      if (alreadyCharged) continue

      // Calcular tarifa de la habitación (aplica temporada / fin de semana si existe)
      const rate = await getEffectiveRate(businessId, res.roomId, today, res.ratePerNight || 0)

      // Personas adicionales: cobro por noche por cada huésped que supera los incluidos.
      const baseGuests = Number(res.baseGuests ?? 1)
      const extraGuestRate = Number(res.extraGuestRate ?? 0)
      const extraGuests = Math.max(0, (Number(res.guests) || 0) - baseGuests)
      const extraGuestAmount = extraGuests * extraGuestRate
      const nightAmount = rate + extraGuestAmount

      const charge = {
        reservationId: res.id,
        roomId: res.roomId,
        roomNumber: res.roomNumber,
        guestName: res.guestName,
        chargeType: 'room_night',
        description: extraGuests > 0 ? `Noche ${today} (+${extraGuests} pers.)` : `Noche ${today}`,
        amount: nightAmount,
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
      const hasDateRange = !!(season.startDate && season.endDate)
      const hasDays = Array.isArray(season.daysOfWeek) && season.daysOfWeek.length > 0

      // Una tarifa debe tener al menos rango de fechas o días de la semana.
      if (!hasDateRange && !hasDays) continue

      // Rango de fechas (opcional): si la tarifa lo tiene, la noche debe caer dentro.
      if (hasDateRange) {
        const start = new Date(season.startDate + 'T00:00:00')
        const end = new Date(season.endDate + 'T23:59:59')
        if (checkDate < start || checkDate > end) continue
      }

      // Días de la semana (opcional): si la tarifa los tiene (0=Dom..6=Sáb),
      // solo aplica cuando el día de la noche coincide. Así se manejan los fines de semana.
      if (hasDays && !season.daysOfWeek.includes(checkDate.getDay())) continue

      // Verificar si aplica a esta habitación (o a todas)
      if (season.roomIds && season.roomIds.length > 0 && !season.roomIds.includes(roomId)) continue
      if (season.rateType === 'fixed') return season.rate
      if (season.rateType === 'multiplier') return baseRate * season.rate
      if (season.rateType === 'surcharge') return baseRate + season.rate
    }
    return baseRate
  } catch (error) {
    console.warn('Error al calcular tarifa efectiva:', error)
    return baseRate
  }
}
