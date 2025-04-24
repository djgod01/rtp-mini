/**
 * RTP MIDI Bonjour Example
 * 
 * Jednoduchý program, který vytvoří RTP MIDI session a rozhlásí ji po síti pomocí Bonjour/mDNS.
 * Umožňuje také automatické připojení k ostatním objeveným zařízením v síti.
 */

const rtpmidi = require('@somesmall.studio/rtpmidi');

// Nastavení loggeru pro sledování aktivit
rtpmidi.logger.level = 5; // INFO level

// Parametry MIDI session
const SESSION_NAME = 'Moje RTP MIDI Session';
const PORT = 5004; // Standardní port pro RTP MIDI

console.log('Vytvářím RTP MIDI Session...');

// Vytvoření lokální session
const session = rtpmidi.manager.createSession({
  localName: SESSION_NAME,
  bonjourName: SESSION_NAME,
  port: PORT,
  published: true, // Rozhlásit přes Bonjour
});

// Sledování příchozích MIDI zpráv
session.on('message', (deltaTime, message) => {
  console.log(`Přijata MIDI zpráva:`, Array.from(message));
  
  // Můžete zde zpracovat příchozí MIDI zprávy
  // Např. identifikovat typ zprávy a parametry
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

// Události pro sledování stavu session
session.on('ready', () => {
  console.log(`Session "${SESSION_NAME}" je připravena na portu ${PORT}`);
});

session.on('streamAdded', (event) => {
  console.log(`Nový stream připojen: ${event.stream.name} (${event.stream.ssrc})`);
});

session.on('streamRemoved', (event) => {
  console.log(`Stream odpojen: ${event.stream.name}`);
});

// Sledování objevených vzdálených session
console.log('Spouštím vyhledávání vzdálených RTP MIDI zařízení...');
rtpmidi.manager.startDiscovery();

// Automatické připojení k objeveným vzdáleným session
const AUTO_CONNECT = false; // Nastavte na false, pokud nechcete automatické připojení

if (AUTO_CONNECT) {
  rtpmidi.manager.on('remoteSessionAdded', (event) => {
    const remoteSession = event.remoteSession;
    console.log(`Objevena vzdálená session: ${remoteSession.name} (${remoteSession.address}:${remoteSession.port})`);
    
    // Připojení ke vzdálené session
    console.log(`Připojuji se k: ${remoteSession.name}...`);
    session.connect(remoteSession);
  });
  
  rtpmidi.manager.on('remoteSessionRemoved', (event) => {
    console.log(`Vzdálená session zmizela: ${event.remoteSession.name}`);
  });
}

// Funkce pro odeslání MIDI zprávy
function sendMidiMessage(midiBytes) {
  if (!Array.isArray(midiBytes)) {
    console.error('Chyba: midiBytes musí být pole bajtů');
    return;
  }
  
  session.sendMessage(midiBytes);
  console.log(`Odeslaná MIDI zpráva:`, midiBytes);
}

// Demonstrační funkce - odešle notu C4 (nota 60) s plnou silou
function sendTestNote() {
  // Note On - kanál 1, nota 60 (C4), síla 127
  sendMidiMessage([0x90, 60, 127]);
  
  // Po 1 sekundě Note Off
  setTimeout(() => {
    // Note Off - kanál 1, nota 60 (C4), síla 0
    sendMidiMessage([0x80, 60, 0]);
  }, 1000);
}

// Pro demonstraci odešleme testovací notu po 3 sekundách
setTimeout(sendTestNote, 3000);

// Reagování na ukončení aplikace
process.on('SIGINT', () => {
  console.log('\nUkončuji RTP MIDI session...');
  rtpmidi.manager.reset(() => {
    console.log('Session ukončena.');
    process.exit(0);
  });
});

console.log('Program běží. Pro ukončení stiskněte Ctrl+C.');

// Pro odesílání vlastních zpráv můžete použít:
// sendMidiMessage([0x90, nota, síla]); // Note On
// sendMidiMessage([0x80, nota, síla]); // Note Off
// sendMidiMessage([0xB0, kontroler, hodnota]); // Control Change
// atd.
