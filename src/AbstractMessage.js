/**
 * AbstractMessage.js - Modernized for Node.js v23.11.0
 * 
 * A base class for protocol messages.
 */

/**
 * AbstractMessage represents a basic protocol message interface
 * that all message types inherit from.
 */
class AbstractMessage {
  /**
   * Create a new AbstractMessage
   */
  constructor() {
    this.isMessage = true;
    this.isValid = true;
    this.buffer = Buffer.alloc(0);
  }
  
  /**
   * Copies properties from another object to this message
   *
   * @param {Object} data - Properties to copy
   * @returns {AbstractMessage} this instance for chaining
   */
  mixin(data) {
    // Using Object.assign instead of manual property iteration
    Object.assign(this, data);
    return this;
  }
  
  /**
   * Parse a buffer into this message object
   *
   * @param {Buffer} buffer - The buffer to parse
   * @returns {AbstractMessage} this instance for chaining
   */
  parseBuffer(buffer) {
    this.buffer = buffer;
    return this;
  }
  
  /**
   * Generate a buffer representation of this message
   * 
   * @returns {AbstractMessage} this instance for chaining
   */
  generateBuffer() {
    // This is a base method to be overridden
    return this;
  }
}

module.exports = AbstractMessage;