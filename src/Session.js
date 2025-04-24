/**
 * Session.js - Modernized for Node.js v23.11.0
 * 
 * This file implements the RTP MIDI Session functionality
 * with modern JavaScript patterns and Node.js APIs.
 */

const { EventEmitter } = require('events');
const dgram = require('dgram');
const ControlMessage = require('./ControlMessage');
const MidiMessage = require('./MidiMessage');
const MdnsService = require('./mdns');
const logger = require('./logger');
const Stream = require('./Stream');

/**
 * Represents an RTP MIDI session
 */
class Session extends EventEmitter {
  /**
   * Create a new RTP MIDI session
   * 
   * @param {number} port - Port number to use
   * @param {string} localName - Name of the local session
   * @param {string} bonjourName - Bonjour service name
   * @param {number} ssrc - Session identifier
   * @param {boolean} published - Whether to publish via mDNS
   * @param {number} ipVersion - IP version (4 or 6)
   */
  constructor(port, localName, bonjourName, ssrc, published, ipVersion) {
    super();
    
    // RTP related
    this.streams = [];
    this.localName = localName;
    this.bonjourName = bonjourName;
    this.port = port || 5004;
    this.ssrc = ssrc || Math.round(Math.random() * (2 ** (8 * 4)));
    this.readyState = 0;
    this.published = !!published;
    
    // State
    this.bundle = true;
    this.queue = [];
    this.flushQueued = false;
    this.lastFlush = 0;
    this.lastMessageTime = 0;
    
    // IPV
    this.ipVersion = ipVersion === 6 ? 6 : 4;
    
    // Bind methods
    this.streamConnected = this.streamConnected.bind(this);
    this.streamDisconnected = this.streamDisconnected.bind(this);
    this.deliverMessage = this.deliverMessage.bind(this);
    
    // Socket handling
    this.controlChannel = dgram.createSocket({
      type: `udp${this.ipVersion}`,
      reuseAddr: true, // Note: This should be reuseAddress in newer Node.js but keeping for compatibility
    });
    
    this.controlChannel.on('message', this.handleMessage.bind(this));
    this.controlChannel.on('listening', this.listening.bind(this));
    this.controlChannel.on('error', (err) => this.emit('error', err));
    
    this.messageChannel = dgram.createSocket({
      type: `udp${this.ipVersion}`,
      reuseAddr: true, // Same note as above
    });
    
    this.messageChannel.on('message', this.handleMessage.bind(this));
    this.messageChannel.on('listening', this.listening.bind(this));
    this.messageChannel.on('error', (err) => this.emit('error', err));
    
    // Message delivery Rate
    this.rate = 10000;
    
    // Start timing
    this.startTime = Date.now() / 1000 * this.rate;
    this.startTimeHr = process.hrtime();
  }

  /**
   * Start the session
   */
  start() {
    if (this.published) {
      this.on('ready', () => this.publish());
    }
    
    // Check if socket is already bound to avoid rebinding errors
    if (!this._isControlChannelBound()) {
      const bindAddress = this.ipVersion === 4 ? '0.0.0.0' : '::';
      this.controlChannel.bind(this.port, bindAddress);
      this.messageChannel.bind(this.port + 1, bindAddress);
    }
  }

  /**
   * Check if control channel is already bound
   * @private
   * @returns {boolean}
   */
  _isControlChannelBound() {
    try {
      return this.controlChannel.address() !== null;
    } catch (err) {
      return false;
    }
  }

  /**
   * End the session
   * @param {Function} callback - Called when session is ended
   */
  end(callback) {
    let i = -1;
    
    const onClose = () => {
      this.readyState -= 1;
      if (this.readyState <= 0 && callback) {
        callback();
      }
    };
    
    const next = () => {
      i += 1;
      const stream = this.streams[i];
      if (stream) {
        stream.end(next);
      } else {
        this.unpublish();

        this.controlChannel.once('close', onClose);
        this.messageChannel.once('close', onClose);

        // Close the sockets
        try {
          this.controlChannel.close();
          this.messageChannel.close();
        } catch (err) {
          logger.error('Error closing socket:', err);
        }
        
        this.published = false;
      }
    };

    if (this.readyState === 2) {
      next();
    } else if (callback) {
      callback();
    }
  }

  /**
   * Get current timestamp
   * @returns {number}
   */
  now() {
    const hrtime = process.hrtime(this.startTimeHr);
    return Math.round(
      ((hrtime[0] + hrtime[1] / 1000 / 1000 / 1000)) * this.rate,
    ) % 0xffffffff;
  }

  /**
   * Called when a socket starts listening
   * @private
   */
  listening() {
    this.readyState += 1;
    if (this.readyState === 2) {
      this.emit('ready');
    }
  }

  /**
   * Handle incoming UDP messages
   * @param {Buffer} message - Message data
   * @param {Object} rinfo - Remote info
   */
  handleMessage(message, rinfo) {
    logger.debug('Incoming Message = ', message);
    
    // Try to parse as Control Message first
    const appleMidiMessage = new ControlMessage().parseBuffer(message);
    let stream;
    
    if (appleMidiMessage.isValid) {
      // Find related stream if it exists
      stream = this.streams.find(
        streamItem => (streamItem.ssrc === appleMidiMessage.ssrc) || 
                     (streamItem.token === appleMidiMessage.token)
      );
      
      this.emit('controlMessage', appleMidiMessage);

      if (!stream && appleMidiMessage.command === 'invitation') {
        // New connection invitation
        stream = new Stream(this);
        stream.handleControlMessage(appleMidiMessage, rinfo);
        this.addStream(stream);
      } else if (stream) {
        // Forward to existing stream
        stream.handleControlMessage(appleMidiMessage, rinfo);
      }
    } else {
      // Try to parse as MIDI Message
      const rtpMidiMessage = new MidiMessage().parseBuffer(message);
      if (!rtpMidiMessage) {
        return;
      }
      
      stream = this.streams.find(
        streamItem => streamItem.ssrc === rtpMidiMessage.ssrc
      );
      
      if (stream) {
        stream.handleMidiMessage(rtpMidiMessage);
      }
      
      this.emit('midi', rtpMidiMessage);
    }
  }

  /**
   * Send a UDP message
   * @param {Object} rinfo - Remote info
   * @param {Object} message - Message object
   * @param {Function} callback - Called when message is sent
   */
  sendUdpMessage(rinfo, message, callback) {
    message.generateBuffer();

    if (message.isValid) {
      try {
        const channel = (rinfo.port % 2 === 0) ? 
                        this.controlChannel : 
                        this.messageChannel;
        
        channel.send(
          message.buffer,
          0,
          message.buffer.length,
          rinfo.port, 
          rinfo.address,
          () => {
            logger.debug('Outgoing Message = ', message.buffer, rinfo.port, rinfo.address);
            if (callback) callback();
          }
        );
      } catch (error) {
        logger.error(error);
      }
    } else {
      logger.warn('Ignoring invalid message', message);
    }
  }

  /**
   * Queue a flush operation
   */
  queueFlush() {
    if (this.bundle) {
      if (!this.flushQueued) {
        this.flushQueued = true;
        setImmediate(this.flushQueue.bind(this));
      }
    } else {
      this.flushQueue();
    }
  }

  /**
   * Flush message queue
   */
  flushQueue() {
    const streams = this.getStreams();
    const queue = this.queue.slice(0);
    const now = this.now();

    this.queue.length = 0;
    this.flushQueued = false;

    if (queue.length === 0) return;

    queue.sort((a, b) => (a.comexTime - b.comexTime));

    let messageTime = queue[0].comexTime;

    if (messageTime > now) {
      messageTime = now;
    }

    queue.forEach((message) => {
      // Calculate delta time
      message.deltaTime = message.comexTime - messageTime;
    });

    const message = {
      timestamp: now,
      commands: queue,
    };

    for (const stream of streams) {
      stream.sendMessage(message);
    }
  }

  /**
   * Send a MIDI message
   * @param {number|Buffer} comexTimeOrCommand - Timestamp or command data
   * @param {Buffer} [command] - Command data if first arg is timestamp
   */
  sendMessage(comexTimeOrCommand, command) {
    let cTime, cmd;

    if (arguments.length === 1) {
      cTime = this.now();
      cmd = comexTimeOrCommand;
    } else {
      cTime = comexTimeOrCommand - this.startTime;
      cmd = command;
    }

    if (!Buffer.isBuffer(cmd)) {
      cmd = Buffer.from(cmd);
    }

    this.queue.push({ comexTime: cTime, data: cmd });
    this.queueFlush();
  }

  /**
   * Connect to a remote session
   * @param {Object} rinfo - Remote info
   */
  connect(rinfo) {
    const stream = new Stream(this);
    const info = {
      address: (this.ipVersion === 6 && rinfo.addressV6) ? rinfo.addressV6 : rinfo.address,
      port: rinfo.port,
    };

    this.addStream(stream);
    stream.connect(info);
  }

  /**
   * Handle stream connected event
   * @param {Object} event - Event data
   */
  streamConnected(event) {
    this.emit('streamAdded', {
      stream: event.stream,
    });
  }

  /**
   * Handle stream disconnected event
   * @param {Object} event - Event data
   */
  streamDisconnected(event) {
    this.removeStream(event.stream);
    this.emit('streamRemoved', {
      stream: event.stream,
    });
  }

  /**
   * Add a stream to the session
   * @param {Stream} stream - Stream to add
   */
  addStream(stream) {
    stream.on('connected', this.streamConnected);
    stream.on('disconnected', this.streamDisconnected);
    stream.on('message', this.deliverMessage);
    this.streams.push(stream);
  }

  /**
   * Remove a stream from the session
   * @param {Stream} stream - Stream to remove
   */
  removeStream(stream) {
    stream.removeListener('connected', this.streamConnected);
    stream.removeListener('disconnected', this.streamDisconnected);
    stream.removeListener('message', this.deliverMessage);
    
    const index = this.streams.indexOf(stream);
    if (index !== -1) {
      this.streams.splice(index, 1);
    }
  }

  /**
   * Deliver a message to listeners
   * @param {number} comexTime - Timestamp
   * @param {Buffer} message - Message data
   */
  deliverMessage(comexTime, message) {
    this.lastMessageTime = this.lastMessageTime || comexTime;
    const deltaTime = comexTime - this.lastMessageTime;
    this.lastMessageTime = comexTime;
    this.emit('message', deltaTime / this.rate, message, comexTime + this.startTime);
  }

  /**
   * Get connected streams
   * @returns {Array} Connected streams
   */
  getStreams() {
    return this.streams.filter(item => item.isConnected);
  }

  /**
   * Get a stream by SSRC
   * @param {number} ssrc - SSRC to find
   * @returns {Stream|null} Found stream or null
   */
  getStream(ssrc) {
    return this.streams.find(stream => stream.ssrc === ssrc) || null;
  }

  /**
   * Publish the session via mDNS
   */
  publish() {
    MdnsService.publish(this);
  }

  /**
   * Unpublish the session from mDNS
   */
  unpublish() {
    MdnsService.unpublish(this);
  }

  /**
   * Get JSON representation of the session
   * @param {boolean} includeStreams - Whether to include streams
   * @returns {Object} Session data
   */
  toJSON(includeStreams) {
    return {
      bonjourName: this.bonjourName,
      localName: this.localName,
      ssrc: this.ssrc,
      port: this.port,
      published: this.published,
      activated: this.readyState >= 2,
      streams: includeStreams ? this.getStreams().map(stream => stream.toJSON()) : undefined,
    };
  }
}

module.exports = Session;