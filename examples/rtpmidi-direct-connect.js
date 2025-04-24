/**
 * RTP MIDI Server s přímým připojením
 * 
 * Tento program vytvoří RTP MIDI session a nabídne dva režimy:
 * 1. Pasivní server (výchozí) - čeká na připojení od jiného zařízení
 * 2. Přímé připojení - umožňuje zadat IP adresu cílového zařízení
 */

const rtpmidi = require('@somesmall.studio/rtpmidi');
const readline = require('readline');
const os = require('os');

// Nastavení loggeru
rtpmidi.logger.level = 3; // INFO level
rtpmidi.logger.setLogger(console);

// Vytvoření readline interface pro vstup z konzole
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Parametry MIDI session
const SESSION_NAME = 'RTP MIDI Direct Connect';
const PORT = 5004; // Standardní port pro RTP MIDI

// Získání lokální IP adresy
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  let ipAddress = '127.0.0.1';
  
  // Projdeme všechna síťová rozhraní
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      // Hledáme IPv4 adresu, která není loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
      }
    });
  });
  
  return ipAddress;
}

console.log('=== RTP MIDI Server s přímým připojením ===');
console.log(`Lokální IP adresa: ${getLocalIpAddress()}`);
console.log(`Vytvářím RTP MIDI Session "${SESSION_NAME}" na portu ${PORT}...`);

// Vytvoření lokální session
const session = rtpmidi.manager.createSession({
  localName: SESSION_NAME,
  bonjourName: SESSION_NAME,
  port: PORT,
  published: true, // Stále zkusíme rozhlásit přes Bonjour
});

// Události session
session.on('ready', () => {
  console.log(`Session "${SESSION_NAME}" je připravena na portu ${PORT}`);
  console.log(`SSRC: ${session.ssrc}`);
  showMenu();
});

session.on('error', (err) => {
  console.error('Chyba session:', err);
});

// Události pro sledování připojených zařízení
session.on('streamAdded', (event) => {
  const { stream } = event;
  console.log(`\n=== NOVÉ PŘIPOJENÍ ===`);
  console.log(`Nové zařízení připojeno: ${stream.name}`);
  if (stream.rinfo1) {
    console.log(`Adresa: ${stream.rinfo1.address}:${stream.rinfo1.port}`);
  }
  console.log(`SSRC: ${stream.ssrc}`);
  console.log(`====================`);
});

session.on('streamRemoved', (event) => {
  console.log(`Zařízení odpojeno: ${event.stream.name}`);
});

// Sledování příchozích MIDI zpráv
session.on('message', (deltaTime, message) => {
  console.log(`Přijata MIDI zpráva:`, Array.from(message));
  
  // Identifikace typu MIDI zprávy
  if (message[0] >= 0x90 && message[0] <= 0x9F) {
    // Note On zpráva
    const channel = message[0] - 0x90 + 1;
    const noteNumber = message[1];
    const velocity = message[2];
    console.log(`Note On - kanál: ${channel}, nota: ${noteNumber}, síla: ${velocity}`);
  } else if (message[0] >= 0x80 && message[0] <= 0x8F) {
    // Note Off zpráva
    const channel = message[0] - 0x80 + 1;
    const noteNumber = message[1];
    const velocity = message[2];
    console.log(`Note Off - kanál: ${channel}, nota: ${noteNumber}, síla: ${velocity}`);
  }
});

// Funkce pro přímé připojení k zadané IP adrese
function connectToIp(ip, port = 5004) {
  console.log(`Připojuji se k ${ip}:${port}...`);
  
  session.connect({
    address: ip,
    port: parseInt(port, 10)
  });
  
  console.log('Požadavek na připojení byl odeslán.');
  console.log('Čekám na navázání spojení...');
}

// Funkce pro odeslání MIDI zprávy
function sendMidiMessage(midiBytes) {
  if (!Array.isArray(midiBytes)) {
    console.error('Chyba: midiBytes musí být pole bajtů');
    return;
  }
  
  const activeStreams = session.getStreams();
  if (activeStreams.length === 0) {
    console.log('Není připojeno žádné zařízení, zpráva nebude odeslána');
    return;
  }
  
  session.sendMessage(midiBytes);
  console.log(`Odeslaná MIDI zpráva:`, midiBytes);
}

// Funkce pro zobrazení stavu
function showStatus() {
  const activeStreams = session.getStreams();
  console.log('\n--- Stav serveru ---');
  console.log(`Datum a čas: ${new Date().toLocaleString()}`);
  console.log(`Počet připojených zařízení: ${activeStreams.length}`);
  
  if (activeStreams.length > 0) {
    console.log('Připojená zařízení:');
    activeStreams.forEach((stream, index) => {
      console.log(`  ${index + 1}. ${stream.name} (${stream.rinfo1?.address}:${stream.rinfo1?.port})`);
    });
  }
  
  // Seznam objevených, ale nepřipojených zařízení
  const remoteSessions = rtpmidi.manager.getRemoteSessions();
  console.log(`Objevená zařízení v síti: ${remoteSessions.length}`);
  if (remoteSessions.length > 0) {
    remoteSessions.forEach((remoteSession, index) => {
      console.log(`  ${index + 1}. ${remoteSession.name} (${remoteSession.address}:${remoteSession.port})`);
    });
  }
  console.log('--------------------');
  showMenu();
}

// Odešle testovací notu C4
function sendTestNote() {
  console.log('Odesílám testovací notu C4...');
  // Note On - kanál 1, nota 60 (C4), síla 100
  sendMidiMessage([0x90, 60, 100]);
  
  // Po 1 sekundě Note Off
  setTimeout(() => {
    // Note Off - kanál 1, nota 60 (C4)
    sendMidiMessage([0x80, 60, 0]);
    console.log('Testovací nota ukončena');
    showMenu();
  }, 1000);
}

// Odešle stupnici C dur
function sendCScale() {
  const notes = [60, 62, 64, 65, 67, 69, 71, 72]; // C, D, E, F, G, A, H, C
  let delay = 0;
  
  console.log('Odesílám stupnici C dur...');
  
  // Odešle každou notu s postupným zpožděním
  notes.forEach((note) => {
    // Note On
    setTimeout(() => {
      sendMidiMessage([0x90, note, 100]);
      
      // Note Off po 300ms
      setTimeout(() => {
        sendMidiMessage([0x80, note, 0]);
      }, 300);
    }, delay);
    
    delay += 400; // Další nota za 400ms
  });
  
  // Po dokončení stupnice zobrazit menu
  setTimeout(showMenu, delay + 400);
}

// Funkce pro zadání IP adresy a připojení
function promptForDirectConnection() {
  rl.question('Zadejte IP adresu vzdáleného zařízení: ', (ip) => {
    rl.question('Zadejte port (výchozí: 5004): ', (port) => {
      const targetPort = port || '5004';
      connectToIp(ip, targetPort);
      showMenu();
    });
  });
}

// Zobrazení menu
function showMenu() {
  console.log('\nDostupné příkazy:');
  console.log('1. Zobrazit stav');
  console.log('2. Připojit k IP adrese');
  console.log('3. Odeslat testovací notu');
  console.log('4. Odeslat stupnici C dur');
  console.log('5. Odpojit všechna zařízení');
  console.log('0. Ukončit program');
  
  rl.question('Vyberte možnost: ', (choice) => {
    switch (choice) {
      case '1':
        showStatus();
        break;
      case '2':
        promptForDirectConnection();
        break;
      case '3':
        sendTestNote();
        break;
      case '4':
        sendCScale();
        break;
      case '5':
        const streams = session.getStreams();
        if (streams.length > 0) {
          console.log('Odpojuji všechna zařízení...');
          let completed = 0;
          streams.forEach(stream => {
            stream.end(() => {
              completed++;
              if (completed === streams.length) {
                console.log('Všechna zařízení byla odpojena.');
                showMenu();
              }
            });
          });
        } else {
          console.log('Nejsou připojena žádná zařízení.');
          showMenu();
        }
        break;
      case '0':
        console.log('Ukončuji program...');
        rtpmidi.manager.reset(() => {
          rl.close();
          process.exit(0);
        });
        break;
      default:
        console.log('Neplatná volba.');
        showMenu();
        break;
    }
  });
}

// Spustíme objevování pro detekci Bonjour zařízení (ale nebudeme se automaticky připojovat)
rtpmidi.manager.startDiscovery();

// Pouze vypisujeme objevená zařízení pro informaci
rtpmidi.manager.on('remoteSessionAdded', (event) => {
  const remoteSession = event.remoteSession;
  console.log(`Objevena vzdálená session: ${remoteSession.name} (${remoteSession.address}:${remoteSession.port})`);
});

rtpmidi.manager.on('remoteSessionRemoved', (event) => {
  console.log(`Vzdálená session zmizela: ${event.remoteSession.name}`);
});

// Reagování na ukončení aplikace
process.on('SIGINT', () => {
  console.log('\nUkončuji RTP MIDI session...');
  rtpmidi.manager.reset(() => {
    rl.close();
    console.log('Session ukončena.');
    process.exit(0);
  });
});
