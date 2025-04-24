/**
 * logger.js - Modernized for Node.js v23.11.0
 * 
 * A simple logging utility for the RTP MIDI library that can be 
 * set to different verbosity levels.
 */

/**
 * A dummy logger that does nothing
 */
const dummyLogger = {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  verbose: () => {},
  debug: () => {},
};

// Default to dummy logger
let _logger = dummyLogger;

/**
 * Log levels
 * @enum {number}
 */
const LogLevels = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  VERBOSE: 5
};

/**
 * The logger object
 * @type {Object}
 */
const logger = {
  /**
   * Current log level
   * @type {number}
   */
  level: LogLevels.NONE,
  
  /**
   * Log levels enum
   */
  LogLevels,
  
  /**
   * Log at any level
   * @param {...*} args - Arguments to log
   */
  log: (...args) => _logger.log(...args),
  
  /**
   * Log at info level
   * @param {...*} args - Arguments to log
   */
  info: (...args) => {
    if (logger.level >= LogLevels.INFO) {
      _logger.info(...args);
    }
  },
  
  /**
   * Log at warn level
   * @param {...*} args - Arguments to log
   */
  warn: (...args) => {
    if (logger.level >= LogLevels.WARN) {
      _logger.warn(...args);
    }
  },
  
  /**
   * Log at error level
   * @param {...*} args - Arguments to log
   */
  error: (...args) => {
    if (logger.level >= LogLevels.ERROR) {
      _logger.error(...args);
    }
  },
  
  /**
   * Log at verbose level
   * @param {...*} args - Arguments to log
   */
  verbose: (...args) => {
    if (logger.level >= LogLevels.VERBOSE) {
      _logger.debug(...args);
    }
  },
  
  /**
   * Log at debug level
   * @param {...*} args - Arguments to log
   */
  debug: (...args) => {
    if (logger.level >= LogLevels.DEBUG) {
      _logger.debug(...args);
    }
  },
  
  /**
   * Set the logger implementation
   * @param {Object} logger - Logger implementation
   */
  setLogger: (logger) => {
    _logger = logger;
  },
  
  /**
   * The dummy logger that does nothing
   */
  dummyLogger,
};

module.exports = logger;