/**
 * Stream.js - Modernized for Node.js v23.11.0
 * 
 * This file implements the RTP MIDI Stream for connecting to remote peers.
 */

const { EventEmitter } = require('events');
const ControlMessage = require('./ControlMessage');
const logger = require('./logger');
const MidiMessage = require('./MidiMessage');

/**
 * Helper functions
 */

/**
 * Generate a random integer
 * @param {number} octets - Number of octets
 * @returns {number} Random integer
 */
function generateRandomInteger(octets) {
  return Math.round(Math.random() * (2 ** (8 * octets)));
}

/**
 * Pad a number with leading zeros
 * @param {number|string} number - Number to pad
 * @param {number} length - Desired length
 * @returns {string} Padded number
 */
function pad(number, length) {
  let num = (typeof number === 'string') ? number : Math.round(number || 0).toString(10);
  while (num.length < length) {
    num = `0${num}`;
  }
  return num;
}

/**
 * Write a 64-bit unsigned integer to a buffer
 * @param {Buffer} buffer - Target buffer
 * @param {number} value - Value to write
 */
function writeUInt64BE(buffer, value) {
  const str = pad((value).toString(16), 16);
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(parseInt(str.slice(8), 16), 4);
}

/**
 * Read a 64-bit unsigned integer from a buffer
 * @param {Buffer} buffer - Source buffer
 * @param {number} [i=0] - Starting offset
 * @returns {number} Read value
 */
function readUInt64BE(buffer, i = 0) {
  return buffer.readUInt32BE(i + 4);
}

/**
 * Stream represents a connection to a remote MIDI peer
 * @extends EventEmitter
 */
class Stream extends EventEmitter {
  /**
   * Create a new Stream
   * @param {Object} session - Parent session
   */
  constructor(session) {
    super();
    this.session = session;
    this.token = null;
    this.ssrc = null;
    this.rinfo1 = null;
    this.rinfo2 = null;
    this.name = '';
    this.lastSentSequenceNr = Math.round(Math.random() * 0xffff);
    this.firstReceivedSequenceNumber = -1;
    this.lastReceivedSequenceNumber = -1;
    this.lostSequenceNumbers = [];
    this.latency = null;
    this.subscribers = [];
    this.isConnected = false;
    this.receiverFeedbackTimeout = null;
    this.lastMessageTime = 0;
    this.timeDifference = null;
    this.isInitiator = false;
    this.connectionInterval = null;
    this.syncInterval = null;
  }

  /**
   * Connect to a remote peer
   * @param {Object} rinfo - Remote info
   */
  connect(rinfo) {
    this.isInitiator = true;
    let counter = 0;
    
    // Clear any existing connection interval
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
    }
    
    this.connectionInterval = setInterval(() => {
      if (counter < 40 && this.ssrc === null) {
        this.sendInvitation(rinfo);
        counter += 1;
      } else {
        clearInterval(this.connectionInterval);
        if (!this.ssrc) {
          const { address, port } = rinfo;
          logger.warn(`Server at ${address}:${port} did not respond.`);
        }
      }
    }, 1500);
  }

  /**
   * Handle a control message
   * @param {Object} message - Control message
   * @param {Object} rinfo - Remote info
   */
  handleControlMessage(message, rinfo) {
    const commandName = message.command;
    
    // Convert command name to handler method name
    const handlerName = 'handle' + 
                       commandName.charAt(0).toUpperCase() + 
                       commandName.slice(1);
    
    // If we have a handler method, call it
    if (typeof this[handlerName] === 'function') {
      this[handlerName](message, rinfo);
    } else if (commandName.includes('_')) {
      // Try with underscore (for commands like invitation_accepted)
      const parts = commandName.split('_');
      const altHandlerName = 'handle' + 
                            parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      
      if (typeof this[altHandlerName] === 'function') {
        this[altHandlerName](message, rinfo);
      }
    }
    
    this.emit('control-message', message);
  }

  /**
   * Handle a MIDI message
   * @param {Object} message - MIDI message
   */
  handleMidiMessage(message) {
    // Track lost packets
    if (this.firstReceivedSequenceNumber !== -1) {
      for (let i = this.lastReceivedSequenceNumber + 1; i < message.sequenceNumber; i++) {
        this.lostSequenceNumbers.push(i);
      }
    } else {
      this.firstReceivedSequenceNumber = message.sequenceNumber;
    }

    this.lastReceivedSequenceNumber = message.sequenceNumber;

    // Process message commands with timing
    let messageTime = this.timeDifference - this.latency + message.timestamp;

    for (const command of message.commands) {
      messageTime += command.deltaTime;
      this.emit('message', messageTime, command.data);
    }

    // Schedule receiver feedback
    clearTimeout(this.receiverFeedbackTimeout);
    this.receiverFeedbackTimeout = setTimeout(() => this.sendReceiverFeedback(), 1000);
  }

  /**
   * Handle invitation accepted message
   * @param {Object} message - Control message
   * @param {Object} rinfo - Remote info
   */
  handleInvitationAccepted(message, rinfo) {
    if (this.rinfo1 === null) {
      logger.info(`Invitation accepted by ${message.name}`);
      this.name = message.name;
      this.ssrc = message.ssrc;
      this.rinfo1 = rinfo;
      
      // Send invitation to second port (data port)
      this.sendInvitation({
        address: rinfo.address,
        port: rinfo.port + 1,
      });
      
      this.isConnected = true;
      this.emit('connected', { stream: this });
    } else if (this.rinfo2 === null) {
      logger.info(`Data channel to ${this.name} established`);
      this.emit('established', { stream: this });
      this.rinfo2 = rinfo;
      
      // Start synchronization
      let count = 0;
      
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
      }
      
      this.syncInterval = setInterval(() => {
        this.sendSynchronization();
        count += 1;
        
        if (count > 10 || this.timeDifference) {
          clearInterval(this.syncInterval);
          this.syncInterval = setInterval(() => {
            this.sendSynchronization();
          }, 10000);
        }
      }, 1500);
    }
  }

  /**
   * Handle invitation rejected message
   * @param {Object} message - Control message
   * @param {Object} rinfo - Remote info
   */
  handleInvitationRejected(message, rinfo) {
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
    }
    
    logger.info(`Invitation was rejected by ${rinfo.address}:${rinfo.port} ${message.name || ''}`);
    this.session.removeStream(this);
  }

  /**
   * Handle invitation message
   * @param {Object} message - Control message
   * @param {Object} rinfo - Remote info
   */
  handleInvitation(message, rinfo) {
    if (this.rinfo1 === null) {
      this.rinfo1 = rinfo;
      this.token = message.token;
      this.name = message.name;
      this.ssrc = message.ssrc;
      logger.info(`Got invitation from ${message.name} on channel 1`);
    } else if (this.rinfo2 === null) {
      this.rinfo2 = rinfo;
      logger.info(`Got invitation from ${message.name} on channel 2`);
      this.isConnected = true;
      this.emit('connected', { stream: this });
    }
    
    this.sendInvitationAccepted(rinfo);
  }

  /**
   * Handle synchronization message
   * @param {Object} message - Control message
   */
  handleSynchronization(message) {
    this.sendSynchronization(message);
  }

  /**
   * Handle end message
   */
  handleEnd() {
    logger.info(`${this.name} ended the stream`);
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.isConnected = false;
    this.emit('disconnected', { stream: this });
  }

  /**
   * Handle receiver feedback message
   * @param {Object} message - Control message
   */
  handleReceiverFeedback(message) {
    logger.info(`Got receiver feedback SSRC ${message.ssrc} is at ${message.sequenceNumber}. Current is ${this.lastSentSequenceNr}`);
  }

  /**
   * Send invitation to remote peer
   * @param {Object} rinfo - Remote info
   */
  sendInvitation(rinfo) {
    if (!this.token) {
      this.token = generateRandomInteger(4);
    }
    
    this.session.sendUdpMessage(rinfo, new ControlMessage().mixin({
      command: 'invitation',
      token: this.token,
      ssrc: this.session.ssrc,
      name: this.session.bonjourName,
    }));
  }

  /**
   * Send invitation accepted message
   * @param {Object} rinfo - Remote info
   */
  sendInvitationAccepted(rinfo) {
    this.session.sendUdpMessage(rinfo, new ControlMessage().mixin({
      command: 'invitation_accepted',
      token: this.token,
      ssrc: this.session.ssrc,
      name: this.session.bonjourName,
    }));
  }

  /**
   * Send end stream message
   * @param {Function} callback - Called when message is sent
   */
  sendEndstream(callback) {
    this.session.sendUdpMessage(this.rinfo1, new ControlMessage().mixin({
      command: 'end',
      token: this.token,
      ssrc: this.session.ssrc,
      name: this.name,
    }), callback);
  }

  /**
   * Send synchronization message
   * @param {Object} incomingSyncMessage - Incoming sync message
   */
  sendSynchronization(incomingSyncMessage) {
    const now = this.session.now();
    const count = incomingSyncMessage ? incomingSyncMessage.count : -1;
    const answer = new ControlMessage();

    answer.command = 'synchronization';
    answer.timestamp1 = count !== -1 ? incomingSyncMessage.timestamp1 : Buffer.alloc(8);
    answer.timestamp2 = count !== -1 ? incomingSyncMessage.timestamp2 : Buffer.alloc(8);
    answer.timestamp3 = count !== -1 ? incomingSyncMessage.timestamp3 : Buffer.alloc(8);
    answer.count = count + 1;
    answer.ssrc = this.session.ssrc;
    answer.token = this.token;

    switch (count) {
      case -1:
        writeUInt64BE(answer.timestamp1, now);
        if (this.timeDifference) {
          writeUInt64BE(answer.timestamp2, now - this.timeDifference);
        } else {
          writeUInt64BE(answer.timestamp2, 0);
        }
        if (this.latency) {
          writeUInt64BE(answer.timestamp3, now + this.latency);
        } else {
          writeUInt64BE(answer.timestamp3, 0);
        }
        break;
        
      case 0:
        writeUInt64BE(answer.timestamp2, now);
        writeUInt64BE(answer.timestamp3, now - this.timeDifference);
        break;
        
      case 1:
        writeUInt64BE(answer.timestamp3, now);
        this.latency = readUInt64BE(incomingSyncMessage.timestamp3) - 
                      readUInt64BE(incomingSyncMessage.timestamp1);
                      
        this.timeDifference = Math.round(
          readUInt64BE(incomingSyncMessage.timestamp3) - 
          readUInt64BE(incomingSyncMessage.timestamp2)
        ) - this.latency;
        break;
        
      case 2:
        // Nothing to do for count 2
        break;
        
      default:
        // Nothing to do for other counts
        break;
    }

    // Log synchronization data for debugging
    this.logSynchronization(incomingSyncMessage, answer);

    if (answer.count < 3) {
      this.session.sendUdpMessage(this.rinfo2, answer);
    } else {
      this.sendSynchronization();
    }
  }

  /**
   * Log synchronization data
   * @param {Object} incomingSyncMessage - Incoming sync message
   * @param {Object} answer - Outgoing sync message
   */
  logSynchronization(incomingSyncMessage, answer) {
    const count = incomingSyncMessage ? incomingSyncMessage.count : -1;

    if (count === 0 || count === -1) {
      logger.debug(
        '\n', 'T', 'C', 'Timestamp 1         ', 'Timestamp 2         ',
        'Timestamp 3         ', 'Latency   ', ' Time difference     ', 'Rate ',
      );
    }
    
    if (incomingSyncMessage) {
      logger.debug(
        'I', incomingSyncMessage.count,
        pad(readUInt64BE(incomingSyncMessage.timestamp1), 20),
        pad(readUInt64BE(incomingSyncMessage.timestamp2), 20),
        pad(readUInt64BE(incomingSyncMessage.timestamp3), 20),
        pad(this.latency, 10),
        (this.timeDifference < 0 ? '-' : ' ') + pad(Math.abs(this.timeDifference || 0), 20),
        this.session.rate,
      );
    }
    
    if (answer.count < 3) {
      logger.debug(
        'O', answer.count,
        pad(readUInt64BE(answer.timestamp1), 20),
        pad(readUInt64BE(answer.timestamp2), 20),
        pad(readUInt64BE(answer.timestamp3), 20),
        pad(this.latency, 10),
        (this.timeDifference < 0 ? '-' : ' ') + pad(Math.abs(this.timeDifference || 0), 20),
        this.session.rate,
      );
    }
  }

  /**
   * Send receiver feedback message
   * @param {Function} callback - Called when message is sent
   */
  sendReceiverFeedback(callback) {
    if (this.lostSequenceNumbers.length) {
      logger.warn(`Lost packages: ${this.lostSequenceNumbers}`);
    }
    
    this.session.sendUdpMessage(this.rinfo1, new ControlMessage().mixin({
      command: 'receiver_feedback',
      ssrc: this.session.ssrc,
      sequenceNumber: this.lastReceivedSequenceNumber,
    }), callback);
  }

  /**
   * Send a MIDI message
   * @param {Object} message - MIDI message
   * @param {Function} callback - Called when message is sent
   */
  sendMessage(message, callback) {
    if (this.latency === null || this.timeDifference === null) {
      return;
    }

    this.lastSentSequenceNr = (this.lastSentSequenceNr + 1) % 0x10000;

    // Create MIDI message
    const midiMessage = new MidiMessage().mixin(message);
    midiMessage.ssrc = this.session.ssrc;
    midiMessage.sequenceNumber = this.lastSentSequenceNr;

    this.session.sendUdpMessage(this.rinfo2, midiMessage, callback);
  }

  /**
   * End the stream
   * @param {Function} callback - Called when stream is ended
   */
  end(callback) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
    }
    
    if (this.isConnected) {
      this.sendEndstream(() => {
        this.emit('disconnected', { stream: this });
        this.isConnected = false;
        if (callback) callback();
      });
    } else if (callback) {
      callback();
    }
  }

  /**
   * Get JSON representation of the stream
   * @returns {Object} Stream data
   */
  toJSON() {
    return this.rinfo1 ? {
      address: this.rinfo1.address,
      ssrc: this.ssrc,
      port: this.rinfo1.port,
      name: this.name,
    } : {};
  }
}

module.exports = Stream;