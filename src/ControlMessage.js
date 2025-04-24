/**
 * ControlMessage.js - Modernized for Node.js v23.11.0
 * 
 * This file implements the Control Message types for RTP MIDI protocol.
 */

const AbstractMessage = require('./AbstractMessage');

// Command byte to string mapping
const byteToCommand = {
  0x494E: 'invitation',
  0x4E4F: 'invitation_rejected',
  0x4F4B: 'invitation_accepted',
  0x4259: 'end',
  0x434B: 'synchronization',
  0x5253: 'receiver_feedback',
  0x524C: 'bitrate_receive_limit',
};

// Generate reverse mapping from command string to byte
const commandToByte = (() => {
  const obj = {};
  for (const [key, value] of Object.entries(byteToCommand)) {
    obj[value] = parseInt(key, 10);
  }
  return obj;
})();

// Control message flags
const flags = {
  start: 0xFFFF,
};

/**
 * Class representing an RTP MIDI Control Message
 * @extends AbstractMessage
 */
class ControlMessage extends AbstractMessage {
  /**
   * Create a new Control Message
   */
  constructor() {
    super();
    this.name = '';
    this.isValid = true;
    this.start = flags.start;
    this.version = 2;
  }

  /**
   * Parse a buffer into this Control Message
   * @param {Buffer} buffer - The buffer to parse
   * @returns {ControlMessage} this instance for chaining
   */
  parseBuffer(buffer) {
    super.parseBuffer(buffer);
    
    this.start = buffer.readUInt16BE(0);
    if (this.start !== flags.start) {
      this.isValid = false;
      return this;
    }
    
    this.command = byteToCommand[buffer.readUInt16BE(2)];

    switch (this.command) {
      case 'invitation':
      case 'invitation_accepted':
      case 'invitation_rejected':
      case 'end':
        this.version = buffer.readUInt32BE(4);
        this.token = buffer.readUInt32BE(8);
        this.ssrc = buffer.readUInt32BE(12);
        this.name = buffer.toString('utf-8', 16);
        break;
        
      case 'synchronization':
        this.ssrc = buffer.readUInt32BE(4, 8);
        this.count = buffer.readUInt8(8);
        // eslint-disable-next-line no-bitwise
        this.padding = (buffer.readUInt8(9) << 0xF0) + buffer.readUInt16BE(10);
        this.timestamp1 = buffer.slice(12, 20);
        this.timestamp2 = buffer.slice(20, 28);
        this.timestamp3 = buffer.slice(28, 36);
        break;
        
      case 'receiver_feedback':
        this.ssrc = buffer.readUInt32BE(4, 8);
        this.sequenceNumber = buffer.readUInt16BE(8);
        break;
        
      default:
        break;
    }
    
    return this;
  }

  /**
   * Generate a buffer from this Control Message
   * @returns {ControlMessage} this instance for chaining
   */
  generateBuffer() {
    let buffer;
    const commandByte = commandToByte[this.command];

    switch (this.command) {
      case 'invitation':
      case 'invitation_accepted':
      case 'invitation_rejected':
      case 'end':
        this.name = this.name || '';
        buffer = Buffer.alloc(17 + Buffer.byteLength(this.name, 'utf8'));
        buffer.writeUInt16BE(this.start, 0);
        buffer.writeUInt16BE(commandByte, 2);
        buffer.writeUInt32BE(this.version, 4);
        buffer.writeUInt32BE(this.token, 8);
        buffer.writeUInt32BE(this.ssrc, 12);
        buffer.write(this.name, 16);
        if (this.command !== 'end') {
          buffer.writeUInt8(0, buffer.length - 1);
        }
        break;
        
      case 'synchronization':
        buffer = Buffer.alloc(36);
        buffer.writeUInt16BE(this.start, 0);
        buffer.writeUInt16BE(commandByte, 2);
        buffer.writeUInt32BE(this.ssrc, 4);
        buffer.writeUInt8(this.count, 8);
        // eslint-disable-next-line no-bitwise
        buffer.writeUInt8(this.padding >>> 0xF0, 9);
        // eslint-disable-next-line no-bitwise
        buffer.writeUInt16BE(this.padding & 0x00FFFF, 10);

        this.timestamp1.copy(buffer, 12);
        this.timestamp2.copy(buffer, 20);
        this.timestamp3.copy(buffer, 28);
        break;
        
      case 'receiver_feedback':
        buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(this.start, 0);
        buffer.writeUInt16BE(commandByte, 2);
        buffer.writeUInt32BE(this.ssrc, 4);
        buffer.writeUInt16BE(this.sequenceNumber, 8);
        break;
        
      default:
        buffer = Buffer.alloc(0);
        break;
    }
    
    this.buffer = buffer;
    return this;
  }
}

module.exports = ControlMessage;