/**
 * MidiMessage.js - Modernized for Node.js v23.11.0
 * 
 * This file implements the MIDI message handling for RTP MIDI protocol.
 */

const midiCommon = require('midi-common');
const logger = require('./logger');
const RTPMessage = require('./RTPMessage');

// Flag constants
const FLAG_MASK_DELTA_TIME_BYTE = 0x7f;
const FLAG_MASK_LENGTH_IN_FIRST_BYTE = 0x0f;
const FLAG_DELTA_TIME_HAS_NEXT = 0x80;
const FLAG_BIG_LENGTH = 0x80;
const FLAG_HAS_JOURNAL = 0x40;
const FLAG_FIRST_HAS_DELTA_TIME = 0x20;
const FLAG_P = 0x10;

/**
 * Get expected data length for a MIDI command
 * @param {number} command - MIDI command byte
 * @returns {number} Expected data length
 */
function getDataLength(command) {
  // eslint-disable-next-line no-bitwise
  const type = (midiCommon.commands[command] || midiCommon.commands[command & 0xf0]);
  return type ? type.dataLength || 0 : 0;
}

/**
 * Class representing an RTP MIDI Message
 * @extends RTPMessage
 */
class MidiMessage extends RTPMessage {
  /**
   * Create a new MIDI Message
   */
  constructor() {
    super();
    this.bigLength = false;
    this.hasJournal = false;
    this.firstHasDeltaTime = false;
    this.p = false;
    this.commands = [];
    this.isValid = true;
    this.payloadType = 0x61;
  }

  /**
   * Parse a buffer into this MIDI Message
   * @param {Buffer} buffer - The buffer to parse
   * @returns {MidiMessage} this instance for chaining
   */
  parseBuffer(buffer) {
    super.parseBuffer(buffer);

    const { payload } = this;
    if (!payload || payload.length === 0) {
      this.isValid = false;
      return this;
    }
    
    const firstByte = payload.readUInt8(0);
    let offset;
    let statusByte;
    let lastStatusByte = null;
    let hasOwnStatusByte;
    let dataLength;

    // eslint-disable-next-line no-bitwise
    this.bigLength = !!(firstByte & FLAG_BIG_LENGTH);
    // eslint-disable-next-line no-bitwise
    this.hasJournal = !!(firstByte & FLAG_HAS_JOURNAL);
    // eslint-disable-next-line no-bitwise
    this.firstHasDeltaTime = !!(firstByte & FLAG_FIRST_HAS_DELTA_TIME);
    // eslint-disable-next-line no-bitwise
    this.p = !!(firstByte & FLAG_P);

    // eslint-disable-next-line no-bitwise
    this.length = (firstByte & FLAG_MASK_LENGTH_IN_FIRST_BYTE);

    if (this.bigLength) {
      this.length = (this.length << 8) + payload.readUInt8(1);
    }

    // Read the command section
    const commandStartOffset = this.bigLength ? 2 : 1;
    offset = commandStartOffset;

    while (offset < this.length + commandStartOffset - 1) {
      const command = {};
      let deltaTime = 0;

      // Decode the delta time
      if (this.commands.length || this.firstHasDeltaTime) {
        for (let k = 0; k < 4; k++) {
          const currentOctet = payload.readUInt8(offset);

          deltaTime <<= 7;
          // eslint-disable-next-line no-bitwise
          deltaTime |= currentOctet & FLAG_MASK_DELTA_TIME_BYTE;
          offset += 1;
          
          // eslint-disable-next-line no-bitwise
          if (!(currentOctet & FLAG_DELTA_TIME_HAS_NEXT)) {
            break;
          }
        }
      }
      command.deltaTime = deltaTime;

      statusByte = payload.readUInt8(offset);
      // eslint-disable-next-line no-bitwise
      hasOwnStatusByte = (statusByte & 0x80) === 0x80;
      if (hasOwnStatusByte) {
        lastStatusByte = statusByte;
        offset += 1;
      } else if (lastStatusByte) {
        statusByte = lastStatusByte;
      }

      // Parse SysEx
      if (statusByte === 0xf0) {
        dataLength = 0;
        while (payload.length > offset + dataLength
          // eslint-disable-next-line no-bitwise
          && !(payload.readUInt8(offset + dataLength) & 0x80)) {
          dataLength += 1;
        }
        if (payload.readUInt8(offset + dataLength) !== 0xf7) {
          dataLength -= 1;
        }

        dataLength += 1;
      } else {
        dataLength = getDataLength(statusByte);
      }
      
      command.data = Buffer.alloc(1 + dataLength);
      command.data[0] = statusByte;
      
      if (payload.length < offset + dataLength) {
        this.isValid = false;
        return this;
      }
      
      if (dataLength) {
        payload.copy(command.data, 1, offset, offset + dataLength);
        offset += dataLength;
      }
      
      if (!(command.data[0] === 0xf0 && command.data[command.data.length - 1] !== 0xf7)) {
        this.commands.push(command);
      } else {
        return this;
      }
    }
    
    if (this.hasJournal) {
      this.journalOffset = offset;
      this.journal = this.parseJournal();
    }
    
    return this;
  }

  /**
   * Parse a journal from the MIDI message
   * @returns {Object} Parsed journal
   */
  parseJournal() {
    let offset = this.journalOffset;
    const { payload } = this;
    let presentChapters;

    const journal = {};
    const journalHeader = payload[offset];

    // eslint-disable-next-line no-bitwise
    journal.singlePacketLoss = !!(journalHeader & 0x80);
    // eslint-disable-next-line no-bitwise
    journal.hasSystemJournal = !!(journalHeader & 0x40);
    // eslint-disable-next-line no-bitwise
    journal.hasChannelJournal = !!(journalHeader & 0x20);
    // eslint-disable-next-line no-bitwise
    journal.enhancedEncoding = !!(journalHeader & 0x10);

    journal.checkPointPacketSequenceNumber = payload.readUInt16BE(offset + 1);
    journal.channelJournals = [];

    offset += 3;

    if (journal.hasSystemJournal) {
      const systemJournal = {};
      journal.systemJournal = systemJournal;
      presentChapters = {};
      systemJournal.presentChapters = presentChapters;
      
      // eslint-disable-next-line no-bitwise
      presentChapters.S = !!(payload[offset] & 0x80);
      // eslint-disable-next-line no-bitwise
      presentChapters.D = !!(payload[offset] & 0x40);
      // eslint-disable-next-line no-bitwise
      presentChapters.V = !!(payload[offset] & 0x20);
      // eslint-disable-next-line no-bitwise
      presentChapters.Q = !!(payload[offset] & 0x10);
      // eslint-disable-next-line no-bitwise
      presentChapters.F = !!(payload[offset] & 0x08);
      // eslint-disable-next-line no-bitwise
      presentChapters.X = !!(payload[offset] & 0x04);
      
      // eslint-disable-next-line no-bitwise
      systemJournal.length = ((payload[offset] & 0x3) << 8) | payload[offset + 1];
      offset += systemJournal.length;
    }

    if (journal.hasChannelJournal) {
      let channel = 0;
      let channelJournal;

      // eslint-disable-next-line no-bitwise
      journal.totalChannels = (journalHeader & 0x0f) + 1;
      
      while (channel < journal.totalChannels && offset < payload.length) {
        channelJournal = {};
        // eslint-disable-next-line no-bitwise
        channelJournal.channel = (payload[offset] >> 3) & 0x0f;
        // eslint-disable-next-line no-bitwise
        channelJournal.s = !!(payload[offset] & 0x80);
        // eslint-disable-next-line no-bitwise
        channelJournal.h = !!(payload[offset] & 0x01);
        // eslint-disable-next-line no-bitwise
        channelJournal.length = ((payload[offset] & 0x3) << 8) | payload[offset + 1];
        
        presentChapters = {};
        channelJournal.presentChapters = presentChapters;
        
        // eslint-disable-next-line no-bitwise
        presentChapters.P = !!(payload[offset + 2] & 0x80);
        // eslint-disable-next-line no-bitwise
        presentChapters.C = !!(payload[offset + 2] & 0x40);
        // eslint-disable-next-line no-bitwise
        presentChapters.M = !!(payload[offset + 2] & 0x20);
        // eslint-disable-next-line no-bitwise
        presentChapters.W = !!(payload[offset + 2] & 0x10);
        // eslint-disable-next-line no-bitwise
        presentChapters.N = !!(payload[offset + 2] & 0x08);
        // eslint-disable-next-line no-bitwise
        presentChapters.E = !!(payload[offset + 2] & 0x04);
        // eslint-disable-next-line no-bitwise
        presentChapters.T = !!(payload[offset + 2] & 0x02);
        // eslint-disable-next-line no-bitwise
        presentChapters.A = !!(payload[offset + 2] & 0x01);

        offset += channelJournal.length;
        journal.channelJournals.push(channelJournal);
        channel += 1;
      }
    }
    
    return journal;
  }

  /**
   * Generate a buffer from this MIDI Message
   * @returns {MidiMessage} this instance for chaining
   */
  generateBuffer() {
    let payloadLength = 1;
    let payloadOffset = 0;
    let command;
    let commandData;
    let commandDataLength;
    let commandDeltaTime;
    let commandStatusByte = null;
    let expectedDataLength;
    let lastStatusByte;
    let bitmask;

    this.firstHasDeltaTime = true;

    // Calculate command lengths and overall payload length
    for (let i = 0; i < this.commands.length; i++) {
      command = this.commands[i];
      command._length = 0;
      commandData = command.data;
      commandDataLength = commandData.length;

      // Check if first command needs delta time
      if (i === 0 && command.deltaTime === 0) {
        this.firstHasDeltaTime = false;
      } else {
        commandDeltaTime = Math.round(command.deltaTime);

        // Calculate delta time bytes needed
        if (commandDeltaTime >= 0x7f7f7f) {
          command._length += 1;
        }
        if (commandDeltaTime >= 0x7f7f) {
          command._length += 1;
        }
        if (commandDeltaTime >= 0x7f) {
          command._length += 1;
        }
        command._length += 1;
      }
      
      commandStatusByte = command.data[0];

      // Calculate data length
      if (commandStatusByte === 0xf0) {
        expectedDataLength = 0;
        while (expectedDataLength + 1 < commandDataLength
          && command.data[expectedDataLength] !== 0xf7) {
          expectedDataLength += 1;
        }
      } else {
        expectedDataLength = getDataLength(commandStatusByte);
      }

      // Validate command data
      if (expectedDataLength + 1 !== commandDataLength) {
        command._length = 0;
      } else {
        command._length += expectedDataLength;
        if (commandStatusByte !== lastStatusByte) {
          command._hasOwnStatusByte = true;
          lastStatusByte = commandStatusByte;
          command._length += 1;
        } else {
          command._hasOwnStatusByte = false;
        }
        payloadLength += command._length;
      }
    }
    
    const length = payloadLength - 1;
    this.bigLength = length > 15;

    if (this.bigLength) {
      payloadLength += 1;
    }

    // Create payload buffer
    const payload = Buffer.alloc(payloadLength);

    // Create header bitmask
    bitmask = 0;
    // eslint-disable-next-line no-bitwise
    bitmask |= this.hasJournal ? FLAG_HAS_JOURNAL : 0;
    // eslint-disable-next-line no-bitwise
    bitmask |= this.firstHasDeltaTime ? FLAG_FIRST_HAS_DELTA_TIME : 0;
    // eslint-disable-next-line no-bitwise
    bitmask |= this.p ? FLAG_P : 0;

    if (this.bigLength) {
      // eslint-disable-next-line no-bitwise
      bitmask |= FLAG_BIG_LENGTH;
      // eslint-disable-next-line no-bitwise
      bitmask |= 0x0f & (length >> 8);
      payload[1] = 0xff & (length);
      payloadOffset += 1;
    } else {
      // eslint-disable-next-line no-bitwise
      bitmask |= 0x0f & (length);
    }

    payload[0] = bitmask;
    payloadOffset += 1;

    // Generate command data
    for (let i = 0; i < this.commands.length; i++) {
      command = this.commands[i];

      if (command._length > 0) {
        // Include delta time if needed
        if (i > 0 || this.firstHasDeltaTime) {
          commandDeltaTime = Math.round(command.deltaTime);

          if (commandDeltaTime >= 0x7f7f7f) {
            payloadOffset += 1;
            // eslint-disable-next-line no-bitwise
            payload.writeUInt8(0x80 | (0x7f & (commandDeltaTime >> 21)), payloadOffset);
          }
          if (commandDeltaTime >= 0x7f7f) {
            payloadOffset += 1;
            // eslint-disable-next-line no-bitwise
            payload.writeUInt8(0x80 | (0x7f & (commandDeltaTime >> 14)), payloadOffset);
          }
          if (commandDeltaTime >= 0x7f) {
            payloadOffset += 1;
            // eslint-disable-next-line no-bitwise
            payload.writeUInt8(0x80 | (0x7f & (commandDeltaTime >> 7)), payloadOffset);
          }
          payloadOffset += 1;
          // eslint-disable-next-line no-bitwise
          payload.writeUInt8(0x7f & commandDeltaTime, payloadOffset);
        }

        commandData = command.data;
        commandDataLength = commandData.length;

        // Write command data
        const startIndex = command._hasOwnStatusByte ? 0 : 1;
        for (let k = startIndex; k < commandDataLength; k++) {
          payload[++payloadOffset] = commandData[k];
        }
      } else {
        logger.warn('Ignoring invalid command');
      }
    }

    this.payload = payload;
    super.generateBuffer();
    return this;
  }

  /**
   * Convert the message to a JSON representation
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      commands: this.commands.map(command => ({
        deltaTime: command.deltaTime,
        data: Array.from(command.data),
      })),
    };
  }
}

module.exports = MidiMessage;