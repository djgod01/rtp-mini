/**
 * manager.js - Modernized for Node.js v23.11.0
 * 
 * Session manager for RTP MIDI protocol.
 */

const { EventEmitter } = require('events');
const os = require('os');

const Session = require('./Session');
const MdnsService = require('./mdns');

/**
 * Session manager
 * @extends EventEmitter
 */
class Manager extends EventEmitter {
  /**
   * Create a new manager
   */
  constructor() {
    super();
    this.sessions = [];
    this.inMemoryStore = {};
    this.storageHandler = this._defaultStorageHandler.bind(this);
    
    // Set up mDNS event handlers
    MdnsService.on('remoteSessionUp', (remoteSession) => {
      this.emit('remoteSessionAdded', { remoteSession });
    });

    MdnsService.on('remoteSessionDown', (remoteSession) => {
      this.emit('remoteSessionRemoved', { remoteSession });
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      this.reset(() => {
        // do not exit the process yet, the service mdns will do this.
        // otherwise bye messages will not be sent
      });
    });
  }

  /**
   * Default storage handler using in-memory storage
   * @param {Object} config - Storage config
   * @param {Function} callback - Callback function
   * @private
   */
  _defaultStorageHandler(config, callback) {
    switch (config.method) {
      case 'read':
        callback(null, JSON.parse(this.inMemoryStore.sessions || '[]'));
        break;
      case 'write':
        this.inMemoryStore.sessions = JSON.stringify(config.sessions || []);
        callback(null);
        break;
      default:
        callback({ message: 'Wrong method.' });
    }
  }

  /**
   * Create a new session
   * @param {Object} config - Session configuration
   * @param {boolean} dontSave - Don't save session to storage
   * @returns {Session} Created session
   */
  createSession(config = {}, dontSave) {
    const conf = { ...config };
    
    // Set default values
    conf.bonjourName = conf.bonjourName || 
                      os.hostname() + (this.sessions.length ? `-${this.sessions.length}` : '');
    conf.localName = conf.localName || `Session ${this.sessions.length + 1}`;
    conf.activated = conf.hasOwnProperty('activated') ? conf.activated : true;
    conf.published = conf.hasOwnProperty('published') ? conf.published : true;
    conf.streams = conf.streams || [];

    // Create session
    const session = new Session(
      conf.port,
      conf.localName, 
      conf.bonjourName,
      conf.ssrc, 
      conf.published, 
      conf.ipVersion
    );

    this.sessions.push(session);

    if (conf.activated) {
      session.start();
    }

    this.emit('sessionAdded', { session });

    if (!dontSave) {
      this.saveSessions();
    }

    return session;
  }

  /**
   * Remove a session
   * @param {Session} session - Session to remove
   */
  removeSession(session) {
    if (session) {
      const index = this.sessions.indexOf(session);
      if (index !== -1) {
        session.end(() => {
          this.sessions.splice(index, 1);
          this.emit('sessionRemoved', { session });
          this.saveSessions();
        });
      }
    }
  }

  /**
   * Get a session by name
   * @param {string} name - Session name
   * @returns {Session|null} Found session or null
   */
  getSessionByName(name) {
    return this.sessions.find(session => session.name === name) || null;
  }

  /**
   * Get a session by port
   * @param {number} port - Session port
   * @returns {Session|null} Found session or null
   */
  getSessionByPort(port) {
    return this.sessions.find(session => session.port === port) || null;
  }

  /**
   * Get a session by SSRC
   * @param {number} ssrc - Session SSRC
   * @returns {Session|null} Found session or null
   */
  getSessionBySsrc(ssrc) {
    return this.sessions.find(session => session.ssrc === ssrc) || null;
  }

  /**
   * Change session configuration
   * @param {Object} config - New configuration
   */
  changeSession(config) {
    const session = this.getSessionBySsrc(config.ssrc);
    if (!session) return;
    
    let restart = false;
    let republish = false;

    // Update session properties
    if (config.hasOwnProperty('bonjourName') && 
        config.bonjourName !== session.bonjourName) {
      session.bonjourName = config.bonjourName;
      republish = true;
    }
    
    if (config.hasOwnProperty('localName') && 
        config.localName !== session.localName) {
      session.localName = config.localName;
    }
    
    if (config.hasOwnProperty('port') && 
        config.port !== session.port) {
      session.port = config.port;
      restart = true;
      republish = true;
    }

    const handleReady = () => {
      session.removeListener('ready', handleReady);
      if (config.published !== false && republish) {
        session.publish();
      }
      this.emit('sessionChanged', { session });
    };

    if (config.published === false || republish || 
        config.activated === false) {
      session.unpublish();
    }

    if ((config.hasOwnProperty('activated') && 
         config.activated !== (session.readyState === 2)) || restart) {
      session.end(() => {
        this.emit('sessionChanged', { session });
        if (config.activated !== false || restart) {
          session.on('ready', handleReady);
          session.start();
        }
      });
    } else {
      handleReady();
    }
  }

  /**
   * Reset all sessions
   * @param {Function} callback - Called when reset is complete
   */
  reset(callback) {
    const resetSessions = async () => {
      for (const session of this.sessions) {
        await new Promise(resolve => session.end(resolve));
      }
      if (callback) callback();
    };
    
    resetSessions();
  }

  /**
   * Start mDNS discovery
   */
  startDiscovery() {
    MdnsService.start();
  }

  /**
   * Stop mDNS discovery
   */
  stopDiscovery() {
    MdnsService.stop();
  }

  /**
   * Get all sessions
   * @returns {Array} Sessions
   */
  getSessions() {
    return this.sessions;
  }

  /**
   * Get all remote sessions
   * @returns {Array} Remote sessions
   */
  getRemoteSessions() {
    return MdnsService.getRemoteSessions();
  }

  /**
   * Set storage handler
   * @param {Function} handler - Storage handler
   */
  setStorageHandler(handler) {
    this.storageHandler = handler;
  }

  /**
   * Restore sessions from storage
   */
  restoreSessions() {
    this.storageHandler({
      method: 'read',
    }, (err, sessionConfigs) => {
      if (err || !sessionConfigs) return;
      
      sessionConfigs.forEach((config) => {
        this.createSession(config, true);
      });
    });
  }

  /**
   * Save sessions to storage
   */
  saveSessions() {
    this.storageHandler({
      method: 'write',
      sessions: this.sessions.map(s => s.toJSON()),
    }, () => {});
  }
}

// Create a singleton instance
const manager = new Manager();

module.exports = manager;