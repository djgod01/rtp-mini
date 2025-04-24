/**
 * MTC.js - Modernized for Node.js v23.11.0
 * 
 * MIDI Time Code implementation for RTP MIDI.
 */

const { EventEmitter } = require('events');

/**
 * Class representing MIDI Time Code
 * @extends EventEmitter
 */
class MTC extends EventEmitter {
  /**
   * Create a new MTC instance
   */
  constructor() {
    super();
    this.hours = 0;
    this.minutes = 0;
    this.seconds = 0;
    this.frames = 0;
    this.type = 0;
    this.songPosition = 0;
  }

  /**
   * Set the MIDI source for time code messages
   * @param {Object} sessionOrStream - Session or stream to listen to
   */
  setSource(sessionOrStream) {
    sessionOrStream.on('message', (deltaTime, message) => {
      if (message[0] === 0xf1) {
        // Quarter frame message
        this.applyQuarterTime(message);
      } else if (
        message[0] === 0xf0 &&
        message[1] === 0x7f &&
        message[3] === 0x01 &&
        message[4] === 0x01
      ) {
        // Full frame message
        this.applyFullTime(message);
      } else if (message[0] === 0xf2) {
        // Song position pointer
        this.applySongPosition(message);
      }
    });
  }

  /**
   * Apply song position message
   * @param {Buffer} message - MIDI message
   */
  applySongPosition(message) {
    const before = this.songPosition;
    
    // Convert bytes to song position
    this.songPosition = message[2];
    this.songPosition <<= 7;
    this.songPosition |= message[1];
    
    if (this.songPosition !== before) {
      this.emit('change');
    }
  }

  /**
   * Apply full time code message
   * @param {Buffer} message - MIDI message
   */
  applyFullTime(message) {
    const originalString = this.toString();

    // Extract type and time values
    this.type = (message[5] >> 5) & 0x3;
    this.hours = message[5] & 0x1f;
    this.minutes = message[6];
    this.seconds = message[7];
    this.frames = message[8];

    if (this.toString() !== originalString) {
      this.emit('change');
    }
  }

  /**
   * Build the MTC timestamp from quarter time commands
   * @param {Buffer} message - MIDI message
   */
  applyQuarterTime(message) {
    const quarterTime = message[1];
    const type = (quarterTime >> 4) & 0x7;
    let nibble = quarterTime & 0x0f;
    let operator;

    if (type % 2 === 0) {
      // Low nibble
      operator = 0xf0;
    } else {
      // High nibble
      nibble <<= 4;
      operator = 0x0f;
    }

    switch (type) {
      case 0:
      case 1:
        this.frames = this.frames & operator | nibble;
        break;
      case 2:
      case 3:
        this.seconds = this.seconds & operator | nibble;
        break;
      case 4:
      case 5:
        this.minutes = this.minutes & operator | nibble;
        break;
      case 6:
        this.hours = this.hours & operator | nibble;
        break;
      case 7:
        this.type = (nibble >> 5) & 0x3;
        nibble &= 0x10;
        this.hours = this.hours & operator | nibble;
        this.emit('change');
        break;
      default:
        break;
    }
  }

  /**
   * Convert a number to a zero-padded string
   * @param {number} number - Number to pad
   * @returns {string} Padded number
   */
  pad(number) {
    return number < 10 ? `0${number}` : number.toString();
  }

  /**
   * Get SMPTE time code string representation
   * @returns {string} Formatted time code
   */
  getSMTPEString() {
    return `${this.pad(this.hours)}:${this.pad(this.minutes)}:${this.pad(this.seconds)}:${this.pad(this.frames)}`;
  }

  /**
   * Get string representation
   * @returns {string} Formatted time code
   */
  toString() {
    return this.getSMTPEString();
  }
}

module.exports = MTC;