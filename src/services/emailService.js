const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.NODEMAILER_USER,
    pass: process.env.NODEMAILER_PASS,
  },
});

const sendMail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"Makeen" <${process.env.NODEMAILER_USER}>`,
    to,
    subject,
    html,
  });
};

const sendVerificationEmail = (email, code) =>
  sendMail({
    to: email,
    subject: "Verify your Makeen account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Verify Your Email</h2>
        <p>Use the code below to verify your account. It expires in <strong>15 minutes</strong>.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#C9A84C;text-align:center;padding:24px 0">${code}</div>
        <p style="color:#888;font-size:12px">If you didn't create an account, ignore this email.</p>
      </div>`,
  });

const sendWelcomeEmail = (email, name) =>
  sendMail({
    to: email,
    subject: "Welcome to Makeen",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Welcome, ${name}!</h2>
        <p>Your account has been verified. Start exploring premium properties today.</p>
        <a href="${process.env.CLIENT_URL}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Browse Properties</a>
      </div>`,
  });

const sendPasswordResetEmail = (email, otp) =>
  sendMail({
    to: email,
    subject: "Reset your Makeen password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Password Reset</h2>
        <p>Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#C9A84C;text-align:center;padding:24px 0">${otp}</div>
        <p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>
      </div>`,
  });

const sendAgentInvitationEmail = (email, code, name) =>
  sendMail({
    to: email,
    subject: "You've been invited to join Makeen",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Hello ${name || "Agent"},</h2>
        <p style="color:#333;font-size:15px;line-height:1.7">
          You have been invited to join Makeen as an agent for your agency.
          Use the verification code below to activate your account, set your password, and complete onboarding.
        </p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#C9A84C;text-align:center;padding:24px 0">${code}</div>
        <p style="color:#333;font-size:15px;line-height:1.7">
          This code expires in 15 minutes.
        </p>
        <a href="${process.env.CLIENT_URL}/agent-invitation?email=${encodeURIComponent(email)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Complete Invitation</a>
        <p style="color:#888;font-size:12px;margin-top:24px">If you didn't expect this invitation, please ignore this email.</p>
      </div>`,
  });

const sendAppointmentNotificationToAgent = (
  agentEmail,
  {
    agentName,
    buyerName,
    buyerEmail,
    buyerPhone,
    propertyTitle,
    date,
    timeSlot,
    message,
  },
) =>
  sendMail({
    to: agentEmail,
    subject: `New Visit Request — ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">New Visit Request</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen — Property Visit Booking</p>
        </div>
        <p style="color:#333">Hi <strong>${agentName}</strong>,</p>
        <p style="color:#555;font-size:14px">A buyer has requested a visit for one of your properties. Details below:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Property</td><td style="padding:10px 14px;color:#333">${propertyTitle}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Buyer Name</td><td style="padding:10px 14px;color:#333">${buyerName}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Buyer Email</td><td style="padding:10px 14px;color:#333">${buyerEmail}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Buyer Phone</td><td style="padding:10px 14px;color:#333">${buyerPhone || "Not provided"}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Requested Date</td><td style="padding:10px 14px;color:#333">${date}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Time Slot</td><td style="padding:10px 14px;color:#333">${timeSlot}</td></tr>
          ${message ? `<tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Message</td><td style="padding:10px 14px;color:#333">${message}</td></tr>` : ""}
        </table>
        <a href="${process.env.CLIENT_URL}/dashboard/agency_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">View in Dashboard</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const sendAppointmentConfirmationToBuyer = (
  buyerEmail,
  { buyerName, agentName, propertyTitle, date, timeSlot },
) =>
  sendMail({
    to: buyerEmail,
    subject: `Visit Booked — ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">Visit Confirmed!</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen — Property Visit Booking</p>
        </div>
        <p style="color:#333">Hi <strong>${buyerName}</strong>,</p>
        <p style="color:#555;font-size:14px">Your visit request has been submitted. The agent will confirm shortly.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Property</td><td style="padding:10px 14px;color:#333">${propertyTitle}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Agent</td><td style="padding:10px 14px;color:#333">${agentName}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Date</td><td style="padding:10px 14px;color:#333">${date}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Time</td><td style="padding:10px 14px;color:#333">${timeSlot}</td></tr>
        </table>
        <a href="${process.env.CLIENT_URL}/properties" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Browse More Properties</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const sendAppointmentStatusUpdateToBuyer = (
  buyerEmail,
  { buyerName, agentName, propertyTitle, date, timeSlot, status },
) => {
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const headerColor = isApproved
    ? "#1a5c3a"
    : isRejected
      ? "#7f1d1d"
      : "#1A3C5E";
  const heading = isApproved
    ? "Visit Approved ✓"
    : isRejected
      ? "Visit Rejected"
      : "Visit Update";
  const statusLine = isApproved
    ? 'Great news! Your visit has been <strong style="color:#16a34a">approved</strong> by the agent.'
    : isRejected
      ? 'Unfortunately, your visit request has been <strong style="color:#dc2626">rejected</strong> by the agent.'
      : "Your appointment status has been updated.";

  return sendMail({
    to: buyerEmail,
    subject: `Visit ${isApproved ? "Approved" : isRejected ? "Rejected" : "Updated"} — ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:${headerColor};padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">${heading}</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen — Property Visit Update</p>
        </div>
        <p style="color:#333">Hi <strong>${buyerName}</strong>,</p>
        <p style="color:#555;font-size:14px">${statusLine}</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Property</td><td style="padding:10px 14px;color:#333">${propertyTitle}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Agent</td><td style="padding:10px 14px;color:#333">${agentName}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Date</td><td style="padding:10px 14px;color:#333">${date}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Time</td><td style="padding:10px 14px;color:#333">${timeSlot}</td></tr>
        </table>
        <a href="${process.env.CLIENT_URL}/dashboard/buyer_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">View in Dashboard</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });
};

const sendAppointmentRescheduledToBuyer = (
  buyerEmail,
  { buyerName, agentName, propertyTitle, newDate, newTimeSlot, note },
) =>
  sendMail({
    to: buyerEmail,
    subject: `Visit Rescheduled — ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">Visit Rescheduled</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen — Property Visit Update</p>
        </div>
        <p style="color:#333">Hi <strong>${buyerName}</strong>,</p>
        <p style="color:#555;font-size:14px">The agent <strong>${agentName}</strong> has rescheduled your visit to a new date and time.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Property</td><td style="padding:10px 14px;color:#333">${propertyTitle}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">New Date</td><td style="padding:10px 14px;color:#333">${newDate}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">New Time</td><td style="padding:10px 14px;color:#333">${newTimeSlot}</td></tr>
          ${note ? `<tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Agent Note</td><td style="padding:10px 14px;color:#333">${note}</td></tr>` : ""}
        </table>
        <a href="${process.env.CLIENT_URL}/dashboard/buyer_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">View in Dashboard</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const sendInquiryNotificationToAgent = (
  agentEmail,
  { agentName, buyerName, buyerEmail, buyerPhone, propertyTitle, message },
) =>
  sendMail({
    to: agentEmail,
    subject: `New Inquiry \u2014 ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">New Inquiry Received</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen \u2014 Property Inquiry</p>
        </div>
        <p style="color:#333">Hi <strong>${agentName}</strong>,</p>
        <p style="color:#555;font-size:14px">A buyer has sent an inquiry about one of your properties.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Property</td><td style="padding:10px 14px;color:#333">${propertyTitle}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Buyer Name</td><td style="padding:10px 14px;color:#333">${buyerName}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Buyer Email</td><td style="padding:10px 14px;color:#333">${buyerEmail}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Buyer Phone</td><td style="padding:10px 14px;color:#333">${buyerPhone || "Not provided"}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Message</td><td style="padding:10px 14px;color:#333">${message}</td></tr>
        </table>
        <a href="${process.env.CLIENT_URL}/dashboard/agency_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Reply in Dashboard</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const sendInquiryReplyToAgent = (
  agentEmail,
  { agentName, buyerName, propertyTitle, replyMessage },
) =>
  sendMail({
    to: agentEmail,
    subject: `Buyer Replied — ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">Buyer Replied to Your Inquiry</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen — Property Inquiry</p>
        </div>
        <p style="color:#333">Hi <strong>${agentName}</strong>,</p>
        <p style="color:#555;font-size:14px">A buyer has replied to their inquiry about <strong>${propertyTitle}</strong>.</p>
        <div style="background:#F5F2ED;border-left:4px solid #C9A84C;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0;font-size:14px;color:#333;font-style:italic">
          &ldquo;${replyMessage}&rdquo;
        </div>
        <a href="${process.env.CLIENT_URL}/dashboard/agency_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">View in Dashboard</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const sendInquiryReplyToBuyer = (
  buyerEmail,
  { buyerName, agentName, propertyTitle, replyMessage },
) =>
  sendMail({
    to: buyerEmail,
    subject: `Agent Replied \u2014 ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">Agent Replied to Your Inquiry</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen \u2014 Property Inquiry</p>
        </div>
        <p style="color:#333">Hi <strong>${buyerName}</strong>,</p>
        <p style="color:#555;font-size:14px"><strong>${agentName}</strong> has replied to your inquiry about <strong>${propertyTitle}</strong>.</p>
        <div style="background:#F5F2ED;border-left:4px solid #C9A84C;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0;font-size:14px;color:#333;font-style:italic">
          &ldquo;${replyMessage}&rdquo;
        </div>
        <a href="${process.env.CLIENT_URL}/dashboard/buyer_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">View in Dashboard</a>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const sendAgentDirectMessage = (
  agentEmail,
  { agentName, senderName, senderEmail, senderPhone, message },
) =>
  sendMail({
    to: agentEmail,
    subject: `New Direct Message from ${escapeHtml(senderName)}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">New Direct Message</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen Agent Profile</p>
        </div>
        <p style="color:#333">Hi <strong>${escapeHtml(agentName)}</strong>,</p>
        <p style="color:#555;font-size:14px">Someone contacted you from your public agent profile.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Name</td><td style="padding:10px 14px;color:#333">${escapeHtml(senderName)}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Email</td><td style="padding:10px 14px;color:#333">${escapeHtml(senderEmail || "Not provided")}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Phone</td><td style="padding:10px 14px;color:#333">${escapeHtml(senderPhone || "Not provided")}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Message</td><td style="padding:10px 14px;color:#333">${escapeHtml(message)}</td></tr>
        </table>
        <p style="color:#aaa;font-size:11px;margin-top:24px">This is an automated notification from Makeen.</p>
      </div>`,
  });

const sendPropertyApprovalRequestEmail = (
  adminEmail,
  { propertyTitle, city, submitterName, submitterRole, featured },
) =>
  sendMail({
    to: adminEmail,
    subject: `${featured ? "Featured " : ""}Property Approval Request — ${propertyTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">Property Approval Required</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen Admin Notification</p>
        </div>
        <p style="color:#333">A ${featured ? "featured " : ""}property request is waiting for review.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Property</td><td style="padding:10px 14px;color:#333">${escapeHtml(propertyTitle)}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">City</td><td style="padding:10px 14px;color:#333">${escapeHtml(city || "Not provided")}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Submitted By</td><td style="padding:10px 14px;color:#333">${escapeHtml(submitterName)} (${escapeHtml(submitterRole)})</td></tr>
        </table>
        <a href="${process.env.CLIENT_URL}/dashboard/super-admin_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Review Request</a>
      </div>`,
  });

const sendPendingApprovalToUser = (email, name) =>
  sendMail({
    to: email,
    subject: "Account Pending Approval — Makeen",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Thank You for Signing Up!</h2>
        <p style="color:#333;font-size:15px;line-height:1.7">Hi <strong>${name}</strong>,</p>
        <p style="color:#555;font-size:14px;line-height:1.7">
          We have received your registration request and payment proof. 
          Our team will review your account and <strong>approve it within 24 hours</strong>.
        </p>
        <p style="color:#555;font-size:14px;line-height:1.7">
          You will receive another email once your account has been reviewed.
        </p>
        <div style="background:#F5F2ED;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
          <p style="color:#1A3C5E;font-size:13px;font-weight:600;margin:0">Estimated Review Time</p>
          <p style="color:#C9A84C;font-size:24px;font-weight:bold;margin:4px 0 0">&lt; 24 hours</p>
        </div>
        <p style="color:#888;font-size:12px">If you have any questions, please contact our support team.</p>
      </div>`,
  });

const sendPendingApprovalToAdmin = (user) =>
  sendMail({
    to: process.env.NODEMAILER_USER,
    subject: `New Registration Pending Approval — ${user.firstName} ${user.lastName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <div style="background:#1A3C5E;padding:20px 24px;border-radius:8px;margin-bottom:24px">
          <h2 style="color:#C9A84C;margin:0;font-size:20px">New Pending Registration</h2>
          <p style="color:#fff;margin:6px 0 0;font-size:13px">Makeen Admin Notification</p>
        </div>
        <p style="color:#333">A new user has registered and uploaded payment proof. Review their account:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E;width:40%">Name</td><td style="padding:10px 14px;color:#333">${user.firstName} ${user.lastName}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Email</td><td style="padding:10px 14px;color:#333">${user.email}</td></tr>
          <tr style="background:#F5F2ED"><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Role</td><td style="padding:10px 14px;color:#333">${user.role}</td></tr>
          ${user.selectedPlan ? `<tr><td style="padding:10px 14px;font-weight:600;color:#1A3C5E">Selected Plan</td><td style="padding:10px 14px;color:#333">${user.selectedPlan}</td></tr>` : ""}
        </table>
        <a href="${process.env.CLIENT_URL}/dashboard/super-admin_dashboard" style="display:inline-block;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Review in Dashboard</a>
      </div>`,
  });

const sendAccountApprovedEmail = (email, name) =>
  sendMail({
    to: email,
    subject: "Account Approved — Welcome to Makeen!",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Account Approved! 🎉</h2>
        <p style="color:#333;font-size:15px;line-height:1.7">Hi <strong>${name}</strong>,</p>
        <p style="color:#555;font-size:14px;line-height:1.7">
          Great news! Your account has been <strong style="color:#16a34a">approved</strong>. 
          You can now log in and start using all the features of your selected plan.
        </p>
        <a href="${process.env.CLIENT_URL}/login" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C9A84C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Log In Now</a>
        <p style="color:#888;font-size:12px;margin-top:24px">Welcome aboard! We're excited to have you.</p>
      </div>`,
  });

const sendAccountRejectedEmail = (email, name, reason) =>
  sendMail({
    to: email,
    subject: "Account Registration Update — Makeen",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1A3C5E">Registration Update</h2>
        <p style="color:#333;font-size:15px;line-height:1.7">Hi <strong>${name}</strong>,</p>
        <p style="color:#555;font-size:14px;line-height:1.7">
          Unfortunately, your account registration could not be approved at this time.
        </p>
        ${reason ? `
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0">
          <p style="color:#991b1b;font-size:13px;font-weight:600;margin:0 0 4px">Reason:</p>
          <p style="color:#7f1d1d;font-size:14px;margin:0">${reason}</p>
        </div>` : ""}
        <p style="color:#555;font-size:14px;line-height:1.7">
          If you believe this is a mistake, please contact our support team for assistance.
        </p>
        <p style="color:#888;font-size:12px;margin-top:24px">We apologize for any inconvenience.</p>
      </div>`,
  });

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAgentInvitationEmail,
  sendAppointmentNotificationToAgent,
  sendAppointmentConfirmationToBuyer,
  sendAppointmentStatusUpdateToBuyer,
  sendAppointmentRescheduledToBuyer,
  sendInquiryNotificationToAgent,
  sendInquiryReplyToAgent,
  sendInquiryReplyToBuyer,
  sendAgentDirectMessage,
  sendPropertyApprovalRequestEmail,
  sendPendingApprovalToUser,
  sendPendingApprovalToAdmin,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
};
