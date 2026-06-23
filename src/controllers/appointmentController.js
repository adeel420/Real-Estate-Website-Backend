const Appointment  = require("../models/Appointment");
const Property     = require("../models/Property");
const Availability = require("../models/Availability");
const User         = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const AppError     = require("../utils/AppError");
const {
  sendAppointmentNotificationToAgent,
  sendAppointmentConfirmationToBuyer,
  sendAppointmentStatusUpdateToBuyer,
  sendAppointmentRescheduledToBuyer,
} = require("../services/emailService");

// POST /api/appointments — buyer books appointment
exports.createAppointment = asyncHandler(async (req, res) => {
  const { propertyId, date, timeSlot, message } = req.body;
  if (!propertyId || !date || !timeSlot) {
    throw new AppError("propertyId, date and timeSlot are required.", 400);
  }

  const property = await Property.findOne({ _id: propertyId, status: "approved" })
    .populate("agentId", "firstName lastName email phone");
  if (!property) throw new AppError("Property not found.", 404);

  const buyer = await User.findById(req.userId).select("firstName lastName email phone");
  if (!buyer) throw new AppError("Buyer not found.", 404);

  const appointment = await Appointment.create({
    propertyId,
    tenantId: property.tenantId || null,
    agentId:  property.agentId._id,
    buyerId:  req.userId,
    date:     new Date(date),
    timeSlot,
    message,
  });

  // Format date for emails
  const formattedDate = new Date(date).toLocaleDateString("en-PK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const agentName  = `${property.agentId.firstName} ${property.agentId.lastName}`;
  const buyerName  = `${buyer.firstName} ${buyer.lastName}`;

  // Send emails (fire and forget — don't fail the request if email fails)
  Promise.allSettled([
    sendAppointmentNotificationToAgent(property.agentId.email, {
      agentName,
      buyerName,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone,
      propertyTitle: property.title,
      date: formattedDate,
      timeSlot,
      message,
    }),
    sendAppointmentConfirmationToBuyer(buyer.email, {
      buyerName,
      agentName,
      propertyTitle: property.title,
      date: formattedDate,
      timeSlot,
    }),
  ]);

  res.status(201).json({ success: true, message: "Visit booked successfully.", data: { appointment } });
});

// GET /api/appointments/agent — agent sees all their appointments
exports.getAgentAppointments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { agentId: req.userId };
  if (status) filter.status = status;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Appointment.countDocuments(filter);

  const appointments = await Appointment.find(filter)
    .sort({ date: 1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("buyerId",    "firstName lastName email phone")
    .populate("propertyId", "title slug images city area")
    .lean();

  res.json({
    success: true,
    data: { appointments },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// GET /api/appointments/buyer — buyer sees their appointments
exports.getBuyerAppointments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { buyerId: req.userId };
  if (status) filter.status = status;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Appointment.countDocuments(filter);

  const appointments = await Appointment.find(filter)
    .sort({ date: 1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("agentId",    "firstName lastName email phone")
    .populate("propertyId", "title slug images city area")
    .lean();

  res.json({
    success: true,
    data: { appointments },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// PATCH /api/appointments/:id/status — agent approves / rejects / completes
exports.updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["approved", "rejected", "completed", "cancelled"];
  if (!allowed.includes(status)) throw new AppError("Invalid status.", 400);

  const appointment = await Appointment.findOne({ _id: req.params.id, agentId: req.userId })
    .populate("buyerId",    "firstName lastName email")
    .populate("agentId",    "firstName lastName")
    .populate("propertyId", "title");
  if (!appointment) throw new AppError("Appointment not found.", 404);

  appointment.status = status;
  await appointment.save();

  // Send email to buyer on approved or rejected
  if (["approved", "rejected"].includes(status)) {
    const formattedDate = new Date(appointment.date).toLocaleDateString("en-PK", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    Promise.allSettled([
      sendAppointmentStatusUpdateToBuyer(appointment.buyerId.email, {
        buyerName:     `${appointment.buyerId.firstName} ${appointment.buyerId.lastName}`,
        agentName:     `${appointment.agentId.firstName} ${appointment.agentId.lastName}`,
        propertyTitle: appointment.propertyId.title,
        date:          formattedDate,
        timeSlot:      appointment.timeSlot,
        status,
      }),
    ]);
  }

  res.json({ success: true, data: { appointment } });
});

// PATCH /api/appointments/:id/reschedule — agent reschedules
exports.rescheduleAppointment = asyncHandler(async (req, res) => {
  const { date, timeSlot, note } = req.body;
  if (!date || !timeSlot) throw new AppError("date and timeSlot are required.", 400);

  const appointment = await Appointment.findOne({ _id: req.params.id, agentId: req.userId })
    .populate("buyerId",    "firstName lastName email")
    .populate("agentId",    "firstName lastName")
    .populate("propertyId", "title");
  if (!appointment) throw new AppError("Appointment not found.", 404);

  appointment.status               = "rescheduled";
  appointment.rescheduledDate      = new Date(date);
  appointment.rescheduledTimeSlot  = timeSlot;
  appointment.rescheduleNote       = note;
  await appointment.save();

  const formattedNewDate = new Date(date).toLocaleDateString("en-PK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  Promise.allSettled([
    sendAppointmentRescheduledToBuyer(appointment.buyerId.email, {
      buyerName:     `${appointment.buyerId.firstName} ${appointment.buyerId.lastName}`,
      agentName:     `${appointment.agentId.firstName} ${appointment.agentId.lastName}`,
      propertyTitle: appointment.propertyId.title,
      newDate:       formattedNewDate,
      newTimeSlot:   timeSlot,
      note,
    }),
  ]);

  res.json({ success: true, data: { appointment } });
});

// GET /api/appointments/availability/:agentId — public: get agent availability
exports.getAgentAvailability = asyncHandler(async (req, res) => {
  const slots = await Availability.find({
    agentId:  req.params.agentId,
    isActive: true,
  }).lean();

  res.json({ success: true, data: { slots } });
});

// PUT /api/appointments/availability — agent sets their availability
exports.setAvailability = asyncHandler(async (req, res) => {
  const { schedule } = req.body; // [{ dayOfWeek, slots, isActive }]
  if (!Array.isArray(schedule)) throw new AppError("schedule must be an array.", 400);

  const ops = schedule.map((s) => ({
    updateOne: {
      filter: { agentId: req.userId, dayOfWeek: s.dayOfWeek },
      update: { $set: { slots: s.slots, isActive: s.isActive, tenantId: req.user.tenantId || null } },
      upsert: true,
    },
  }));

  await Availability.bulkWrite(ops);
  const updated = await Availability.find({ agentId: req.userId }).lean();

  res.json({ success: true, data: { schedule: updated } });
});
