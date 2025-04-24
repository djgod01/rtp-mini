/**
 * RTP MIDI Bonjour Debug
 * 
 * Vylepšená verze programu s podrobnějším logováním pro diagnostiku Bonjour/mDNS.
 */

const rtpmidi = require('@somesmall.studio/rtpmidi');

// Nastavení loggeru na nejvyšší úroveň - zobrazí všechny debugovací informace
// NONE: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, VERBOSE: 5
rtpmidi.logger.level = 5; // VERBOSE level

// Nastavíme logger na konzoli pro jistotu
rtpmidi.logger.setLogger(console);

console.log('=== RTP MIDI Bonjour DEBUG ===');
console.log('Node.js Version:', process.version);
console.log('Current directory:', process.cwd());

// Parametry MIDI session
const SESSION_NAME = 'RTP MIDI Debug Session';
const PORT = 5004; // Standardní port pro RTP MIDI

console.log(`\n[SETUP] Vytvářím RTP MIDI Session "${SESSION_NAME}" na portu ${PORT}...`);

// Vytvoření lokální session s explicitním nastavením
const session = rtpmidi.manager.createSession({
  localName: SESSION_NAME,
  bonjourName: SESSION_NAME,
  port: PORT,
  published: true, // Rozhlásit přes Bonjour
});

// Detailní sledování událostí sesssion
session.on('ready', () => {
  console.log(`[SESSION] Session "${SESSION_NAME}" je připravena na portu ${PORT}`);
  console.log('[SESSION] SSRC:', session.ssrc);
  console.log('[SESSION] Published:', session.published);
  
  // Explicitně publikujeme session ještě jednou pro jistotu
  console.log('[BONJOUR] Explicitně publikuji session...');
  session.publish();
});

session.on('error', (err) => {
  console.error('[SESSION ERROR]', err);
});

// Události pro sledování stavu session
session.on('streamAdded', (event) => {
  console.log(`[STREAM] Nový stream připojen: ${event.stream.name} (${event.stream.ssrc})`);
  if (event.stream.rinfo1) {
    console.log(`[STREAM] Remote info: ${event.stream.rinfo1.address}:${event.stream.rinfo1.port}`);
  }
});

session.on('streamRemoved', (event) => {
  console.log(`[STREAM] Stream odpojen: ${event.stream.name}`);
});

// Sledování příchozích MIDI zpráv
session.on('message', (deltaTime, message) => {
  console.log(`[MIDI] Přijata MIDI zpráva:`, Array.from(message));
});

// Sledování kontrolních zpráv
session.on('controlMessage', (message) => {
  console.log(`[CONTROL] Přijata kontrolní zpráva typu: ${message.command}`);
});

// Speciální sledování mDNS/Bonjour událostí
console.log('\n[BONJOUR] Připojuji se přímo k mDNS service...');

// Přímý přístup k mdns service pro diagnostiku
const mdnsService = rtpmidi.MdnsService;

// Sledování všech událostí mDNS service
const originalEmit = mdnsService.emit;
mdnsService.emit = function(event, ...args) {
  console.log(`[MDNS EVENT] ${event}`);
  return originalEmit.apply(this, [event, ...args]);
};

// Vypsání seznamu existujících vzdálených session
const remoteSessions = rtpmidi.manager.getRemoteSessions();
console.log(`\n[BONJOUR] Počet již známých vzdálených session: ${remoteSessions.length}`);
remoteSessions.forEach((session, index) => {
  console.log(`[BONJOUR] Session ${index + 1}: ${session.name} (${session.address}:${session.port})`);
});

// Sledování objevených vzdálených session
console.log('\n[DISCOVERY] Spouštím vyhledávání vzdálených RTP MIDI zařízení...');
rtpmidi.manager.startDiscovery();

// Události manažeru
rtpmidi.manager.on('remoteSessionAdded', (event) => {
  const remoteSession = event.remoteSession;
  console.log(`\n[DISCOVERY] Objevena vzdálená session: ${remoteSession.name} (${remoteSession.address}:${remoteSession.port})`);
  
  // Dotaz na připojení ke vzdálené session
  const doConnect = true; // Můžete nastavit na false, pokud se nechcete připojovat
  
  if (doConnect) {
    console.log(`[CONNECT] Připojuji se k: ${remoteSession.name}...`);
    try {
      session.connect(remoteSession);
    } catch (error) {
      console.error('[CONNECT ERROR]', error);
    }
  }
});

rtpmidi.manager.on('remoteSessionRemoved', (event) => {
  console.log(`[DISCOVERY] Vzdálená session zmizela: ${event.remoteSession.name}`);
});

rtpmidi.manager.on('sessionAdded', (event) => {
  console.log(`[MANAGER] Přidána lokální session: ${event.session.localName}`);
});

rtpmidi.manager.on('sessionRemoved', (event) => {
  console.log(`[MANAGER] Odstraněna lokální session: ${event.session.localName}`);
});

// Funkce pro odeslání MIDI zprávy
function sendMidiMessage(midiBytes) {
  if (!Array.isArray(midiBytes)) {
    console.error('[ERROR] Chyba: midiBytes musí být pole bajtů');
    return;
  }
  
  try {
    session.sendMessage(midiBytes);
    console.log(`[MIDI OUT] Odeslaná MIDI zpráva:`, midiBytes);
  } catch (error) {
    console.error('[MIDI ERROR]', error);
  }
}

// Diagnostická funkce - vypíše stav všech známých session každých 5 sekund
function printSessionStatus() {
  console.log('\n=== DIAGNOSTIKA STAVU ===');
  
  // Lokální sessions
  const localSessions = rtpmidi.manager.getSessions();
  console.log(`[STATUS] Počet lokálních session: ${localSessions.length}`);
  
  localSessions.forEach((localSession, index) => {
    console.log(`[STATUS] Lokální session ${index + 1}: ${localSession.localName} (${localSession.ssrc})`);
    console.log(`[STATUS]   - Port: ${localSession.port}`);
    console.log(`[STATUS]   - Published: ${localSession.published}`);
    console.log(`[STATUS]   - Aktivní: ${localSession.readyState === 2}`);
    console.log(`[STATUS]   - Počet streamů: ${localSession.streams.length}`);
    
    localSession.streams.forEach((stream, idx) => {
      console.log(`[STATUS]     - Stream ${idx + 1}: ${stream.name} (${stream.isConnected ? 'připojeno' : 'odpojeno'})`);
    });
  });
  
  // Vzdálené sessions
  const remoteSessions = rtpmidi.manager.getRemoteSessions();
  console.log(`[STATUS] Počet vzdálených session: ${remoteSessions.length}`);
  
  remoteSessions.forEach((remoteSession, index) => {
    console.log(`[STATUS] Vzdálená session ${index + 1}: ${remoteSession.name}`);
    console.log(`[STATUS]   - Adresa: ${remoteSession.address}:${remoteSession.port}`);
  });
  
  console.log('========================\n');
}

// Spustit diagnostiku každých 5 sekund
setInterval(printSessionStatus, 5000);

// Demonstrační funkce - odešle notu C4 (nota 60) s plnou silou
function sendTestNote() {
  console.log('\n[TEST] Odesílám testovací notu C4...');
  
  // Note On - kanál 1, nota 60 (C4), síla 127
  sendMidiMessage([0x90, 60, 127]);
  
  // Po 1 sekundě Note Off
  setTimeout(() => {
    // Note Off - kanál 1, nota 60 (C4), síla 0
    sendMidiMessage([0x80, 60, 0]);
    console.log('[TEST] Testovací nota ukončena');
  }, 1000);
}

// Pro demonstraci odešleme testovací notu po 10 sekundách
setTimeout(sendTestNote, 10000);
console.log('\n[TEST] Testovací nota bude odeslána za 10 sekund');

// Reagování na ukončení aplikace
process.on('SIGINT', () => {
  console.log('\n[EXIT] Ukončuji RTP MIDI session...');
  
  mdnsService.unpublishAll(() => {
    console.log('[EXIT] Všechny mDNS služby byly ukončeny');
    
    rtpmidi.manager.reset(() => {
      console.log('[EXIT] Všechny session byly ukončeny');
      process.exit(0);
    });
  });
});

console.log('\n[READY] Program běží. Pro ukončení stiskněte Ctrl+C.');
console.log('[INFO] Očekávám Bonjour události...');
