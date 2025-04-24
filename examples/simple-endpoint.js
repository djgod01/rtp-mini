const rtpmidi = require('../index')

// rtpmidi.logger.setLogger(console)
rtpmidi.logger.level = 'debug'

const session = rtpmidi.manager.createSession({
  localName: 'Session 1',
  bonjourName: 'RTP MIDI Nodejs Endpoint Test',
  port: 5004,
  // ipVersion: 6,
}).on('message', (deltaTime, message) => {
  // message is a Buffer so we convert it to an array to pass it to the midi output.
  const commands = Array.prototype.slice.call(message, 0);
  console.log('received a network message', { deltaTime, message });
})

const session6 = rtpmidi.manager.createSession({
  localName: 'Session 1',
  bonjourName: 'RTP MIDI Nodejs Endpoint Test',
  port: 5004,
  published: false,
  ipVersion: 6,
}).on('message', (deltaTime, message) => {
  // message is a Buffer so we convert it to an array to pass it to the midi output.
  const commands = Array.prototype.slice.call(message, 0);
  console.log('received a network message', { deltaTime, message });
})
