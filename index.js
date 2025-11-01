const { Client, LocalAuth, MessageMedia, Buttons, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const autoAcceptRequests = {};
const gameStates = new Map();
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = (arr) => arr[random(0, arr.length - 1)];
const percentage = () => random(0, 100);
const DEFAULT_PREFIX = '.';
let prefixes = {}; // caricalo/salvalo da JSON come fai per gli altri dati
const userStatsFile = './userStats.json';

// funzione corretta
function getPrefix(chatId) {
  return prefixes && prefixes[chatId] ? prefixes[chatId] : DEFAULT_PREFIX;
} // <- <- chiusura obbligatoria

let text = '';


// ---------------------- DATABASE ----------------------
let groupData = {};
let games = {};
let economy = {};
let userStats = {};
let marriages = {};
let pets = {};
let warnings = {};
let automodConfig = {};
let botData = {};
const startTime = Date.now();

function loadData() {
    try {
        if (fs.existsSync('./groupData.json')) groupData = JSON.parse(fs.readFileSync('./groupData.json', 'utf8'));
        if (fs.existsSync('./games.json')) games = JSON.parse(fs.readFileSync('./games.json', 'utf8'));
        if (fs.existsSync('./economy.json')) economy = JSON.parse(fs.readFileSync('./economy.json', 'utf8'));
        if (fs.existsSync('./userStats.json')) userStats = JSON.parse(fs.readFileSync('./userStats.json', 'utf8'));
        if (fs.existsSync('./marriages.json')) marriages = JSON.parse(fs.readFileSync('./marriages.json', 'utf8'));
        if (fs.existsSync('./pets.json')) pets = JSON.parse(fs.readFileSync('./pets.json', 'utf8'));
        if (fs.existsSync('./warnings.json')) warnings = JSON.parse(fs.readFileSync('./warnings.json', 'utf8'));
        if (fs.existsSync('./automod.json')) automodConfig = JSON.parse(fs.readFileSync('./automod.json', 'utf8'));
        if (fs.existsSync('./botData.json')) botData = JSON.parse(fs.readFileSync('./botData.json', 'utf8'));
        if (fs.existsSync('./gameStates.json')) gameStates = JSON.parse(fs.readFileSync('./gameStates.json', 'utf8'));
    } catch (err) {
        console.log('⚠️ Errore caricamento dati:', err);
    }
}

function saveData() {
    try {
        fs.writeFileSync('./groupData.json', JSON.stringify(groupData, null, 2));
        fs.writeFileSync('./games.json', JSON.stringify(games, null, 2));
        fs.writeFileSync('./economy.json', JSON.stringify(economy, null, 2));
        fs.writeFileSync('./userStats.json', JSON.stringify(userStats, null, 2));
        fs.writeFileSync('./marriages.json', JSON.stringify(marriages, null, 2));
        fs.writeFileSync('./pets.json', JSON.stringify(pets, null, 2));
        fs.writeFileSync('./warnings.json', JSON.stringify(warnings, null, 2));
        fs.writeFileSync('./automod.json', JSON.stringify(automodConfig, null, 2));
        fs.writeFileSync('./gameStates.json', JSON.stringify(gameStates, null, 2));
        fs.writeFileSync('./botData.json', JSON.stringify(botData, null, 2));
    } catch (err) {
        console.log('⚠️ Errore salvataggio dati:', err);
    }
}

function initGroup(groupId) {
    if (!groupData[groupId]) {
        groupData[groupId] = {
            mutedUsers: [],
            bannedUsers: [],
            warnings: {},
            adminMode: false,
            antilink: false,
            blockedWords: [],
            slowmode: 0,
            lastMessage: {},
            rules: '',
            welcomeEnabled: true,
            goodbyeEnabled: true,
            autoKickWarns: 3,
            welcomeMessage: '👋 Benvenuto {user} nel gruppo *{group}*! 🎉',
            goodbyeMessage: '👋 Ciao {user}, ci mancherai! 💔',
            levelSystem: true,
            antiSpam: false,
            polls: {},
            lockSettings: false,
            antiBot: false,
            maxWarns: 3,
            muteTime: {}
        };
    }
    if (!automodConfig[groupId]) {
        automodConfig[groupId] = {
            autoDelete: true,
            antiFlood: false,
            antiRaid: false,
            captchaEnabled: false,
            maxMessages: 5,
            timeWindow: 10
        };
    }
}

function initUser(userId) {
    if (!economy[userId]) {
        economy[userId] = {
            money: 100,
            bank: 0,
            inventory: [],
            lastDaily: 0,
            lastWork: 0,
            lastRob: 0,
            lastCrime: 0,
            lastWeekly: 0,
            lastMonthly: 0
        };
    }
    if (!userStats[userId]) {
        userStats[userId] = {
            level: 1,
            xp: 0,
            messages: 0,
            reputation: 0,
            bio: '',
            lastXP: 0,
            lastRep: 0
        };
    }
    if (!pets[userId]) {
        pets[userId] = {
            name: '',
            type: '',
            hunger: 100,
            happiness: 100,
            health: 100,
            lastFed: 0,
            lastPlayed: 0
        };
    }
}

// ---------------------- CLIENT ----------------------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

client.on('qr', (qr) => {
    console.log('📱 Scansiona questo QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ 🤖 Bot WhatsApp pronto e operativo!');
    loadData();
});

client.on('authenticated', () => {
    console.log('🔐 Autenticazione completata!');
});

client.on('auth_failure', () => {
    console.error('❌ Autenticazione fallita!');
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Bot disconnesso:', reason);
});

// ---------------------- UTILITY ----------------------
const nowSeconds = () => Math.floor(Date.now() / 1000);
const getUserIdFromMsg = (msg) => msg.author || msg.from;

const getNormalizedNumber = async (msg) => {
    try {
        const contact = await msg.getContact();
        const userId = contact.id._serialized;
        return userId.split('@')[0];
    } catch {
        const userId = msg.author || msg.from;
        return userId.split('@')[0];
    }
};

// EVENTO BENVENUTO AUTOMATICO (con tag funzionante)
client.on('group_join', async (notification) => {
  try {
    const chat = await client.getChatById(notification.chatId);
    if (!chat || !chat.isGroup) return;

    // ID del nuovo membro (es. "39333xxxxxxx@c.us")
    const newMemberId = notification.recipientIds && notification.recipientIds[0];
    if (!newMemberId) return;

    // Recupera il contatto
    const contact = await client.getContactById(newMemberId);
    const displayTag = contact.number || newMemberId.split('@')[0]; // testo che comparirà dopo la @
    const mentionObj = contact; // oggetto da passare in mentions

    // Messaggio di benvenuto — includi @displayTag nel testo
    const welcomeMsg = `
╔═══════════════════════╗
║  👋 *BENVENUTO/A!*    ║
╚═══════════════════════╝

Ciao @${displayTag} 🎉

Benvenuto/a nel gruppo!

━━━━━━━━━━━━━━━━━━━━━
📝 *Presentati con:*

👤 Nome
🎂 Età
📍 Provenienza
📸 Foto  a 1 visualizzazione

━━━━━━━━━━━━━━━━━━━━━
💬 Buona permanenza!`;

    // Invia il messaggio con il mention (tag)
    await chat.sendMessage(welcomeMsg, {
      mentions: [mentionObj]
    });

    console.log(`[WELCOME] ${contact.pushname || displayTag} è entrato nel gruppo ${chat.name}`);
  } catch (error) {
    console.error('Errore evento group_join:', error);
  }
});


// Controlla se l'autore del messaggio è admin nel gruppo
async function isAdmin(msg, chat) {
  try {
    // Se non è un gruppo, consideriamo "true" (comando in privato)
    if (!chat || !chat.isGroup) return true;

    // Proviamo prima a ottenere il contact (più affidabile)
    let senderIdRaw = '';
    try {
      const contact = await msg.getContact(); // restituisce il contatto del mittente
      senderIdRaw = contact && contact.id && contact.id._serialized ? contact.id._serialized : '';
    } catch (e) {
      // fallback se getContact() fallisce
      senderIdRaw = msg.author || msg.from || '';
    }

    // Normalizza (prendi la parte prima di @)
    const normalize = id => (id || '').split('@')[0];

    const userId = normalize(senderIdRaw);

    // Prendi lo stato aggiornato della chat
    const freshChat = await client.getChatById(chat.id._serialized);
    if (!freshChat || !Array.isArray(freshChat.participants)) return false;

    const participant = freshChat.participants.find(p => {
      const pId = p && p.id && p.id._serialized ? p.id._serialized : '';
      return normalize(pId) === userId;
    });

    // Verifica flag admin/superadmin (some versions use isAdmin/isSuperAdmin)
    return Boolean(participant && (participant.isAdmin === true || participant.isSuperAdmin === true));
  } catch (err) {
    console.error('isAdmin error:', err);
    return false;
  }
}

// Controlla se il bot è admin nel gruppo
async function isBotAdmin(chat) {
  try {
    if (!chat || !chat.isGroup) return false;

    // Ottieni l'ID del bot in modo più affidabile
    let botId = '';
    
    // Prova diversi metodi per ottenere l'ID del bot
    if (client.info && client.info.wid) {
      botId = client.info.wid._serialized || client.info.wid.user || '';
    } else if (client.info && client.info.me) {
      botId = client.info.me._serialized || client.info.me.user || '';
    }
    
    // Se non otteniamo l'ID completo, proviamo ad estrarre solo il numero
    const botNumber = botId.split('@')[0];
    
    if (!botNumber) {
      console.log('⚠️ Impossibile ottenere ID bot');
      return false;
    }

    // Ottieni la chat aggiornata con i partecipanti
    const freshChat = await client.getChatById(chat.id._serialized);
    
    if (!freshChat || !Array.isArray(freshChat.participants)) {
      console.log('⚠️ Impossibile ottenere partecipanti del gruppo');
      return false;
    }

    // Cerca il bot tra i partecipanti
    const botParticipant = freshChat.participants.find(p => {
      if (!p || !p.id || !p.id._serialized) return false;
      const participantNumber = p.id._serialized.split('@')[0];
      return participantNumber === botNumber;
    });

    if (!botParticipant) {
      console.log('⚠️ Bot non trovato tra i partecipanti');
      return false;
    }

    // Verifica se il bot è admin o super admin
    const isAdminStatus = botParticipant.isAdmin === true || botParticipant.isSuperAdmin === true;
    
    // Debug log (rimuovi in produzione)
    console.log(`Bot admin status in ${chat.name}: ${isAdminStatus}`);
    
    return isAdminStatus;

  } catch (err) {
    console.error('❌ isBotAdmin error:', err.message);
    return false;
  }
}


function addXP(userId, amount) {
    initUser(userId);
    const now = Date.now();
    if (now - userStats[userId].lastXP < 60000) return false;
    userStats[userId].xp += amount;
    userStats[userId].lastXP = now;
    const xpNeeded = userStats[userId].level * 100;
    if (userStats[userId].xp >= xpNeeded) {
        userStats[userId].level++;
        userStats[userId].xp = 0;
        saveData();
        return true;
    }
    saveData();
    return false;
}



// Funzioni helper per livelli
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100));
}

function getXPForLevel(level) {
    return level * level * 100;
}

function createProgressBar(current, total, length = 10) {
    const filled = Math.floor((current / total) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function getUserStats(userId) {
    initUser(userId); // Crea l'utente se non esiste
    return userStats[userId]; // Restituisci direttamente l'oggetto
}

function formatTime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let result = '';
    if (d > 0) result += `${d}g `;
    if (h > 0) result += `${h}h `;
    if (m > 0) result += `${m}m `;
    if (s > 0) result += `${s}s`;
    return result.trim();
}

// Alias per compatibilità
const formatUptime = formatTime;

// Funzione helper per ottenere il nome visualizzato di un utente
async function getUserDisplayName(userId, chat) {
    try {
        const contact = await client.getContactById(userId);
        return contact.pushname || contact.name || userId.split('@')[0];
    } catch (err) {
        return userId.split('@')[0];
    }
}

// ---------------- Helper: pin/unpin resiliente per WhatsApp Web ----------------
async function evaluatePinUnpin(pupPage, msgIdSerialized, pinBoolean) {
  if (!pupPage) throw new Error('pupPage non disponibile (client.pupPage).');
  return await pupPage.evaluate(async (msgId, pin) => {
    function findMessage(id) {
      try {
        if (window.Store && window.Store.Msg) {
          if (typeof window.Store.Msg.get === 'function') {
            return window.Store.Msg.get(id);
          }
          // fallback: cerca in models
          if (Array.isArray(window.Store.Msg.models)) {
            return window.Store.Msg.models.find(m => m && m.id && (m.id._serialized === id || m.id.id === id));
          }
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    const message = findMessage(msgId);
    if (!message) throw new Error('Message object non trovato in window.Store (msgId: ' + msgId + ')');

    // 1) se esiste la funzione compatibile -> usala direttamente
    try {
      if (window.Store && typeof window.Store.pinUnpinMsg === 'function') {
        return await window.Store.pinUnpinMsg(message, !!pin);
      }
    } catch (e) { /* prosegui fallback */ }

    // 2) prova metodi su Store.Msg (nomi probabili: pin, pinMessage, togglePin, setPinned...)
    try {
      if (window.Store && window.Store.Msg) {
        const candidates = Object.keys(window.Store.Msg).filter(k => /pin|pinned|toggle/i.test(k));
        for (const c of candidates) {
          try {
            if (typeof window.Store.Msg[c] === 'function') {
              return await window.Store.Msg[c](message, !!pin);
            }
          } catch (err) { /* ignora candidato fallito */ }
        }
      }

      // Chat-level
      if (message.chat && window.Store.Chat && typeof window.Store.Chat.get === 'function') {
        const chatKey = message.chat._serialized || (message.chat.id && message.chat.id._serialized) || message.chat;
        const chatObj = window.Store.Chat.get(chatKey) || window.Store.Chat.get(message.chat._serialized || chatKey);
        if (chatObj) {
          if (typeof chatObj.pin === 'function') {
            return await chatObj.pin(message, !!pin);
          }
          if (typeof chatObj.togglePin === 'function') {
            return await chatObj.togglePin(message, !!pin);
          }
        }
      }
    } catch (e) { /* ignora */ }

    // 3) ricerca dinamica su window.Store e sotto-oggetti per funzioni con "pin" nel nome
    try {
      for (const key of Object.keys(window.Store || {})) {
        const obj = window.Store[key];
        if (!obj) continue;
        if (typeof obj === 'function' && /pin/i.test(key)) {
          try { return await obj(message, !!pin); } catch(e) {}
        }
        if (typeof obj === 'object') {
          for (const sub of Object.keys(obj)) {
            if (/pin/i.test(sub) && typeof obj[sub] === 'function') {
              try { return await obj[sub](message, !!pin); } catch(e) {}
            }
          }
        }
      }
    } catch (e) { /* ignora */ }

    // 4) se niente trovato, installa wrapper descrittivo (utile per debug futuro) e fallisci in modo esplicito
    try {
      if (window.Store) {
        window.Store.pinUnpinMsg = function() {
          throw new Error('Wrapper pinUnpinMsg: nessuna implementazione trovata in questa build di WhatsApp Web.');
        };
      }
    } catch (e) {}

    throw new Error('Nessuna API di pin/unpin trovata in window.Store (versione WhatsApp Web incompatibile).');
  }, msgIdSerialized, pinBoolean);
}

// --------- (OPZIONALE) funzione di diagnostica da eseguire se vuoi capire le API disponibili -----
// Usa: const diag = await client.pupPage.evaluate(() => { ... });
// Ti può servire per debug; puoi rimuoverla se non ti serve.
async function getStorePinCandidates(pupPage) {
  if (!pupPage) throw new Error('pupPage non disponibile (client.pupPage).');
  return await pupPage.evaluate(() => {
    const keys = Object.keys(window.Store || {}).slice(0, 300);
    const pinCandidates = keys.filter(k => /pin|pinned/i.test(k));
    return { keysCount: keys.length, pinCandidates, keysSample: keys.slice(0, 80) };
  });
}

// Listener per richieste di ingresso gruppo
client.on('group_join_request', async (notification) => {
    try {
        const groupId = notification.chatId;
        
        if (autoAcceptRequests[groupId]) {
            await notification.approve();
            console.log(`✅ Richiesta accettata automaticamente per ${groupId}`);
        }
    } catch (err) {
        console.error('Errore accettazione richiesta:', err);
    }
});

function formatTime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let result = '';
    if (d > 0) result += `${d}g `;
    if (h > 0) result += `${h}h `;
    if (m > 0) result += `${m}m `;
    if (s > 0) result += `${s}s`;
    return result.trim();
}

// ---------------------- HANDLER MESSAGGI ----------------------
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const isGroup = chat.isGroup;
        
        // Inizializza gruppo se necessario
        if (isGroup) initGroup(chat.id._serialized);
        
        const groupInfo = isGroup ? groupData[chat.id._serialized] : null;
        const automod = isGroup ? automodConfig[chat.id._serialized] : null;
        const userNumber = await getNormalizedNumber(msg);
        const userId = getUserIdFromMsg(msg);

        // Sistema XP e messaggi
        if (isGroup && groupInfo?.levelSystem) {
            userStats[userId] = userStats[userId] || { messages: 0 };
            userStats[userId].messages++;
            if (addXP(userId, Math.floor(Math.random() * 5) + 1)) {
                await msg.reply(`🎉🎊 *LEVEL UP!* 🎊🎉\n\n🏆 Sei ora livello *${userStats[userId].level}*!\n⭐ Continua così campione!`);
            }
        }

        // Utenti mutati - controlla sia numero che ID completo
        const isMuted = groupInfo?.mutedUsers?.some(id => 
            id === userId || id.split('@')[0] === userNumber
        );
        if (isMuted) {
            try { 
                await msg.delete(true); 
                return;
            } catch (err) {
                console.log('Errore eliminazione messaggio mutato:', err);
            }
        }

        // Utenti bannati
        const isBanned = groupInfo?.bannedUsers?.some(id => 
            id === userId || id.split('@')[0] === userNumber
        );
        if (isBanned) {
            if (await isBotAdmin(chat)) {
                try { 
                    await chat.removeParticipants([msg.author]); 
                    return;
                } catch (err) {
                    console.log('Errore rimozione utente bannato:', err);
                }
            }
        }

            // ======== CONTROLLO VISUAL MODE (deve girare PRIMA del parsing comandi) ========
if (isGroup && groupInfo?.visualMode && msg.hasMedia) {
    // Se non è admin, applica la regola
    if (!await isAdmin(msg, chat)) {
        try {
            const type = msg.type?.toLowerCase(); // tipo del media (image, video, audio, sticker, ecc.)

            // ✅ controlla SOLO foto e video
            if (type === 'image' || type === 'video') {
                // Se il media NON è "visualizza una volta" → elimina e avvisa
                if (!msg.isViewOnce && !msg._data?.isViewOnce) {
                    try { 
                        await msg.delete(true); 
                    } catch (e) { 
                        console.warn('Impossibile eliminare il messaggio:', e.message);
                    }

                    const sender = msg._data?.notifyName || 'Utente';
                    const userId = msg.author || msg.from; // compatibilità per diversi tipi di messaggi
                    const contact = await client.getContactById(userId);

                    const warningMsg = `
╔═══════════════════════╗
║  ⚠️ *VISUAL MODE*     ║
╚═══════════════════════╝

@${displayTag} ⚠️

❌ *Media eliminato!*

📸 In questa chat puoi inviare **solo foto e video**
con *visualizzazione singola (1 visual)*!

━━━━━━━━━━━━━━━━━━━━━
💡 Suggerimento: quando invii il media,
tocca su 📸 e scegli "Visualizza una volta" prima di inviare.`;

                    await chat.sendMessage(warningMsg, { mentions: [contact] });
                    console.log(`[VISUAL MODE] Media non view-once eliminato da ${sender}`);
                    return; // Esci: non processare altro su questo messaggio
                }
            }

            // Se è un altro tipo di media (sticker, audio, ecc.) → ignoralo
        } catch (err) {
            console.error('Errore nel controllo visual mode:', err);
            // non bloccare l'esecuzione del resto del codice se fallisce
        }
    }
}


// ======== PARSING PREFIX + COMANDO (robusto per media con caption/no-body) ========
// usa sia msg.body che msg.caption (alcune librerie mettono la caption in msg.caption)
const content = (typeof msg.body === 'string' ? msg.body : (msg.caption || ''))?.trim() || '';

// Se non c'è testo o caption, non è un comando testuale: esci
if (!content) return;

// Recupera prefix per la chat (fallback a DEFAULT_PREFIX)
const prefix = typeof getPrefix === 'function' ? getPrefix(msg.from) : DEFAULT_PREFIX;

// Se il contenuto non inizia con il prefix, non è un comando: esci
if (!content.startsWith(prefix)) return;

// Estrai comando e args
const withoutPrefix = content.slice(prefix.length).trim();
if (!withoutPrefix) return;

const cmdArgs = withoutPrefix.split(/\s+/);



        // Anti-link
        if (groupInfo?.antilink && /https?:\/\/|www\.|wa\.me|whatsapp\.com/i.test(msg.body || '')) {
            if (!(await isAdmin(msg, chat))) {
                try { 
                    await msg.delete(true); 
                    await msg.reply('⚠️🔗 *ANTILINK ATTIVO*\n\nI link non sono permessi in questo gruppo!');
                    return;
                } catch (err) {
                    console.log('Errore antilink:', err);
                }
            }
        }

        // Anti-bot
        if (groupInfo?.antiBot && msg.fromMe === false) {
            const contact = await msg.getContact();
            if (contact.isWAContact === false || contact.isBusiness) {
                if (!(await isAdmin(msg, chat))) {
                    try {
                        await chat.removeParticipants([msg.author]);
                        await msg.reply('🤖❌ Bot rilevato e rimosso automaticamente!');
                        return;
                    } catch (err) {
                        console.log('Errore antibot:', err);
                    }
                }
            }
        }

        // Slowmode
        if (groupInfo?.slowmode > 0) {
            const lastMsg = groupInfo.lastMessage?.[userNumber] || 0;
            if (Date.now() - lastMsg < groupInfo.slowmode * 1000) {
                try { 
                    await msg.delete(true); 
                    return;
                } catch {}
            }
            groupInfo.lastMessage = groupInfo.lastMessage || {};
            groupInfo.lastMessage[userNumber] = Date.now();
        }

        // Parole vietate
        if ((msg.body || '').length > 0 && (groupInfo?.blockedWords || []).some(w => (msg.body || '').toLowerCase().includes(w.toLowerCase()))) {
            try { 
                await msg.delete(true); 
                await msg.reply('⚠️🚫 Hai usato una parola vietata!');
                return;
            } catch {}
        }

        // Carica dati da file all'avvio
if (fs.existsSync(userStatsFile)) {
    try {
        userStats = JSON.parse(fs.readFileSync(userStatsFile, 'utf8'));
    } catch (err) {
        console.error('Errore nel caricamento di userStats.json:', err);
        userStats = {};
    }
} else {
    fs.writeFileSync(userStatsFile, JSON.stringify({}, null, 2));
}

// Funzione per salvare i dati
function saveUserStats() {
    try {
        fs.writeFileSync(userStatsFile, JSON.stringify(userStats, null, 2));
    } catch (err) {
        console.error('Errore nel salvataggio di userStats.json:', err);
    }
}

// Inizializza utente se non esiste
function initUser(id) {
    if (!userStats[id]) {
        userStats[id] = {
            level: 1,
            xp: 0,
            messages: 0,
            dailyStreak: 0,
            instagram: null
        };
        saveUserStats();
    }
}

// Esempio funzioni ausiliarie (se non le hai già)
function getRank(level) {
    if (level >= 50) return { name: 'Leggenda', emoji: '👑' };
    if (level >= 25) return { name: 'Maestro', emoji: '💠' };
    if (level >= 10) return { name: 'Esperto', emoji: '🔥' };
    if (level >= 5)  return { name: 'Apprendista', emoji: '⭐' };
    return { name: 'Novizio', emoji: '🌱' };
}

function getXPForLevel(level) {
    return 100 + (level * 50);
}

        // Anti-flood
        if (automod?.antiFlood) {
            groupInfo.messageCount = groupInfo.messageCount || {};
            if (!groupInfo.messageCount[userNumber]) groupInfo.messageCount[userNumber] = [];
            
            groupInfo.messageCount[userNumber].push(Date.now());
            groupInfo.messageCount[userNumber] = groupInfo.messageCount[userNumber].filter(t => Date.now() - t < automod.timeWindow * 1000);
            
            if (groupInfo.messageCount[userNumber].length > automod.maxMessages) {
                if (!(await isAdmin(msg, chat))) {
                    try {
                        await msg.delete(true);
                        await msg.reply(`⚠️💥 *FLOOD RILEVATO!*\n\n@${userNumber} stai inviando troppi messaggi!`);
                        groupInfo.messageCount[userNumber] = [];
                    } catch {}
                }
            }
        }

             

        // ---------------------- COMANDI ----------------------
if (!msg.body || !msg.body.startsWith('.')) return;

const args = msg.body.slice(1).trim().split(/ +/);
const command = (args.shift() || '').toLowerCase();
const text = msg.body.slice(1); // se ti serve il testo intero senza il punto

// ---------- CONTROLLO MODALITÀ ADMIN (POSIZIONE CORRETTA) ----------
        if (isGroup && groupData[chat.id._serialized]?.adminMode) {
            const isUserAdmin = await isAdmin(msg, chat); // OK perché sei in funzione async
            if (!isUserAdmin && command !== 'modoadmin') return; // esce dall'handler
        }     

// ================= FUNZIONE FALLBACK =================
async function sendListOrFallback(client, to, text, sections, buttonText, title) {
  try {
    const list = new List(text, buttonText, sections, title, 'Scegli un\'opzione');
    await client.sendMessage(to, list);
  } catch (err) {
    // Se il list non è supportato, invia il testo normale come fallback
    let fallbackText = `${text}\n\n📂 *MENU DISPONIBILE:*\n`;
    for (const section of sections) {
      fallbackText += `\n${section.title}\n`;
      for (const row of section.rows) {
        fallbackText += `• ${row.id} → ${row.description}\n`;
      }
    }
    await client.sendMessage(to, fallbackText);
  }
}




// ========== MENU PRINCIPALE ==========
if (['menu', 'help', 'comandi'].includes(command)) {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const menuText = `
╔═══════════════════════╗
║  🤖 *BOT WHATSAPP*   ║
║  *MENU PRINCIPALE*    ║
╚═══════════════════════╝

📋 *NAVIGAZIONE RAPIDA:*
Usa i pulsanti sotto o digita i comandi

🎯 *CATEGORIE DISPONIBILI:*
• \`.moderazione\` - Gestione gruppo 👮
• \`.economia\` - Sistema economico 💰
• \`.giochi\` - Giochi e intrattenimento 🎮
• \`.fun\` - Comandi divertenti 🎪
• \`.utility\` - Strumenti utili 🔧

📊 *INFORMAZIONI:*
• \`.level\` - Mostra il tuo livello
• \`.profilo\` - Il tuo profilo completo
• \`.top\` - Classifiche del gruppo
• \`.stats\` - Statistiche bot

❓ *SUPPORTO:*
• \`.help [comando]\` - Info su comando
• \`.info\` - Info dettagliate bot
• \`.ping\` - Verifica latenza

💡 *SUGGERIMENTO:*
Usa i pulsanti interattivi per una navigazione più veloce!

━━━━━━━━━━━━━━━━━━━━━
🔧 Versione: *2.5 Premium*
⏰ Uptime: *${formatUptime(uptime)}*
👥 Utenti attivi: *${Object.keys(userStats).length}*
`;

    const sections = [
        {
            title: '👮 GESTIONE',
            rows: [
                { id: '.moderazione', title: '👮 Moderazione', description: 'Comandi admin completi' },
                { id: '.automod', title: '🛡️ Auto-Moderazione', description: 'Protezione automatica' },
                { id: '.config', title: '⚙️ Configurazione', description: 'Impostazioni gruppo' }
            ]
        },
        {
            title: '💰 SISTEMA',
            rows: [
                { id: '.economia', title: '💰 Economia', description: 'Sistema monetario completo' },
                { id: '.giochi', title: '🎮 Giochi', description: 'Slot, quiz e altro' },
                { id: '.livelli', title: '🏆 Livelli', description: 'Sistema XP e ricompense' }
            ]
        },
        {
            title: '🎉 SOCIAL',
            rows: [
                { id: '.fun', title: '🎪 Fun', description: 'Comandi divertenti' },
                { id: '.social', title: '💬 Social', description: 'Interazione utenti' },
                { id: '.utility', title: '🔧 Utility', description: 'Strumenti vari' }
            ]
        }
    ];

    await sendListOrFallback(client, msg.from, menuText, sections, '📋 Menu Principale', '🤖 Bot WhatsApp');
    return;
}

// ========== MENU MODERAZIONE ==========
else if (command === 'moderazione' || command === 'mod') {
    const modText = `
╔═══════════════════════╗
║ 👮 *MODERAZIONE*     ║
╚═══════════════════════╝

👥 *GESTIONE UTENTI:*
• \`.kick @user\` - Rimuovi utente
• \`.ban @user\` - Banna permanentemente
• \`.unban @user\` - Rimuovi ban
• \`.muta @user [tempo]\` - Silenzia utente
• \`.smuta @user\` - Rimuovi mute
• \`.warn @user [motivo]\` - Avvisa utente
• \`.unwarn @user\` - Rimuovi warn
• \`.warnings [@user]\` - Vedi warns
• \`.clearwarns @user\` - Resetta warns

👑 *GESTIONE ADMIN:*
• \`.p @user\` - Promuovi admin
• \`.d @user\` - Degrada admin
• \`.admins\` - Lista admin
• \`.promote-all\` - Promuovi tutti
• \`.demote-all\` - Degrada tutti

🛡️ *PROTEZIONE:*
• \`.antilink on/off\` - Blocca link
• \`.antibot on/off\` - Blocca bot
• \`.antispam on/off\` - Anti spam
• \`.antiraid on/off\` - Anti raid
• \`.antiflood on/off\` - Anti flood
• \`.slowmode [sec]\` - Rallenta chat

📝 *CONTENUTI:*
• \`.blocca [parola]\` - Blocca parola
• \`.sblocca [parola]\` - Sblocca parola
• \`.listaparole\` - Parole bloccate
• \`.r\` - Elimina messaggio

⚙️ *CONFIGURAZIONE:*
• \`.regole [testo]\` - Imposta regole
• \`.vediregole\` - Mostra regole
• \`.chiudi\` - Solo admin scrivono
• \`.apri\` - Tutti scrivono
• \`.lock\` - Blocca impostazioni
• \`.unlock\` - Sblocca impostazioni
• \`.setwelcome [msg]\` - Msg benvenuto
• \`.setgoodbye [msg]\` - Msg addio
• \`.setmaxwarns [num]\` - Max warn
• \`.visual on/off\` - Foto visualizzabili una volta
• \`.link\` - Manda link del gruppo
• \`.revoke\` - Resetta link del gruppo

*👁️ VISUALIZZA RICHIESTE:*
- \`.richieste\` - Mostra lista completa
  └─ Vedi tutti i numeri in attesa

*✅ ACCETTAZIONE:*
- \`.accettarichieste\` - Accetta TUTTE
  └─ Approva tutte in automatico
- \`.accetta @numero\` - Accetta singola
  └─ Esempio: \`.accetta @393123456789\`

*❌ RIFIUTO:*
- \`.rifiutarichieste\` - Rifiuta TUTTE
  └─ Richiede conferma per sicurezza
- \`.confermarifiuto\` - Conferma rifiuto
  └─ Completa l'operazione di rifiuto
- \`.rifiuta @numero\` - Rifiuta singola
  └─ Esempio: \`.rifiuta @393123456789\`

*⚙️ ALTRE AZIONI:*
- \`.annulla\` - Annulla operazione
  └─ Cancella rifiuto in attesa

📊 *STATISTICHE:*
• \`.info\` - Info gruppo
• \`.mutati\` - Lista mutati
• \`.bannati\` - Lista bannati
• \`.attivita\` - Attività gruppo
• \`.logs\` - Ultimi eventi

🎯 *AZIONI RAPIDE:*
• \`.tag [msg]\` - Tagga tutti
• \`.hidetag [msg]\` - Tag nascosto
• \`.purge [num]\` - Elimina messaggi
• \`.pin\` - Fissa messaggio
• \`.unpin\` - Rimuovi fissa

━━━━━━━━━━━━━━━━━━━━━
💡 Usa \`.automod\` per configurare la protezione automatica!
`;
    await msg.reply(modText);
    return;
}

// ========== MENU AUTO-MODERAZIONE ==========
if (command === 'automod' || command === 'automoderatore') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    
    initGroup(chat.id._serialized);
    const g = groupData[chat.id._serialized];
    const automod = automodConfig[chat.id._serialized] || {};
    
    const automodText = `
╔═══════════════════════╗
║ 🛡️ *AUTO-MODERAZIONE*║
╚═══════════════════════╝

*📊 STATO PROTEZIONI:*
┌─────────────────────┐
│ 🔗 Antilink: ${g.antilink ? '✅ ON' : '❌ OFF'}
│ 🤖 Antibot: ${g.antiBot ? '✅ ON' : '❌ OFF'}
│ 💥 Antispam: ${g.antiSpam ? '✅ ON' : '❌ OFF'}
│ 🛡️ Antiraid: ${automod.antiRaid ? '✅ ON' : '❌ OFF'}
│ 💥 Antiflood: ${automod.antiFlood ? '✅ ON' : '❌ OFF'}
│ ⏱️ Slowmode: ${g.slowmode}s
│ ⚠️ Max Warns: ${g.maxWarns || 3}
└─────────────────────┘

*⚙️ CONFIGURAZIONE:*
• \`.antilink on/off\` - Rimuove link
• \`.antibot on/off\` - Rimuove bot
• \`.antispam on/off\` - Blocca spam
• \`.antiraid on/off\` - Protegge da raid
• \`.antiflood on/off [msg] [sec]\` - Config flood
• \`.slowmode [sec]\` - Ritardo messaggi
• \`.setmaxwarns [num]\` - Warn prima ban

*📝 ESEMPI:*
┌─────────────────────┐
│ Antiflood:
│ \`.antiflood on 5 10\`
│ (Max 5 msg in 10 sec)
│
│ Slowmode:
│ \`.slowmode 5\`
│ (1 msg ogni 5 sec)
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
💡 Le protezioni attive rimuovono automaticamente contenuti violanti!
`;
    await msg.reply(automodText);
    return;
}

// ========== COMANDO: .tag / .tagall (gestione testuale + media + sticker) ==========
else if (command === 'tag' || command === 'tagall') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    // Recupera il messaggio quotato se presente
    let quotedMsgObj = null;
    if (msg.hasQuotedMsg) {
        try {
            quotedMsgObj = await msg.getQuotedMessage();
        } catch (e) {
            console.log('Errore recupero messaggio quotato:', e);
            quotedMsgObj = null;
        }
    }

    // Se NON ci sono argomenti E NON c'è un messaggio quotato -> non fare nulla (silenzioso)
    if (args.length === 0 && !quotedMsgObj) {
        return;
    }

    // Raccogli tutti i contatti del gruppo per le menzioni
    const mentions = [];
    try {
        for (let participant of chat.participants) {
            try {
                const jid = participant.id && participant.id._serialized ? participant.id._serialized : participant;
                const contact = await client.getContactById(jid);
                if (contact) mentions.push(contact);
            } catch (e) {
                console.log('Impossibile ottenere contatto durante tag:', participant.id ? participant.id._serialized : participant, e);
            }
        }
    } catch (e) {
        console.error('Errore raccogliendo partecipanti per .tag:', e);
    }

    // Se sono presenti argomenti (".tag ciao") -> invia semplice testo con mentions
    if (args.length > 0) {
        const textToSend = args.join(' ').trim() || '📢';
        try {
            await chat.sendMessage(textToSend, { mentions });
        } catch (err) {
            console.error('Errore invio .tag con testo:', err);
            await msg.reply('❌ Errore durante l\'invio del tag.');
        }
        return;
    }

    // Qui: non ci sono argomenti ma c'è un messaggio quotato -> gestisci in base al tipo
    try {
        // Se il messaggio quotato è testuale -> invia il testo (senza mostrare la lista di nomi)
        if (quotedMsgObj.type === 'chat' || (typeof quotedMsgObj.body === 'string' && quotedMsgObj.body.trim().length > 0)) {
            const textToSend = quotedMsgObj.body || '📢 Messaggio condiviso';
            await chat.sendMessage(textToSend, { mentions });
            return;
        }

        // Se è uno sticker -> forward + notifica con mentions (i sticker non supportano caption/mentions)
        if (quotedMsgObj.type === 'sticker') {
            try {
                await quotedMsgObj.forward(chat.id);
                // Notifica breve con mentions (minimale)
                await chat.sendMessage('[Sticker condiviso]', { mentions });
            } catch (e) {
                console.error('Errore forwarding sticker:', e);
                // fallback: invia un messaggio descrittivo con mentions
                await chat.sendMessage('[Sticker condiviso]', { mentions });
            }
            return;
        }

        // Se è media (image, video, audio, document, ecc.) -> prova a scaricare e reinviare con mentions nella caption
        if (quotedMsgObj.hasMedia) {
            try {
                const media = await quotedMsgObj.downloadMedia();
                // tenta di usare la stessa caption se presente, altrimenti una minima descrizione
                const caption = quotedMsgObj.caption || quotedMsgObj.body || '';
                // Reinvia il media con mentions (whatsapp-web.js supporta caption + mentions su immagini/video/documenti)
                await chat.sendMessage(media, { caption: caption, mentions });
                return;
            } catch (e) {
                console.error('Errore download/reinvio media:', e);
                // fallback: forward + notifica con mentions
                try {
                    await quotedMsgObj.forward(chat.id);
                    await chat.sendMessage('[Media condiviso]', { mentions });
                    return;
                } catch (ee) {
                    console.error('Fallback forward media fallito:', ee);
                    await msg.reply('❌ Impossibile condividere il media con mentions.');
                    return;
                }
            }
        }

        // Caso generico (non riconosciuto): invia fallback testuale taggando tutti
        await chat.sendMessage('[Messaggio condiviso]', { mentions });
    } catch (err) {
        console.error('Errore comando .tag (gestione quote/media):', err);
        await msg.reply('❌ Errore durante il tag di tutti i membri.');
    }
}

        

// ========== HIDETAG ==========
else if (command === 'hidetag') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    
    try {
        const text = args.join(' ') || '👻 *Messaggio nascosto*';
        const mentions = chat.participants.map(p => p.id._serialized);
        
        await chat.sendMessage(text, { mentions });
        await msg.delete(true); // Elimina comando
        
        console.log(`[HIDETAG] Admin ${msg.author} ha inviato messaggio nascosto`);
        
    } catch (err) {
        console.error('Errore hidetag:', err);
        await msg.reply('❌ Errore durante l\'invio del messaggio.');
    }
}

// ========== KICK (Rimozione utente) ==========
else if (command === 'kick' || command === 'remove') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin per rimuovere utenti!');

    try {
        const targetContact = await getTargetFromMsg(msg);
        if (!targetContact) {
            const helpText = `
╔═══════════════════════╗
║   👢 *KICK UTENTE*   ║
╚═══════════════════════╝

*📝 COME USARE:*
┌─────────────────────┐
│ Metodo 1: Menziona
│ \`.kick @utente [motivo]\`
│
│ Metodo 2: Rispondi
│ Rispondi a un messaggio
│ con \`.kick [motivo]\`
└─────────────────────┘

*💡 ESEMPI:*
- \`.kick @mario Spam\`
- \`.kick @luca Comportamento scorretto\`
- Rispondi e scrivi: \`.kick Insulti\`

━━━━━━━━━━━━━━━━━━━━━
⚠️ *Nota:* Non puoi rimuovere admin!
`;
            return msg.reply(helpText);
        }

        const toKickId = targetContact.id._serialized;
        const toKickNumber = toKickId.split('@')[0];
        const toKickName = await getUserDisplayName(toKickId, chat);
        const adminName = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
        
        // Estrai il motivo (salta @mention se presente)
        let reason = args.slice(1).join(' ');
        if (reason.startsWith('@')) {
            reason = args.slice(2).join(' ');
        }
        reason = reason || 'Nessun motivo specificato';

        // Verifica partecipante aggiornato
        const freshChat = await client.getChatById(chat.id._serialized);
        const participant = freshChat.participants.find(p => p.id._serialized === toKickId);

        if (!participant) {
            return msg.reply('❌ *Utente non trovato nel gruppo!*\n\n🔍 Verifica che l\'utente sia ancora membro del gruppo.');
        }

        if (participant.isAdmin || participant.isSuperAdmin) {
            const adminWarnText = `
╔═══════════════════════╗
║  ⚠️ *AZIONE NEGATA*  ║
╚═══════════════════════╝

*❌ Impossibile rimuovere admin!*

┌─────────────────────┐
│ 👤 Utente: ${toKickName}
│ 👑 Ruolo: ${participant.isSuperAdmin ? 'Super Admin' : 'Admin'}
└─────────────────────┘

*📝 SOLUZIONE:*
1. Degrada l'utente con:
   \`.d @${toKickNumber}\`
2. Poi riprova il kick

━━━━━━━━━━━━━━━━━━━━━
💡 Gli admin devono essere degradati prima!
`;
            return msg.reply(adminWarnText, { mentions: [targetContact] });
        }

        // Rimuovi utente
        await chat.removeParticipants([toKickId]);

        // Salva log (se hai sistema di logging)
        if (typeof logModAction === 'function') {
            await logModAction(chat.id._serialized, 'KICK', {
                target: toKickId,
                targetName: toKickName,
                moderator: msg.author || msg.from,
                reason: reason,
                timestamp: Date.now()
            });
        }

        const kickText = `
╔═══════════════════════╗
║  👢 *UTENTE RIMOSSO* ║
╚═══════════════════════╝

*👤 INFORMAZIONI:*
┌─────────────────────┐
│ 🎯 Utente: *${toKickName}*
│ 📱 Numero: +${toKickNumber}
│ 
│ 📝 Motivo:
│ "${reason}"
│ 
│ 👮 Moderatore: @${adminName}
│ ⏰ Data: ${new Date().toLocaleString('it-IT')}
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
✅ *Azione completata con successo!*
🚪 L'utente è stato espulso dal gruppo.
`;

        await msg.reply(kickText, { mentions: [targetContact] });

        console.log(`[KICK] ${toKickName} (${toKickNumber}) rimosso da ${adminName} | Motivo: ${reason}`);

    } catch (err) {
        console.error('Errore kick:', err);
        
        const errorText = `
╔═══════════════════════╗
║  ❌ *ERRORE KICK*    ║
╚═══════════════════════╝

*⚠️ Impossibile rimuovere l'utente*

*🔍 POSSIBILI CAUSE:*
┌─────────────────────┐
│ • Il bot non è admin
│ • L'utente è admin
│ • L'utente ha lasciato il gruppo
│ • Errore di connessione
└─────────────────────┘

*📝 VERIFICA:*
1. Il bot ha i permessi admin
2. L'utente non è amministratore
3. L'utente è ancora nel gruppo

━━━━━━━━━━━━━━━━━━━━━
💡 Riprova o contatta il supporto
`;
        
        await msg.reply(errorText);
    }
}


// ========== HELPER FUNCTIONS ==========

// Helper: ottieni target da mentions o da reply (più robusto)
async function getTargetFromMsg(msg) {
    // 1) se ci sono mentions, prendi la prima
    try {
        const mentioned = await msg.getMentions();
        if (mentioned && mentioned.length > 0) return mentioned[0]; // Contact
    } catch (e) {
        console.error('getMentions error:', e && e.stack ? e.stack : e);
    }

    // 2) se il comando è una reply, prendi l'autore del messaggio quotato
    if (msg.hasQuotedMsg) {
        try {
            const quoted = await msg.getQuotedMessage();
            // estrai l'id autore con più fallback possibili
            const authorId =
                quoted.author ||
                quoted.from ||
                (quoted._data && (quoted._data.participant || quoted._data.author || quoted._data.from)) ||
                null;

            if (authorId) {
                try {
                    const contact = await client.getContactById(authorId);
                    return contact;
                } catch (err) {
                    console.error('client.getContactById(quoted author) error:', err && err.stack ? err.stack : err);
                }
            }
        } catch (e) {
            console.error('Errore getQuotedMessage:', e && e.stack ? e.stack : e);
        }
    }

    // nessun target
    return null;
}

// Utility per ottenere nome visualizzato (con fallback)
async function getUserDisplayName(userId, chat) {
    try {
        const contact = await client.getContactById(userId);
        return contact.pushname || contact.name || contact.number || userId.split('@')[0];
    } catch (err) {
        // Fallback: cerca nei partecipanti
        try {
            const freshChat = await client.getChatById(chat.id._serialized);
            const participant = freshChat.participants.find(p => p.id._serialized === userId);
            if (participant) {
                const pContact = await client.getContactById(participant.id._serialized);
                return pContact.pushname || pContact.name || pContact.number || userId.split('@')[0];
            }
        } catch (e) {
            console.error('Errore getUserDisplayName:', e);
        }
        return userId.split('@')[0];
    }
}

// Utility per garantire struttura gruppo
function ensureGroupData(chatId) {
    initGroup(chatId); // se hai già questa funzione, la chiamiamo
    if (!groupData[chatId]) {
        groupData[chatId] = {
            mutedUsers: [],
            muteTime: {},
            visualMode: false,
            antilink: false,
            antiBot: false,
            antiSpam: false,
            slowmode: 0,
            maxWarns: 3
        };
    }
    return groupData[chatId];
}

// Funzione opzionale per logging azioni moderazione
function logModAction(chatId, action, data) {
    if (!global.modLogs) global.modLogs = {};
    if (!global.modLogs[chatId]) global.modLogs[chatId] = [];
    
    global.modLogs[chatId].push({
        action,
        ...data,
        timestamp: Date.now()
    });
    
    // Mantieni solo ultimi 100 log per gruppo
    if (global.modLogs[chatId].length > 100) {
        global.modLogs[chatId] = global.modLogs[chatId].slice(-100);
    }
}

// ========== MUTA ==========
if (command === 'muta' || command === 'mute') {
  if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
  if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
  if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin!');

  // ottieni chat affidabile (in alcune versioni msg.chat potrebbe non esserci)
  const localChat = chat || (await msg.getChat());

  try {
    const targetContact = await getTargetFromMsg(msg);
    if (!targetContact) {
      return msg.reply(
        '⚠️ *Menziona un utente o rispondi a un suo messaggio!*\n\n' +
        '💡 *Uso:*\n' +
        '• `.muta @utente` - Mute permanente\n' +
        '• `.muta @utente 30` - Mute 30 minuti\n' +
        '• `.muta @utente 2h` - Mute 2 ore\n' +
        '• `.muta @utente 1d` - Mute 1 giorno'
      );
    }

    const toMuteId = targetContact.id._serialized;
    const toMuteName = await getUserDisplayName(toMuteId, localChat);

    // parse tempo
    let muteMinutes = 0;
    const timeArg = args[args.length - 1];
    if (timeArg) {
      if (timeArg.endsWith('d')) {
        muteMinutes = parseInt(timeArg) * 24 * 60;
      } else if (timeArg.endsWith('h')) {
        muteMinutes = parseInt(timeArg) * 60;
      } else if (!isNaN(parseInt(timeArg))) {
        muteMinutes = parseInt(timeArg);
      }
    }

    const chatId = localChat.id._serialized || localChat.id;
    const g = ensureGroupData(chatId);

    if (g.mutedUsers.includes(toMuteId)) {
      return localChat.sendMessage(`⚠️ *${toMuteName}* è già mutato! Usa \`.smuta @utente\` per rimuovere il mute.`, {
        mentions: [targetContact]
      });
    }

    g.mutedUsers.push(toMuteId);

    let responseText = '';
    let unmuteTime = null;

    if (muteMinutes > 0) {
      unmuteTime = Date.now() + (muteMinutes * 60 * 1000);
      if (!g.muteTime) g.muteTime = {};
      g.muteTime[toMuteId] = unmuteTime;

      // Auto-unmute (non persistente su riavvio)
      setTimeout(async () => {
        try {
          initGroup(chatId);
          const gg = groupData[chatId] || { mutedUsers: [], muteTime: {} };
          const idx = gg.mutedUsers.indexOf(toMuteId);
          if (idx !== -1) {
            gg.mutedUsers.splice(idx, 1);
            if (gg.muteTime && gg.muteTime[toMuteId]) delete gg.muteTime[toMuteId];
            saveData();
            const contactSend = await client.getContactById(toMuteId);
            await client.sendMessage(chatId, `🔊 *${contactSend.pushname || contactSend.number}* è stato automaticamente smutato!`, {
              mentions: [contactSend]
            });
          }
        } catch (err) {
          console.error('Errore unmute automatico:', err && err.stack ? err.stack : err);
        }
      }, muteMinutes * 60 * 1000);

      responseText = `
╔═══════════════════════╗
║  🔇 *UTENTE MUTATO*   ║
╚═══════════════════════╝

👤 *Utente:* ${toMuteName}
⏱️ *Durata:* ${muteMinutes >= 1440 ? Math.floor(muteMinutes/1440) + ' giorni' : muteMinutes >= 60 ? Math.floor(muteMinutes/60) + ' ore' : muteMinutes + ' minuti'}
🔊 *Scadenza:* ${new Date(unmuteTime).toLocaleString('it-IT')}

━━━━━━━━━━━━━━━━━━━━━
⚠️ Tutti i suoi messaggi verranno eliminati automaticamente.
🔊 Sarà smutato automaticamente alla scadenza.`;
    } else {
      responseText = `
╔═══════════════════════╗
║  🔇 *UTENTE MUTATO*   ║
╚═══════════════════════╝

👤 *Utente:* ${toMuteName}
⏱️ *Durata:* PERMANENTE ∞

━━━━━━━━━━━━━━━━━━━━━
⚠️ Tutti i suoi messaggi verranno eliminati automaticamente.
💡 Usa \`.smuta @utente\` per rimuovere il mute.`;
    }

    saveData();

    // invia con mentions usando chat.sendMessage (più affidabile per i tag)
    await localChat.sendMessage(responseText, { mentions: [targetContact] });

    console.log(`[MUTE] ${toMuteName} mutato per ${muteMinutes} minuti da ${msg.author}`);
  } catch (err) {
    console.error('Errore muta:', err && err.stack ? err.stack : err);
    // invia messaggio d'errore più descrittivo (puoi rimuovere err.message se non vuoi esporre info)
    await (chat || msg).reply(`❌ Errore durante il mute. Errore: ${err && err.message ? err.message : 'sconosciuto'}`);
  }
}

// ========== SMUTA ==========
if (command === 'smuta' || command === 'unmute') {
  if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
  if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

  const localChat = chat || (await msg.getChat());

  try {
    const targetContact = await getTargetFromMsg(msg);
    if (!targetContact) {
      return msg.reply('⚠️ Menziona un utente o rispondi al suo messaggio! Uso: `.smuta @utente`');
    }

    const toUnmuteId = targetContact.id._serialized;
    const toUnmuteName = await getUserDisplayName(toUnmuteId, localChat);

    const chatId = localChat.id._serialized || localChat.id;
    const g = ensureGroupData(chatId);

    const idx = g.mutedUsers.indexOf(toUnmuteId);

    if (idx === -1) {
      return localChat.sendMessage(`⚠️ *${toUnmuteName}* non è mutato!`, { mentions: [targetContact] });
    }

    g.mutedUsers.splice(idx, 1);
    if (g.muteTime && g.muteTime[toUnmuteId]) delete g.muteTime[toUnmuteId];

    saveData();

    const responseText = `╔═══════════════════════╗
║  🔊 *UTENTE SMUTATO*  ║
╚═══════════════════════╝

👤 *Utente:* ${toUnmuteName}
✅ *Status:* Può scrivere liberamente

━━━━━━━━━━━━━━━━━━━━━
Il mute è stato rimosso con successo!`;

    await localChat.sendMessage(responseText, { mentions: [targetContact] });

    console.log(`[UNMUTE] ${toUnmuteName} smutato da ${msg.author}`);
  } catch (err) {
    console.error('Errore smuta:', err && err.stack ? err.stack : err);
    await (chat || msg).reply(`❌ Errore durante lo smute. Errore: ${err && err.message ? err.message : 'sconosciuto'}`);
  }
}



// ========== WARN ==========
else if (command === 'warn') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    
    const mentioned = await msg.getMentions();
    if (mentioned.length === 0) {
        return msg.reply(
            '⚠️ *Menziona un utente!*\n\n' +
            '💡 *Uso:* `.warn @utente [motivo]`\n' +
            '📝 *Esempio:* `.warn @mario Linguaggio inappropriato`'
        );
    }
    
    try {
        const userId = mentioned[0].id._serialized;
        const userName = await getUserDisplayName(userId, chat);
        const reason = args.slice(1).join(' ') || 'Nessun motivo specificato';
        
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        
        g.warnings[userId] = (g.warnings[userId] || 0) + 1;
        
        // Log warning con timestamp
        if (!g.warningHistory) g.warningHistory = {};
        if (!g.warningHistory[userId]) g.warningHistory[userId] = [];
        g.warningHistory[userId].push({
            reason,
            admin: msg.author,
            timestamp: Date.now()
        });
        
        saveData();
        
        const warnCount = g.warnings[userId];
        const maxWarns = g.maxWarns || 3;
        const progressBar = createProgressBar(warnCount, maxWarns, 10);
        
        // Emoji status
        let statusEmoji = '⚠️';
        if (warnCount >= maxWarns) statusEmoji = '🔴';
        else if (warnCount >= maxWarns * 0.7) statusEmoji = '🟠';
        else if (warnCount >= maxWarns * 0.4) statusEmoji = '🟡';
        else statusEmoji = '🟢';
        
        await msg.reply(
            `╔═══════════════════════╗
║  ⚠️ *WARNING ISSUED*  ║
╚═══════════════════════╝

👤 *Utente:* ${userName}
📊 *Warn:* ${warnCount}/${maxWarns}
${progressBar}

${statusEmoji} *Status:* ${warnCount >= maxWarns ? 'CRITICO' : warnCount >= maxWarns * 0.7 ? 'PERICOLO' : warnCount >= maxWarns * 0.4 ? 'ATTENZIONE' : 'NORMALE'}

💬 *Motivo:*
${reason}

👮 *Admin:* ${msg.author.split('@')[0]}
📅 *Data:* ${new Date().toLocaleString('it-IT')}

━━━━━━━━━━━━━━━━━━━━━
${warnCount >= maxWarns ? '🚨 *LIMITE RAGGIUNTO!* Utente verrà rimosso.' : `⚠️ Ancora *${maxWarns - warnCount} warn* prima della rimozione automatica.`}`
        );
        
        // Auto-kick se limite raggiunto
        if (warnCount >= maxWarns) {
            setTimeout(async () => {
                try {
                    await chat.removeParticipants([userId]);
                    await msg.reply(`🚫 *${userName}* è stato rimosso automaticamente per aver raggiunto ${maxWarns} warning!`);
                    delete g.warnings[userId];
                    saveData();
                } catch (err) {
                    console.error('Errore auto-kick:', err);
                    await msg.reply('❌ Impossibile rimuovere l\'utente. Verifica i permessi del bot.');
                }
            }, 2000);
        }
        
        console.log(`[WARN] ${userName} warned by ${msg.author}: ${reason}`);
        
    } catch (err) {
        console.error('Errore warn:', err);
        await msg.reply('❌ Errore durante l\'invio del warning.');
    }
}

// ========== UNWARN ==========
else if (command === 'unwarn') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    
    const mentioned = await msg.getMentions();
    if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente! Uso: `.unwarn @utente`');
    
    try {
        const userId = mentioned[0].id._serialized;
        const userName = await getUserDisplayName(userId, chat);
        
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        
        if (!g.warnings[userId] || g.warnings[userId] === 0) {
            return msg.reply(`⚠️ *${userName}* non ha warning attivi!`);
        }
        
        const previousWarns = g.warnings[userId];
        g.warnings[userId]--;
        saveData();
        
        const warnCount = g.warnings[userId];
        const maxWarns = g.maxWarns || 3;
        const progressBar = createProgressBar(warnCount, maxWarns, 10);
        
        await msg.reply(
            `╔═══════════════════════╗
║  ✅ *WARNING RIMOSSO* ║
╚═══════════════════════╝

👤 *Utente:* ${userName}
📊 *Warn precedenti:* ${previousWarns}
📊 *Warn attuali:* ${warnCount}/${maxWarns}
${progressBar}

━━━━━━━━━━━━━━━━━━━━━
Un warning è stato rimosso con successo!`
        );
        
    } catch (err) {
        console.error('Errore unwarn:', err);
        await msg.reply('❌ Errore durante la rimozione del warning.');
    }
}

// ========== WARNINGS ==========
else if (command === 'warnings') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    const userId = getUserIdFromMsg(msg);
    const mentioned = await msg.getMentions();
    const targetId = mentioned.length > 0 ? mentioned[0].id._serialized : userId;
    const targetName = mentioned.length > 0 
        ? await getUserDisplayName(targetId, chat)
        : 'Tu';
    
    initGroup(chat.id._serialized);
    const g = groupData[chat.id._serialized];
    
    const warnCount = g.warnings[targetId] || 0;
    const maxWarns = g.maxWarns || 3;
    const progressBar = createProgressBar(warnCount, maxWarns, 15);
    
    // Status con emoji
    let status = '';
    let statusEmoji = '';
    if (warnCount === 0) {
        status = '✅ Nessun warning';
        statusEmoji = '🟢';
    } else if (warnCount < maxWarns * 0.4) {
        status = '⚠️ Attenzione';
        statusEmoji = '🟡';
    } else if (warnCount < maxWarns * 0.7) {
        status = '🚨 Pericolo';
        statusEmoji = '🟠';
    } else if (warnCount < maxWarns) {
        status = '🔴 Critico';
        statusEmoji = '🔴';
    } else {
        status = '💀 Limite raggiunto';
        statusEmoji = '💀';
    }
    
    // Storia warnings (ultimi 3)
    let historyText = '';
    if (g.warningHistory && g.warningHistory[targetId] && g.warningHistory[targetId].length > 0) {
        const history = g.warningHistory[targetId].slice(-3).reverse();
        historyText = '\n\n📜 *ULTIMI WARNING:*\n';
        history.forEach((w, i) => {
            const date = new Date(w.timestamp).toLocaleDateString('it-IT');
            historyText += `${i + 1}. ${w.reason}\n   👮 ${w.admin.split('@')[0]} • ${date}\n`;
        });
    }
    
    await msg.reply(
        `╔═══════════════════════╗
║  📋 *WARNINGS*        ║
╚═══════════════════════╝

👤 *Utente:* ${targetName}
📊 *Warn:* ${warnCount}/${maxWarns}
${progressBar}

${statusEmoji} *Status:* ${status}
${warnCount >= maxWarns ? '⛔ *AZIONE:* Prossimo warn = kick automatico' : `💡 *Rimanenti:* ${maxWarns - warnCount} warn disponibili`}${historyText}

━━━━━━━━━━━━━━━━━━━━━
${warnCount > 0 ? '💡 Admin possono usare `.unwarn @utente` per rimuovere un warn' : '✨ Record pulito! Nessuna infrazione registrata.'}`
    );
}

// ========== CLEAR WARNINGS ==========
else if (command === 'clearwarns') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    
    const mentioned = await msg.getMentions();
    if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente! Uso: `.clearwarns @utente`');
    
    try {
        const userId = mentioned[0].id._serialized;
        const userName = await getUserDisplayName(userId, chat);
        
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        
        const previousWarns = g.warnings[userId] || 0;
        g.warnings[userId] = 0;
        
        // Cancella anche la storia
        if (g.warningHistory && g.warningHistory[userId]) {
            delete g.warningHistory[userId];
        }
        
        saveData();
        
        await msg.reply(
            `╔═══════════════════════╗
║  🗑️ *WARNS CANCELLATI*║
╚═══════════════════════╝

👤 *Utente:* ${userName}
📊 *Warn precedenti:* ${previousWarns}
✨ *Warn attuali:* 0

━━━━━━━━━━━━━━━━━━━━━
✅ Tutti i warning e la cronologia sono stati cancellati!
🎉 L'utente ha un record pulito.`
        );
        
        console.log(`[CLEARWARNS] ${userName} warns cleared by ${msg.author}`);
        
    } catch (err) {
        console.error('Errore clearwarns:', err);
        await msg.reply('❌ Errore durante la cancellazione dei warning.');
    }
}

// ========== ANTILINK ==========
else if (command === 'antilink') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const status = args[0]?.toLowerCase();
    
    if (!['on', 'off'].includes(status)) {
        initGroup(chat.id._serialized);
        const currentStatus = groupData[chat.id._serialized].antilink ? '✅ ON' : '❌ OFF';
        return msg.reply(
            `⚙️ 🔗 *ANTILINK*\n\n` +
            `*Status attuale:* ${currentStatus}\n\n` +
            `*Descrizione:*\n` +
            `Blocca automaticamente messaggi contenenti link esterni.\n\n` +
            `*Uso:* \`.antilink on/off\``
        );
    }
    
    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].antilink = (status === 'on');
    saveData();
    
    await msg.reply(`✅ 🔗 Antilink ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!\n\n${status === 'on' ? '⚠️ I link esterni verranno rimossi automaticamente.' : '📋 I link sono ora consentiti.'}`);
}

// ========== ANTIBOT ==========
else if (command === 'antibot') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const status = args[0]?.toLowerCase();
    
    if (!['on', 'off'].includes(status)) {
        initGroup(chat.id._serialized);
        const currentStatus = groupData[chat.id._serialized].antiBot ? '✅ ON' : '❌ OFF';
        return msg.reply(
            `⚙️ 🤖 *ANTIBOT*\n\n` +
            `*Status attuale:* ${currentStatus}\n\n` +
            `*Descrizione:*\n` +
            `Previene l'aggiunta di altri bot al gruppo.\n\n` +
            `*Uso:* \`.antibot on/off\``
        );
    }
    
    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].antiBot = (status === 'on');
    saveData();
    
    await msg.reply(`✅ 🤖 Antibot ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!\n\n${status === 'on' ? '⚠️ I bot non autorizzati verranno rimossi.' : '📋 È ora possibile aggiungere altri bot.'}`);
}

// ========== ANTISPAM ==========
else if (command === 'antispam') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const status = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(status)) return msg.reply('⚠️ Usa: `.antispam on/off`');
    
    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].antiSpam = (status === 'on');
    saveData();
    
    await msg.reply(`✅ 💥 Anti-spam ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!\n\n${status === 'on' ? '⚠️ Messaggi spam verranno bloccati.' : '📋 Controllo spam disattivato.'}`);
}

// ========== ANTIFLOOD ==========
else if (command === 'antiflood') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const status = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(status)) {
        return msg.reply(
            '⚠️ *Uso:* `.antiflood on/off [maxMsg] [secondi]`\n\n' +
            '💡 *Esempio:*\n' +
            '`.antiflood on 5 10`\n' +
            '(Max 5 messaggi in 10 secondi)'
        );
    }
    
    initGroup(chat.id._serialized);
    if (!automodConfig[chat.id._serialized]) automodConfig[chat.id._serialized] = {};
    
    automodConfig[chat.id._serialized].antiFlood = (status === 'on');
    
    if (status === 'on') {
        const maxMsg = parseInt(args[1]) || 5;
        const timeWindow = parseInt(args[2]) || 10;
        automodConfig[chat.id._serialized].maxMessages = maxMsg;
        automodConfig[chat.id._serialized].timeWindow = timeWindow;
        
        await msg.reply(
            `✅ 💥 Antiflood *ATTIVATO*!\n\n` +
            `📊 *Configurazione:*\n` +
            `• Max messaggi: *${maxMsg}*\n` +
            `• Finestra temporale: *${timeWindow}s*\n\n` +
            `⚠️ Utenti che superano il limite riceveranno un warn.`
        );
    } else {
        await msg.reply('✅ 💥 Antiflood *DISATTIVATO*!');
    }
    
    saveData();
}

// ========== SLOWMODE ==========
else if (command === 'slowmode') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const seconds = parseInt(args[0]);
    
    if (isNaN(seconds) || seconds < 0) {
        return msg.reply(
            '⚠️ *Uso:* `.slowmode [secondi]`\n\n' +
            '💡 *Esempi:*\n' +
            '• `.slowmode 5` - 1 msg ogni 5 secondi\n' +
            '• `.slowmode 0` - Disattiva slowmode'
        );
    }
    
    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].slowmode = seconds;
    saveData();
    
    if (seconds === 0) {
        await msg.reply('✅ ⏱️ Slowmode *DISATTIVATO*!');
    } else {
        await msg.reply(
            `✅ ⏱️ Slowmode *ATTIVATO*!\n\n` +
            `⏱️ *Intervallo:* ${seconds} secondi\n` +
            `📋 Gli utenti possono inviare 1 messaggio ogni ${seconds} secondi.`
        );
    }
}

// ========== BLOCCA PAROLA ==========
else if (command === 'blocca' || command === 'blockword') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const word = args.join(' ').toLowerCase().trim();
    if (!word) return msg.reply('⚠️ Specifica una parola! Uso: `.blocca [parola]`');
    
    initGroup(chat.id._serialized);
    const g = groupData[chat.id._serialized];
    
    if (g.blockedWords.includes(word)) {
        return msg.reply(`⚠️ La parola *"${word}"* è già bloccata!`);
    }
    
    g.blockedWords.push(word);
    saveData();
    
    await msg.reply(
        `✅ 🚫 *PAROLA BLOCCATA*\n\n` +
        `📝 Parola: *"${word}"*\n` +
        `📊 Totale bloccate: *${g.blockedWords.length}*\n\n` +
        `⚠️ Messaggi contenenti questa parola verranno eliminati.`
    );
}

// ========== SBLOCCA PAROLA ==========
else if (command === 'sblocca' || command === 'unblockword') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const word = args.join(' ').toLowerCase().trim();
    if (!word) return msg.reply('⚠️ Specifica una parola! Uso: `.sblocca [parola]`');
    
    initGroup(chat.id._serialized);
    const g = groupData[chat.id._serialized];
    const idx = g.blockedWords.indexOf(word);
    
    if (idx === -1) {
        return msg.reply(`⚠️ La parola *"${word}"* non è bloccata!`);
    }
    
    g.blockedWords.splice(idx, 1);
    saveData();
    
    await msg.reply(
        `✅ *PAROLA SBLOCCATA*\n\n` +
        `📝 Parola: *"${word}"*\n` +
        `📊 Totale bloccate: *${g.blockedWords.length}*`
    );
}

// ========== LISTA PAROLE ==========
else if (command === 'listaparole') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    
    initGroup(chat.id._serialized);
    const words = groupData[chat.id._serialized].blockedWords;
    
    if (words.length === 0) {
        return msg.reply('📋 *PAROLE BLOCCATE*\n\nNessuna parola bloccata al momento.');
    }
    
    let text = `╔═══════════════════════╗
║  🚫 *PAROLE BLOCCATE* ║
╚═══════════════════════╝

📊 *Totale:* ${words.length}\n\n`;
    
    words.forEach((w, i) => {
        text += `${i + 1}. ${w}\n`;
    });
    
    text += `\n━━━━━━━━━━━━━━━━━━━━━\n💡 Usa \`.sblocca [parola]\` per rimuovere una parola.`;
    
    await msg.reply(text);
}

// ========== REGOLE ==========
else if (command === 'regole' || command === 'setrules') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const rules = args.join(' ').trim();
    if (!rules) {
        return msg.reply(
            '⚠️ *Specifica le regole!*\n\n' +
            '💡 *Uso:* `.regole [testo regole]`\n\n' +
            '📝 *Esempio:*\n' +
            '`.regole 1. Rispetta tutti\n2. No spam\n3. No insulti`'
        );
    }
    
    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].rules = rules;
    saveData();
    
    await msg.reply('✅ 📜 *Regole impostate con successo!*\n\nGli utenti possono vederle con `.vediregole`');
}

// ========== VEDI REGOLE ==========
else if (command === 'vediregole' || command === 'rules') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    
    initGroup(chat.id._serialized);
    const rules = groupData[chat.id._serialized].rules;
    
    if (!rules) {
        return msg.reply('⚠️ *Nessuna regola impostata!*\n\nGli admin possono impostarle con `.regole`');
    }
    
    await msg.reply(
        `╔═══════════════════════╗
║  📜 *REGOLE GRUPPO*   ║
╚═══════════════════════╝

${rules}

━━━━━━━━━━━━━━━━━━━━━
⚠️ Il rispetto delle regole è obbligatorio!`
    );
}

// ========== CHIUDI GRUPPO ==========
else if (command === 'chiudi' || command === 'close') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        await chat.setMessagesAdminsOnly(true);
        await msg.reply(
            `🔒 *GRUPPO CHIUSO*\n\n` +
            `📋 Solo gli admin possono scrivere.\n` +
            `💡 Usa \`.apri\` per riaprire il gruppo.`
        );
    } catch (err) {
        console.error('Errore chiudi gruppo:', err);
        await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
    }
}

// ========== APRI GRUPPO ==========
else if (command === 'apri' || command === 'open') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        await chat.setMessagesAdminsOnly(false);
        await msg.reply(
            `🔓 *GRUPPO APERTO*\n\n` +
            `📋 Tutti possono scrivere.\n` +
            `💡 Usa \`.chiudi\` per limitare ai soli admin.`
        );
    } catch (err) {
        console.error('Errore apri gruppo:', err);
        await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
    }
}

// ========== LOCK IMPOSTAZIONI ==========
else if (command === 'lock') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        await chat.setInfoAdminsOnly(true);
        await msg.reply(
            `🔒 *IMPOSTAZIONI BLOCCATE*\n\n` +
            `📋 Solo admin possono modificare:\n` +
            `• Nome gruppo\n` +
            `• Descrizione\n` +
            `• Foto profilo\n\n` +
            `💡 Usa \`.unlock\` per sbloccare.`
        );
    } catch (err) {
        console.error('Errore lock:', err);
        await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
    }
}

// ========== UNLOCK IMPOSTAZIONI ==========
else if (command === 'unlock') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        await chat.setInfoAdminsOnly(false);
        await msg.reply(
            `🔓 *IMPOSTAZIONI SBLOCCATE*\n\n` +
            `📋 Tutti possono modificare le info del gruppo.\n` +
            `💡 Usa \`.lock\` per limitare agli admin.`
        );
    } catch (err) {
        console.error('Errore unlock:', err);
        await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
    }
}

// ========== DELETE MESSAGE ==========
else if (command === 'r' || command === 'delete') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        const quoted = await msg.getQuotedMessage();
        if (!quoted) {
            return msg.reply('⚠️ Rispondi al messaggio da eliminare!\n\n💡 Quota il messaggio e poi usa `.r`');
        }
        
        await quoted.delete(true);
        await msg.reply('✅ 🗑️ Messaggio eliminato!');
        
        // Elimina anche il comando dopo 2 secondi
        setTimeout(async () => {
            try {
                await msg.delete(true);
            } catch (e) {
                // Ignora errori
            }
        }, 2000);
        
    } catch (err) {
        console.error('Errore delete:', err);
        await msg.reply('❌ Impossibile eliminare. Il messaggio potrebbe essere troppo vecchio o non ho i permessi.');
    }
}

// ========== PROMUOVI ==========
else if (command === 'p' || command === 'promuovi' || command === 'promote') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin!');
    
    const mentioned = await msg.getMentions();
    if (!mentioned || mentioned.length === 0) {
        return msg.reply(
            '⚠️ *Menziona almeno un utente!*\n\n' +
            '💡 *Uso:* `.p @utente1 @utente2 ...`\n' +
            '📝 *Esempio:* `.p @mario @luigi`'
        );
    }
    
    const promoted = [];
    const failed = [];
    const botId = client.info?.wid?._serialized;
    
    for (const u of mentioned) {
        const uid = u.id._serialized;
        const display = await getUserDisplayName(uid, chat);
        
        if (botId && uid === botId) {
            failed.push({ display, reason: 'Bot già admin' });
            continue;
        }
        
        try {
            await chat.promoteParticipants([uid]);
            promoted.push(display);
        } catch (err) {
            console.error(`Errore promozione ${display}:`, err);
            failed.push({ display, reason: err.message || 'Errore sconosciuto' });
        }
    }
    
    let reply = `╔═══════════════════════╗
║  👑 *PROMOZIONI*      ║
╚═══════════════════════╝\n\n`;
    
    if (promoted.length > 0) {
        reply += `✅ *Promossi:* ${promoted.length}\n`;
        promoted.forEach(n => reply += `• ${n}\n`);
        reply += '\n';
    }
    
    if (failed.length > 0) {
        reply += `⚠️ *Non promossi:* ${failed.length}\n`;
        failed.forEach(f => reply += `• ${f.display} — ${f.reason}\n`);
    }
    
    await msg.reply(reply);
}

// ========== DEGRADA ==========
else if (command === 'd' || command === 'degrada' || command === 'demote') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin!');
    
    const mentioned = await msg.getMentions();
    if (!mentioned || mentioned.length === 0) {
        return msg.reply(
            '⚠️ *Menziona almeno un utente!*\n\n' +
            '💡 *Uso:* `.d @utente1 @utente2 ...`\n' +
            '📝 *Esempio:* `.d @mario @luigi`'
        );
    }
    
    const demoted = [];
    const failed = [];
    const botId = client.info?.wid?._serialized;
    
    for (const u of mentioned) {
        const uid = u.id._serialized;
        const display = await getUserDisplayName(uid, chat);
        
        if (botId && uid === botId) {
            failed.push({ display, reason: 'Non posso degradare me stesso' });
            continue;
        }
        
        try {
            await chat.demoteParticipants([uid]);
            demoted.push(display);
        } catch (err) {
            console.error(`Errore degradazione ${display}:`, err);
            failed.push({ display, reason: err.message || 'Errore sconosciuto' });
        }
    }
    
    let reply = `╔═══════════════════════╗
║  👤 *DEGRADAZIONI*    ║
╚═══════════════════════╝\n\n`;
    
    if (demoted.length > 0) {
        reply += `✅ *Degradati:* ${demoted.length}\n`;
        demoted.forEach(n => reply += `• ${n}\n`);
        reply += '\n';
    }
    
    if (failed.length > 0) {
        reply += `⚠️ *Non degradati:* ${failed.length}\n`;
        failed.forEach(f => reply += `• ${f.display} — ${f.reason}\n`);
    }
    
    await msg.reply(reply);
}

// ========== LISTA ADMIN ==========
else if (command === 'admins') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    
    const admins = chat.participants.filter(p => p.isAdmin || p.isSuperAdmin);
    
    let text = `╔═══════════════════════╗
║  👑 *LISTA ADMIN*     ║
╚═══════════════════════╝

📊 *Totale:* ${admins.length}\n\n`;
    
    for (let i = 0; i < admins.length; i++) {
        const admin = admins[i];
        const name = await getUserDisplayName(admin.id._serialized, chat);
        const role = admin.isSuperAdmin ? '👑' : '👮';
        text += `${role} ${i + 1}. ${name}\n`;
    }
    
    await msg.reply(text);
}

// ========== LISTA MUTATI ==========
else if (command === 'mutati') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    initGroup(chat.id._serialized);
    const muted = groupData[chat.id._serialized].mutedUsers;
    
    if (muted.length === 0) {
        return msg.reply('📋 *UTENTI MUTATI*\n\nNessun utente mutato al momento.');
    }
    
    let text = `╔═══════════════════════╗
║  🔇 *UTENTI MUTATI*   ║
╚═══════════════════════╝

📊 *Totale:* ${muted.length}\n\n`;
    
    for (let i = 0; i < muted.length; i++) {
        const name = await getUserDisplayName(muted[i], chat);
        const muteTime = groupData[chat.id._serialized].muteTime?.[muted[i]];
        
        if (muteTime) {
            const remaining = Math.max(0, Math.floor((muteTime - Date.now()) / 60000));
            text += `${i + 1}. ${name}\n   ⏱️ Scade tra: ${remaining} minuti\n`;
        } else {
            text += `${i + 1}. ${name}\n   ⏱️ Permanente\n`;
        }
    }
    
    await msg.reply(text);
}

// ========== LISTA BANNATI ==========
else if (command === 'bannati') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    initGroup(chat.id._serialized);
    const banned = groupData[chat.id._serialized].bannedUsers;
    
    if (banned.length === 0) { return msg.reply('📋 *UTENTI BANNATI*\n\nNessun utente bannato al momento.');
    }
    
    let text = `╔═══════════════════════╗
║  🚫 *UTENTI BANNATI*  ║
╚═══════════════════════╝

📊 *Totale:* ${banned.length}\n\n`;
    
    for (let i = 0; i < banned.length; i++) {
        const name = await getUserDisplayName(banned[i], chat);
        text += `${i + 1}. ${name}\n`;
    }
    
    text += `\n━━━━━━━━━━━━━━━━━━━━━\n💡 Usa \`.unban @utente\` per rimuovere un ban.`;
    
    await msg.reply(text);
}

// ========== ATTIVITÀ ==========
else if (command === 'attivita' || command === 'activity') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    
    initGroup(chat.id._serialized);
    const g = groupData[chat.id._serialized];
    
    const totalMessages = Object.values(userStats)
        .filter(u => u.messages > 0)
        .reduce((sum, u) => sum + u.messages, 0);
    
    const activeUsers = Object.keys(userStats).filter(id => userStats[id].messages > 0).length;
    const totalUsers = chat.participants.length;
    const activityRate = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0;
    
    await msg.reply(
        `╔═══════════════════════╗
║  📈 *ATTIVITÀ GRUPPO* ║
╚═══════════════════════╝

👥 *UTENTI:*
- Totali: *${totalUsers}*
- Attivi: *${activeUsers}* (${activityRate}%)
- Inattivi: *${totalUsers - activeUsers}*

💬 *MESSAGGI:*
- Totali: *${totalMessages}*
- Media/utente: *${totalUsers > 0 ? Math.floor(totalMessages / totalUsers) : 0}*

🛡️ *MODERAZIONE:*
- Mutati: *${g.mutedUsers.length}* 🔇
- Bannati: *${g.bannedUsers.length}* 🚫
- Warnings attivi: *${Object.values(g.warnings).reduce((sum, w) => sum + w, 0)}* ⚠️

⚙️ *PROTEZIONI:*
- Antilink: ${g.antilink ? '✅' : '❌'}
- Antibot: ${g.antiBot ? '✅' : '❌'}
- Antispam: ${g.antiSpam ? '✅' : '❌'}
- Slowmode: ${g.slowmode > 0 ? `✅ (${g.slowmode}s)` : '❌'}

━━━━━━━━━━━━━━━━━━━━━
📅 *Data:* ${new Date().toLocaleDateString('it-IT')}`
    );
}

// ========== SETMAXWARNS ==========
else if (command === 'setmaxwarns') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const maxWarns = parseInt(args[0]);
    
    if (isNaN(maxWarns) || maxWarns < 1 || maxWarns > 10) {
        return msg.reply(
            '⚠️ *Specifica un numero valido!*\n\n' +
            '💡 *Uso:* `.setmaxwarns [1-10]`\n' +
            '📝 *Esempio:* `.setmaxwarns 3`\n\n' +
            '⚠️ Numero consigliato: 3-5'
        );
    }
    
    initGroup(chat.id._serialized);
    const previousMax = groupData[chat.id._serialized].maxWarns || 3;
    groupData[chat.id._serialized].maxWarns = maxWarns;
    saveData();
    
    await msg.reply(
        `╔═══════════════════════╗
║  ⚙️ *MAX WARNS*       ║
╚═══════════════════════╝

📊 *Valore precedente:* ${previousMax}
✨ *Nuovo valore:* ${maxWarns}

━━━━━━━━━━━━━━━━━━━━━
⚠️ Gli utenti verranno rimossi automaticamente dopo ${maxWarns} warning.`
    );
}

// ========== MODO ADMIN ==========
else if (command === 'modoadmin' || command === 'adminmode') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    const status = args[0]?.toLowerCase();
    
    if (!['on', 'off'].includes(status)) {
        initGroup(chat.id._serialized);
        const currentStatus = groupData[chat.id._serialized].adminMode ? '✅ ON' : '❌ OFF';
        return msg.reply(
            `⚙️ 👑 *MODO ADMIN*\n\n` +
            `*Status attuale:* ${currentStatus}\n\n` +
            `*Descrizione:*\n` +
            `Quando attivo, solo gli admin possono usare i comandi del bot.\n\n` +
            `*Uso:* \`.modoadmin on/off\``
        );
    }
    
    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].adminMode = (status === 'on');
    saveData();
    
    await msg.reply(
        `✅ 👑 Modo Admin ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!\n\n` +
        `${status === 'on' ? '⚠️ Solo gli admin possono usare i comandi.' : '📋 Tutti possono usare i comandi base.'}`
    );
}

    



// ========== MENU ECONOMIA ==========
else if (command === 'economia' || command === 'eco') {
    const ecoText = `
╔═══════════════════════╗
║ 💰 *ECONOMIA*        ║
╚═══════════════════════╝

💵 *GESTIONE SOLDI:*
- \`.soldi [@user]\` - Vedi saldo
- \`.daily\` - Bonus giornaliero
- \`.weekly\` - Bonus settimanale
- \`.monthly\` - Bonus mensile
- \`.lavora\` - Lavora per guadagnare
- \`.crimine\` - Commetti crimine

🏦 *BANCA:*
- \`.deposita [importo]\` - Deposita in banca
- \`.preleva [importo]\` - Preleva da banca
- \`.banca [@user]\` - Info banca

💸 *TRANSAZIONI:*
- \`.regalo @user [importo]\` - Dona soldi
- \`.ruba @user\` - Tenta furto
- \`.scommessa [importo]\` - Scommetti

📈 *INVESTIMENTI:*
- \`.investimento [importo]\` - Investi
- \`.multiplica [importo]\` - Moltiplica
- \`.prestito [importo]\` - Chiedi prestito
- \`.ripaga\` - Ripaga prestito

🏪 *SHOP:*
- \`.shop\` - Negozio oggetti
- \`.compra [id]\` - Compra oggetto
- \`.inventario\` - I tuoi oggetti
- \`.usa [id]\` - Usa oggetto

📊 *CLASSIFICHE:*
- \`.topmoney\` - Più ricchi
- \`.topbank\` - Maggiori risparmi
- \`.toplevel\` - Livelli più alti

━━━━━━━━━━━━━━━━━━━━━
💡 Lavora, investi e diventa il più ricco del gruppo!
`;
    await msg.reply(ecoText);
    return;
}

// ========== MENU GIOCHI ==========
else if (command === 'giochi' || command === 'games') {
    const gamesText = `
╔═══════════════════════╗
║ 🎮 *GIOCHI*          ║
╚═══════════════════════╝

🎲 *GIOCHI CASUALI:*
- \`.dado\` - Lancia dado
- \`.moneta\` - Testa o croce
- \`.8ball [domanda]\` - Palla magica
- \`.scelta op1|op2\` - Scelta random

🎰 *CASINO:*
- \`.slot [bet]\` - Slot machine
- \`.blackjack [bet]\` - Blackjack
- \`.roulette [bet] [num/col]\` - Roulette
- \`.rps [scelta]\` - Morra cinese

🧠 *QUIZ & TRIVIA:*
- \`.quiz\` - Quiz random
- \`.trivia\` - Domanda trivia
- \`.math\` - Matematica veloce
- \`.indovina\` - Indovina numero
- \`.indovinachi\` - Indovina personaggio

🎯 *GIOCHI MULTIPLAYER:*
- \`.tictactoe @user\` - Tris
- \`.sfida @user\` - Sfida utente
- \`.memory\` - Gioco memoria
- \`.impiccato\` - Impiccato

❤️ *AMORE & SOCIAL:*
- \`.amore [@user]\` - Affinità
- \`.ship @user1 @user2\` - Shippa
- \`.creacoppia\` - Coppia random

━━━━━━━━━━━━━━━━━━━━━
💡 Gioca e guadagna XP per salire di livello!
`;
    await msg.reply(gamesText);
    return;
}

// ========== MENU FUN ==========
else if (command === 'fun' || command === 'divertimento') {
    const funText = `
╔═══════════════════════╗
║ 🎪 *FUN & GIOCHI*     ║
╚═══════════════════════╝

🕹️ *GIOCHI VELOCI:*
- \`.rps [scelta]\` - Morra cinese
- \`.slot\` - Slot machine
- \`.indovina [num]\` - Indovina numero (1-100)
- \`.8ball [domanda]\` - Palla magica
- \`.scelta op1|op2\` - Scegli tra opzioni
- \`.dado\` - Lancia dado (1-6)
- \`.moneta\` - Lancia moneta
- \`.grattaevinci\` - Gratta e vinci
- \`.lotteria\` - Numeri fortunati
- \`.setig\` - Setta l instagram (admin)
- \`.setuserig\` - Setta l instagram di un utente (admin)


🃏 *CASINO & CARTE:*
- \`.blackjack\` - Blackjack vs bot
- \`.roulette [color/num]\` - Roulette
- \`.poker\` - Mano di poker
- \`.bingo\` - Cartella bingo
- \`.scommessa [importo]\` - Scommetti

🧠 *INTELLETTO:*
- \`.quiz\` - Quiz a scelta multipla
- \`.trivia\` - Fatto casuale
- \`.math\` - Domanda matematica
- \`.enigma\` - Indovinello
- \`.parola\` - Anagramma

💘 *AMORE & ROMANTICO:*
- \`.ship @user1 @user2\` - Compatibilità
- \`.creacoppia\` - Coppia random
- \`.amore\` - Citazione romantica
- \`.bacio @user\` - Bacio virtuale
- \`.abbraccio @user\` - Abbraccio
- \`.appuntamento @user\` - Chiedi appuntamento
- \`.complimento @user\` - Complimento
- \`.lovetest @user\` - Test amore
- \`.cuore\` - ASCII art cuore
- \`.rosarossa @user\` - Regala rosa
- \`.poesia\` - Poesia d'amore
- \`.dedica @user [testo]\` - Dedica
- \`.matrimonio @user\` - Proposta
- \`.lettera @user\` - Lettera d'amore
- \`.serenata @user\` - Serenata

🔥 *PICCANTE & SPICY:*
- \`.obbligo\` - Obbligo osé
- \`.verita\` - Verità piccante
- \`.osare @user\` - Sfida piccante
- \`.spin\` - Gira la bottiglia
- \`.flirt @user\` - Frase approccio
- \`.hotrate @user\` - Vota hotness (1-10)
- \`.seduzione @user\` - Tecnica seduzione
- \`.wink @user\` - Occhiolino
- \`.sussurro @user [testo]\` - Sussurro
- \`.piccante\` - Fatto piccante
- \`.desiderio\` - Desiderio segreto
- \`.fantasia\` - Scenario spicy
- \`.gioco7minuti @user\` - 7 minuti paradiso
- \`.spogliarello\` - Strip virtuale
- \`.dirty\` - Domanda sporca
- \`.naughty @user\` - Messaggio birichino
- \`.temperatura @user\` - Temperatura tra voi
- \`.chimica @user\` - Chimica fisica (%)
- \`.attrazione @user\` - Livello attrazione
- \`.tentazione\` - Frase tentatrice

━━━━━━━━━━━━━━━━━━━━━
💡 Digita \`.fun2\` per altri comandi!
🎯 Divertiti responsabilmente!
⚠️ I comandi piccanti sono per 18+
`;

    await msg.reply(funText);
}

// ========== MENU FUN 2 ==========
else if (command === 'fun2') {
    const funText2 = `
╔═══════════════════════╗
║ 🎪 *FUN & GIOCHI* (2) ║
╚═══════════════════════╝

🎭 *SOCIAL & ACTION:*
- \`.schiaffo @user\` - Schiaffo virtuale
- \`.poke @user\` - Stuzzica
- \`.pat @user\` - Carezza
- \`.feed @user\` - Dai da mangiare
- \`.tickle @user\` - Solletico
- \`.punch @user\` - Pugno scherzoso
- \`.kill @user\` - Uccisione comica
- \`.slap @user\` - Schiaffone
- \`.highfive @user\` - Batti il cinque

🎲 *RANDOM & GENERATORI:*
- \`.nome\` - Nome casuale
- \`.nickname\` - Nickname divertente
- \`.scusa\` - Scusa random
- \`.insulto @user\` - Insulto comico
- \`.pickup\` - Frase rimorchio cringe
- \`.fatto\` - Fatto interessante
- \`.consiglio\` - Consiglio del giorno
- \`.fortuna\` - Predizione fortuna
- \`.personalita\` - Analisi personalità
- \`.superpotere\` - Superpotere assegnato
- \`.lavoro\` - Lavoro futuro
- \`.animale\` - Animale spirito guida

🎉 *PARTY & DIVERTENTE:*
- \`.festa\` - Festa virtuale
- \`.karaoke\` - Canzone karaoke
- \`.balla\` - GIF ballo
- \`.meme\` - Meme del giorno
- \`.joke\` - Barzelletta
- \`.roast @user\` - Roast comico
- \`.vibe\` - Vibe check
- \`.mood\` - Umore di oggi
- \`.aesthetic\` - Aesthetic casuale
- \`.zodiac\` - Oroscopo del giorno

━━━━━━━━━━━━━━━━━━━━━
💡 Digita \`.fun\` per tornare al menu principale!
🎯 Divertiti e usa con rispetto!
`;

    await msg.reply(funText2);
}


// ========== INFO GRUPPO ==========
else if (command === 'info') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    
    try {
        const groupMetadata = chat;
        const adminsCount = groupMetadata.participants.filter(p => p.isAdmin || p.isSuperAdmin).length;
        const creationDate = groupMetadata.createdAt ? new Date(groupMetadata.createdAt * 1000).toLocaleDateString('it-IT') : 'Sconosciuta';
        
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        
        let infoText = `╔═══════════════════════╗
║  ℹ️ *INFO GRUPPO*     ║
╚═══════════════════════╝

📝 *DETTAGLI:*
- Nome: *${groupMetadata.name}*
- Creato: *${creationDate}*
- Descrizione: ${groupMetadata.description || 'Nessuna'}

👥 *MEMBRI:*
- Totali: *${groupMetadata.participants.length}*
- Admin: *${adminsCount}*
- Membri: *${groupMetadata.participants.length - adminsCount}*

🛡️ *SICUREZZA:*
- Antilink: ${g.antilink ? '✅' : '❌'}
- Antibot: ${g.antiBot ? '✅' : '❌'}
- Antispam: ${g.antiSpam ? '✅' : '❌'}
- Slowmode: ${g.slowmode > 0 ? `✅ (${g.slowmode}s)` : '❌'}
- Max Warns: *${g.maxWarns || 3}*

📊 *STATISTICHE:*
- Mutati: *${g.mutedUsers.length}*
- Bannati: *${g.bannedUsers.length}*
- Parole bloccate: *${g.blockedWords.length}*
- Regole: ${g.rules ? '✅' : '❌'}

━━━━━━━━━━━━━━━━━━━━━
🤖 Bot gestito da stocazzo`;
        
        await msg.reply(infoText);
        
    } catch (err) {
        console.error('Errore info gruppo:', err);
        await msg.reply('❌ Errore nel recuperare le informazioni del gruppo.');
    }
}

        else if (command === 'setmaxwarns') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const maxWarns = parseInt(args[0]);
            if (isNaN(maxWarns) || maxWarns < 1) return msg.reply('⚠️ Usa: .setmaxwarns [numero]');
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].maxWarns = maxWarns;
            saveData();
            await msg.reply(`✅ ⚠️ Max warn impostato a *${maxWarns}*!`);
        }

        // ========== COMANDI ECONOMIA ==========
        else if (command === 'soldi' || command === 'balance' || command === 'bal') {
            initUser(userId);
            const bal = economy[userId];
            await msg.reply(`💰 *IL TUO PORTAFOGLIO*\n\n💵 Contanti: *${bal.money}* coins\n🏦 Banca: *${bal.bank}* coins\n💎 Totale: *${bal.money + bal.bank}* coins`);
        }

        else if (command === 'daily') {
            initUser(userId);
            const now = nowSeconds();
            const cooldown = 24 * 60 * 60;
            if (now - economy[userId].lastDaily < cooldown) {
                const remaining = cooldown - (now - economy[userId].lastDaily);
                const h = Math.floor(remaining / 3600);
                const m = Math.floor((remaining % 3600) / 60);
                return msg.reply(`⏳ Già riscattato! Torna tra *${h}h ${m}m*.`);
            }
            const amount = 200 + Math.floor(Math.random() * 201);
            economy[userId].money += amount;
            economy[userId].lastDaily = now;
            saveData();
            await msg.reply(`✅ *DAILY RISCATTATO!* 🎉\n\nHai ricevuto *${amount}* coins!`); 
        }

        else if (command === 'weekly') {
            initUser(userId);
            const now = nowSeconds();
            const cooldown = 7 * 24 * 60 * 60;
            if (now - economy[userId].lastWeekly < cooldown) {
                const remaining = cooldown - (now - economy[userId].lastWeekly);
                const d = Math.floor(remaining / 86400);
                const h = Math.floor((remaining % 86400) / 3600);
                return msg.reply(`⏳ Già riscattato! Torna tra *${d}g ${h}h*.`);
            }
            const amount = 1000 + Math.floor(Math.random() * 1001);
            economy[userId].money += amount;
            economy[userId].lastWeekly = now;
            saveData();
            await msg.reply(`✅ *WEEKLY RISCATTATO!* 🎉\n\nHai ricevuto *${amount}* coins!`);
        }

        else if (command === 'monthly') {
            initUser(userId);
            const now = nowSeconds();
            const cooldown = 30 * 24 * 60 * 60;
            if (now - economy[userId].lastMonthly < cooldown) {
                const remaining = cooldown - (now - economy[userId].lastMonthly);
                const d = Math.floor(remaining / 86400);
                return msg.reply(`⏳ Già riscattato! Torna tra *${d}g*.`);
            }
            const amount = 3000 + Math.floor(Math.random() * 2001);
            economy[userId].money += amount;
            economy[userId].lastMonthly = now;
            saveData();
            await msg.reply(`✅ *MONTHLY RISCATTATO!* 🎉\n\nHai ricevuto *${amount}* coins!`);
        }

        // ========== LAVORO & CRIMINE ==========
        else if (command === 'lavora') {
            initUser(userId);
            const now = nowSeconds();
            const cooldown = 60 * 60; // 1 ora
            if (now - economy[userId].lastWork < cooldown) {
                const remaining = cooldown - (now - economy[userId].lastWork);
                const m = Math.floor(remaining / 60);
                return msg.reply(`⏳ Hai già lavorato! Torna tra *${m}m*.`);
            }
            const earnings = 50 + Math.floor(Math.random() * 201);
            economy[userId].money += earnings;
            economy[userId].lastWork = now;
            saveData();
            await msg.reply(`💼 Hai lavorato e guadagnato *${earnings}* coins!`);
        }

        else if (command === 'crimine') {
            initUser(userId);
            const now = nowSeconds();
            const cooldown = 2 * 60 * 60; // 2 ore
            if (now - economy[userId].lastCrime < cooldown) {
                const remaining = cooldown - (now - economy[userId].lastCrime);
                const m = Math.floor(remaining / 60);
                return msg.reply(`⏳ Hai già tentato un crimine! Torna tra *${m}m*.`);
            }
            const success = Math.random() < 0.45;
            economy[userId].lastCrime = now;
            if (success) {
                const loot = 200 + Math.floor(Math.random() * 801);
                economy[userId].money += loot;
                saveData();
                await msg.reply(`😈 *CRIMINE RIESCIUTO!* Hai guadagnato *${loot}* coins!`);
            } else {
                const fine = Math.min(economy[userId].money, 150 + Math.floor(Math.random() * 351));
                economy[userId].money -= fine;
                saveData();
                await msg.reply(`🚔 *FALLITO!* Sei stato beccato e hai perso *${fine}* coins come multa!`);
            }
        }

        else if (command === 'ruba') {
            if (!isGroup) return msg.reply('⚠️ Usa questo comando in un gruppo menzionando un utente.');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da cui rubare!');
            const target = mentioned[0];
            const targetId = target.id._serialized;
            initUser(userId);
            initUser(targetId);
            const now = nowSeconds();
            const cooldown = 30 * 60; // 30 minuti
            if (now - economy[userId].lastRob < cooldown) {
                const remaining = cooldown - (now - economy[userId].lastRob);
                const m = Math.floor(remaining / 60);
                return msg.reply(`⏳ Hai già tentato di rubare! Torna tra *${m}m*.`);
            }
            economy[userId].lastRob = now;
            const success = Math.random() < 0.4;
            if (success && economy[targetId].money > 0) {
                const amount = Math.min(economy[targetId].money, 100 + Math.floor(Math.random() * 401));
                economy[targetId].money -= amount;
                economy[userId].money += amount;
                saveData();
                await msg.reply(`🕵️‍♂️ Rubato con successo *${amount}* coins da *${target.pushname || target.number}*!`);
            } else {
                const penalty = Math.min(economy[userId].money, 50 + Math.floor(Math.random() * 151));
                economy[userId].money -= penalty;
                saveData();
                await msg.reply(`🚨 Fallito! Sei stato scoperto e hai perso *${penalty}* coins come penalità.`);
            }
        }

        else if (command === 'cerca') {
            initUser(userId);
            const now = nowSeconds();
            const found = Math.random() < 0.6;
            if (!found) {
                await msg.reply('🔎 Hai cercato ma non hai trovato nulla di interessante.');
                return;
            }
            const items = ['moneta d\'argento', 'bottiglia', 'vecchio telefono', 'chiave', 'gemma', 'oggetto raro'];
            const item = items[Math.floor(Math.random() * items.length)];
            const coins = 20 + Math.floor(Math.random() * 181);
            economy[userId].money += coins;
            economy[userId].inventory.push(item);
            saveData();
            await msg.reply(`🔎 Hai trovato *${item}* e *${coins}* coins!`);
        }

        // ========== BANCA & TRANSAZIONI ==========
        else if (command === 'deposita' || command === 'deposit') {
            initUser(userId);
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .deposita [amt]');
            if (economy[userId].money < amount) return msg.reply('⚠️ Non hai abbastanza contanti!');
            economy[userId].money -= amount;
            economy[userId].bank += amount;
            saveData();
            await msg.reply(`🏦 Depositate *${amount}* coins in banca!`);
        }

        else if (command === 'preleva' || command === 'withdraw') {
            initUser(userId);
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .preleva [amt]');
            if (economy[userId].bank < amount) return msg.reply('⚠️ Non hai abbastanza nella banca!');
            economy[userId].bank -= amount;
            economy[userId].money += amount;
            saveData();
            await msg.reply(`💵 Prelevati *${amount}* coins dalla banca!`);
        }

        else if (command === 'prestito') {
            initUser(userId);
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .prestito [amt]');
            // semplice prestito con interesse fisso 10%
            const interest = Math.ceil(amount * 0.10);
            economy[userId].money += amount;
            economy[userId].debt = (economy[userId].debt || 0) + amount + interest;
            saveData();
            await msg.reply(`💳 Prestito concesso: *${amount}* coins. Dovrai ripagare *${amount + interest}* coins (interesse 10%).`);
        }

        else if (command === 'ripaga') {
            initUser(userId);
            const debt = economy[userId].debt || 0;
            if (debt === 0) return msg.reply('✅ Non hai debiti da ripagare!');
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .ripaga [amt]');
            if (economy[userId].money < amount) return msg.reply('⚠️ Non hai abbastanza contanti!');
            economy[userId].money -= amount;
            economy[userId].debt = Math.max(0, debt - amount);
            saveData();
            await msg.reply(`✅ Hai ripagato *${amount}* coins. Debito rimanente: *${economy[userId].debt}* coins.`);
        }

        else if (command === 'investimento' || command === 'invest') {
            initUser(userId);
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .investimento [amt]');
            if (economy[userId].money < amount) return msg.reply('⚠️ Non hai abbastanza contanti!');
            economy[userId].money -= amount;
            // semplice investimento rischio/ricompensa
            const success = Math.random() < 0.6;
            if (success) {
                const profit = Math.ceil(amount * (0.10 + Math.random() * 0.4)); // 10% - 50%
                economy[userId].money += amount + profit;
                saveData();
                await msg.reply(`📈 Investimento riuscito! Guadagni *${profit}* coins (totale restituito *${amount + profit}*).`);
            } else {
                saveData();
                await msg.reply(`📉 Investimento fallito! Hai perso *${amount}* coins.`);
            }
        }

        // ========== REGALI, SCOMMESSE & MULTIPLICA ==========
        else if (command === 'regalo') {
            initUser(userId);
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente e specifica un ammontare: .regalo @user [amt]');
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Importo non valido!');
            if (economy[userId].money < amount) return msg.reply('⚠️ Non hai abbastanza contanti!');
            const target = mentioned[0];
            initUser(target.id._serialized);
            economy[userId].money -= amount;
            economy[target.id._serialized].money += amount;
            saveData();
            await msg.reply(`🎁 Hai regalato *${amount}* coins a *${target.pushname || target.number}*!`);
        }

        else if (command === 'scommessa' || command === 'bet') {
            initUser(userId);
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .scommessa [amt]');
            if (economy[userId].money < amount) return msg.reply('⚠️ Non hai abbastanza contanti!');
            const win = Math.random() < 0.48;
            economy[userId].money -= amount;
            if (win) {
                const winnings = amount * (1 + Math.floor(Math.random() * 3)); // raddoppia/triplica...
                economy[userId].money += winnings;
                saveData();
                await msg.reply(`🎰 Hai vinto! Ricevi *${winnings}* coins!`);
            } else {
                saveData();
                await msg.reply(`😞 Hai perso *${amount}* coins. Ritenta!`);
            }
        }

        else if (command === 'multiplica') {
            initUser(userId);
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Usa: .multiplica [amt]');
            if (economy[userId].money < amount) return msg.reply('⚠️ Non hai abbastanza contanti!');
            economy[userId].money -= amount;
            const factor = Math.random();
            if (factor < 0.5) {
                saveData();
                return msg.reply('💥 Tentativo fallito! Hai perso il tuo investimento.');
            }
            const gained = Math.floor(amount * (1 + factor * 3)); // possibile grande guadagno
            economy[userId].money += gained;
            saveData();
            await msg.reply(`✨ Successo! Il tuo investimento è diventato *${gained}* coins!`);
        }

        // ========== NEGOZIO ==========
        else if (command === 'shop') {
            const shopItems = [
                { id: 'pacciugo', name: 'Pacciugo', price: 500, desc: 'Aumenta XP' },
                { id: 'scudo', name: 'Scudo', price: 1200, desc: 'Protezione da furti' },
                { id: 'lucky', name: 'Lucky Charm', price: 800, desc: 'Aumenta fortuna' }
            ];
            let text = '🛒 *NEGOZIO*\n\n';
            shopItems.forEach(i => {
                text += `• ${i.name} - ${i.price} coins — ${i.desc}\n`;
            });
            text += '\nUsa: .compra [nome]';
            await msg.reply(text);
        }

        else if (command === 'compra') {
            initUser(userId);
            const itemName = args.join(' ').toLowerCase();
            if (!itemName) return msg.reply('⚠️ Usa: .compra [nome]');
            const catalog = {
                'pacciugo': { price: 500 },
                'scudo': { price: 1200 },
                'lucky charm': { price: 800, key: 'lucky' },
                'lucky': { price: 800 }
            };
            const item = catalog[itemName];
            if (!item) return msg.reply('⚠️ Articolo non trovato!');
            if (economy[userId].money < item.price) return msg.reply('⚠️ Non hai abbastanza contanti!');
            economy[userId].money -= item.price;
            economy[userId].inventory.push(itemName);
            saveData();
            await msg.reply(`✅ Hai comprato *${itemName}* per *${item.price}* coins!`);
        }

        else if (command === 'vendi') {
            initUser(userId);
            const itemName = args.join(' ').toLowerCase();
            if (!itemName) return msg.reply('⚠️ Usa: .vendi [nome]');
            const idx = economy[userId].inventory.indexOf(itemName);
            if (idx === -1) return msg.reply('⚠️ Non possiedi questo oggetto!');
            // prezzo di vendita: 50% del valore base (semplice)
            const basePrices = { 'pacciugo': 500, 'scudo': 1200, 'lucky charm': 800, 'lucky': 800 };
            const price = Math.floor((basePrices[itemName] || 100) * 0.5);
            economy[userId].inventory.splice(idx, 1);
            economy[userId].money += price;
            saveData();
            await msg.reply(`💰 Hai venduto *${itemName}* per *${price}* coins.`);
        }

        else if (command === 'usa') {
            initUser(userId);
            const itemName = args.join(' ').toLowerCase();
            if (!itemName) return msg.reply('⚠️ Usa: .usa [nome]');
            const idx = economy[userId].inventory.indexOf(itemName);
            if (idx === -1) return msg.reply('⚠️ Non possiedi questo oggetto!');
            // applica effetto semplice
            economy[userId].inventory.splice(idx, 1);
            if (itemName.includes('pacciugo')) {
                addXP(userId, 50);
                saveData();
                return msg.reply('✨ Hai usato Pacciugo! Hai ricevuto +50 XP.');
            } else if (itemName.includes('scudo')) {
                economy[userId].shield = (economy[userId].shield || 0) + 1;
                saveData();
                return msg.reply('🛡️ Hai attivato uno Scudo! Protezione extra attiva.');
            } else if (itemName.includes('lucky')) {
                economy[userId].luck = (economy[userId].luck || 0) + 1;
                saveData();
                return msg.reply('🍀 Lucky Charm attivato! Fortuna aumentata.');
            } else {
                saveData();
                return msg.reply(`✅ Hai usato *${itemName}* (nessun effetto speciale definito).`);
            }
        }

        // ========== CLASSIFICHE ==========
        else if (command === 'top') {
            // mostra i top per saldo totale (semplice: ordina economy)
            const arr = Object.keys(economy).map(k => ({ id: k, total: (economy[k].money || 0) + (economy[k].bank || 0) }));
            arr.sort((a, b) => b.total - a.total);
            const top = arr.slice(0, 10);
            let text = '🏆 *TOP RICCHI* (totale coins)\n\n';
            for (let i = 0; i < top.length; i++) {
                text += `${i + 1}. ${top[i].id.split('@')[0]} — ${top[i].total}\n`;
            }
            await msg.reply(text);
        }

        // ========== UTILITY & INFO ==========
        else if (command === 'ping') {
            const latency = Date.now() - msg.timestamp * 1000;
            await msg.reply(`🏓 Pong!\nLatenza stimata: *${latency}ms*`);
        }

        else if (command === 'uptime') {
            await msg.reply(`⏰ Uptime: *${formatTime(Math.floor((Date.now() - startTime) / 1000))}*`);
        }

        else if (command === 'info' || command === 'infobot') {
            const memUsage = process.memoryUsage();
            const text = `🤖 *INFO BOT*\n\nVersione: 2.0 Premium\nUptime: ${formatTime(Math.floor((Date.now() - startTime) / 1000))}\nMemoria (rss): ${Math.round(memUsage.rss / 1024 / 1024)} MB\nGruppi attivi: ${Object.keys(groupData).length}\nUtenti registrati: ${Object.keys(userStats).length}`;
            await msg.reply(text);
        }

        else if (command === 'stato') {
            await msg.reply('🟢 Bot operativo e pronto a rispondere!');
        }

        else if (command === 'qr') {
            // genera qr del testo dato o del numero
            const text = args.join(' ') || 'https://wa.me/';
            try {
                const qrBuffer = await qrcode.toDataURL(text);
                const media = MessageMedia.fromDataURL(qrBuffer);
                await client.sendMessage(msg.from, media, { caption: `📱 QR per: ${text}` });
            } catch (e) {
                await msg.reply('❌ Errore nella generazione del QR.');
            }
        }

        // ========== LINK GRUPPO ==========
else if (command === 'link' || command === 'invite') {
    if (!isGroup) {
        return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    }
    
    if (!await isBotAdmin(chat)) {
        return msg.reply('⚠️ Il bot deve essere admin per ottenere il link del gruppo!');
    }
    
    try {
        // Ottieni il codice di invito del gruppo
        const inviteCode = await chat.getInviteCode();
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
        
        // Genera QR code (usa un servizio API per QR code)
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(inviteLink)}`;
        
        const response = `
╔═══════════════════════╗
║  🔗 *LINK GRUPPO*     ║
╚═══════════════════════╝

👥 *Gruppo:* ${chat.name}

━━━━━━━━━━━━━━━━━━━━━
🔗 *Link di invito:*
${inviteLink}

━━━━━━━━━━━━━━━━━━━━━
📱 *Come usarlo:*
- Copia e condividi il link
- Scansiona il QR code qui sotto
- Valido fino alla revoca

⚠️ *Attenzione:*
Chiunque abbia questo link può
entrare nel gruppo!`;

        // Invia il messaggio
        await msg.reply(response);
        
        // Scarica e invia il QR code
        const axios = require('axios');
        const { MessageMedia } = require('whatsapp-web.js');
        
        const qrResponse = await axios.get(qrCodeUrl, { responseType: 'arraybuffer' });
        const qrMedia = new MessageMedia(
            'image/png',
            Buffer.from(qrResponse.data).toString('base64'),
            'qrcode.png'
        );
        
        await chat.sendMessage(qrMedia, {
            caption: `📲 *QR CODE GRUPPO*\n\n✨ Scansiona per entrare nel gruppo!\n\n🔗 ${chat.name}`
        });
        
        console.log(`[LINK] Link gruppo richiesto in ${chat.name}`);
        
    } catch (error) {
        console.error('Errore generazione link:', error);
        await msg.reply('❌ Errore durante la generazione del link! Assicurati che il bot sia admin.');
    }
}

// ========== REVOKE LINK ==========
else if (command === 'revoke' || command === 'resetlink') {
    if (!isGroup) {
        return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    }
    
    if (!await isAdmin(msg, chat)) {
        return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    }
    
    if (!await isBotAdmin(chat)) {
        return msg.reply('⚠️ Il bot deve essere admin per revocare il link!');
    }
    
    try {
        // Revoca il vecchio link e ne genera uno nuovo
        await chat.revokeInvite();
        
        const response = `
╔═══════════════════════╗
║  🔄 *LINK REVOCATO*   ║
╚═══════════════════════╝

✅ *Link precedente revocato!*

Il vecchio link non funziona più.
È stato generato un nuovo link.

━━━━━━━━━━━━━━━━━━━━━
💡 Usa \`.link\` per ottenere
il nuovo link di invito!

👮 Revocato da: ${msg._data.notifyName || 'Admin'}`;
        
        await msg.reply(response);
        
        console.log(`[REVOKE] Link revocato in ${chat.name} da ${msg._data.notifyName}`);
        
    } catch (error) {
        console.error('Errore revoca link:', error);
        await msg.reply('❌ Errore durante la revoca del link!');
    }
}

    // ========== VISUAL MODE ==========
else if (command === 'visual') {
    if (!isGroup) {
        return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    }
    
    if (!await isAdmin(msg, chat)) {
        return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    }
    
    const action = args[0]?.toLowerCase();
    
    if (!action || !['on', 'off'].includes(action)) {
        return msg.reply(
            '⚠️ *Uso comando:*\n\n' +
            '💡 Attiva/disattiva modalità visual\n\n' +
            '📝 *Esempio:*\n' +
            '• `.visual on` - Attiva (solo foto 1 visual)\n' +
            '• `.visual off` - Disattiva\n\n' +
            '📊 *Stato attuale:* ' + (groupInfo.visualMode ? '✅ ON' : '❌ OFF')
        );
    }
    
    groupInfo.visualMode = (action === 'on');
    saveData();
    
    const status = groupInfo.visualMode ? 'attivata ✅' : 'disattivata ❌';
    
    const response = `
╔═══════════════════════╗
║  👁️ *VISUAL MODE*     ║
╚═══════════════════════╝

📸 Modalità visual ${status}

${groupInfo.visualMode ? '⚠️ *Regola attiva:*\nSono permesse SOLO foto/video\ncon visualizzazione singola!\n\n❌ Foto/video "sempre visibili"\nverranno eliminati automaticamente.' : '✅ *Regola disattivata:*\nÈ possibile inviare qualsiasi\ntipo di media senza restrizioni.'}

━━━━━━━━━━━━━━━━━━━━━
👮 Impostato da: ${msg._data.notifyName || 'Admin'}`;
    
    await msg.reply(response);
}


        

    try {
        
        // ═══════════════════════════════════════
        // 🕹️ GIOCHI VELOCI
        // ═══════════════════════════════════════
        
        if (command === 'rps' || command === 'morra') {
            const choices = ['sasso', 'carta', 'forbice'];
            const userChoice = args[0]?.toLowerCase();
            
            if (!userChoice || !choices.includes(userChoice)) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Scegli: sasso, carta o forbice\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.rps sasso`\n' +
                    '• `.morra carta`\n' +
                    '• `.rps forbice`'
                );
            }
            
            const botChoice = choice(choices);
            let result = '';
            let emoji = '';
            
            if (userChoice === botChoice) {
                result = 'PAREGGIO!';
                emoji = '🤝';
            } else if (
                (userChoice === 'sasso' && botChoice === 'forbice') ||
                (userChoice === 'carta' && botChoice === 'sasso') ||
                (userChoice === 'forbice' && botChoice === 'carta')
            ) {
                result = 'HAI VINTO!';
                emoji = '🎉';
            } else {
                result = 'HAI PERSO!';
                emoji = '😭';
            }
            
            const response = `
╔═══════════════════════╗
║  🎮 *MORRA CINESE*    ║
╚═══════════════════════╝

👤 *Tu:* ${userChoice}
🤖 *Bot:* ${botChoice}

━━━━━━━━━━━━━━━━━━━━━
${emoji} *${result}*`;
            
            await msg.reply(response);
        }

        // ========== SLOT ==========
        else if (command === 'slot') {
            const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔', '⭐'];
            const slot1 = choice(symbols);
            const slot2 = choice(symbols);
            const slot3 = choice(symbols);
            
            let result = '';
            let prize = '';
            
            if (slot1 === slot2 && slot2 === slot3) {
                if (slot1 === '7️⃣') {
                    result = 'JACKPOT!!! 💰💰💰';
                    prize = '🎰 Vincita: 10.000 punti!';
                } else if (slot1 === '💎') {
                    result = 'SUPER WIN! 💎💎💎';
                    prize = '💰 Vincita: 5.000 punti!';
                } else {
                    result = 'HAI VINTO! 🎉';
                    prize = '💵 Vincita: 1.000 punti!';
                }
            } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
                result = 'Piccola vincita! ✨';
                prize = '💰 Vincita: 100 punti!';
            } else {
                result = 'Riprova! 😢';
                prize = '💸 Nessuna vincita';
            }
            
            const response = `
╔═══════════════════════╗
║  🎰 *SLOT MACHINE*    ║
╚═══════════════════════╝

┌─────────────────┐
│  ${slot1}  │  ${slot2}  │  ${slot3}  │
└─────────────────┘

━━━━━━━━━━━━━━━━━━━━━
${result}
${prize}`;
            
            await msg.reply(response);
        }

        // ========== INDOVINA ==========
        else if (command === 'indovina') {
            const userNum = parseInt(args[0]);
            const secretNum = random(1, 100);
            
            if (!userNum || userNum < 1 || userNum > 100) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Scegli un numero tra 1 e 100\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.indovina 50`\n' +
                    '• `.indovina 27`'
                );
            }
            
            const diff = Math.abs(userNum - secretNum);
            let hint = '';
            let emoji = '';
            
            if (userNum === secretNum) {
                const response = `
╔═══════════════════════╗
║  🎯 *INDOVINA NUMERO* ║
╚═══════════════════════╝

🎉 *INCREDIBILE!*
Hai indovinato al primo colpo!

━━━━━━━━━━━━━━━━━━━━━
🔢 Numero segreto: *${secretNum}*
👤 Tuo numero: *${userNum}*

🏆 *VITTORIA PERFETTA!*`;
                
                return msg.reply(response);
            }
            
            if (diff <= 5) {
                hint = 'CALDISSIMO!';
                emoji = '🔥🔥🔥';
            } else if (diff <= 10) {
                hint = 'Molto caldo!';
                emoji = '♨️♨️';
            } else if (diff <= 20) {
                hint = 'Caldo';
                emoji = '🌡️';
            } else if (diff <= 30) {
                hint = 'Tiepido';
                emoji = '😐';
            } else {
                hint = 'Freddo';
                emoji = '❄️';
            }
            
            const response = `
╔═══════════════════════╗
║  🎯 *INDOVINA NUMERO* ║
╚═══════════════════════╝

❌ *Sbagliato!*

━━━━━━━━━━━━━━━━━━━━━
🔢 Numero segreto: *${secretNum}*
👤 Tuo numero: *${userNum}*
📊 Differenza: ${diff}

${emoji} *${hint}*`;
            
            await msg.reply(response);
        }

        // ========== 8BALL ==========
        else if (command === '8ball') {
            const responses = [
                { text: 'Certamente!', emoji: '✅', type: 'positive' },
                { text: 'Senza dubbio!', emoji: '✅', type: 'positive' },
                { text: 'Assolutamente sì!', emoji: '✅', type: 'positive' },
                { text: 'Puoi contarci!', emoji: '✅', type: 'positive' },
                { text: 'Sì, decisamente!', emoji: '✅', type: 'positive' },
                { text: 'Forse...', emoji: '🤔', type: 'maybe' },
                { text: 'Non sono sicuro...', emoji: '🤔', type: 'maybe' },
                { text: 'Chiedimelo dopo', emoji: '🤔', type: 'maybe' },
                { text: 'Meglio non dirlo ora', emoji: '🤔', type: 'maybe' },
                { text: 'Concentrati e riprova', emoji: '🤔', type: 'maybe' },
                { text: 'No', emoji: '❌', type: 'negative' },
                { text: 'Assolutamente no!', emoji: '❌', type: 'negative' },
                { text: 'Non ci contare', emoji: '❌', type: 'negative' },
                { text: 'Le mie fonti dicono no', emoji: '❌', type: 'negative' },
                { text: 'Molto dubbio', emoji: '❌', type: 'negative' }
            ];
            
            if (args.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Fai una domanda alla palla magica!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.8ball sarò ricco?`\n' +
                    '• `.8ball troverò l\'amore?`\n' +
                    '• `.8ball vinco la lotteria?`'
                );
            }
            
            const answer = choice(responses);
            const question = args.join(' ');
            
            const response = `
╔═══════════════════════╗
║  🎱 *PALLA MAGICA 8*  ║
╚═══════════════════════╝

❓ *Domanda:*
${question}

━━━━━━━━━━━━━━━━━━━━━
${answer.emoji} *${answer.text}*`;
            
            await msg.reply(response);
        }

        // ========== SCELTA ==========
        else if (command === 'scelta') {
            const input = msg.body.slice(PREFIX.length + 7);
            const options = input.split('|').map(o => o.trim()).filter(o => o);
            
            if (options.length < 2) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Separa le opzioni con |\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.scelta pizza|pasta`\n' +
                    '• `.scelta mare|montagna|città`\n' +
                    '• `.scelta sì|no|forse`'
                );
            }
            
            const selected = choice(options);
            const optionsList = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
            
            const response = `
╔═══════════════════════╗
║  🎯 *SCELTA CASUALE*  ║
╚═══════════════════════╝

📋 *Opzioni:*
${optionsList}

━━━━━━━━━━━━━━━━━━━━━
✨ *Ho scelto:*
🎲 *${selected}*`;
            
            await msg.reply(response);
        }

        // ========== DADO ==========
        else if (command === 'dado') {
            const result = random(1, 6);
            const diceEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][result - 1];
            
            const response = `
╔═══════════════════════╗
║     🎲 *DADO*         ║
╚═══════════════════════╝

        ${diceEmoji}

━━━━━━━━━━━━━━━━━━━━━
🎯 *Risultato: ${result}*`;
            
            await msg.reply(response);
        }

        // ========== MONETA ==========
        else if (command === 'moneta') {
            const result = random(0, 1);
            const face = result === 0 ? 'Testa' : 'Croce';
            const emoji = result === 0 ? '👤' : '✖️';
            
            const response = `
╔═══════════════════════╗
║  🪙 *LANCIA MONETA*   ║
╚═══════════════════════╝

        ${emoji}

━━━━━━━━━━━━━━━━━━━━━
🎯 *Risultato: ${face}*`;
            
            await msg.reply(response);
        }

        // ========== GRATTA E VINCI ==========
        else if (command === 'grattaevinci') {
            const symbols = ['🍒', '🍋', '⭐', '💎', '7️⃣', '🔔'];
            const results = Array(9).fill(0).map(() => choice(symbols));
            
            const grid = `
┌───┬───┬───┐
│ ${results[0]} │ ${results[1]} │ ${results[2]} │
├───┼───┼───┤
│ ${results[3]} │ ${results[4]} │ ${results[5]} │
├───┼───┼───┤
│ ${results[6]} │ ${results[7]} │ ${results[8]} │
└───┴───┴───┘`;
            
            // Trova simbolo vincente
            const symbolCounts = {};
            results.forEach(s => symbolCounts[s] = (symbolCounts[s] || 0) + 1);
            const winSymbol = Object.keys(symbolCounts).find(s => symbolCounts[s] >= 3);
            
            let prize = '';
            let result = '';
            
            if (winSymbol) {
                const count = symbolCounts[winSymbol];
                if (count >= 5) {
                    result = '🎰 SUPER JACKPOT!!!';
                    prize = '💰 Vincita: 50.000 punti!';
                } else if (count === 4) {
                    result = '🎉 GRANDE VINCITA!';
                    prize = '💵 Vincita: 10.000 punti!';
                } else {
                    result = '✨ HAI VINTO!';
                    prize = '💰 Vincita: 1.000 punti!';
                }
            } else {
                result = '😢 Non hai vinto';
                prize = '💸 Ritenta!';
            }
            
            const response = `
╔═══════════════════════╗
║  🎫 *GRATTA E VINCI*  ║
╚═══════════════════════╝

${grid}

━━━━━━━━━━━━━━━━━━━━━
${result}
${prize}`;
            
            await msg.reply(response);
        }

        // ========== LOTTERIA ==========
        else if (command === 'lotteria') {
            const numbers = [];
            while(numbers.length < 6) {
                const n = random(1, 90);
                if (!numbers.includes(n)) numbers.push(n);
            }
            numbers.sort((a, b) => a - b);
            
            const response = `
╔═══════════════════════╗
║  🎰 *LOTTERIA*        ║
╚═══════════════════════╝

🔢 *Numeri estratti:*

╭─────────────────╮
│  ${numbers.map(n => n.toString().padStart(2, '0')).join('  │  ')}  │
╰─────────────────╯

━━━━━━━━━━━━━━━━━━━━━
🍀 *Buona fortuna!*
✨ In bocca al lupo!`;
            
            await msg.reply(response);
        }

        // ═══════════════════════════════════════
        // 🃏 CASINO & CARTE
        // ═══════════════════════════════════════

        // ========== BLACKJACK ==========
        else if (command === 'blackjack') {
            const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            const suits = ['♠️', '♥️', '♦️', '♣️'];
            
            const getCard = () => `${choice(cards)}${choice(suits)}`;
            const getValue = (card) => {
                const val = card.slice(0, -2);
                if (val === 'A') return 11;
                if (['J', 'Q', 'K'].includes(val)) return 10;
                return parseInt(val);
            };
            
            const playerCards = [getCard(), getCard()];
            const dealerCards = [getCard(), getCard()];
            
            let playerValue = playerCards.reduce((sum, c) => sum + getValue(c), 0);
            let dealerValue = dealerCards.reduce((sum, c) => sum + getValue(c), 0);
            
            // Gestione Assi
            if (playerValue > 21 && playerCards.some(c => c.startsWith('A'))) playerValue -= 10;
            if (dealerValue > 21 && dealerCards.some(c => c.startsWith('A'))) dealerValue -= 10;
            
            let result = '';
            let emoji = '';
            
            if (playerValue > 21) {
                result = 'HAI SBALLATO!';
                emoji = '💥';
            } else if (dealerValue > 21) {
                result = 'DEALER SBALLATO! HAI VINTO!';
                emoji = '🎉';
            } else if (playerValue === 21 && playerCards.length === 2) {
                result = 'BLACKJACK! HAI VINTO!';
                emoji = '🎰';
            } else if (dealerValue === 21 && dealerCards.length === 2) {
                result = 'Dealer fa Blackjack!';
                emoji = '😢';
            } else if (playerValue > dealerValue) {
                result = 'HAI VINTO!';
                emoji = '🎉';
            } else if (playerValue < dealerValue) {
                result = 'Hai perso';
                emoji = '😢';
            } else {
                result = 'PAREGGIO!';
                emoji = '🤝';
            }
            
            const response = `
╔═══════════════════════╗
║   🃏 *BLACKJACK*      ║
╚═══════════════════════╝

👤 *Le tue carte:*
${playerCards.join(' ')}
🎯 Punteggio: *${playerValue}*

🎩 *Dealer:*
${dealerCards.join(' ')}
🎯 Punteggio: *${dealerValue}*

━━━━━━━━━━━━━━━━━━━━━
${emoji} *${result}*`;
            
            await msg.reply(response);
        }

        // ========== ROULETTE ==========
        else if (command === 'roulette') {
            const bet = args[0]?.toLowerCase();
            const number = random(0, 36);
            const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(number);
            const color = number === 0 ? 'verde' : (isRed ? 'rosso' : 'nero');
            const colorEmoji = number === 0 ? '💚' : (isRed ? '🔴' : '⚫');
            
            if (!bet) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Scommetti su:\n' +
                    '• `rosso` o `nero`\n' +
                    '• numero (0-36)\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.roulette rosso`\n' +
                    '• `.roulette 17`\n' +
                    '• `.roulette nero`'
                );
            }
            
            let result = '';
            let prize = '';
            let won = false;
            
            if (bet === 'rosso' && color === 'rosso') {
                result = 'HAI VINTO!';
                prize = '💰 Vincita: x2';
                won = true;
            } else if (bet === 'nero' && color === 'nero') {
                result = 'HAI VINTO!';
                prize = '💰 Vincita: x2';
                won = true;
            } else if (bet === 'verde' && color === 'verde') {
                result = 'VERDE! JACKPOT!';
                prize = '💚 Vincita: x36';
                won = true;
            } else if (bet === number.toString()) {
                result = 'NUMERO ESATTO! JACKPOT!';
                prize = '🎰 Vincita: x36';
                won = true;
            } else {
                result = 'Hai perso';
                prize = '💸 Riprova!';
            }
            
            const response = `
╔═══════════════════════╗
║   🎡 *ROULETTE*       ║
╚═══════════════════════╝

🔮 *Numero uscito:*
    ${colorEmoji} *${number}* (${color})

💰 *Scommessa:* ${bet}

━━━━━━━━━━━━━━━━━━━━━
${won ? '🎉' : '😢'} *${result}*
${prize}`;
            
            await msg.reply(response);
        }

        // ========== POKER ==========
        else if (command === 'poker') {
            const suits = ['♠️', '♥️', '♦️', '♣️'];
            const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            const hand = [];
            
            for (let i = 0; i < 5; i++) {
                hand.push(`${choice(values)}${choice(suits)}`);
            }
            
            const response = `
╔═══════════════════════╗
║   🃏 *POKER HAND*     ║
╚═══════════════════════╝

🎴 *La tua mano:*

╭──────────────────╮
│ ${hand.join('  ')} │
╰──────────────────╯

━━━━━━━━━━━━━━━━━━━━━
🎰 Buona fortuna!`;
            
            await msg.reply(response);
        }

        // ========== BINGO ==========
        else if (command === 'bingo') {
            const numbers = [];
            while(numbers.length < 15) {
                const n = random(1, 75);
                if (!numbers.includes(n)) numbers.push(n);
            }
            numbers.sort((a, b) => a - b);
            
            const card = `
┌────┬────┬────┬────┬────┐
│ B  │ I  │ N  │ G  │ O  │
├────┼────┼────┼────┼────┤
│ ${numbers[0].toString().padStart(2)} │ ${numbers[3].toString().padStart(2)} │ ${numbers[6].toString().padStart(2)} │ ${numbers[9].toString().padStart(2)} │ ${numbers[12].toString().padStart(2)} │
├────┼────┼────┼────┼────┤
│ ${numbers[1].toString().padStart(2)} │ ${numbers[4].toString().padStart(2)} │ ⭐ │ ${numbers[10].toString().padStart(2)} │ ${numbers[13].toString().padStart(2)} │
├────┼────┼────┼────┼────┤
│ ${numbers[2].toString().padStart(2)} │ ${numbers[5].toString().padStart(2)} │ ${numbers[7].toString().padStart(2)} │ ${numbers[11].toString().padStart(2)} │ ${numbers[14].toString().padStart(2)} │
└────┴────┴────┴────┴────┘`;
            
            const response = `
╔═══════════════════════╗
║   🎰 *BINGO CARD*     ║
╚═══════════════════════╝

${card}

━━━━━━━━━━━━━━━━━━━━━
✨ Buona fortuna!
🎯 BINGO!`;
            
            await msg.reply(response);
        }

        // ========== SCOMMESSA ==========
        else if (command === 'scommessa') {
            const amount = parseInt(args[0]) || 100;
            const win = random(0, 1) === 1;
            const multiplier = (random(15, 30) / 10).toFixed(1);
            const winAmount = Math.floor(amount * multiplier);
            
            let response = '';
            
            if (win) {
                response = `
╔═══════════════════════╗
║   💰 *SCOMMESSA*      ║
╚═══════════════════════╝

✅ *HAI VINTO!*

💵 Puntata: *${amount}* punti
📈 Moltiplicatore: *x${multiplier}*
🎉 Vincita: *${winAmount}* punti

━━━━━━━━━━━━━━━━━━━━━
💰 Profitto: *+${winAmount - amount}* punti`;
            } else {
                response = `
╔═══════════════════════╗
║   💸 *SCOMMESSA*      ║
╚═══════════════════════╝

❌ *Hai perso!*

💵 Puntata: *${amount}* punti
📉 Persi: *${amount}* punti

━━━━━━━━━━━━━━━━━━━━━
😢 Riprova! La fortuna girerà!`;
            }
            
            await msg.reply(response);
        }

        // ═══════════════════════════════════════
        // 🧠 GIOCHI DI INTELLETTO
        // ═══════════════════════════════════════

        // ========== QUIZ ==========
        else if (command === 'quiz') {
            const quizzes = [
                { q: 'Qual è la capitale della Francia?', a: ['Parigi', 'Londra', 'Berlino', 'Madrid'], c: 0 },
                { q: 'Quanti continenti ci sono?', a: ['5', '6', '7', '8'], c: 2 },
                { q: 'Chi ha dipinto la Gioconda?', a: ['Michelangelo', 'Leonardo da Vinci', 'Raffaello', 'Donatello'], c: 1 },
                { q: 'Quale pianeta è il più vicino al Sole?', a: ['Venere', 'Marte', 'Mercurio', 'Terra'], c: 2 },
                { q: 'In che anno è finita la Seconda Guerra Mondiale?', a: ['1943', '1944', '1945', '1946'], c: 2 },
                { q: 'Qual è l\'oceano più grande?', a: ['Atlantico', 'Pacifico', 'Indiano', 'Artico'], c: 1 },
                { q: 'Quante corde ha una chitarra classica?', a: ['4', '5', '6', '7'], c: 2 },
                { q: 'Chi ha scritto "La Divina Commedia"?', a: ['Petrarca', 'Dante', 'Boccaccio', 'Manzoni'], c: 1 }
            ];
            
            const quiz = choice(quizzes);
            const options = quiz.a.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
            
            const response = `
╔═══════════════════════╗
║     🧠 *QUIZ*         ║
╚═══════════════════════╝

❓ *Domanda:*
${quiz.q}

📋 *Opzioni:*
${options}

━━━━━━━━━━━━━━━━━━━━━
✅ *Risposta:* ||${quiz.a[quiz.c]}||`;
            
            await msg.reply(response);
        }

        // ========== TRIVIA ==========
        else if (command === 'trivia') {
            const facts = [
                { fact: 'Il miele non scade mai!', emoji: '🍯' },
                { fact: 'Un polpo ha 3 cuori!', emoji: '🐙' },
                { fact: 'La Torre Eiffel può crescere di 15cm in estate!', emoji: '🗼' },
                { fact: 'Le banane sono bacche, le fragole no!', emoji: '🍌' },
                { fact: 'Il cuore di un gambero è nella testa!', emoji: '🦐' },
                { fact: 'I pinguini hanno le ginocchia!', emoji: '🐧' },
                { fact: 'La luce del sole impiega 8 minuti per arrivare sulla Terra!', emoji: '☀️' },
                { fact: 'Gli squali sono più vecchi degli alberi!', emoji: '🦈' },
                { fact: 'Le impronte digitali dei koala sono quasi identiche a quelle umane!', emoji: '🐨' },
                { fact: 'Un fulmine è più caldo della superficie del sole!', emoji: '⚡' }
            ];
            
            const trivia = choice(facts);
            
            const response = `
╔═══════════════════════╗
║    💡 *TRIVIA*        ║
╚═══════════════════════╝

${trivia.emoji} *Lo sapevi?*

${trivia.fact}

━━━━━━━━━━━━━━━━━━━━━
🤓 Cultura generale!`;
            
            await msg.reply(response);
        }

        // ========== MATH ==========
        else if (command === 'math') {
            const num1 = random(1, 20);
            const num2 = random(1, 20);
            const operations = [
                { op: '+', symbol: '+', calc: (a, b) => a + b },
                { op: '-', symbol: '-', calc: (a, b) => a - b },
                { op: '*', symbol: '×', calc: (a, b) => a * b }
            ];
            const operation = choice(operations);
            const result = operation.calc(num1, num2);
            
            const response = `
╔═══════════════════════╗
║   🔢 *MATEMATICA*     ║
╚═══════════════════════╝

❓ *Calcola:*

     ${num1} ${operation.symbol} ${num2} = ?

━━━━━━━━━━━━━━━━━━━━━
✅ *Risposta:* ||${result}||`;
            
            await msg.reply(response);
        }

        // ========== ENIGMA ==========
        else if (command === 'enigma') {
            const riddles = [
                { q: 'Ho le chiavi ma nessuna serratura. Ho spazio ma nessuna stanza. Puoi entrare ma non uscire. Cosa sono?', a: 'Una tastiera' },
                { q: 'Più ne togli, più divento grande. Cosa sono?', a: 'Un buco' },
                { q: 'Cosa ha un collo ma non ha testa?', a: 'Una bottiglia' },
                { q: 'Vado su e giù ma non mi muovo mai. Cosa sono?', a: 'Le scale' },
                { q: 'Ho città ma nessuna casa, foreste ma nessun albero, acqua ma nessun pesce. Cosa sono?', a: 'Una mappa' },
                { q: 'Sono sempre affamato, devo sempre essere nutrito. Il dito che tocco, presto diventerà rosso. Cosa sono?', a: 'Il fuoco' },
                { q: 'Puoi vedermi di notte nella luminosità. Sono una luce che non hai mai acceso. Cosa sono?', a: 'La luna' }
            ];
            
            const riddle = choice(riddles);
            
            const response = `
╔═══════════════════════╗
║    🤔 *ENIGMA*        ║
╚═══════════════════════╝

🎭 *Indovina:*

${riddle.q}

━━━━━━━━━━━━━━━━━━━━━
💡 *Risposta:* ||${riddle.a}||`;
            
            await msg.reply(response);
        }

        // ========== PAROLA ==========
        else if (command === 'parola') {
            const words = ['AMORE', 'CUORE', 'STELLA', 'FIORE', 'MARE', 'SOLE', 'LUNA', 'VENTO', 'FUOCO', 'TERRA'];
            const word = choice(words);
            const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
            
            const response = `
╔═══════════════════════╗
║   🔤 *ANAGRAMMA*      ║
╚═══════════════════════╝

🔀 *Parola mescolata:*

     *${scrambled}*

━━━━━━━━━━━━━━━━━━━━━
✅ *Soluzione:* ||${word}||`;
            
            await msg.reply(response);
        }

        // ═══════════════════════════════════════
        // 💘 AMORE & ROMANTICO
        // ═══════════════════════════════════════

        // ========== SHIP ==========
        else if (command === 'ship') {
            const mentions = await msg.getMentions();
            
            if (mentions.length < 2) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona 2 persone per vedere la loro compatibilità!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.ship @persona1 @persona2`'
                );
            }
            
            const user1 = mentions[0].pushname || mentions[0].verifiedName || 'User1';
            const user2 = mentions[1].pushname || mentions[1].verifiedName || 'User2';
            const percent = percentage();
            
            let emoji = '';
            let message = '';
            
            if (percent >= 90) {
                emoji = '💕💕💕';
                message = 'Anime gemelle! Matrimonio in vista! 💒';
            } else if (percent >= 70) {
                emoji = '❤️❤️';
                message = 'Ottima compatibilità! Coppia perfetta! 🥰';
            } else if (percent >= 50) {
                emoji = '💖';
                message = 'Buona chimica! Potrebbe funzionare! 😊';
            } else if (percent >= 30) {
                emoji = '💔';
                message = 'Compatibilità bassa... Forse solo amici? 🤷';
            } else {
                emoji = '💀';
                message = 'Disastro totale! Meglio evitare! 😱';
            }
            
            const hearts = '❤️'.repeat(Math.floor(percent / 10));
            const empty = '🤍'.repeat(10 - Math.floor(percent / 10));
            
            const response = `
╔═══════════════════════╗
║   💘 *SHIP METER*     ║
╚═══════════════════════╝

👤 ${user1}
     💕
👤 ${user2}

━━━━━━━━━━━━━━━━━━━━━
${emoji} *${percent}%* ${emoji}

[${hearts}${empty}]

${message}`;
            
            await msg.reply(response);
        }

        // ========== CREA COPPIA ==========
        else if (command === 'creacoppia') {
            if (!isGroup) {
                return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
            }
            
            const participants = chat.participants.map(p => p.id._serialized);
            
            if (participants.length < 2) {
                return msg.reply('❌ Servono almeno 2 persone nel gruppo!');
            }
            
            const person1 = choice(participants);
            let person2 = choice(participants);
            while (person2 === person1 && participants.length > 1) {
                person2 = choice(participants);
            }
            
            const contact1 = await client.getContactById(person1);
            const contact2 = await client.getContactById(person2);
            const name1 = contact1.pushname || contact1.verifiedName || 'User1';
            const name2 = contact2.pushname || contact2.verifiedName || 'User2';
            
            const percent = percentage();
            
            let verdict = '';
            if (percent >= 70) verdict = '🎉 Coppia perfetta!';
            else if (percent >= 40) verdict = '😊 Potrebbe funzionare!';
            else verdict = '😅 Mmm... difficile!';
            
            const response = `
╔═══════════════════════╗
║  💑 *COPPIA RANDOM*   ║
╚═══════════════════════╝

💘 *Cupido ha scelto:*

👤 @${person1.split('@')[0]}
     💕
👤 @${person2.split('@')[0]}

━━━━━━━━━━━━━━━━━━━━━
💘 Compatibilità: *${percent}%*

${verdict}`;
            
            await chat.sendMessage(response, {
                mentions: [contact1, contact2]
            });
        }

        // ========== AMORE ==========
        else if (command === 'amore') {
            const quotes = [
                { text: 'L\'amore è come il vento, non puoi vederlo ma puoi sentirlo.', emoji: '💕' },
                { text: 'Sei la ragione per cui sorrido ogni giorno.', emoji: '❤️' },
                { text: 'In un mare di persone, i miei occhi cercheranno sempre te.', emoji: '💖' },
                { text: 'Ti amo non solo per quello che sei, ma per quello che sono io quando sono con te.', emoji: '🌹' },
                { text: 'Ogni momento con te è un momento che vorrei durasse per sempre.', emoji: '💝' },
                { text: 'Il mio cuore batte il tuo nome.', emoji: '💗' },
                { text: 'Sei il mio per sempre e sempre.', emoji: '💓' },
                { text: 'Con te, ogni giorno è San Valentino.', emoji: '💞' }
            ];
            
            const quote = choice(quotes);
            
            const response = `
╔═══════════════════════╗
║  💕 *CITAZIONE AMORE* ║
╚═══════════════════════╝

${quote.emoji} "${quote.text}"

━━━━━━━━━━━━━━━━━━━━━
💘 Con amore...`;
            
            await msg.reply(response);
        }

        // ========== BACIO ==========
        else if (command === 'bacia') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.bacia @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const kisses = [
                { text: `${sender} manda un bacio appassionato a ${target}!`, emoji: '💋😘' },
                { text: `${sender} bacia dolcemente ${target} sulla guancia!`, emoji: '😘💕' },
                { text: `${sender} e ${target} si baciano sotto le stelle!`, emoji: '💏✨' },
                { text: `${sender} ruba un bacio a ${target}!`, emoji: '😚💖' },
                { text: `Un bacio magico da ${sender} per ${target}!`, emoji: '💋🌹' }
            ];
            
            const kiss = choice(kisses);
            
            const response = `
╔═══════════════════════╗
║    💋 *BACIO*         ║
╚═══════════════════════╝

${kiss.emoji}

${kiss.text}

━━━━━━━━━━━━━━━━━━━━━
💕 *Awww...*`;
            
            await msg.reply(response);
        }

        // ========== ABBRACCIO ==========
        else if (command === 'abbraccio') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.abbraccio @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const hugs = [
                { text: `${sender} abbraccia forte ${target}!`, emoji: '🤗💕' },
                { text: `${sender} stringe ${target} in un abbraccio caloroso!`, emoji: '🫂❤️' },
                { text: `${sender} abbraccia teneramente ${target}!`, emoji: '💑🥰' },
                { text: `Un super abbraccio da ${sender} per ${target}!`, emoji: '🤗💖' },
                { text: `${sender} e ${target} non vogliono più lasciarsi!`, emoji: '🫂💞' }
            ];
            
            const hug = choice(hugs);
            
            const response = `
╔═══════════════════════╗
║   🤗 *ABBRACCIO*      ║
╚═══════════════════════╝

${hug.emoji}

${hug.text}

━━━━━━━━━━━━━━━━━━━━━
💝 *Che dolcezza!*`;
            
            await msg.reply(response);
        }

        // ========== APPUNTAMENTO ==========
        else if (command === 'appuntamento') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.appuntamento @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const dates = [
                { text: `${sender} chiede a ${target} di uscire!`, detail: '"Ti va di cenare con me stasera?"', emoji: '💑🍷🌹' },
                { text: `${sender} invita ${target} al cinema!`, detail: '"Ho due biglietti... uno è per te!"', emoji: '🎬🍿💕' },
                { text: `${sender} vuole guardare il tramonto con ${target}!`, detail: '"Il panorama sarà più bello con te accanto."', emoji: '🌅🌄💖' },
                { text: `${sender} chiede a ${target} un caffè!`, detail: '"Un caffè insieme? Offro io! 😊"', emoji: '☕💝' },
                { text: `${sender} propone una passeggiata romantica a ${target}!`, detail: '"Passeggiamo sotto le stelle?"', emoji: '🚶🌙✨' }
            ];
            
            const date = choice(dates);
            
            const response = `
╔═══════════════════════╗
║  💑 *APPUNTAMENTO*    ║
╚═══════════════════════╝

${date.emoji}

${date.text}

${date.detail}

━━━━━━━━━━━━━━━━━━━━━
💘 *Romantico!*`;
            
            await msg.reply(response);
        }

        // ========== COMPLIMENTO ==========
        else if (command === 'complimento') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.complimento @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            
            const compliments = [
                { text: `${target}, hai un sorriso che illumina la giornata!`, emoji: '💕✨' },
                { text: `${target}, sei incredibilmente speciale!`, emoji: '🌹💖' },
                { text: `${target}, la tua presenza rende tutto migliore!`, emoji: '💫❤️' },
                { text: `${target}, hai un fascino irresistibile!`, emoji: '✨😍' },
                { text: `${target}, sei bellissimo/a dentro e fuori!`, emoji: '💝🥰' },
                { text: `${target}, sei unico/a e meraviglioso/a!`, emoji: '🌟💞' },
                { text: `${target}, il mondo è più bello con te!`, emoji: '💗🌈' }
            ];
            
            const compliment = choice(compliments);
            
            const response = `
╔═══════════════════════╗
║  💖 *COMPLIMENTO*     ║
╚═══════════════════════╝

${compliment.emoji}

${compliment.text}

━━━━━━━━━━━━━━━━━━━━━
🥰 *Che dolcezza!*`;
            
            await msg.reply(response);
        }

        // ========== LOVE TEST ==========
        else if (command === 'lovetest') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.lovetest @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Tu';
            
            const love = percentage();
            const passion = percentage();
            const chemistry = percentage();
            const future = percentage();
            
            const avg = Math.floor((love + passion + chemistry + future) / 4);
            
            let verdict = '';
            if (avg >= 80) verdict = '💕 ANIME GEMELLE! Siete fatti l\'uno per l\'altra! 💕';
            else if (avg >= 60) verdict = '❤️ Grande amore! Avete un futuro insieme! ❤️';
            else if (avg >= 40) verdict = '💖 Buona intesa! Continuate così! 💖';
            else verdict = '💔 Serve più impegno... o forse solo amici? 💔';
            
            const response = `
╔═══════════════════════╗
║   💘 *LOVE TEST*      ║
╚═══════════════════════╝

👤 ${sender}
     💕
👤 ${target}

━━━━━━━━━━━━━━━━━━━━━
💖 Amore: ${love}%
🔥 Passione: ${passion}%
⚡ Chimica: ${chemistry}%
🔮 Futuro: ${future}%
━━━━━━━━━━━━━━━━━━━━━
📊 Media: *${avg}%*

${verdict}`;
            
            await msg.reply(response);
        }

        // ========== CUORE ==========
        else if (command === 'cuore') {
            const heart = `
╔═══════════════════════╗
║     💖 *CUORE*        ║
╚═══════════════════════╝

    ♥️♥️         ♥️♥️
  ♥️    ♥️     ♥️    ♥️
♥️        ♥️ ♥️        ♥️
♥️                      ♥️
  ♥️                  ♥️
    ♥️              ♥️
      ♥️          ♥️
        ♥️      ♥️
          ♥️  ♥️
            ♥️

━━━━━━━━━━━━━━━━━━━━━
💕 Con tutto il cuore!`;
            
            await msg.reply(heart);
        }

        // ========== ROSA ROSSA ==========
        else if (command === 'rosarossa') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.rosarossa @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const rose = `
╔═══════════════════════╗
║   🌹 *ROSA ROSSA*     ║
╚═══════════════════════╝

         🌹
        /|\\
       / | \\
      /  |  \\
         |
         |
         |

━━━━━━━━━━━━━━━━━━━━━
💐 ${sender} regala una rosa a ${target}

💕 "Per te, con amore..."`;
            
            await msg.reply(rose);
        }

        // ========== POESIA ==========
        else if (command === 'poesia') {
            const poems = [
                `Nel profondo del mio cuore,\nRisiede un eterno ardore,\nChe brucia solo per te,\nAmore mio, eternamente.`,
                `Sei la stella che brilla,\nNella mia notte tranquilla,\nLa luce che mi guida,\nVerso una vita infinita.`,
                `Come fiore al mattino,\nChe si apre al suo destino,\nCosì il mio cuore si schiude,\nQuando penso a te che concludi.`,
                `Tu sei il sogno che non finisce,\nL'amore che sempre fiorisce,\nLa ragione del mio esistere,\nIl mio dolce resistere.`
            ];
            
            const poem = choice(poems);
            
            const response = `
╔═══════════════════════╗
║   📜 *POESIA D'AMORE* ║
╚═══════════════════════╝

💕 ${poem}

━━━━━━━━━━━━━━━━━━━━━
🌹 Con sentimento...`;
            
            await msg.reply(response);
        }

        // ========== DEDICA ==========
        else if (command === 'dedica') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0 || args.length < 2) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno e scrivi una dedica!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.dedica @persona Sei speciale`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            const dedication = args.slice(1).join(' ');
            
            const response = `
╔═══════════════════════╗
║  💌 *DEDICA SPECIALE* ║
╚═══════════════════════╝

💕 *Da:* ${sender}
💖 *Per:* ${target}

━━━━━━━━━━━━━━━━━━━━━

"${dedication}"

━━━━━━━━━━━━━━━━━━━━━
🌹 Con affetto...`;
            
            await msg.reply(response);
        }

        // ========== MATRIMONIO ==========
        else if (command === 'matrimonio') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.matrimonio @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            const acceptance = percentage();
            
            let answer = '';
            if (acceptance >= 70) answer = `${target} ha detto SÌ! 💍✨`;
            else if (acceptance >= 40) answer = `${target} ci deve pensare... 🤔`;
            else answer = `${target} ha rifiutato... 💔😢`;
            
            const response = `
╔═══════════════════════╗
║  💍 *PROPOSTA*        ║
╚═══════════════════════╝

💑 ${sender} si inginocchia...

"${target}, vuoi sposarmi?"

          💍
         /|\\
        / | \\

━━━━━━━━━━━━━━━━━━━━━
${answer}

${acceptance >= 70 ? '🎊 Evviva gli sposi! 🎊' : acceptance >= 40 ? '⏳ Dai tempo al tempo...' : '💔 Forse un giorno...'}`;
            
            await msg.reply(response);
        }

        // ========== LETTERA ==========
        else if (command === 'lettera') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.lettera @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'Amore mio';
            const sender = msg._data.notifyName || 'Chi ti ama';
            
            const letters = [
                `Carissimo/a ${target},\n\nOgni giorno che passa mi rendo conto sempre di più di quanto tu sia importante per me. Il tuo sorriso illumina le mie giornate e il tuo amore mi rende la persona più fortunata del mondo.\n\nCon tutto il mio cuore,\n${sender} 💕`,
                `Mio/a dolce ${target},\n\nCi sono momenti in cui le parole non bastano per esprimere ciò che sento. Tu sei la mia ispirazione, il mio sogno realizzato, la ragione per cui ogni giorno vale la pena di essere vissuto.\n\nPer sempre tuo/a,\n${sender} ❤️`,
                `A ${target}, con amore,\n\nSei entrato/a nella mia vita come un raggio di sole in una giornata grigia. Da quel momento, tutto ha acquisito un nuovo significato. Grazie per esistere.\n\nSempre,\n${sender} 💖`
            ];
            
            const letter = choice(letters);
            
            const response = `
╔═══════════════════════╗
║  💌 *LETTERA D'AMORE* ║
╚═══════════════════════╝

${letter}

━━━━━━━━━━━━━━━━━━━━━
🌹 Sigillato con un bacio 💋`;
            
            await msg.reply(response);
        }

        // ========== SERENATA ==========
        else if (command === 'serenata') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.serenata @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const response = `
╔═══════════════════════╗
║  🎵 *SERENATA*        ║
╚═══════════════════════╝

🌙 Sotto la tua finestra...

${sender} canta per ${target}:

♪ ♫ ♪ ♫

"🎶 Sei tu la mia stella,
che brilla la sera,
l'amore più vero,
che il cuore spera! 🎶"

━━━━━━━━━━━━━━━━━━━━━
🎸 Con passione... 💕`;
            
            await msg.reply(response);
        }

        // ═══════════════════════════════════════
        // 🔥 PICCANTE & SPICY
        // ═══════════════════════════════════════

        // ========== OBBLIGO ==========
        else if (command === 'obbligo') {
            const dares = [
                { text: 'Manda un vocale sexy di 10 secondi', emoji: '🔥' },
                { text: 'Descrivi il tuo sogno più proibito', emoji: '😈' },
                { text: 'Racconta la tua esperienza più audace', emoji: '💋' },
                { text: 'Manda un selfie con uno sguardo provocante', emoji: '😏' },
                { text: 'Sussurra qualcosa di piccante', emoji: '🌶️' }
            ];
            
            const dare = choice(dares);
            
            const response = `
╔═══════════════════════╗
║   🔥 *OBBLIGO OSÉ*    ║
╚═══════════════════════╝

${dare.emoji}

*${dare.text}*

━━━━━━━━━━━━━━━━━━━━━
😈 Osi o non osi?`;
            
            await msg.reply(response);
        }

        // ========== VERITÀ ==========
        else if (command === 'verita') {
            const truths = [
                { text: 'Qual è la tua fantasia segreta?', emoji: '😏' },
                { text: 'Hai mai fatto qualcosa di molto audace?', emoji: '🔥' },
                { text: 'Qual è il posto più strano dove hai baciato qualcuno?', emoji: '💋' },
                { text: 'Qual è il tuo più grande desiderio nascosto?', emoji: '🌶️' },
                { text: 'Hai mai avuto un sogno piccante? Raccontalo!', emoji: '😈' }
            ];
            
            const truth = choice(truths);
            
            const response = `
╔═══════════════════════╗
║  💬 *VERITÀ PICCANTE* ║
╚═══════════════════════╝

${truth.emoji}

*${truth.text}*

━━━━━━━━━━━━━━━━━━━━━
🤐 Confessa!`;
            
            await msg.reply(response);
        }

        // ========== OSARE ==========
        else if (command === 'osare') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.osare @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const challenges = [
                { text: `${sender} sfida ${target} a mandare un vocale sexy!`, emoji: '🔥😏' },
                { text: `${sender} osa ${target} a confessare la sua fantasia!`, emoji: '😈💭' },
                { text: `${sender} sfida ${target} a descrivere il suo tipo ideale!`, emoji: '💋❤️' },
                { text: `${sender} osa ${target} a rivelare il suo sogno proibito!`, emoji: '🌶️😏' },
                { text: `${sender} sfida ${target} a fare un complimento audace!`, emoji: '🔥💕' }
            ];
            
            const challenge = choice(challenges);
            
            const response = `
╔═══════════════════════╗
║  😈 *SFIDA PICCANTE*  ║
╚═══════════════════════╝

${challenge.emoji}

${challenge.text}

━━━━━━━━━━━━━━━━━━━━━
🎯 Accetti la sfida?`;
            
            await msg.reply(response);
        }

        // ========== SPIN ==========
        else if (command === 'spin') {
            if (!isGroup) {
                return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
            }
            
            const participants = chat.participants.map(p => p.id._serialized);
            
            if (participants.length < 2) {
                return msg.reply('❌ Servono almeno 2 persone!');
            }
            
            const selected = choice(participants);
            const contact = await client.getContactById(selected);
            const name = contact.pushname || contact.verifiedName || 'Qualcuno';
            
            const response = `
╔═══════════════════════╗
║  🍾 *GIRA BOTTIGLIA*  ║
╚═══════════════════════╝

       🍾
      /  \\
     /    \\
    /      \\
   /        \\
  ----------
      ⬇️

━━━━━━━━━━━━━━━━━━━━━
🎯 La bottiglia indica:

👤 *${name}*

━━━━━━━━━━━━━━━━━━━━━
😏 Cosa succederà?`;
            
            await msg.reply(response);
        }

        // ========== FLIRT ==========
        else if (command === 'flirt') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.flirt @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            
            const flirts = [
                { text: `Hey ${target}, sei così affascinante che il mio cuore ha saltato un battito... 😏`, emoji: '😏💕' },
                { text: `${target}, devo chiamare i vigili? Perché sei troppo hot! 🔥`, emoji: '🔥😈' },
                { text: `${target}, ho perso il mio numero... posso avere il tuo? 😘`, emoji: '😘📱' },
                { text: `${target}, sei un ladro/a? Perché mi hai rubato il cuore! 💋`, emoji: '💋💖' },
                { text: `${target}, credi nel colpo di fulmine o devo passare di nuovo? ⚡`, emoji: '⚡😍' }
            ];
            
            const flirt = choice(flirts);
            
            const response = `
╔═══════════════════════╗
║  😏 *FLIRT PICCANTE*  ║
╚═══════════════════════╝

${flirt.emoji}

${flirt.text}

━━━━━━━━━━━━━━━━━━━━━
🔥 Che audacia!`;
            
            await msg.reply(response);
        }

        // ========== HOT RATE ==========
        else if (command === 'hotrate') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.hotrate @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const rating = random(1, 10);
            
            let emoji = '';
            let verdict = '';
            
            if (rating >= 9) {
                emoji = '🔥🔥🔥';
                verdict = 'INFUOCATO! Impossibile resistere!';
            } else if (rating >= 7) {
                emoji = '🔥🔥';
                verdict = 'Molto hot! Temperatura alta!';
            } else if (rating >= 5) {
                emoji = '🔥';
                verdict = 'Decisamente interessante!';
            } else {
                emoji = '😅';
                verdict = 'Serve più fuoco!';
            }
            
            const response = `
╔═══════════════════════╗
║  🔥 *HOT RATE*        ║
╚═══════════════════════╝

👤 *${target}*

━━━━━━━━━━━━━━━━━━━━━
${emoji} *${rating}/10* ${emoji}

${verdict}`;
            
            await msg.reply(response);
        }

        // ========== SEDUZIONE ==========
        else if (command === 'seduzione') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.seduzione @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            
            const techniques = [
                { text: `Guardalo/a negli occhi intensamente e sorridi misteriosamente`, emoji: '👁️💫' },
                { text: `Sussurra qualcosa al suo orecchio`, emoji: '👂🔥' },
                { text: `Gioca con i capelli mentre parli con lui/lei`, emoji: '💁‍♀️✨' },
                { text: `Toccalo/a "accidentalmente" sul braccio`, emoji: '🤚💕' },
                { text: `Mordicchia leggermente il labbro inferiore`, emoji: '💋😏' }
            ];
            
            const technique = choice(techniques);
            
            const response = `
╔═══════════════════════╗
║  😈 *SEDUZIONE*       ║
╚═══════════════════════╝

🎯 *Obiettivo:* ${target}

━━━━━━━━━━━━━━━━━━━━━
${technique.emoji}

*Tecnica:*
${technique.text}

━━━━━━━━━━━━━━━━━━━━━
🔥 Irresistibile!`;
            
            await msg.reply(response);
        }

        // ========== WINK ==========
        else if (command === 'wink') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.wink @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const response = `
╔═══════════════════════╗
║  😉 *OCCHIOLINO*      ║
╚═══════════════════════╝

${sender} fa un occhiolino
civettoso a ${target}! 😉

━━━━━━━━━━━━━━━━━━━━━
💕 Che birichino/a!`;
            
            await msg.reply(response);
        }

        // ========== SUSSURRO ==========
        else if (command === 'sussurro') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0 || args.length < 2) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno e scrivi!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.sussurro @persona Sei bellissimo/a`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            const whisper = args.slice(1).join(' ');
            
            const response = `
╔═══════════════════════╗
║  🤫 *SUSSURRO*        ║
╚═══════════════════════╝

${sender} sussurra all'orecchio di ${target}:

━━━━━━━━━━━━━━━━━━━━━
👂 *"${whisper}"*

━━━━━━━━━━━━━━━━━━━━━
😏 Intimo e misterioso...`;
            
            await msg.reply(response);
        }

        // ========== PICCANTE ==========
        else if (command === 'piccante') {
            const facts = [
                { text: 'Il cioccolato aumenta il desiderio', emoji: '🍫🔥' },
                { text: 'Un bacio brucia 6 calorie', emoji: '💋🔥' },
                { text: 'Gli occhi si dilatano quando vedi qualcuno che ti piace', emoji: '👁️💕' },
                { text: 'Il cuore batte più forte quando flirtiamo', emoji: '💓😏' },
                { text: 'Le labbra sono 100 volte più sensibili delle dita', emoji: '💋✨' }
            ];
            
            const fact = choice(facts);
            
            const response = `
╔═══════════════════════╗
║  🌶️ *FATTO PICCANTE* ║
╚═══════════════════════╝

${fact.emoji}

${fact.text}

━━━━━━━━━━━━━━━━━━━━━
🔥 Interessante...`;
            
            await msg.reply(response);
        }

        // ========== DESIDERIO ==========
        else if (command === 'desiderio') {
            const desires = [
                { text: 'Un bacio appassionato sotto la pioggia', emoji: '💋🌧️' },
                { text: 'Una cena a lume di candela seguita da...', emoji: '🕯️😏' },
                { text: 'Una notte da ricordare sotto le stelle', emoji: '⭐🌙' },
                { text: 'Un weekend romantico in un luogo isolato', emoji: '🏝️❤️' },
                { text: 'Una danza sensuale a mezzanotte', emoji: '💃🕛' }
            ];
            
            const desire = choice(desires);
            
            const response = `
╔═══════════════════════╗
║  💭 *DESIDERIO*       ║
╚═══════════════════════╝

${desire.emoji}

${desire.text}

━━━━━━━━━━━━━━━━━━━━━
🔥 Un sogno...`;
            
            await msg.reply(response);
        }

        // ========== FANTASIA ==========
        else if (command === 'fantasia') {
            const fantasies = [
                { text: 'Una fuga romantica a Parigi', emoji: '🗼❤️' },
                { text: 'Una serata privata in una spa', emoji: '🛀💕' },
                { text: 'Un picnic al tramonto sulla spiaggia', emoji: '🌅🍷' },
                { text: 'Una notte in una suite lussuosa', emoji: '🏨✨' },
                { text: 'Un ballo lento al chiaro di luna', emoji: '🌙💃' }
            ];
            
            const fantasy = choice(fantasies);
            
            const response = `
╔═══════════════════════╗
║  ✨ *FANTASIA*        ║
╚═══════════════════════╝

${fantasy.emoji}

*Scenario:*
${fantasy.text}

━━━━━━━━━━━━━━━━━━━━━
😏 Immaginazione al potere!`;
            
            await msg.reply(response);
        }

        // ========== 7 MINUTI ==========
        else if (command === 'gioco7minuti') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.gioco7minuti @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const response = `
╔═══════════════════════╗
║ ⏱️ *7 MINUTI PARADISO*║
╚═══════════════════════╝

🚪 *Nel ripostiglio:*

👤 ${sender}
     💕
👤 ${target}

━━━━━━━━━━━━━━━━━━━━━
⏱️ Timer: 7:00

3... 2... 1... VIA! 🔥

━━━━━━━━━━━━━━━━━━━━━
😏 Cosa succederà?`;
            
            await msg.reply(response);
        }

        // ========== SPOGLIARELLO ==========
        else if (command === 'spogliarello') {
            const points = random(0, 100);
            
            let rating = '';
            if (points >= 90) rating = '🔥🔥🔥 INFUOCANTE!';
            else if (points >= 70) rating = '🔥🔥 Molto hot!';
            else if (points >= 50) rating = '🔥 Buono!';
            else rating = '😅 Serve pratica!';
            
            const response = `
╔═══════════════════════╗
║  💃 *SPOGLIARELLO*    ║
╚═══════════════════════╝

🎭 *Performance:*

━━━━━━━━━━━━━━━━━━━━━
📊 Punteggio: *${points}/100*

${rating}

━━━━━━━━━━━━━━━━━━━━━
😏 Che spettacolo!`;
            
            await msg.reply(response);
        }

        // ========== DIRTY ==========
        else if (command === 'dirty') {
            const questions = [
                { text: 'Qual è il tuo più grande segreto intimo?', emoji: '🔥' },
                { text: 'Hai mai fatto qualcosa di molto audace?', emoji: '😈' },
                { text: 'Qual è la cosa più piccante che hai fatto?', emoji: '🌶️' },
                { text: 'Cosa ti eccita di più?', emoji: '💋' },
                { text: 'Qual è la tua fantasia più nascosta?', emoji: '😏' }
            ];
            
            const question = choice(questions);
            
            const response = `
╔═══════════════════════╗
║  😈 *DIRTY QUESTION*  ║
╚═══════════════════════╝

${question.emoji}

*${question.text}*

━━━━━━━━━━━━━━━━━━━━━
🔥 Rispondi se osi!`;
            
            await msg.reply(response);
        }

        // ========== NAUGHTY ==========
        else if (command === 'naughty') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.naughty @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Qualcuno';
            
            const messages = [
                { text: `${sender} guarda ${target} con uno sguardo malizioso... 😏`, emoji: '😈' },
                { text: `${sender} manda un messaggio birichino a ${target}... 🔥`, emoji: '💋' },
                { text: `${sender} fa una proposta indecente a ${target}... 😏`, emoji: '🌶️' },
                { text: `${sender} ha pensieri proibiti su ${target}... 🔥`, emoji: '😈' }
            ];
            
            const message = choice(messages);
            
            const response = `
╔═══════════════════════╗
║  😈 *NAUGHTY*         ║
╚═══════════════════════╝

${message.emoji}

${message.text}

━━━━━━━━━━━━━━━━━━━━━
🔥 Che birichino/a!`;
            
            await msg.reply(response);
        }

        // ========== TEMPERATURA ==========
        else if (command === 'temperatura') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.temperatura @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Tu';
            const temp = random(0, 100);
            
            let emoji = '';
            let status = '';
            
            if (temp >= 90) {
                emoji = '🔥🔥🔥';
                status = 'ROVENTE! Temperatura alle stelle!';
            } else if (temp >= 70) {
                emoji = '🔥🔥';
                status = 'Molto calda! C\'è tensione!';
            } else if (temp >= 50) {
                emoji = '🔥';
                status = 'Calda! Qualcosa bolle in pentola!';
            } else if (temp >= 30) {
                emoji = '🌡️';
                status = 'Tiepida... serve più fuoco!';
            } else {
                emoji = '❄️';
                status = 'Fredda... nessuna scintilla!';
            }
            
            const response = `
╔═══════════════════════╗
║  🌡️ *TEMPERATURA*     ║
╚═══════════════════════╝

👤 ${sender}
     💕
👤 ${target}

━━━━━━━━━━━━━━━━━━━━━
🌡️ *${temp}°C*

${emoji}

${status}`;
            
            await msg.reply(response);
        }

        // ========== CHIMICA ==========
        else if (command === 'chimica') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.chimica @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Tu';
            const chemistry = percentage();
            
            let verdict = '';
            if (chemistry >= 80) verdict = '💥 ESPLOSIVA! Scintille ovunque!';
            else if (chemistry >= 60) verdict = '⚡ Forte! C\'è attrazione!';
            else if (chemistry >= 40) verdict = '✨ Presente! Potrebbe funzionare!';
            else verdict = '😐 Debole... servono più ingredienti!';
            
            const response = `
╔═══════════════════════╗
║  ⚗️ *CHIMICA FISICA*  ║
╚═══════════════════════╝

👤 ${sender}
     ⚡
👤 ${target}

━━━━━━━━━━━━━━━━━━━━━
⚗️ Chimica: *${chemistry}%*

${verdict}`;
            
            await msg.reply(response);
        }

        // ========== ATTRAZIONE ==========
        else if (command === 'attrazione') {
            const mentions = await msg.getMentions();
            
            if (mentions.length === 0) {
                return msg.reply(
                    '⚠️ *Uso comando:*\n\n' +
                    '💡 Menziona qualcuno!\n\n' +
                    '📝 *Esempio:*\n' +
                    '• `.attrazione @persona`'
                );
            }
            
            const target = mentions[0].pushname || mentions[0].verifiedName || 'qualcuno';
            const sender = msg._data.notifyName || 'Tu';
            const attraction = percentage();
            
            let magnetic = '';
            if (attraction >= 90) magnetic = '🧲🧲🧲 MAGNETISMO IRRESISTIBILE!';
            else if (attraction >= 70) magnetic = '🧲🧲 Forte attrazione!';
            else if (attraction >= 50) magnetic = '🧲 Attrazione presente!';
            else magnetic = '😐 Attrazione debole...';
            
            const response = `
╔═══════════════════════╗
║  🧲 *ATTRAZIONE*      ║
╚═══════════════════════╝

👤 ${sender}
     🧲
👤 ${target}

━━━━━━━━━━━━━━━━━━━━━
📊 Livello: *${attraction}%*

${magnetic}`;
            
            await msg.reply(response);
        }

        // ========== TENTAZIONE ==========
        else if (command === 'tentazione') {
            const temptations = [
                { text: 'Un bacio rubato nel buio...', emoji: '💋🌑' },
                { text: 'Uno sguardo che dice tutto...', emoji: '👁️🔥' },
                { text: 'Un tocco "accidentale"...', emoji: '🤚✨' },
                { text: 'Un sussurro proibito...', emoji: '👂😏' },
                { text: 'Una proposta irresistibile...', emoji: '😈💕' }
            ];
            
            const temptation = choice(temptations);
            
            const response = `
╔═══════════════════════╗
║  😈 *TENTAZIONE*      ║
╚═══════════════════════╝

${temptation.emoji}

${temptation.text}

━━━━━━━━━━━━━━━━━━━━━
🔥 Resisti... se ci riesci!`;
            
            await msg.reply(response);
        }


        // ===== FUN & SOCIAL =====

        else if (command === 'meme') {
            await msg.reply('🎭 *MEME*\n\n"Quando ti dicono che il bot è pronto"\n😎 Il bot: _ancora in sviluppo_');
        }

        else if (command === 'fact') {
            const facts = [
                'Il cuore di un gamberetto si trova nella testa! 🦐',
                'I pinguini hanno le ginocchia! 🐧',
                'Una formica può sopravvivere 2 settimane sott\'acqua! 🐜',
                'Gli elefanti non possono saltare! 🐘',
                'Le giraffe possono pulirsi le orecchie con la lingua! 🦒'
            ];
            await msg.reply(`📚 *FATTO INTERESSANTE*\n\n${facts[Math.floor(Math.random() * facts.length)]}`);
        }

        else if (command === 'quote') {
            const quotes = [
                '"La vita è quello che accade mentre sei impegnato a fare altri piani" - John Lennon',
                '"Il successo è la somma di piccoli sforzi ripetuti giorno dopo giorno" - Robert Collier',
                '"Non conta quante volte cadi, ma quante volte ti rialzi" - Vince Lombardi',
                '"Il modo migliore per predire il futuro è crearlo" - Peter Drucker',
                '"Sii il cambiamento che vuoi vedere nel mondo" - Gandhi'
            ];
            await msg.reply(`💬 *CITAZIONE*\n\n${quotes[Math.floor(Math.random() * quotes.length)]}`);
        }

        else if (command === 'joke') {
            const jokes = [
                'Perché il libro di matematica è triste?\nPerché ha troppi problemi! 😄',
                'Cosa fa un gatto in chiesa?\nMiao! 🐱',
                'Qual è il colmo per un elettricista?\nRimanere folgorato! ⚡',
                'Cosa dice un muro a un altro muro?\nCi vediamo all\'angolo! 🧱',
                'Perché i programmatori confondono Halloween con Natale?\nPerché Oct 31 = Dec 25! 🎃🎄'
            ];
            await msg.reply(`😂 *BARZELLETTA*\n\n${jokes[Math.floor(Math.random() * jokes.length)]}`);
        }

        else if (command === 'consiglio') {
            const consigli = [
                'Bevi più acqua oggi! 💧',
                'Fai una pausa e respira profondamente 🧘',
                'Chiama una persona cara che non senti da tempo 📞',
                'Fai una passeggiata all\'aria aperta 🚶',
                'Impara qualcosa di nuovo oggi! 📖',
                'Sorridi di più, fa bene! 😊'
            ];
            await msg.reply(`💡 *CONSIGLIO DEL GIORNO*\n\n${consigli[Math.floor(Math.random() * consigli.length)]}`);
        }

        else if (command === 'sfida') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona qualcuno da sfidare!');
            const sfide = [
                'Chi resiste più a lungo senza guardare il telefono! 📱',
                'Gara di flessioni! 💪',
                'Chi fa la battuta più divertente! 😂',
                'Gara di memory! 🧠',
                'Chi indovina più capitali! 🌍'
            ];
            await msg.reply(
                `⚔️ *SFIDA*\n\n` +
                `@${(msg.author || msg.from).split('@')[0]} sfida @${mentioned[0].id._serialized.split('@')[0]}\n\n` +
                `${sfide[Math.floor(Math.random() * sfide.length)]}`,
                undefined,
                { mentions: [msg.author || msg.from, mentioned[0].id._serialized] }
            );
        }

        else if (command === 'complimento') {
            const mentioned = await msg.getMentions();
            const target = mentioned.length > 0 ? `@${mentioned[0].id._serialized.split('@')[0]}` : 'Tu';
            const complimenti = [
                'sei una persona fantastica! ⭐',
                'hai un sorriso contagioso! 😊',
                'sei molto intelligente! 🧠',
                'hai un cuore d\'oro! 💛',
                'sei una fonte di ispirazione! 🌟'
            ];
            const mentions = mentioned.length > 0 ? [mentioned[0].id._serialized] : undefined;
            await msg.reply(
                `💝 *COMPLIMENTO*\n\n${target} ${complimenti[Math.floor(Math.random() * complimenti.length)]}`,
                undefined,
                mentions ? { mentions } : undefined
            );
        }

        else if (command === 'insulta') {
            const mentioned = await msg.getMentions();
            const target = mentioned.length > 0 ? `@${mentioned[0].id._serialized.split('@')[0]}` : 'Tu';
            const insulti = [
                'hai lo stesso QI di una pantofola! 👟',
                'sei lento come una lumaca assonnata! 🐌',
                'sei confuso come un pinguino nel deserto! 🐧',
                'hai la memoria di un pesce rosso! 🐠',
                'sei più perso di un turista senza GPS! 🗺️'
            ];
            const mentions = mentioned.length > 0 ? [mentioned[0].id._serialized] : undefined;
            await msg.reply(
                `😈 *INSULTO (SCHERZOSO)*\n\n${target} ${insulti[Math.floor(Math.random() * insulti.length)]}`,
                undefined,
                mentions ? { mentions } : undefined
            );
        }

        // ===== COMANDO RIVELA CORRETTO =====
else if (command === 'rivela' || command === 'reveal') {
    try {
        const quotedMsg = await msg.getQuotedMessage();
        
        if (!quotedMsg) {
            return msg.reply(
                '⚠️ *RIVELA IMMAGINE*\n\n' +
                '📝 Rispondi a un\'immagine "visualizzabile una volta" con `.rivela`'
            );
        }
        
        console.log('Tipo messaggio:', quotedMsg.type);
        console.log('Ha media:', quotedMsg.hasMedia);
        
        // Controlla se è ciphertext (view once criptato) o ha media normale
        const isViewOnce = quotedMsg.type === 'ciphertext';
        const hasNormalMedia = quotedMsg.hasMedia === true;
        
        if (!isViewOnce && !hasNormalMedia) {
            return msg.reply('⚠️ Il messaggio non contiene media!');
        }
        
        if (isViewOnce) {
            return msg.reply(
                '❌ *IMPOSSIBILE RIVELARE*\n\n' +
                '⚠️ I messaggi "visualizzabili una volta" sono criptati end-to-end.\n\n' +
                '🔒 WhatsApp protegge questi messaggi e non possono essere scaricati dal bot dopo l\'invio.\n\n' +
                '💡 Questo è per la tua privacy e sicurezza!'
            );
        }
        
        await msg.reply('🔓 Download in corso...');
        
        // Scarica il media normale
        const media = await quotedMsg.downloadMedia();
        
        if (!media || !media.data) {
            return msg.reply('❌ Impossibile scaricare il media!');
        }
        
        const contact = await msg.getContact();
        const userName = contact.pushname || 'Qualcuno';
        
        // Ricrea il media
        const revealedMedia = new MessageMedia(
            media.mimetype,
            media.data,
            'revealed_' + (media.filename || 'media')
        );
        
        // Invia il media
        await client.sendMessage(
            msg.from, 
            revealedMedia, 
            { caption: `🔓 *Media inviato da ${userName}*` }
        );
        
        await msg.reply('✅ Media inviato con successo!');
        
    } catch (err) {
        console.error('Errore rivela:', err);
        await msg.reply('❌ Errore: ' + err.message);
    }
}

// ===== COMANDO STICKER CORRETTO =====
else if (command === 's' || command === 'sticker') {
    try {
        let mediaMsg = null;
        
        // 1. Controlla se il messaggio corrente ha media
        if (msg.hasMedia) {
            mediaMsg = msg;
        } 
        // 2. Controlla il messaggio quotato
        else {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted) {
                    console.log('Quoted type:', quoted.type);
                    console.log('Quoted hasMedia:', quoted.hasMedia);
                    
                    // Controlla se è ciphertext (view once)
                    if (quoted.type === 'ciphertext') {
                        return msg.reply(
                            '❌ *IMPOSSIBILE CREARE STICKER*\n\n' +
                            '⚠️ Le immagini "visualizzabili una volta" sono criptate.\n\n' +
                            '🔒 WhatsApp protegge questi messaggi per la tua privacy.\n\n' +
                            '💡 Invia l\'immagine normalmente per creare lo sticker!'
                        );
                    }
                    
                    // Se ha media normale, procedi
                    if (quoted.hasMedia) {
                        mediaMsg = quoted;
                    }
                }
            } catch (e) {
                console.error('Errore quote:', e);
            }
        }
        
        if (!mediaMsg) {
            return msg.reply(
                "📎 *CREA STICKER*\n\n" +
                "✅ Modi d'uso:\n" +
                "• Invia immagine con caption `.s`\n" +
                "• Rispondi a immagine/GIF con `.s`\n\n" +
                "⚠️ Formati: JPG, PNG, GIF, MP4 (max 1MB)\n\n" +
                "❌ NON funziona con foto 'view once' (sono criptate)"
            );
        }
        
        // Verifica che sia immagine o video
        const mediaType = mediaMsg.type;
        if (!['image', 'video'].includes(mediaType)) {
            return msg.reply('⚠️ Solo immagini o video/GIF!');
        }
        
        await msg.reply('⏳ Creazione sticker...');
        
        // Scarica il media
        const media = await mediaMsg.downloadMedia();
        
        if (!media || !media.data) {
            return msg.reply("❌ Impossibile scaricare il media!");
        }
        
        // Verifica il mimetype
        if (!media.mimetype || (!media.mimetype.includes('image') && !media.mimetype.includes('video'))) {
            return msg.reply('⚠️ Formato non supportato!');
        }
        
        const isAnimated = media.mimetype.includes('gif') || media.mimetype.includes('video');
        
        // Crea lo sticker
        const stickerMedia = new MessageMedia(
            media.mimetype,
            media.data,
            'sticker'
        );
        
        const stickerOptions = {
            sendMediaAsSticker: true,
            stickerName: 'WhatsApp Bot',
            stickerAuthor: 'Bot'
        };
        
        if (isAnimated) {
            stickerOptions.stickerAnimated = true;
        }
        
        await client.sendMessage(msg.from, stickerMedia, stickerOptions);
        await msg.reply('✅ Sticker creato! 🎉');
        
    } catch (err) {
        console.error('Errore sticker:', err);
        
        let errorMsg = '❌ Errore: ';
        
        if (err.message.includes('large') || err.message.includes('size')) {
            errorMsg += 'File troppo grande! Max 500KB immagini, 1MB GIF.';
        } else if (err.message.includes('format')) {
            errorMsg += 'Formato non supportato.';
        } else if (err.message.includes('Processing')) {
            errorMsg += 'Errore nel processare il media. Riprova con un file più piccolo.';
        } else {
            errorMsg += err.message;
        }
        
        await msg.reply(errorMsg);
    }
}

// COMANDO: .sticker-pack -> info sui limiti degli sticker
else if (command === 'sticker-info' || command === 'stickerinfo') {
    await msg.reply(
        "🎨 *INFO STICKER*\n\n" +
        "📏 *Limiti:*\n" +
        "• Immagini: max 500KB\n" +
        "• GIF/Video: max 1MB\n" +
        "• Durata video: max 6 secondi\n" +
        "• Risoluzione: 512x512 px (ottimale)\n\n" +
        "✅ *Formati supportati:*\n" +
        "• JPG, PNG (statici)\n" +
        "• GIF (animati)\n" +
        "• MP4 (animati, max 6s)\n\n" +
        "💡 *Uso:*\n" +
        "• `.s` su immagine\n" +
        "• `.s` rispondendo a media"
    );
}

        // BONUS: Roulette dell'amore - trova partner per l'utente che scrive
else if (command === 'amore' || command === 'trovamore') {
    if (!isGroup) return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    
    try {
        const senderId = msg.author || msg.from;
        
        // Ottieni tutti i partecipanti (escluso chi ha mandato il comando e il bot)
        const botId = client.info?.wid?._serialized || client.info?.me?._serialized || '';
        const participants = chat.participants.filter(p => {
            return p.id._serialized !== senderId && p.id._serialized !== botId;
        });
        
        if (participants.length === 0) {
            return msg.reply('⚠️ Non ci sono altri membri disponibili nel gruppo!');
        }
        
        // Scegli un partner casuale
        const partner = participants[Math.floor(Math.random() * participants.length)];
        const percentuale = Math.floor(Math.random() * 101);
        
        let messaggio = '';
        if (percentuale < 30) messaggio = '💔 Non sembra promettente...';
        else if (percentuale < 60) messaggio = '💛 C\'è del potenziale!';
        else if (percentuale < 80) messaggio = '💕 Bella coppia!';
        else messaggio = '💖 Match perfetto!';
        
        const nomePartner = partner.id._serialized.split('@')[0];
        const nomeSender = senderId.split('@')[0];
        
        await msg.reply(
            `💘 *ROULETTE DELL\'AMORE* 🎰\n\n` +
            `@${nomeSender} ❤️ @${nomePartner}\n\n` +
            `Compatibilità: *${percentuale}%*\n${messaggio}`,
            undefined,
            { mentions: [senderId, partner.id._serialized] }
        );
        
    } catch (err) {
        console.error('Errore amoroulette:', err);
        await msg.reply('❌ Errore nella ricerca del partner. Riprova!');
    }
}

        // VARIANTE: Crea coppia con utenti specifici
else if (command === 'shippa') {
    if (!isGroup) return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    
    const mentioned = await msg.getMentions();
    
    if (mentioned.length === 0) {
        // Se non ci sono mention, comportati come creacoppia
        return msg.reply('💡 Usa `.creacoppia` per una coppia casuale, oppure `.shippa @user1 @user2` per shippare due persone specifiche!');
    }
    
    if (mentioned.length === 1) {
        return msg.reply('⚠️ Menziona un secondo utente da shippare!');
    }
    
    if (mentioned.length >= 2) {
        const frasi = [
            'sono ufficialmente una coppia! 💑',
            'si sono sposati! 💒',
            'sono innamorati! 😍',
            'sono fidanzati! 💕',
            'sono destinati a stare insieme! ✨',
            'hanno fatto match! 💖',
            'sono anime gemelle! 💫'
        ];
        
        const fraseScelta = frasi[Math.floor(Math.random() * frasi.length)];
        const nome1 = mentioned[0].id._serialized.split('@')[0];
        const nome2 = mentioned[1].id._serialized.split('@')[0];
        
        await msg.reply(
            `💘 *CUPIDO HA COLPITO!* 🏹\n\n` +
            `@${nome1} e @${nome2} ${fraseScelta}\n\n` +
            `💕 Che coppia! 🎉`,
            undefined,
            { mentions: [mentioned[0].id._serialized, mentioned[1].id._serialized] }
        );
    }
}

        else if (command === 'creacoppia') {
    if (!isGroup) return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    
    try {
        // Ottieni tutti i partecipanti del gruppo (escluso il bot)
        const participants = chat.participants.filter(p => {
            // Escludi il bot stesso
            const botId = client.info?.wid?._serialized || client.info?.me?._serialized || '';
            return p.id._serialized !== botId;
        });
        
        if (participants.length < 2) {
            return msg.reply('⚠️ Servono almeno 2 membri nel gruppo (escluso il bot)!');
        }
        
        // Scegli due utenti casuali diversi
        const shuffled = participants.sort(() => Math.random() - 0.5);
        const user1 = shuffled[0];
        const user2 = shuffled[1];
        
        // Frasi romantiche
        const frasi = [
            'sono ufficialmente una coppia! 💑',
            'si sono sposati! 💒',
            'sono innamorati! 😍',
            'sono fidanzati! 💕',
            'sono destinati a stare insieme! ✨',
            'hanno fatto match! 💖',
            'sono anime gemelle! 💫',
            'formano una coppia perfetta! 💝',
            'si sono dichiarati! 💌',
            'hanno iniziato a frequentarsi! 🥰'
        ];
        
        const fraseScelta = frasi[Math.floor(Math.random() * frasi.length)];
        
        // Ottieni i nomi o numeri degli utenti
        const nome1 = user1.id.user || user1.id._serialized.split('@')[0];
        const nome2 = user2.id.user || user2.id._serialized.split('@')[0];
        
        await msg.reply(
            `💘 *CUPIDO HA COLPITO!* 🏹\n\n` +
            `@${nome1} e @${nome2} ${fraseScelta}\n\n` +
            `💕 Auguri ai neo-fidanzati! 🎉`,
            undefined,
            { mentions: [user1.id._serialized, user2.id._serialized] }
        );
        
    } catch (err) {
        console.error('Errore creacoppia:', err);
        await msg.reply('❌ Errore nella creazione della coppia. Riprova!');
    }
}

        // ===== TEXT MANIPULATION =====

        else if (command === 'faketext') {
            if (!args.length) return msg.reply('⚠️ Usa: .faketext [testo]');
            const testo = msg.body.slice(10);
            await msg.reply(`✨ *TESTO FAKE*\n\n_"${testo}"_\n\n- Qualcuno, probabilmente`);
        }

        else if (command === 'ascii') {
            if (!args.length) return msg.reply('⚠️ Usa: .ascii [testo]');
            const testo = args.join(' ').toUpperCase();
            const ascii = {
                'A': '  █████╗ \n ██╔══██╗\n ███████║\n ██╔══██║\n ██║  ██║',
                'B': ' ██████╗ \n ██╔══██╗\n ██████╔╝\n ██╔══██╗\n ██████╔╝',
                'C': '  ██████╗\n ██╔════╝\n ██║     \n ██║     \n ╚██████╗'
            };
            const output = testo.split('').map(c => ascii[c] || c).join('\n\n');
            await msg.reply(`\`\`\`\n${output}\n\`\`\``);
        }

        else if (command === 't' && args[0]) {
    const chatId = chat.id._serialized;
    if (!gameStates[chatId]?.tictactoe) return msg.reply('⚠️ Nessuna partita attiva! Usa .tictactoe');
    
    const game = gameStates[chatId].tictactoe;
    const pos = parseInt(args[0]) - 1;
    
    if (isNaN(pos) || pos < 0 || pos > 8) return msg.reply('⚠️ Posizione non valida! Usa 1-9');
    if (game.board[pos] !== '⬜') return msg.reply('⚠️ Posizione già occupata!');
    
    const currentPlayer = msg.author || msg.from;
    if (currentPlayer !== game.turn) return msg.reply('⚠️ Non è il tuo turno!');
    
    const symbol = currentPlayer === game.player1 ? '⭕' : '❌';
    game.board[pos] = symbol;
    
    // Controlla vittoria
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const hasWon = wins.some(w => w.every(i => game.board[i] === symbol));
    
    if (hasWon) {
        await msg.reply(
            `🎉 *VITTORIA!*\n\n` +
            `${game.board.slice(0,3).join('')}\n` +
            `${game.board.slice(3,6).join('')}\n` +
            `${game.board.slice(6,9).join('')}\n\n` +
            `@${currentPlayer.split('@')[0]} ha vinto!`,
            undefined,
            { mentions: [currentPlayer] }
        );
        delete gameStates[chatId].tictactoe;
    } else if (!game.board.includes('⬜')) {
        await msg.reply(
            `🤝 *PAREGGIO!*\n\n` +
            `${game.board.slice(0,3).join('')}\n` +
            `${game.board.slice(3,6).join('')}\n` +
            `${game.board.slice(6,9).join('')}`
        );
        delete gameStates[chatId].tictactoe;
    } else {
        game.turn = game.turn === game.player1 ? game.player2 : game.player1;
        await msg.reply(
            `${game.board.slice(0,3).join('')}\n` +
            `${game.board.slice(3,6).join('')}\n` +
            `${game.board.slice(6,9).join('')}\n\n` +
            `Turno di @${game.turn.split('@')[0]}`,
            undefined,
            { mentions: [game.turn] }
        );
    }
    saveData();
}

        else if (command === 'reverse') {
            if (!args.length) return msg.reply('⚠️ Usa: .reverse [testo]');
            const testo = msg.body.slice(9);
            await msg.reply(`🔄 *TESTO INVERTITO*\n\n${testo.split('').reverse().join('')}`);
        }

        else if (command === 'caps') {
            if (!args.length) return msg.reply('⚠️ Usa: .caps [testo]');
            const testo = msg.body.slice(6);
            await msg.reply(testo.toUpperCase());
        }

        else if (command === 'mock') {
            if (!args.length) return msg.reply('⚠️ Usa: .mock [testo]');
            const testo = msg.body.slice(6);
            const mocked = testo.split('').map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join('');
            await msg.reply(`🤪 ${mocked}`);
        }



            
        // ===== MODERAZIONE =====

else if (command === 'purge') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    
    const num = parseInt(args[0]);
    if (isNaN(num) || num < 1 || num > 100) {
        return msg.reply('⚠️ Specifica un numero tra 1 e 100!\n\n📝 Esempio: `.purge 10`');
    }
    
    try {
        await msg.reply(`🗑️ Eliminazione di ${num} messaggi in corso...\n\n_Nota: WhatsApp Web ha limitazioni sulla cancellazione massiva_`);
        
        // Ottieni i messaggi della chat
        const messages = await chat.fetchMessages({ limit: num + 1 }); // +1 per escludere il comando stesso
        let deleted = 0;
        
        for (let i = 1; i < messages.length && i <= num; i++) {
            try {
                await messages[i].delete(true); // true = elimina per tutti
                deleted++;
                await new Promise(resolve => setTimeout(resolve, 300)); // Pausa per evitare rate limit
            } catch (e) {
                console.error('Errore eliminazione messaggio:', e);
            }
        }
        
        await msg.reply(`✅ Eliminati ${deleted} messaggi su ${num} richiesti.`);
    } catch (err) {
        console.error('Errore purge:', err);
        await msg.reply('❌ Errore durante l\'eliminazione dei messaggi.');
    }
}

// ========== PIN MESSAGE ==========
else if (command === 'pin') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        const quoted = await msg.getQuotedMessage();
        if (!quoted) {
            return msg.reply('⚠️ Rispondi al messaggio da fissare!\n\n💡 Quota il messaggio e usa `.pin`');
        }
        
        await quoted.pin();
        await msg.reply('✅ 📌 Messaggio fissato!');
        
    } catch (err) {
        console.error('Errore pin:', err);
        await msg.reply('❌ Impossibile fissare il messaggio. Verifica i permessi.');
    }
}

// ========== UNPIN MESSAGE ==========
else if (command === 'unpin') {
    if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        const quoted = await msg.getQuotedMessage();
        if (!quoted) {
            return msg.reply('⚠️ Rispondi al messaggio fissato da rimuovere!\n\n💡 Quota il messaggio e usa `.unpin`');
        }
        
        await quoted.unpin();
        await msg.reply('✅ 📌 Pin rimosso!');
        
    } catch (err) {
        console.error('Errore unpin:', err);
        await msg.reply('❌ Impossibile rimuovere il pin. Verifica i permessi.');
    }
}

   // ===== COMANDO .SHIP =====
else if (command === 'ship') {
    if (!isGroup) return msg.reply('⚠️ Questo comando funziona solo nei gruppi!');
    
    const mentioned = await msg.getMentions();

    // Se non ci sono due menzioni
    if (mentioned.length < 2) {
        return msg.reply('💡 Usa: `.ship @utente1 @utente2` per vedere la compatibilità amorosa!');
    }

    const user1 = mentioned[0];
    const user2 = mentioned[1];

    // Calcolo casuale della compatibilità (0-100)
    const lovePercentage = Math.floor(Math.random() * 101);

    // Determina un messaggio in base al punteggio
    let description = '';
    if (lovePercentage >= 90) description = '💞 Anima gemella trovata! Amore eterno! 💍';
    else if (lovePercentage >= 70) description = '❤️ Coppia perfetta, c’è grande intesa!';
    else if (lovePercentage >= 50) description = '💘 Potrebbe funzionare... con un po’ di impegno!';
    else if (lovePercentage >= 30) description = '💔 Mmh… non sembra ci sia molta chimica.';
    else description = '😬 Meglio restare amici!';

    // Componi un nome “ship” (unione dei due nomi)
    const name1 = (user1.pushname || user1.id.user || 'User1').split(' ')[0];
    const name2 = (user2.pushname || user2.id.user || 'User2').split(' ')[0];
    const shipName = name1.slice(0, Math.floor(name1.length / 2)) + name2.slice(Math.floor(name2.length / 2));

    // Messaggio finale
    const resultMsg = `💞 *Shipping Time!* 💞\n\n` +
                      `❤️ *${name1}* + *${name2}* = *${shipName}*\n\n` +
                      `💘 Compatibilità: *${lovePercentage}%*\n\n${description}`;

    // Invia il messaggio con le menzioni
    await msg.reply(resultMsg, null, { mentions: [user1, user2] });
}
 

// ========== GESTIONE RICHIESTE GRUPPO ==========

else if (command === 'richieste' || command === 'requests') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin per gestire le richieste!');

    try {
        // Ottieni richieste pendenti
        const pendingRequests = await chat.getGroupMembershipRequests();
        
        if (!pendingRequests || pendingRequests.length === 0) {
            const noRequestsText = `
╔═══════════════════════╗
║ 📋 *RICHIESTE GRUPPO*║
╚═══════════════════════╝

*✅ Nessuna richiesta pendente*

┌─────────────────────┐
│ 📊 Stato: Tutto OK
│ 🔔 Richieste: 0
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
💡 Quando arriveranno richieste potrai:
- \`.accettarichieste\` - Accetta tutte
- \`.rifiutarichieste\` - Rifiuta tutte
- \`.richieste\` - Vedi lista
`;
            return msg.reply(noRequestsText);
        }

        // Mostra lista richieste
        let requestsList = '';
        pendingRequests.forEach((req, index) => {
            const number = req.id.user.split('@')[0];
            requestsList += `│ ${index + 1}. +${number}\n`;
        });

        const requestsText = `
╔═══════════════════════╗
║ 📋 *RICHIESTE GRUPPO*║
╚═══════════════════════╝

*🔔 ${pendingRequests.length} richiesta/e in attesa*

*👥 LISTA UTENTI:*
┌─────────────────────┐
${requestsList}└─────────────────────┘

*⚙️ AZIONI DISPONIBILI:*
- \`.accettarichieste\` - ✅ Accetta tutte
- \`.rifiutarichieste\` - ❌ Rifiuta tutte
- \`.accetta @numero\` - ✅ Accetta singolo
- \`.rifiuta @numero\` - ❌ Rifiuta singolo

━━━━━━━━━━━━━━━━━━━━━
⏱️ Scegli un'azione per procedere
`;
        
        await msg.reply(requestsText);

    } catch (err) {
        console.error('Errore richieste:', err);
        await msg.reply('❌ Errore nel recuperare le richieste. Verifica che il gruppo abbia le richieste abilitate.');
    }
}

else if (command === 'accettarichieste' || command === 'acceptall') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin per accettare richieste!');
    
    try {
        const pendingRequests = await chat.getGroupMembershipRequests();
        
        if (!pendingRequests || pendingRequests.length === 0) {
            return msg.reply('ℹ️ *Nessuna richiesta da accettare*\n\nNon ci sono richieste pendenti in questo momento.');
        }

        const totalRequests = pendingRequests.length;
        const adminName = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];

        // Mostra messaggio di elaborazione
        await msg.reply(`⏳ *Elaborazione in corso...*\n\nAccettazione di ${totalRequests} richiesta/e...`);

        let accepted = 0;
        let failed = 0;
        const failedNumbers = [];

        // Accetta tutte le richieste
        for (const request of pendingRequests) {
            try {
                await chat.approveGroupMembershipRequests(request.id.user);
                accepted++;
                await new Promise(resolve => setTimeout(resolve, 500)); // Delay per evitare rate limit
            } catch (err) {
                failed++;
                const number = request.id.user.split('@')[0];
                failedNumbers.push(number);
                console.error(`Errore accettazione ${number}:`, err);
            }
        }

        const resultText = `
╔═══════════════════════╗
║ ✅ *RICHIESTE ACCETTATE* ║
╚═══════════════════════╝

*📊 RIEPILOGO:*
┌─────────────────────┐
│ ✅ Accettate: *${accepted}/${totalRequests}*
${failed > 0 ? `│ ❌ Fallite: *${failed}*\n` : ''}│ 👮 Admin: @${adminName}
│ ⏰ Data: ${new Date().toLocaleString('it-IT')}
└─────────────────────┘
${failed > 0 ? `
*⚠️ RICHIESTE FALLITE:*
${failedNumbers.map(n => `• +${n}`).join('\n')}
` : ''}
━━━━━━━━━━━━━━━━━━━━━
${accepted > 0 ? '🎉 Gli utenti sono stati aggiunti al gruppo!' : '❌ Nessuna richiesta accettata'}
`;

        await msg.reply(resultText);

        // Log per console
        console.log(`[ACCEPT REQUESTS] ${accepted}/${totalRequests} accettate da ${adminName}`);

    } catch (err) {
        console.error('Errore accettarichieste:', err);
        
        const errorText = `
╔═══════════════════════╗
║  ❌ *ERRORE*         ║
╚═══════════════════════╝

*⚠️ Impossibile accettare le richieste*

*🔍 POSSIBILI CAUSE:*
┌─────────────────────┐
│ • Il bot non è admin
│ • Gruppo senza richieste
│ • Errore di connessione
│ • Limite di rate WhatsApp
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
💡 Riprova tra qualche minuto
`;
        
        await msg.reply(errorText);
    }
}

else if (command === 'rifiutarichieste' || command === 'rejectall') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin per rifiutare richieste!');
    
    try {
        const pendingRequests = await chat.getGroupMembershipRequests();
        
        if (!pendingRequests || pendingRequests.length === 0) {
            return msg.reply('ℹ️ *Nessuna richiesta da rifiutare*\n\nNon ci sono richieste pendenti in questo momento.');
        }

        const totalRequests = pendingRequests.length;
        const adminName = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];

        // Chiedi conferma
        const confirmText = `
╔═══════════════════════╗
║ ⚠️ *CONFERMA AZIONE* ║
╚═══════════════════════╝

*❌ Stai per rifiutare ${totalRequests} richiesta/e*

┌─────────────────────┐
│ 🔔 Richieste: ${totalRequests}
│ 👮 Admin: @${adminName}
└─────────────────────┘

*⚠️ ATTENZIONE:*
Questa azione è irreversibile!
Gli utenti dovranno richiedere di nuovo l'accesso.

*📝 CONFERMA:*
Rispondi con:
- \`.confermarifiuto\` - Per procedere
- \`.annulla\` - Per annullare

━━━━━━━━━━━━━━━━━━━━━
⏱️ Hai 30 secondi per confermare
`;

        await msg.reply(confirmText);

        // Salva stato di conferma
        if (!global.pendingRejections) global.pendingRejections = {};
        global.pendingRejections[chat.id._serialized] = {
            requests: pendingRequests,
            admin: msg.author || msg.from,
            timestamp: Date.now()
        };

        // Timeout dopo 30 secondi
        setTimeout(() => {
            if (global.pendingRejections && global.pendingRejections[chat.id._serialized]) {
                delete global.pendingRejections[chat.id._serialized];
            }
        }, 30000);

    } catch (err) {
        console.error('Errore rifiutarichieste:', err);
        await msg.reply('❌ Errore nel recuperare le richieste. Verifica che il gruppo abbia le richieste abilitate.');
    }
}

else if (command === 'confermarifiuto') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    const pending = global.pendingRejections?.[chat.id._serialized];
    
    if (!pending) {
        return msg.reply('❌ *Nessuna richiesta di rifiuto pendente*\n\nUsa prima `.rifiutarichieste` per iniziare.');
    }

    try {
        const totalRequests = pending.requests.length;
        const adminName = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];

        // Mostra messaggio di elaborazione
        await msg.reply(`⏳ *Elaborazione in corso...*\n\nRifiuto di ${totalRequests} richiesta/e...`);

        let rejected = 0;
        let failed = 0;
        const failedNumbers = [];

        // Rifiuta tutte le richieste
        for (const request of pending.requests) {
            try {
                await chat.rejectGroupMembershipRequests(request.id.user);
                rejected++;
                await new Promise(resolve => setTimeout(resolve, 500)); // Delay per evitare rate limit
            } catch (err) {
                failed++;
                const number = request.id.user.split('@')[0];
                failedNumbers.push(number);
                console.error(`Errore rifiuto ${number}:`, err);
            }
        }

        // Pulisci stato pendente
        delete global.pendingRejections[chat.id._serialized];

        const resultText = `
╔═══════════════════════╗
║ ❌ *RICHIESTE RIFIUTATE* ║
╚═══════════════════════╝

*📊 RIEPILOGO:*
┌─────────────────────┐
│ ❌ Rifiutate: *${rejected}/${totalRequests}*
${failed > 0 ? `│ ⚠️ Fallite: *${failed}*\n` : ''}│ 👮 Admin: @${adminName}
│ ⏰ Data: ${new Date().toLocaleString('it-IT')}
└─────────────────────┘
${failed > 0 ? `
*⚠️ RICHIESTE NON RIFIUTATE:*
${failedNumbers.map(n => `• +${n}`).join('\n')}
` : ''}
━━━━━━━━━━━━━━━━━━━━━
${rejected > 0 ? '✅ Le richieste sono state rifiutate!' : '❌ Nessuna richiesta rifiutata'}
`;

        await msg.reply(resultText);

        // Log per console
        console.log(`[REJECT REQUESTS] ${rejected}/${totalRequests} rifiutate da ${adminName}`);

    } catch (err) {
        console.error('Errore confermarifiuto:', err);
        
        const errorText = `
╔═══════════════════════╗
║  ❌ *ERRORE*         ║
╚═══════════════════════╝

*⚠️ Impossibile rifiutare le richieste*

*🔍 POSSIBILI CAUSE:*
┌─────────────────────┐
│ • Il bot non è admin
│ • Richieste già processate
│ • Errore di connessione
│ • Limite di rate WhatsApp
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
💡 Riprova tra qualche minuto
`;
        
        await msg.reply(errorText);
    }
}

else if (command === 'annulla') {
    if (!isGroup) return;
    
    const pending = global.pendingRejections?.[chat.id._serialized];
    
    if (!pending) {
        return; // Ignora se non c'è nulla da annullare
    }

    delete global.pendingRejections[chat.id._serialized];
    await msg.reply('✅ *Operazione annullata*\n\nLe richieste non sono state rifiutate.');
}

// ========== GESTIONE RICHIESTE SINGOLE ==========

else if (command === 'accetta' || command === 'approve') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin per accettare richieste!');

    try {
        const number = args[0]?.replace(/[^0-9]/g, '');
        
        if (!number) {
            return msg.reply(
                '⚠️ *Specifica il numero da accettare!*\n\n' +
                '💡 *Uso:* `.accetta @numero` o `.accetta +39123456789`\n' +
                '📝 *Esempio:* `.accetta @393123456789`'
            );
        }

        const userId = number + '@c.us';
        await chat.approveGroupMembershipRequests(userId);

        const successText = `
╔═══════════════════════╗
║ ✅ *RICHIESTA ACCETTATA* ║
╚═══════════════════════╝

*👤 UTENTE AGGIUNTO:*
┌─────────────────────┐
│ 📱 Numero: +${number}
│ ✅ Stato: Accettato
│ ⏰ Data: ${new Date().toLocaleString('it-IT')}
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
🎉 L'utente è stato aggiunto al gruppo!
`;

        await msg.reply(successText);

    } catch (err) {
        console.error('Errore accetta:', err);
        await msg.reply('❌ Errore nell\'accettare la richiesta. Verifica che il numero sia corretto e abbia una richiesta pendente.');
    }
}

else if (command === 'rifiuta' || command === 'reject') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
    if (!await isBotAdmin(chat)) return msg.reply('⚠️ Il bot deve essere admin per rifiutare richieste!');

    try {
        const number = args[0]?.replace(/[^0-9]/g, '');
        
        if (!number) {
            return msg.reply(
                '⚠️ *Specifica il numero da rifiutare!*\n\n' +
                '💡 *Uso:* `.rifiuta @numero` o `.rifiuta +39123456789`\n' +
                '📝 *Esempio:* `.rifiuta @393123456789`'
            );
        }

        const userId = number + '@c.us';
        await chat.rejectGroupMembershipRequests(userId);

        const successText = `
╔═══════════════════════╗
║ ❌ *RICHIESTA RIFIUTATA* ║
╚═══════════════════════╝

*👤 UTENTE RIFIUTATO:*
┌─────────────────────┐
│ 📱 Numero: +${number}
│ ❌ Stato: Rifiutato
│ ⏰ Data: ${new Date().toLocaleString('it-IT')}
└─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━
✅ La richiesta è stata rifiutata!
`;

        await msg.reply(successText);

    } catch (err) {
        console.error('Errore rifiuta:', err);
        await msg.reply('❌ Errore nel rifiutare la richiesta. Verifica che il numero sia corretto e abbia una richiesta pendente.');
    }
}

// ===== COMANDO LEVEL =====
if (command === 'level' || command === 'livello') {
    const userId = getUserIdFromMsg(msg);
    const stats = getUserStats(userId);
    const level = stats.level || 1;
    const xp = stats.xp || 0;
    const xpForNext = level * 100;
    const progressBar = createProgressBar(xp, xpForNext);
    
    try {
        const contact = await msg.getContact();
        const userName = contact.pushname || contact.name || 'Utente';
        
        await msg.reply(
            `🏆 *LIVELLO DI ${userName.toUpperCase()}*\n\n` +
            `📊 Livello: *${level}*\n` +
            `⭐ XP: *${xp}* / ${xpForNext}\n` +
            `${progressBar}\n\n` +
            `📈 Progresso: ${Math.floor((xp / xpForNext) * 100)}%\n` +
            `🎯 XP mancanti: *${xpForNext - xp}*\n\n` +
            `💬 Messaggi inviati: ${stats.messages || 0}`
        );
    } catch (err) {
        console.error('Errore level:', err);
        await msg.reply('❌ Errore nel recuperare il livello.');
    }
}

// ===== COMANDO PROFILO =====
else if (command === 'profilo' || command === 'profile') {
    const userId = getUserIdFromMsg(msg);
    const stats = getUserStats(userId);
    const level = stats.level || 1;
    const xp = stats.xp || 0;
    const messages = stats.messages || 0;
    const rep = stats.reputation || 0;
    const bio = stats.bio || 'Nessuna bio impostata';

    // --- Recupera Instagram se presente ---
    let igHandle = null;
    if (stats.instagram) igHandle = stats.instagram;
    else if (stats.ig) igHandle = stats.ig;
    if (igHandle) {
        igHandle = igHandle.toString().trim().replace(/^@/, ''); // normalizza rimuovendo @
        if (igHandle === '') igHandle = null;
    }

    try {
        const contact = await msg.getContact();
        const userName = contact.pushname || contact.name || 'Utente';
        const about = contact.statusMessage || 'Nessuno stato';

        // Determina il rank
        let rank = '🥉 Bronzo';
        if (level >= 30) rank = '💎 Diamante';
        else if (level >= 20) rank = '🏅 Platino';
        else if (level >= 10) rank = '🥇 Oro';
        else if (level >= 5) rank = '🥈 Argento';

        // Recupera economia
        const eco = economy[userId] || { money: 0, bank: 0 };

        // Recupera warnings
        const warns = warnings[userId] || 0;

        // Se esiste Instagram, prepara la riga (tag + link)
        const igSection = igHandle ? `📸 Instagram: @${igHandle}\n🔗 https://instagram.com/${igHandle}\n\n` : '';

        const profileMsg =
            `👤 *PROFILO DI ${userName.toUpperCase()}*\n\n` +
            `━━━━━━━━━━━━━━━\n` +
            `🏆 Livello: *${level}*\n` +
            `⭐ XP Totale: *${xp}*\n` +
            `🎖️ Rank: ${rank}\n\n` +
            `━━━━━━━━━━━━━━━\n` +
            `📊 *STATISTICHE*\n` +
            `💬 Messaggi: ${messages}\n` +
            `⭐ Reputazione: ${rep}\n` +
            `💰 Money: $${eco.money}\n` +
            `🏦 Bank: $${eco.bank}\n` +
            `⚠️ Warning: ${warns}/3\n\n` +
            `━━━━━━━━━━━━━━━\n` +
            igSection + // qui inserisco l'Instagram se presente
            `💭 Bio: _"${bio}"_\n` +
            `📱 Stato: _"${about}"_\n` +
            `━━━━━━━━━━━━━━━`;

        // Prova a inviare con foto profilo
        try {
            const profilePic = await contact.getProfilePicUrl();
            const media = await MessageMedia.fromUrl(profilePic);
            await client.sendMessage(msg.from, media, { caption: profileMsg });
        } catch (e) {
            // Se non c'è foto profilo, invia solo testo
            await msg.reply(profileMsg);
        }

    } catch (err) {
        console.error('Errore profilo:', err);
        await msg.reply('❌ Errore nel recuperare il profilo.');
    }
}

     // ========== .setig ==========
else if (command === 'setig') {
    const ig = args.join(' ').trim();
    if (!ig) return await msg.reply('📸 Uso corretto:\n.setig {instagram}\nEsempio: `.setig cristian_fx`');

    initUser(userId);
    const clean = ig.replace(/^@/, '').trim();

    if (!/^[A-Za-z0-9._]{1,30}$/.test(clean))
        return await msg.reply('⚠️ Username Instagram non valido. Usa solo lettere, numeri, punti o underscore.');

    userStats[userId].instagram = clean;
    saveUserStats();

    await msg.reply(`✅ Il tuo Instagram è stato impostato su: @${clean}\n🔗 https://instagram.com/${clean}`);
}


// ========== .setuserig ==========
else if (command === 'setuserig') {
    const mentions = await msg.getMentions();
    let targetId = null;
    let ig = '';

    if (mentions.length > 0) {
        targetId = mentions[0].id._serialized;
        ig = args.slice(1).join(' ').trim();
    } else {
        if (args.length < 2)
            return await msg.reply('📸 Uso corretto:\n.setuserig {@utente} {instagram}\nOppure: .setuserig {userId} {instagram}');
        targetId = args[0];
        ig = args.slice(1).join(' ').trim();
    }

    if (!ig) return await msg.reply('⚠️ Specifica l’handle Instagram.');

    const clean = ig.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9._]{1,30}$/.test(clean))
        return await msg.reply('⚠️ Username Instagram non valido. Usa solo lettere, numeri, punti o underscore.');

    initUser(targetId);
    userStats[targetId].instagram = clean;
    saveUserStats();

    let targetDisplay = 'Utente';
    try {
        if (mentions.length > 0)
            targetDisplay = mentions[0].pushname || mentions[0].verifiedName || targetDisplay;
    } catch {}

    await msg.reply(`✅ Instagram di *${targetDisplay}* impostato su: @${clean}\n🔗 https://instagram.com/${clean}`);
}

// ========== CLEAR CACHE (DS) ==========
else if (command === 'ds') {
    // Permessi: se è in gruppo richiedi admin, altrimenti lascia passare (es. DM)
    if (isGroup && !await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
    
    try {
        // funzione helper per contare elementi in vari tipi di container
        const countItems = (c) => {
            if (!c) return 0;
            if (typeof c.size === 'number') return c.size;         // Map/Set
            if (Array.isArray(c)) return c.length;                // Array
            if (typeof c === 'object') return Object.keys(c).length; // plain object
            return 0;
        };

        // Conta prima della pulizia (per report)
        const before = {
            groupData: countItems(groupData),
            games: countItems(games),
            economy: countItems(economy),
            userStats: countItems(userStats),
            marriages: countItems(marriages),
            pets: countItems(pets),
            warnings: countItems(warnings),
            automodConfig: countItems(automodConfig)
        };

        // Pulisci in modo sicuro: se sono strutture con .clear() usalo, altrimenti re-inizializza
        if (groupData && typeof groupData.clear === 'function') groupData.clear(); else groupData = {};
        if (games && typeof games.clear === 'function') games.clear(); else games = {};
        if (economy && typeof economy.clear === 'function') economy.clear(); else economy = {};
        if (userStats && typeof userStats.clear === 'function') userStats.clear(); else userStats = {};
        if (marriages && typeof marriages.clear === 'function') marriages.clear(); else marriages = {};
        if (pets && typeof pets.clear === 'function') pets.clear(); else pets = {};
        if (warnings && typeof warnings.clear === 'function') warnings.clear(); else warnings = {};
        if (automodConfig && typeof automodConfig.clear === 'function') automodConfig.clear(); else automodConfig = {};

        // Prova a liberare memoria (se Node è stato avviato con --expose-gc)
        let gcMsg = '⚠️ GC non disponibile (avvia node con --expose-gc per usarlo)';
        if (typeof global !== 'undefined' && typeof global.gc === 'function') {
            try {
                global.gc();
                gcMsg = '✅ Garbage collector eseguito (global.gc())';
            } catch (e) {
                gcMsg = '⚠️ Tentativo GC fallito: ' + e.message;
            }
        }

        // Se hai una funzione per salvare su disco (es. saveData), chiamala per mantenere coerenza
        if (typeof saveData === 'function') {
            try {
                await saveData();
            } catch (e) {
                // non bloccare l'operazione se save fallisce
                console.error('saveData fallita dopo ds:', e);
            }
        }

        // Report all'utente (conteggio prima -> pulito)
        const report = [
            `✅ Cache pulita! Il bot resta attivo.`,
            ``,
            `Elementi rimossi (prima della pulizia):`,
            `• groupData: ${before.groupData}`,
            `• games: ${before.games}`,
            `• economy: ${before.economy}`,
            `• userStats: ${before.userStats}`,
            `• marriages: ${before.marriages}`,
            `• pets: ${before.pets}`,
            `• warnings: ${before.warnings}`,
            `• automodConfig: ${before.automodConfig}`,
            ``,
            `${gcMsg}`
        ].join('\n');

        await msg.reply(report);

    } catch (err) {
        console.error('Errore comando .ds:', err);
        await msg.reply('❌ Errore durante la pulizia della cache. Controlla i log.');
    }
}




        // Risposta quiz/math se l'utente risponde con numeri
        else if (!isNaN(text) && text.trim() !== '') {
            const chatId = msg.from;
            const num = parseInt(text);
            
            // Controlla quiz
            if (gameStates[chatId]?.quiz) {
                const q = gameStates[chatId].quiz;
                if (num >= 1 && num <= 3) {
                    if (num - 1 === q.c) {
                        await msg.reply(`🎉 *CORRETTO!*\n\nLa risposta giusta era: ${q.a[q.c]}`);
                    } else {
                        await msg.reply(`❌ *SBAGLIATO!*\n\nLa risposta corretta era: ${q.a[q.c]}`);
                    }
                    delete gameStates[chatId].quiz;
                    saveData();
                }
            }
            
            // Controlla math
            if (gameStates[chatId]?.math) {
                const m = gameStates[chatId].math;
                if (num === m.risposta) {
                    await msg.reply(`🎉 *CORRETTO!*\n\n${m.domanda} = ${m.risposta}`);
                } else {
                    await msg.reply(`❌ *SBAGLIATO!*\n\n${m.domanda} = ${m.risposta}`);
                }
                delete gameStates[chatId].math;
                saveData();
            }
        }
        
        // Risposta memory
        else if (gameStates[msg.from]?.memory && !gameStates[msg.from].memory.attesa) {
            const game = gameStates[msg.from].memory;
            if (text === game.sequenza.toLowerCase()) {
                await msg.reply(`🎉 *ESATTO!*\n\nHai memorizzato la sequenza corretta!`);
            } else {
                await msg.reply(`❌ *SBAGLIATO!*\n\nLa sequenza era: ${game.sequenza}`);
            }
            delete gameStates[msg.from].memory;
            saveData();
        }

        

    // ========== Fallback per comandi non riconosciuti ==========
        else {
            if (!isGroup) {
                await msg.reply('❓ Comando non riconosciuto. Usa `.fun` per la lista dei comandi fun!');
            }
        }

    } catch (error) {
        console.error('⚠️ Errore nel processamento del messaggio:', error);
        try {
            await msg.reply('❌ Si è verificato un errore! Riprova.');
        } catch (err) {
            console.error('Errore invio messaggio di errore:', err);
        }
    }

    } catch (error) {
        console.error('⚠️ Errore nel processamento del messaggio:', error);
        await msg.reply('❌ Si è verificato un errore! Riprova.');
    }
}); // Chiude client.on('message')

// Avvia il client
client.initialize();

console.log('🚀 Bot WhatsApp in avvio...');

