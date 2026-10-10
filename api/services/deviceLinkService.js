const crypto = require('crypto');

// In-memory stores for pairing tickets and linked devices
const linkTickets = new Map(); // ticketId -> ticket
const linkedDevices = new Map(); // deviceId -> device

const TICKET_TTL_MS = 10 * 60 * 1000; // 10 minutes to scan / pair
const LINKED_INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 hour of inactiveness

/**
 * Generate a clean 6-character human-readable code (e.g. 7KP-9X2)
 * Omits ambiguous characters like 0, O, 1, I
 */
function generatePairCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${result.slice(0, 3)}-${result.slice(3)}`;
}

/**
 * Periodic cleaner for expired tickets and inactive linked devices
 */
setInterval(() => {
  const now = Date.now();
  // Clean expired tickets
  for (const [id, ticket] of linkTickets.entries()) {
    if (now > ticket.expiresAt) {
      linkTickets.delete(id);
    }
  }
  // Clean inactive linked devices (> 1 hour)
  for (const [id, device] of linkedDevices.entries()) {
    if (now > device.expiresAt) {
      linkedDevices.delete(id);
    }
  }
}, 60 * 1000);

class DeviceLinkService {
  constructor() {
    this.io = null;
  }

  setIo(ioInstance) {
    this.io = ioInstance;
  }

  /**
   * Create a new pairing ticket requested by secondary device (TV/browser)
   */
  createTicket(metadata = {}) {
    const ticketId = crypto.randomUUID();
    let pairCode = generatePairCode();

    // Ensure uniqueness of pair code
    let attempts = 0;
    while ([...linkTickets.values()].some(t => t.pairCode === pairCode) && attempts < 10) {
      pairCode = generatePairCode();
      attempts++;
    }

    const ticket = {
      ticketId,
      pairCode,
      createdAt: Date.now(),
      expiresAt: Date.now() + TICKET_TTL_MS,
      status: 'pending',
      deviceType: metadata.deviceType || 'Web / TV',
      userAgent: metadata.userAgent || '',
    };

    linkTickets.set(ticketId, ticket);
    return ticket;
  }

  /**
   * Get ticket by ID or pairCode
   */
  findTicket(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toUpperCase();

    // Check by ticketId
    if (linkTickets.has(identifier)) {
      return linkTickets.get(identifier);
    }

    // Check by pairCode (supports with or without hyphen)
    for (const ticket of linkTickets.values()) {
      const formattedCode = ticket.pairCode.toUpperCase();
      const strippedCode = formattedCode.replace('-', '');
      const strippedInput = clean.replace('-', '');
      if (formattedCode === clean || strippedCode === strippedInput) {
        return ticket;
      }
    }

    return null;
  }

  /**
   * Primary device approves the ticket and transfers authenticated session
   */
  approveTicket({ identifier, userGuid, deviceName, userProfile, deviceType }) {
    const ticket = this.findTicket(identifier);
    if (!ticket) {
      throw new Error('Link code not found or has expired.');
    }

    if (Date.now() > ticket.expiresAt) {
      linkTickets.delete(ticket.ticketId);
      throw new Error('Link code has expired. Please refresh on the other device.');
    }

    const deviceId = crypto.randomUUID();
    const now = Date.now();
    const userAgent = ticket.userAgent || '';

    // Check if the ticket comes from a mobile device
    const isMobileDevice = deviceType === 'Mobile / Companion' ||
                           deviceType === 'Mobile' ||
                           ticket.deviceType === 'Mobile Companion' ||
                           /iphone|ipod|mobile|android.*mobile/i.test(userAgent);

    // Only genuine TVs should be classified as TV (mobiles can never be TV)
    const isSmartTvUa = !isMobileDevice && /smart-?tv|googletv|apple-?tv|android tv|tizen|webos|viera|bravia|netcast|roku|aftb|aftt|aftm|afts/i.test(userAgent);
    const isExplicitTvName = /\b(tv|television|smarttv)\b/i.test(deviceName || '') && !/browser|phone|mobile/i.test(deviceName || '');
    const isExplicitTvType = deviceType === 'Television' || ticket.deviceType === 'Television';

    const isTV = !isMobileDevice && (isExplicitTvType || isSmartTvUa || isExplicitTvName);

    const defaultName = isTV ? 'Smart TV' : (isMobileDevice ? 'Mobile Phone' : 'Companion Device');
    const finalDeviceName = (deviceName && deviceName.trim()) ? deviceName.trim() : defaultName;
    const finalDeviceType = isTV ? 'Television' : (isMobileDevice ? 'Mobile Companion' : (deviceType || ticket.deviceType || 'Web'));

    const sessionDuration = isTV ? 24 * 60 * 60 * 1000 : LINKED_INACTIVITY_LIMIT_MS; // 24h for TV, 1h for mobile
    const expiry = now + sessionDuration;

    const sessionPayload = {
      loggedIn: true,
      userGuid,
      business: userProfile?.business,
      permissionGroup: userProfile?.permission_group,
      repId: userProfile?.rep_id,
      eventId: userProfile?.event_id,
      deviceId,
      deviceName: finalDeviceName,
      deviceType: finalDeviceType,
      isTV,
      isLinkedDevice: true,
      linkedAt: now,
      expiresAt: expiry,
      sessionDurationMs: sessionDuration,
      userProfile,
    };

    const linkedDeviceRecord = {
      deviceId,
      userGuid,
      deviceName: finalDeviceName,
      deviceType: finalDeviceType,
      isTV,
      userAgent: ticket.userAgent,
      linkedAt: now,
      lastActive: now,
      expiresAt: expiry,
      sessionDurationMs: sessionDuration,
    };

    linkedDevices.set(deviceId, linkedDeviceRecord);
    ticket.status = 'approved';
    ticket.session = sessionPayload;

    // Notify secondary device via Socket.IO room
    if (this.io) {
      this.io.to(`ticket_${ticket.ticketId}`).emit('device_link_approved', sessionPayload);
      this.io.to(`user_${userGuid}`).emit('devices_updated');
      console.log(`[DeviceLink] Emitted device_link_approved to ticket_${ticket.ticketId} and devices_updated to user_${userGuid}`);
    }

    // Schedule cleanup of ticket
    setTimeout(() => {
      linkTickets.delete(ticket.ticketId);
    }, 5000);

    return {
      success: true,
      deviceId,
      sessionPayload,
    };
  }

  /**
   * Touch activity timestamp when linked device performs actions
   * Enforces inactivity rules (24h for TV, 1h for other linked devices)
   */
  touchActivity(deviceId) {
    if (!deviceId || !linkedDevices.has(deviceId)) {
      return { active: false, expired: true };
    }

    const device = linkedDevices.get(deviceId);
    const now = Date.now();

    if (now > device.expiresAt) {
      linkedDevices.delete(deviceId);
      if (this.io) {
        this.io.to(`device_${deviceId}`).emit('device_session_expired', {
          reason: device.isTV ? 'TV session ended after 24 hours.' : 'Session ended after 1 hour of inactivity.',
        });
        this.io.to(`user_${device.userGuid}`).emit('devices_updated');
      }
      return { active: false, expired: true };
    }

    // Extend session (24 hours for TV, 1 hour for mobile)
    const duration = device.isTV ? 24 * 60 * 60 * 1000 : LINKED_INACTIVITY_LIMIT_MS;
    device.lastActive = now;
    device.expiresAt = now + duration;
    return { active: true, expiresAt: device.expiresAt };
  }

  /**
   * Check if a specific device is active and not expired
   */
  isDeviceActive(deviceId) {
    if (!deviceId || !linkedDevices.has(deviceId)) {
      return false;
    }
    const dev = linkedDevices.get(deviceId);
    if (Date.now() > dev.expiresAt) {
      linkedDevices.delete(deviceId);
      if (this.io) {
        this.io.to(`user_${dev.userGuid}`).emit('devices_updated');
      }
      return false;
    }
    return true;
  }

  /**
   * Retrieve all currently linked devices for a user
   */
  getLinkedDevices(userGuid) {
    const now = Date.now();
    const list = [];

    for (const [id, dev] of linkedDevices.entries()) {
      if (dev.userGuid === userGuid) {
        if (now > dev.expiresAt) {
          linkedDevices.delete(id);
        } else {
          list.push({
            deviceId: dev.deviceId,
            deviceName: dev.deviceName,
            linkedAt: dev.linkedAt,
            lastActive: dev.lastActive,
            expiresAt: dev.expiresAt,
            remainingMinutes: Math.max(0, Math.round((dev.expiresAt - now) / 60000)),
          });
        }
      }
    }

    return list;
  }

  /**
   * Primary device revokes a linked device or linked device logs out
   */
  revokeDevice(userGuid, deviceId) {
    if (linkedDevices.has(deviceId)) {
      const dev = linkedDevices.get(deviceId);
      if (dev.userGuid === userGuid) {
        linkedDevices.delete(deviceId);
        if (this.io) {
          this.io.to(`device_${deviceId}`).emit('device_revoked', {
            reason: 'This device was logged out by the primary device.',
          });
          this.io.to(`user_${userGuid}`).emit('devices_updated');
          console.log(`[DeviceLink] Emitted device_revoked to device_${deviceId} and devices_updated to user_${userGuid}`);
        }
        return true;
      }
    }
    return false;
  }
}

const deviceLinkService = new DeviceLinkService();
module.exports = deviceLinkService;
