/**
 * service-mdns.js - Modernized for Node.js v23.11.0
 * 
 * mDNS service for RTP MIDI protocol.
 */

const { EventEmitter } = require('events');
const { Bonjour } = require('bonjour-service');
const logger = require('../logger');

/**
 * Extract session details from a Bonjour service
 * @param {Object} service - Bonjour service
 * @returns {Object} Session details
 */
function extractSessionDetails(service) {
  let addressV4 = null;
  let addressV6 = null;

  if (service.addresses) {
    for (const address of service.addresses) {
      if (address.includes('.') && !addressV4) {
        addressV4 = address;
      } else if (address.includes(':') && !addressV6) {
        addressV6 = address;
      }
    }
  }

  return {
    name: service.name,
    port: service.port,
    address: addressV4,
    addressV6: addressV6,
    host: service.host
  };
}

/**
 * mDNS service for discovering and publishing RTP MIDI sessions
 * @extends EventEmitter
 */
class MDnsService extends EventEmitter {
  /**
   * Create a new mDNS service
   */
  constructor() {
    super();
    
    // Initialize properties
    this.publishedSessions = [];
    this.advertisements = [];
    this.remoteSessions = {};
    this.sessionDetails = {};
    this.sessionsList = [];
    
    // Create Bonjour service
    this.bonjourService = new Bonjour({
      ttl: 20
    });
    
    // Initialize browser
    this.browser = this.bonjourService.find({ 
      type: 'apple-midi', 
      protocol: 'udp' 
    });
    
    // Set up browser events
    this.browser.on('up', (service) => {
      this.remoteSessions[service.name] = service;
      this.sessionDetails[service.name] = extractSessionDetails(service);
      this._updateRemoteSessions();
      this.emit('remoteSessionUp', this.sessionDetails[service.name]);
    });
    
    this.browser.on('down', (service) => {
      const sessionDetail = this.sessionDetails[service.name];
      delete this.remoteSessions[service.name];
      delete this.sessionDetails[service.name];
      this._updateRemoteSessions();
      this.emit('remoteSessionDown', sessionDetail);
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      this.unpublishAll(() => {
        this.bonjourService.destroy();
        process.exit();
      });
    });
  }

  /**
   * Update the list of remote sessions
   * @private
   */
  _updateRemoteSessions() {
    this.sessionsList = [];
    
    for (const name in this.sessionDetails) {
      if (Object.prototype.hasOwnProperty.call(this.sessionDetails, name)) {
        this.sessionsList.push(this.sessionDetails[name]);
      }
    }
  }

  /**
   * Start mDNS discovery
   */
  start() {
    this.remoteSessions = {};
    
    if (this.browser) {
      this.browser.start();
    } else {
      logger.log('mDNS discovery is not available.');
    }
  }

  /**
   * Stop mDNS discovery
   */
  stop() {
    if (this.browser) {
      this.browser.stop();
    }
  }

  /**
   * Publish a session
   * @param {Session} session - Session to publish
   */
  publish(session) {
    if (this.publishedSessions.includes(session)) {
      return;
    }
    
    this.publishedSessions.push(session);
    
    const advertisement = this.bonjourService.publish({ 
      name: session.bonjourName, 
      type: 'apple-midi', 
      port: session.port, 
      protocol: 'udp' 
    });
    
    logger.debug('Added mDNS service', advertisement);
    this.advertisements.push(advertisement);
    advertisement.start();
  }

  /**
   * Unpublish all sessions
   * @param {Function} [callback] - Called when complete
   */
  unpublishAll(callback = () => {}) {
    this.bonjourService.unpublishAll(callback);
  }

  /**
   * Unpublish a session
   * @param {Session} session - Session to unpublish
   */
  unpublish(session) {
    const index = this.publishedSessions.indexOf(session);
    if (index === -1) {
      return;
    }
    
    const advertisement = this.advertisements[index];
    if (!advertisement) return;

    advertisement.stop(() => {
      this.publishedSessions.splice(index, 1);
      this.advertisements.splice(index, 1);
    });
  }

  /**
   * Get all remote sessions
   * @returns {Array} Remote sessions
   */
  getRemoteSessions() {
    return this.sessionsList;
  }
}

// Export a singleton instance
module.exports = new MDnsService();