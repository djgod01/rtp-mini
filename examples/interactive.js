const rtpmidi = require('..');

const w = console.log.bind(console);

let mode = 'main';

let sessionConfiguration = null;

const sessionConfigurationDefaults = { name: 'MySession', bonjourName: 'Node RTP Midi', port: 5008 };

const sessionProperties = ['name', 'bonjourName', 'port'];

let sessionProperty;

let session = null,sessionToRemote;

const stdin = process.openStdin();

stdin.setRawMode(true);

stdin.resume();
stdin.setEncoding('utf8');

rtpmidi.manager.startDiscovery();

main();

// on any data into stdin
stdin.on('data', (key) => {
  if (key == '\u0003') {
    rtpmidi.manager.reset(() => {
      process.exit();
    });
  }

  switch (mode) {
    case 'main':
      switch (key) {
        case 'c':
          if (!session) {
            return w('Select a local session first');
          }
          session.connect({ address: '127.0.0.1', port: 5004 });
          break;
        case 's':
          mode = 'newSession';
          sessionConfiguration = {};
          sessionProperty = 0;
          newSession(null);
          break;
        case 'h':
          main();
          break;
        case 'n':
          if (!sessionToRemote) {
            main();
            return w('Select a local session first');
          }
          w('Sending a Message...');
          sessionToRemote.sendMessage([144, 60, 127]);
          setTimeout(function(){
            sessionToRemote.sendMessage([ 128, 60, 47 ]);
          },1000)
          break;
        case 'd':
          if (!session) {
            main();
            return w('Select a local session first');
          }
          rtpmidi.logger.level = !rtpmidi.logger.level;
          w(`Debug mode is ${session.debug ? 'on' : 'off'}.`);
          main();
          break;
        case 'l':
          listSessions();
          break;
        case 'r':
          listRemoteSessions();
          break;
      }
      break;
    case 'remote':
      var integer = parseInt(key, 10);
      var sessionInfo = rtpmidi.manager.getRemoteSessions()[integer];
      if (sessionInfo) {
        w('Connecting...');

        sessionToRemote = rtpmidi.manager.createSession({
          // localName: 'Session 1',
          // bonjourName: 'Node RTPMidi',
          // port: 5008,
        });

        sessionToRemote.on('message', (deltaTime, message) => {
          // message is a Buffer so we convert it to an array to pass it to the midi output.
          const commands = Array.prototype.slice.call(message, 0);
          console.log('received a network message', commands);
          //output.sendMessage(commands);
        });
        sessionToRemote.on('streamRemoved', (event) => {
          w(`Stream removed ${event.stream.name}`);
          sessionToRemote.unpublish();
          rtpmidi.manager.removeSession(sessionToRemote);


        });

        sessionToRemote.connect(sessionInfo);
      }
      main();
      break;
    case 'sessions':
      var integer = parseInt(key, 10);
      session = rtpmidi.manager.getSessions()[integer];
      if (session) {
        w(`Selected session ${integer}`);
      }
      main();
      break;
    case 'newSession':
      newSession(key);
      break;
  }
});

function main() {
  mode = 'main';
  w('Commands: ');
  w('h: Print this help message');
  w('s: Create a new local session');
  w('c: connect to 127.0.0.1:5004');
  w('d: Toggle debug mode.');
  w('n: send a test note to all streams');
  w('l: List the local sessions.');
  w('r: List the available remote sessions.');
}

function listRemoteSessions() {
  const allSession = rtpmidi.manager.getRemoteSessions();
  if(!allSession.length){
    w('No Remote sessions \n');
    main();
    return;
  }

  w('Remote sessions: \n');
  w(allSession.map((session, index) => `${index}: ${session.name} (Hostname: ${session.host} Address: ${session.address} Port: ${session.port})`).join('\n'));

  // if (!session) {
  //   main();
  //   return w('To connect to a remote session select a local session first ');
  // }
  mode = 'remote';
  w('Press the index number to connect to a session or any other key to go back to main menu.');
}

function listSessions() {
  const allSession = rtpmidi.manager.getSessions();
  if(!allSession.length){
    w('No Local sessions \n');
    main();
    return;
  }
  w('Local sessions: \n');
  w(allSession.map((session, index) => `${index}: ${session.name} (Bonjour name: ${session.bonjourName} Address: ${session.address} Port: ${session.port})`).join('\n'));
  w('Press the index number to select a session or any other key to go back to main menu.');
  mode = 'sessions';

}

function createSession(conf) {
  session = rtpmidi.manager.createSession(conf);

  session.on('streamAdded', (event) => {
    const { stream } = event;
    w(`New stream started. SSRC: ${stream.ssrc}`);
    stream.on('message', (deltaTime, message) => {
      w('Received a command: ', message);
    });
  });

  session.on('streamRemoved', (event) => {
    w(`Stream removed ${event.stream.name}`);
  });

  session.start();
  main();
}

function newSession(key) {
  switch (key) {
    case '\u001b':
      main();
      break;
    case '\u000d':
      if (sessionConfiguration[sessionProperties[sessionProperty]] === '') {
        sessionConfiguration[sessionProperties[sessionProperty]] = sessionConfigurationDefaults[sessionProperties[sessionProperty]];
      }
      process.stdout.write('\n');
      sessionProperty++;
      if (sessionProperty === sessionProperties.length) {
        sessionConfiguration.port = parseInt(sessionConfiguration.port, 10);
        createSession(sessionConfiguration);
        w('Session started');
        sessionConfiguration = null;
        sessionProperty = 0;
      } else {
        newSession(null);
      }
      break;
    case '\u007f':
      if (sessionConfiguration[sessionProperties[sessionProperty]] && sessionConfiguration[sessionProperties[sessionProperty]].length) {
        sessionConfiguration[sessionProperties[sessionProperty]] = sessionConfiguration[sessionProperties[sessionProperty]].slice(0, -1);
        process.stdout.write(`\r${sessionConfiguration[sessionProperties[sessionProperty]]}`);
      }
      break;
    case null:
      w(`Type in the ${sessionProperties[sessionProperty]} of the new session and press Enter. Default: ${sessionConfigurationDefaults[sessionProperties[sessionProperty]]}`);
      sessionConfiguration[sessionProperties[sessionProperty]] = '';
      break;
    default:
      sessionConfiguration[sessionProperties[sessionProperty]] += key;
      process.stdout.write(key);
      break;
  }
}

module.exports = session;
