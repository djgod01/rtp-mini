/**
 * mdns/index.js - Modernized for Node.js v23.11.0
 * 
 * mDNS service module for RTP MIDI.
 */

// Export the mDNS service implementation
const service = require('./service-mdns');

module.exports = service;