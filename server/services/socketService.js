const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const CoverageArea = require('../models/CoverageArea');

let io;

/**
 * Initialize WebSocket server
 * @param {http.Server} server - The HTTP server instance
 */
const init = (server) => {
  // CLIENT_ORIGIN may be a comma-separated string — socket.io needs an array
  const origins = (process.env.CLIENT_ORIGIN || '')
    .split(',').map(o => o.trim()).filter(Boolean);

  io = socketIo(server, {
    cors: {
      origin: origins.length === 1 ? origins[0] : origins,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // JWT Authentication Middleware for Socket.io
  io.use(async (socket, next) => {
    // Clients can pass token in auth object (recommended) or headers
    const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
    
    if (!token) {
      console.warn('[Socket Auth] Connection attempt without token');
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Fetch user to verify they still exist and aren't suspended
      const user = await User.findById(decoded.user.id).select('companyName role isSuspended');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      if (user.isSuspended) {
        return next(new Error('Authentication error: Account suspended'));
      }

      // Attach user info to socket
      socket.user = {
        id: user._id.toString(),
        companyName: user.companyName,
        role: user.role
      };
      
      next();
    } catch (err) {
      console.error('[Socket Auth] Token verification failed:', err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const { companyName, id } = socket.user;
    console.log(`[Socket] ${companyName} connected (${socket.id})`);

    try {
      // 1. Fetch coverage areas for this company
      const coverageAreas = await CoverageArea.find({ company: id });
      
      // 2. Join rooms based on zip codes
      // Prefixing room names to avoid potential collisions with other socket.io features
      const joinedRooms = [];
      coverageAreas.forEach(area => {
        const room = `zip_${area.zipCode}`;
        socket.join(room);
        joinedRooms.push(area.zipCode);
      });
      
      console.log(`[Socket] ${companyName} joined ${joinedRooms.length} coverage rooms`);

      // 3. Send confirmation to client
      socket.emit('connection_established', {
        message: 'Securely connected to MoveLeads Real-time',
        company: companyName,
        coverageCount: joinedRooms.length
      });
    } catch (err) {
      console.error('[Socket] Error during room subscription:', err.message);
    }

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] ${companyName} disconnected (${reason})`);
    });
  });

  return io;
};

/**
 * Emit a new lead to relevant zip code rooms
 * @param {Object} lead - The Mongoose lead document
 */
const emitNewLead = (lead) => {
  if (!io) {
    console.error('[Socket] Cannot emit lead: Socket.io not initialized');
    return;
  }

  // Sanitize lead data for public emission (remove customer contact info)
  // According to requirements: "receive instant JSON payloads of new leads" 
  // Normally, we'd only expose full details after purchase, but "NEW_LEAD_AVAILABLE" 
  // usually implies a notification of a lead they CAN buy.
  const payload = {
    _id: lead._id,
    id: lead._id,
    route: lead.route,
    originCity: lead.originCity,
    destinationCity: lead.destinationCity,
    originZip: lead.originZip,
    destinationZip: lead.destinationZip,
    homeSize: lead.homeSize,
    moveDate: lead.moveDate,
    distance: lead.distance,
    price:            lead.price,
    status:           lead.status,
    createdAt:        lead.createdAt,
    // Auction fields
    grade:            lead.grade            || null,
    score:            lead.score            || 0,
    miles:            lead.miles            || 0,
    buyNowPrice:      lead.buyNowPrice      || lead.price || 25,
    startingBidPrice: lead.startingBidPrice || 9,
    currentBidPrice:  lead.currentBidPrice  || 0,
    auctionEndsAt:    lead.auctionEndsAt    || null,
    auctionStatus:    lead.auctionStatus    || 'active',
  };

  const originRoom      = `zip_${lead.originZip}`;
  const destinationRoom = `zip_${lead.destinationZip}`;

  console.log(`[Socket] Broadcasting Lead ${lead._id} to rooms: ${originRoom}, ${destinationRoom}`);
  io.to(originRoom).to(destinationRoom).emit('NEW_LEAD_AVAILABLE', payload);
};

/** Expose the io instance so other services (e.g. bids.js) can emit events. */
const getIo = () => io;

module.exports = { init, emitNewLead, getIo };
