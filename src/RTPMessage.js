/*
/ * RTPMessage.js - Modernized for Node.js v23.11.0
/ * 
/ * This file implements the RTP Protocol message.
/*/

const AbstractMessage = require('./AbstractMessage');

/**
 * This represents a RTP Protocol message.
 * @extends AbstractMessage
 */
class RTPMessage extends AbstractMessage {
  /**
   * Create a new RTP message
   */
  constructor() {
    super();
    this.version = 2;
    this.padding = false;
    this.hasExtension = false;
    this.csrcCount = 0;
    this.marker = false;
    this.payloadType = 0;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = 0;
    this.payload = Buffer.alloc(0);
    this.csrcs = [];
  }

  /**
   * Parses a Buffer into this RTPMessage object
   * @param {Buffer} buffer - The buffer containing an RTP message
   * @returns {RTPMessage} this instance for chaining
   */
  parseBuffer(buffer) {
    let currentOffset;

    super.parseBuffer(buffer);
    const firstByte = buffer.readUInt8(0);

    this.version = firstByte >>> 6;
    this.padding = !!(firstByte >>> 5 & 1);
    this.hasExtension = !!((firstByte >>> 4) & 1);
    this.csrcCount = firstByte & 0xF;

    const secondByte = buffer.readUInt8(1);
    this.marker = (secondByte & 0x80) === 0x80;
    this.payloadType = secondByte & 0x7f;

    this.sequenceNumber = buffer.readUInt16BE(2);
    this.timestamp = buffer.readUInt32BE(4);
    this.ssrc = buffer.readUInt32BE(8);
    currentOffset = 12;
    
    // Parse CSRCs
    this.csrcs = [];
    for (let i = 0; i < this.csrcCount; i++) {
      this.csrcs.push(buffer.readUInt32BE(currentOffset));
      currentOffset += 4;
    }
    
    // Parse extension if present
    if (this.hasExtension) {
      this.extensionHeaderId = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
      this.extensionHeaderLength = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
      this.extension = buffer.slice(currentOffset, currentOffset += this.extensionHeaderLength / 32);
    }
    
    // Get payload
    this.payload = buffer.slice(currentOffset);

    return this;
  }

  /**
   * Generates the buffer of the message. It is then available as the .buffer property.
   * @returns {RTPMessage} this instance for chaining
   */
  generateBuffer() {
    let bufferLength = 12; // Header size
    
    // Calculate total buffer size
    const csrcLength = Math.min(this.csrcs.length, 15) * 4;
    bufferLength += csrcLength;
    
    if (this.hasExtension) {
      bufferLength += 4 + (this.extension ? this.extension.length : 0);
    }
    
    const payLoadOffset = bufferLength;
    
    if (Buffer.isBuffer(this.payload)) {
      bufferLength += this.payload.length;
    }

    // Create buffer and fill header
    const buffer = Buffer.alloc(bufferLength);

    // Create first byte with version, padding, extension, and CSRC count
    let firstByte = 0;
    firstByte |= this.version << 6;
    firstByte |= this.padding ? 0x20 : 0;
    firstByte |= this.hasExtension ? 0x10 : 0;
    firstByte |= Math.min(this.csrcs.length, 15);

    // Create second byte with marker and payload type
    const secondByte = this.payloadType | (this.marker ? 0x80 : 0);

    // Write header fields
    buffer.writeUInt8(firstByte, 0);
    buffer.writeUInt8(secondByte, 1);
    buffer.writeUInt16BE(this.sequenceNumber, 2);
    buffer.writeUInt32BE(this.timestamp, 4);
    buffer.writeUInt32BE(this.ssrc, 8);

    // Write CSRCs
    let offset = 12;
    for (let i = 0; i < this.csrcs.length && i < 15; i++) {
      buffer.writeUInt32BE(this.csrcs[i], offset);
      offset += 4;
    }

    // Write extension if present
    if (this.hasExtension && this.extension) {
      const length = Math.ceil(this.extension.length / 32);
      buffer.writeUInt16BE(this.extensionHeaderId, offset);
      buffer.writeUInt16BE(length, offset + 2);
      this.extension.copy(buffer, offset + 4);
      offset += 4 + this.extension.length;
    }

    // Write payload
    if (Buffer.isBuffer(this.payload)) {
      this.payload.copy(buffer, payLoadOffset);
    }

    this.buffer = buffer;
    return this;
  }
}

module.exports = RTPMessage;