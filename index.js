/**
 * index.js - Modernized for Node.js v23.11.0
 * 
 * Main entry point for the RTP MIDI library.
 */

// Export all modules
module.exports = {
  manager: require('./src/manager'),
  Session: require('./src/Session'),
  Stream: require('./src/Stream'),
  AbstractMessage: require('./src/AbstractMessage'),
  ControlMessage: require('./src/ControlMessage'),
  RTPMessage: require('./src/RTPMessage'),
  MTC: require('./src/MTC'),
  MdnsService: require('./src/mdns'),
  logger: require('./src/logger'),
};