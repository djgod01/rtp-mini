/**
 * RTP MIDI Pasivní Server s Bonjour
 * 
 * Tento program vytvoří RTP MIDI session, rozhlásí ji přes Bonjour,
 * ale NEINICIALIZUJE aktivně připojení k objeveným zařízením.
 * Místo toho čeká, až se k němu připojí protistrana.
 */

const rtpmidi = require('@somesmall.studio/rtpmidi');

// Nastavení loggeru pro lepší viditelnost událostí
rtpmidi.logger.level = 4; // DEBUG level
rtpmidi.logger.setLogger(console);

// Parametry MIDI session
const SESSION_NAME = 'RTP MIDI Pasivní Server';
const PORT = 5004; // Standardní port pro RTP MIDI

console.log('=== RTP MIDI Pasivní Server ===');
console.log(`Vytvářím RTP MIDI Session "${SESSION_NAME}" na portu ${PORT}...`);

// Vytvoření lokální session
const session = rtpmidi.manager.createSession({
  localName: SESSION_NAME,
  bonjourName: SESSION_NAME,
  port: PORT,
  published: true, // Rozhlásit přes Bonjour
});

// Události session
session.on('ready', () => {
  console.log(`Session "${SESSION_NAME}" je připravena na portu ${PORT} a rozhlášena přes Bonjour`);
  console.log('SSRC:', session.ssrc);
  console.log('Čekám na připojení protistrany...');
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
    
    // Volitelně - můžete odeslat odpověď jako echo
    /*
    setTimeout(() => {
      // Odpověď o oktávu výš
      session.sendMessage([message[0], noteNumber + 12, velocity]);
    }, 500);
    */
  } else if (message[0] >= 0x80 && message[0] <= 0x8F) {
    // Note Off zpráva
    const channel = message[0] - 0x80 + 1;
    const noteNumber = message[1];
    const velocity = message[2];
    console.log(`Note Off - kanál: ${channel}, nota: ${noteNumber}, síla: ${velocity}`);
  }
});

// Spustíme objevování, ale NEBUDEME se automaticky připojovat
console.log('Spouštím vyhledávání vzdálených RTP MIDI zařízení...');
rtpmidi.manager.startDiscovery();

// Pouze vypisujeme objevená zařízení pro informaci
rtpmidi.manager.on('remoteSessionAdded', (event) => {
  const remoteSession = event.remoteSession;
  console.log(`Objevena vzdálená session: ${remoteSession.name} (${remoteSession.address}:${remoteSession.port})`);
  console.log('Čekám na připojení z této session...');
});

rtpmidi.manager.on('remoteSessionRemoved', (event) => {
  console.log(`Vzdálená session zmizela: ${event.remoteSession.name}`);
});

// Funkce pro odeslání MIDI zprávy všem připojeným streamům
function sendMidiMessage(midiBytes) {
  if (!Array.isArray(midiBytes)) {
    console.error('Chyba: midiBytes musí být pole bajtů');
    return;
  }
  
  // Získáme seznam aktivních streamů
  const activeStreams = session.getStreams();
  if (activeStreams.length === 0) {
    console.log('Není připojeno žádné zařízení, zpráva nebude odeslána');
    return;
  }
  
  // Odešleme zprávu
  session.sendMessage(midiBytes);
  console.log(`Odeslaná MIDI zpráva ${midiBytes} všem připojeným zařízením (${activeStreams.length})`);
}

// Periodické vypisování stavu
function printStatus() {
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
}

// Vypisovat stav každých 30 sekund
setInterval(printStatus, 30000);

// Ukázkové testovací funkce - můžete je použít pro testování
// když se k vám připojí jiné zařízení

// Odešle testovací notu C4
function sendTestNote() {
  console.log('Odesílám testovací notu C4...');
  // Note On - kanál 1, nota 60 (C4), síla 100
  sendMidiMessage([0x90, 60, 100]);
  
  // Po 1 sekundě Note Off
  setTimeout(() => {
    // Note Off - kanál 1, nota 60 (C4)
    sendMidiMessage([0x80, 60, 0]);
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
}

// Definujeme příkazy, které můžete zadávat do konzole
process.stdin.setEncoding('utf8');
process.stdin.on('data', (data) => {
  const command = data.trim().toLowerCase();
  
  if (command === 'status') {
    printStatus();
  } else if (command === 'test') {
    sendTestNote();
  } else if (command === 'scale') {
    sendCScale();
  } else if (command === 'exit' || command === 'quit') {
    console.log('Ukončuji program...');
    rtpmidi.manager.reset(() => {
      process.exit(0);
    });
  } else if (command === 'help') {
    console.log('\nDostupné příkazy:');
    console.log('  status - zobrazí aktuální stav serveru');
    console.log('  test   - odešle testovací notu C4');
    console.log('  scale  - odešle stupnici C dur');
    console.log('  exit   - ukončí program');
    console.log('  help   - zobrazí tuto nápovědu');
  } else {
    console.log('Neznámý příkaz. Zadejte "help" pro zobrazení dostupných příkazů.');
  }
});

// Reagování na ukončení aplikace
process.on('SIGINT', () => {
  console.log('\nUkončuji RTP MIDI session...');
  rtpmidi.manager.reset(() => {
    console.log('Session ukončena.');
    process.exit(0);
  });
});

console.log('\nProgram běží. Server čeká na připojení.');
console.log('Pro zobrazení příkazů zadejte "help" a stiskněte Enter.');

// Zobrazíme počáteční stav
setTimeout(printStatus, 3000);
