const { Client, LocalAuth, MessageMedia, Buttons, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

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

    // Ottieni id del bot in modo sicuro
    const botRaw = (client && client.info && (client.info.me?._serialized || client.info.wid?._serialized)) || '';
    const botId = (botRaw || '').split('@')[0];
    if (!botId) return false;

    // La lista dei partecipanti potrebbe essere già presente su `chat`, altrimenti cogliamo freshChat
    const targetChat = chat.participants && Array.isArray(chat.participants) ? chat : await client.getChatById(chat.id._serialized);
    if (!targetChat || !Array.isArray(targetChat.participants)) return false;

    const participant = targetChat.participants.find(p => {
      const pIdRaw = p && p.id && p.id._serialized ? p.id._serialized : '';
      return (pIdRaw || '').split('@')[0] === botId;
    });

    return Boolean(participant && (participant.isAdmin === true || participant.isSuperAdmin === true));
  } catch (err) {
    console.error('isBotAdmin error:', err);
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

// ---------------------- MESSAGGI ----------------------
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const isGroup = chat.isGroup;
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

        // ---------------------- MODERAZIONE AUTOMATICA ----------------------
        if (isGroup && groupInfo) {
            // Utenti mutati
            if (groupInfo.mutedUsers.includes(userNumber)) {
                try { 
                    await msg.delete(true); 
                    return;
                } catch {}
            }

            // Utenti bannati
            if (groupInfo.bannedUsers.includes(userNumber)) {
                if (await isBotAdmin(chat)) {
                    try { 
                        await chat.removeParticipants([msg.author]); 
                        return;
                    } catch {}
                }
            }

            // Anti-link
            if (groupInfo.antilink && /https?:\/\/|www\.|wa\.me|whatsapp\.com/i.test(msg.body || '')) {
                if (!(await isAdmin(msg, chat))) {
                    try { 
                        await msg.delete(true); 
                        await msg.reply('⚠️🔗 *ANTILINK ATTIVO*\n\nI link non sono permessi in questo gruppo!');
                        return;
                    } catch {}
                }
            }

            // Anti-bot
            if (groupInfo.antiBot && msg.fromMe === false) {
                const contact = await msg.getContact();
                if (contact.isWAContact === false || contact.isBusiness) {
                    if (!(await isAdmin(msg, chat))) {
                        try {
                            await chat.removeParticipants([msg.author]);
                            await msg.reply('🤖❌ Bot rilevato e rimosso automaticamente!');
                            return;
                        } catch {}
                    }
                }
            }

            // Slowmode
            if (groupInfo.slowmode > 0) {
                const lastMsg = groupInfo.lastMessage[userNumber] || 0;
                if (Date.now() - lastMsg < groupInfo.slowmode * 1000) {
                    try { 
                        await msg.delete(true); 
                        return;
                    } catch {}
                }
                groupInfo.lastMessage[userNumber] = Date.now();
            }

            // Parole vietate
            if ((msg.body || '').length > 0 && groupInfo.blockedWords.some(w => msg.body.toLowerCase().includes(w.toLowerCase()))) {
                try { 
                    await msg.delete(true); 
                    await msg.reply('⚠️🚫 Hai usato una parola vietata!');
                    return;
                } catch {}
            }

            // Anti-flood
            if (automod?.antiFlood) {
                if (!groupInfo.messageCount) groupInfo.messageCount = {};
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
        }

        // ---------------------- COMANDI ----------------------
if (!msg.body || !msg.body.startsWith('.')) return;

const args = msg.body.slice(1).trim().split(/ +/);
const command = (args.shift() || '').toLowerCase();

// ---------- CONTROLLO MODALITÀ ADMIN ----------
if (chat.isGroup && groupData[chat.id._serialized]?.adminMode) {
    const isUserAdmin = await isAdmin(msg, chat);
    if (!isUserAdmin && command !== 'modoadmin') return; // silenzio per non-admin
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
  const menuText = `
╔═══════════════════════╗
║  🤖 *BOT WHATSAPP*   ║
║  *MENU PRINCIPALE*    ║
╚═══════════════════════╝

📋 *USA I PULSANTI SOTTO PER NAVIGARE*

🎯 *COMANDI RAPIDI:*
• .moderazione - Gestisci gruppo 👮
• .economia - Sistema economico 💰
• .giochi - Giochi disponibili 🎮
• .fun - Comandi divertenti 🎪
• .utilita - Strumenti utili ⚙️

📊 *STATISTICHE:*
• .level - Il tuo livello 🏆
• .profilo - Il tuo profilo 👤
• .top - Classifiche 🏅

❓ *AIUTO:*
• .help [comando] - Info comando
• .info-bot - Info sul bot
• .ping - Testa il bot

💡 *SUGGERIMENTO:*
Usa i pulsanti qui sotto per navigare rapidamente nei menu!

🔧 *Versione Bot:* 2.0 Premium
⏰ *Uptime:* ${formatTime(Math.floor((Date.now() - startTime) / 1000))}
`;

  const sections = [
    {
      title: '👮 MODERAZIONE',
      rows: [
        { id: '.moderazione', title: '👮 Moderazione', description: 'Comandi admin e moderazione' },
        { id: '.automod', title: '🛡️ Auto-Moderazione', description: 'Sistema automatico' }
      ]
    },
    {
      title: '💰 SISTEMA',
      rows: [
        { id: '.economia', title: '💰 Economia', description: 'Soldi, lavoro, banca' },
        { id: '.giochi', title: '🎮 Giochi', description: 'Slot, quiz, indovina' }
      ]
    },
    {
      title: '🎉 EXTRA',
      rows: [
        { id: '.fun', title: '🎪 Fun & Social', description: 'Comandi divertenti' },
        { id: '.utilita', title: '⚙️ Utilità', description: 'Strumenti vari' }
      ]
    }
  ];

  // Invia menu interattivo o fallback testuale
  await sendListOrFallback(client, msg.from, menuText, sections, '📋 Seleziona Menu', '🤖 Bot Menu');
  return;
}


// ========== MENU MODERAZIONE ==========
if (command === 'moderazione' || command === 'mod') {
  const modText = `
╔═══════════════════════╗
║ 👮 *MODERAZIONE*     ║
╚═══════════════════════╝

👥 *GESTIONE UTENTI:*
• .ban @user - 🚫 Banna utente
• .unban @user - ✅ Sbanna utente
• .kick @user - 👢 Rimuovi utente
• .muta @user [tempo] - 🔇 Muta utente
• .smuta @user - 🔊 Smuta utente
• .warn @user [motivo] - ⚠️ Avvisa utente
• .unwarn @user - ✅ Rimuovi warn
• .warnings @user - 📋 Vedi warns
• .clearwarns @user - 🗑️ Cancella warns

👑 *GESTIONE ADMIN:*
• .p @user - 👑 Promuovi admin
• .d @user - 👤 Degrada admin
• .admins - 👥 Lista admin
• .promote-all - 👑 Promuovi tutti
• .demote-all - 👤 Degrada tutti

🛡️ *PROTEZIONE GRUPPO:*
• .antilink on/off - 🔗 Blocca link
• .antibot on/off - 🤖 Blocca bot
• .antispam on/off - 💥 Anti spam
• .antiraid on/off - 🛡️ Anti raid
• .slowmode [sec] - ⏱️ Rallenta chat
• .lock - 🔒 Blocca impostazioni
• .unlock - 🔓 Sblocca impostazioni

📝 *CONTENUTI:*
• .blocca [parola] - 🚫 Blocca parola
• .sblocca [parola] - ✅ Sblocca parola
• .listaparole - 📋 Lista parole bloccate
• .r - 🗑️ Elimina messaggio quotato

⚙️ *CONFIGURAZIONE:*
• .regole [testo] - 📜 Imposta regole
• .vediregole - 📖 Visualizza regole
• .chiudi - 🔒 Solo admin scrivono
• .apri - 🔓 Tutti scrivono
• .setwelcome [msg] - 👋 Messaggio benvenuto
• .setgoodbye [msg] - 👋 Messaggio addio
• .setmaxwarns [num] - ⚠️ Max warn prima ban

📊 *INFORMAZIONI:*
• .info - 📊 Info gruppo
• .mutati - 🔇 Lista utenti mutati
• .bannati - 🚫 Lista utenti bannati
• .attivita - 📈 Attività gruppo

🎯 *AZIONI RAPIDE:*
• .tag [msg] - 📢 Tagga tutti
• .hidetag [msg] - 👻 Tag nascosto
• .purge [num] - 🗑️ Elimina messaggi
• .pin - 📌 Fissa messaggio
• .unpin - 📌 Togli fissa

💡 *SUGGERIMENTO:*
Usa .automod per configurare la moderazione automatica!
`;
  await msg.reply(modText);
  return;
}

// ========== MENU AUTO-MODERAZIONE ==========
if (command === 'automod' || command === 'automoderatore') {
  if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
  if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
  
  const automodText = `
╔═══════════════════════╗
║ 🛡️ *AUTO-MOD*       ║
╚═══════════════════════╝

*STATO ATTUALE:*
🔗 Antilink: ${groupInfo.antilink ? '✅ ON' : '❌ OFF'}
🤖 Antibot: ${groupInfo.antiBot ? '✅ ON' : '❌ OFF'}
💥 Antispam: ${groupInfo.antiSpam ? '✅ ON' : '❌ OFF'}
🛡️ Antiraid: ${automod?.antiRaid ? '✅ ON' : '❌ OFF'}
💥 Antiflood: ${automod?.antiFlood ? '✅ ON' : '❌ OFF'}
⏱️ Slowmode: ${groupInfo.slowmode}s
⚠️ Max Warns: ${groupInfo.maxWarns}

*COMANDI CONFIGURAZIONE:*
• .antilink on/off - Attiva/disattiva antilink
• .antibot on/off - Attiva/disattiva antibot
• .antispam on/off - Attiva/disattiva antispam
• .antiraid on/off - Attiva/disattiva antiraid
• .antiflood on/off [msg] [sec] - Config antiflood
• .slowmode [secondi] - Imposta slowmode
• .setmaxwarns [numero] - Max warn

*ESEMPIO ANTIFLOOD:*
.antiflood on 5 10
(Max 5 messaggi in 10 secondi)
`;
  await msg.reply(automodText);
  return;
}

// ========== MENU ECONOMIA ==========
if (command === 'economia' || command === 'eco') {
  const ecoText = `
╔═══════════════════════╗
║ 💰 *ECONOMIA*        ║
╚═══════════════════════╝

.soldi - Vedi saldo
.daily - Bonus giornaliero
.lavora - Lavora per soldi
.weekly - Bonus settimanale
.monthly - Bonus mensile
.regalo @user [amt] - Dona soldi
.ruba @user - Ruba soldi
.deposita [amt] - Deposita in banca
.preleva [amt] - Preleva da banca
.crimine - Commetti crimine
.scommessa [amt] - Scommetti
.multiplica [amt] - Moltiplica soldi
.investimento [amt] - Investi
.prestito [amt] - Chiedi prestito
.ripaga - Ripaga prestito

`;
  await msg.reply(ecoText);
  return;
}

// ========== MENU GIOCHI ==========
if (command === 'giochi' || command === 'games') {
  const gamesText = `
╔═══════════════════════╗
║ 🎮 *GIOCHI*          ║
╚═══════════════════════╝

.rps [scelta] - Morra cinese
.slot - Slot machine
.indovina [num] - Indovina numero
.8ball [domanda] - Palla magica
.scelta op1|op2 - Scegli random
.dado - Lancia dado
.moneta - Lancia moneta
.blackjack - Gioca blackjack
.roulette [color/num] - Roulette
.quiz - Quiz random
.trivia - Trivia
.math - Matematica veloce
.memory - Gioco memoria
.tictactoe @user - Tris
.impiccato - Impiccato
.indovinachi - Indovina personaggio
`;
  await msg.reply(gamesText);
  return;
}

// ========== MENU FUN ==========
if (command === 'fun' || command === 'divertimento') {
  const funText = `
╔═══════════════════════╗
║ 🎪 *FUN & SOCIAL*    ║
╚═══════════════════════╝

.meme - Meme random
.fact - Fatto random
.quote - Citazione
.joke - Barzelletta
.consiglio - Consiglio random
.sfida @user - Sfida utente
.complimento @user - Complimento
.insulta @user - Insulta (fun)
.amore @user - Calcolatore amore
.ship @user1 @user2 - Shippa due user
.faketext [testo] - Testo fake
.ascii [testo] - Testo ASCII
.reverse [testo] - Testo invertito
.caps [testo] - MAIUSCOLO
.mock [testo] - tEsTo AlTeRnAtO
`;
  await msg.reply(funText);
  return;
}



        // ========== COMANDI MODERAZIONE ==========
        else if (command === 'tag' || command === 'tagall') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
            const messageText = args.join(' ').trim() || '📢 Attenzione a tutti!';
            const mentions = [];
            for (let participant of chat.participants) {
                try {
                    const contact = await client.getContactById(participant.id._serialized);
                    mentions.push(contact);
                } catch (e) {}
            }
            try {
                await chat.sendMessage(messageText, { mentions });
            } catch (err) {
                await msg.reply('❌ Errore durante il tag.');
            }
        }

        else if (command === 'hidetag') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
            const text = args.join(' ') || '👻 Messaggio nascosto';
            const mentions = chat.participants.map(p => p.id._serialized);
            try {
                await chat.sendMessage(text, { mentions });
            } catch (err) {
                await msg.reply('❌ Errore durante l\'invio.');
            }
        }

        else if (command === 'ban') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da bannare!');
            const toBanId = mentioned[0].id._serialized;
            const toBanNumber = toBanId.split('@')[0];
            initGroup(chat.id._serialized);
            const alreadyBanned = groupData[chat.id._serialized].bannedUsers.some(id => id.split('@')[0] === toBanNumber);
            if (!alreadyBanned) {
                groupData[chat.id._serialized].bannedUsers.push(toBanId);
                saveData();
            }
            try {
                const freshChat = await client.getChatById(chat.id._serialized);
                const participant = freshChat.participants.find(p => p.id._serialized.split('@')[0] === toBanNumber);
                if (!participant) return msg.reply('❌ Utente non trovato nel gruppo!');
                await chat.removeParticipants([participant.id._serialized]);
                await msg.reply(`✅ 🚫 *${mentioned[0].pushname || mentioned[0].number}* è stato bannato dal gruppo!`);
            } catch (err) {
                await msg.reply('❌ Errore nel bannare l\'utente.');
            }
        }

        else if (command === 'unban') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da sbannare!');
            const toUnbanNumber = mentioned[0].id._serialized.split('@')[0];
            initGroup(chat.id._serialized);
            const idx = groupData[chat.id._serialized].bannedUsers.findIndex(id => id.split('@')[0] === toUnbanNumber);
            if (idx !== -1) {
                groupData[chat.id._serialized].bannedUsers.splice(idx, 1);
                saveData();
                await msg.reply(`✅ *${mentioned[0].pushname || mentioned[0].number}* è stato sbannato!`);
            } else {
                await msg.reply('⚠️ Questo utente non è bannato!');
            }
        }

        else if (command === 'kick' || command === 'remove') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente!');
            const toKickNumber = mentioned[0].id._serialized.split('@')[0];
            try {
                const freshChat = await client.getChatById(chat.id._serialized);
                const participant = freshChat.participants.find(p => p.id._serialized.split('@')[0] === toKickNumber);
                if (!participant) return msg.reply('❌ Utente non trovato!');
                await chat.removeParticipants([participant.id._serialized]);
                await msg.reply(`✅ 👢 *${mentioned[0].pushname || mentioned[0].number}* rimosso dal gruppo!`);
            } catch (err) {
                await msg.reply('❌ Errore rimozione.');
            }
        }

        else if (command === 'muta' || command === 'mute') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona utente!');
            const toMuteNumber = mentioned[0].id._serialized.split('@')[0];
            const muteTime = parseInt(args[args.length - 1]);
            initGroup(chat.id._serialized);
            const alreadyMuted = groupData[chat.id._serialized].mutedUsers.some(id => id.split('@')[0] === toMuteNumber);
            if (!alreadyMuted) {
                groupData[chat.id._serialized].mutedUsers.push(mentioned[0].id._serialized);
                if (!isNaN(muteTime) && muteTime > 0) {
                    setTimeout(() => {
                        const idx = groupData[chat.id._serialized].mutedUsers.findIndex(id => id.split('@')[0] === toMuteNumber);
                        if (idx !== -1) {
                            groupData[chat.id._serialized].mutedUsers.splice(idx, 1);
                            saveData();
                            msg.reply(`🔊 *${mentioned[0].pushname || mentioned[0].number}* è stato automaticamente smutato!`);
                        }
                    }, muteTime * 60 * 1000);
                }
                saveData();
                await msg.reply(`🔇 *${mentioned[0].pushname || mentioned[0].number}* mutato!${!isNaN(muteTime) ? ` (${muteTime} minuti)` : ''}`);
            } else {
                await msg.reply('⚠️ Utente già mutato!');
            }
        }

        else if (command === 'smuta' || command === 'unmute') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona utente!');
            const toUnmuteNumber = mentioned[0].id._serialized.split('@')[0];
            initGroup(chat.id._serialized);
            const idx = groupData[chat.id._serialized].mutedUsers.findIndex(id => id.split('@')[0] === toUnmuteNumber);
            if (idx !== -1) {
                groupData[chat.id._serialized].mutedUsers.splice(idx, 1);
                saveData();
                await msg.reply(`🔊 *${mentioned[0].pushname || mentioned[0].number}* smutato!`);
            } else {
                await msg.reply('⚠️ Utente non mutato!');
            }
        }

        else if (command === 'warn') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona utente!');
            const userId = mentioned[0].id._serialized;
            const reason = args.slice(1).join(' ') || 'Nessun motivo specificato';
            initGroup(chat.id._serialized);
            const g = groupData[chat.id._serialized];
            g.warnings[userId] = (g.warnings[userId] || 0) + 1;
            saveData();
            const warnCount = g.warnings[userId];
            await msg.reply(`⚠️ *${mentioned[0].pushname || mentioned[0].number}* avvisato!\n\n📋 Warn: *${warnCount}/${g.maxWarns}*\n💬 Motivo: ${reason}`);
            if (warnCount >= g.maxWarns) {
                try {
                    await chat.removeParticipants([userId]);
                    await msg.reply(`🚫 *${mentioned[0].pushname || mentioned[0].number}* rimosso per troppi warn!`);
                    delete g.warnings[userId];
                    saveData();
                } catch {}
            }
        }

        else if (command === 'unwarn') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona utente!');
            const userId = mentioned[0].id._serialized;
            initGroup(chat.id._serialized);
            const g = groupData[chat.id._serialized];
            if (!g.warnings[userId] || g.warnings[userId] === 0) {
                return msg.reply(`⚠️ *${mentioned[0].pushname || mentioned[0].number}* non ha warn!`);
            }
            g.warnings[userId]--;
            saveData();
            await msg.reply(`✅ Warn rimosso da *${mentioned[0].pushname || mentioned[0].number}*!\n\n📋 Warn rimanenti: *${g.warnings[userId]}/${g.maxWarns}*`);
        }

        else if (command === 'warnings') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            const mentioned = await msg.getMentions();
            const targetId = mentioned.length > 0 ? mentioned[0].id._serialized : userId;
            const targetName = mentioned.length > 0 ? (mentioned[0].pushname || mentioned[0].number) : 'Tu';
            initGroup(chat.id._serialized);
            const g = groupData[chat.id._serialized];
            const warnCount = g.warnings[targetId] || 0;
            await msg.reply(`📋 *WARNINGS*\n\n👤 Utente: ${targetName}\n⚠️ Warn: *${warnCount}/${g.maxWarns}*`);
        }

        else if (command === 'modoadmin') {
            if (!isGroup) return;
            if (!await isAdmin(msg, chat)) return;
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].adminMode = !groupData[chat.id._serialized].adminMode;
            const stato = groupData[chat.id._serialized].adminMode ? 'attiva' : 'disattiva';
            await msg.reply(`✅ Modalità admin ${stato} nel gruppo!`);
        }    

        else if (command === 'clearwarns') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona utente!');
            const userId = mentioned[0].id._serialized;
            initGroup(chat.id._serialized);
            const g = groupData[chat.id._serialized];
            g.warnings[userId] = 0;
            saveData();
            await msg.reply(`✅ 🗑️ Tutti i warn di *${mentioned[0].pushname || mentioned[0].number}* sono stati cancellati!`);
        }

        else if (command === 'antilink') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const status = args[0] ? args[0].toLowerCase() : null;
            if (!['on', 'off'].includes(status)) {
                initGroup(chat.id._serialized);
                const currentStatus = groupData[chat.id._serialized].antilink ? '✅ ON' : '❌ OFF';
                return msg.reply(`⚙️ 🔗 *ANTILINK*\n\nStato: ${currentStatus}\n\nUsa: .antilink on/off`);
            }
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].antilink = (status === 'on');
            saveData();
            await msg.reply(`✅ 🔗 Antilink ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!`);
        }

        else if (command === 'antibot') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const status = args[0] ? args[0].toLowerCase() : null;
            if (!['on', 'off'].includes(status)) {
                initGroup(chat.id._serialized);
                const currentStatus = groupData[chat.id._serialized].antiBot ? '✅ ON' : '❌ OFF';
                return msg.reply(`⚙️ 🤖 *ANTIBOT*\n\nStato: ${currentStatus}\n\nUsa: .antibot on/off`);
            }
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].antiBot = (status === 'on');
            saveData();
            await msg.reply(`✅ 🤖 Antibot ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!`);
        }

        else if (command === 'antispam') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const status = args[0]?.toLowerCase();
            if (!['on', 'off'].includes(status)) return msg.reply('⚠️ Usa: .antispam on/off');
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].antiSpam = (status === 'on');
            saveData();
            await msg.reply(`✅ 💥 Anti-spam ${status === 'on' ? '*ATTIVATO*' : '*DISATTIVATO*'}!`);
        }

        else if (command === 'antiflood') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const status = args[0]?.toLowerCase();
            if (!['on', 'off'].includes(status)) return msg.reply('⚠️ Usa: .antiflood on/off [maxMsg] [secondi]');
            initGroup(chat.id._serialized);
            automodConfig[chat.id._serialized].antiFlood = (status === 'on');
            if (status === 'on') {
                const maxMsg = parseInt(args[1]) || 5;
                const timeWindow = parseInt(args[2]) || 10;
                automodConfig[chat.id._serialized].maxMessages = maxMsg;
                automodConfig[chat.id._serialized].timeWindow = timeWindow;
            }
            saveData();
            await msg.reply(`✅ 💥 Antiflood ${status === 'on' ? `*ATTIVATO*\n\n📊 Max messaggi: ${automodConfig[chat.id._serialized].maxMessages}\n⏱️ Finestra: ${automodConfig[chat.id._serialized].timeWindow}s` : '*DISATTIVATO*'}!`);
        }

        else if (command === 'slowmode') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const seconds = parseInt(args[0]);
            if (isNaN(seconds) || seconds < 0) {
                return msg.reply('⚠️ Usa: .slowmode [secondi] (0 per disattivare)');
            }
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].slowmode = seconds;
            saveData();
            await msg.reply(`✅ ⏱️ Slowmode ${seconds === 0 ? '*DISATTIVATO*' : `impostato a *${seconds}s*`}!`);
        }

        else if (command === 'blocca' || command === 'blockword') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const word = args.join(' ').toLowerCase();
            if (!word) return msg.reply('⚠️ Specifica una parola!');
            initGroup(chat.id._serialized);
            if (!groupData[chat.id._serialized].blockedWords.includes(word)) {
                groupData[chat.id._serialized].blockedWords.push(word);
                saveData();
                await msg.reply(`✅ 🚫 Parola *"${word}"* bloccata!`);
            } else {
                await msg.reply('⚠️ Parola già bloccata!');
            }
        }

        else if (command === 'sblocca' || command === 'unblockword') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const word = args.join(' ').toLowerCase();
            if (!word) return msg.reply('⚠️ Specifica una parola!');
            initGroup(chat.id._serialized);
            const idx = groupData[chat.id._serialized].blockedWords.indexOf(word);
            if (idx !== -1) {
                groupData[chat.id._serialized].blockedWords.splice(idx, 1);
                saveData();
                await msg.reply(`✅ Parola *"${word}"* sbloccata!`);
            } else {
                await msg.reply('⚠️ Parola non era bloccata!');
            }
        }

        else if (command === 'listaparole') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            initGroup(chat.id._serialized);
            const words = groupData[chat.id._serialized].blockedWords;
            if (words.length === 0) return msg.reply('📋 Nessuna parola bloccata!');
            await msg.reply(`📋 *PAROLE BLOCCATE* (${words.length})\n\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`);
        }

        else if (command === 'regole' || command === 'setrules') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const rules = args.join(' ');
            if (!rules) return msg.reply('⚠️ Usa: .regole [testo regole]');
            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].rules = rules;
            saveData();
            await msg.reply('✅ 📜 Regole impostate con successo!');
        }

        else if (command === 'vediregole' || command === 'rules') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            initGroup(chat.id._serialized);
            const rules = groupData[chat.id._serialized].rules;
            if (!rules) return msg.reply('⚠️ Nessuna regola impostata! Gli admin possono impostarle con .regole');
            await msg.reply(`📜 *REGOLE DEL GRUPPO*\n\n${rules}`);
        }

        else if (command === 'chiudi' || command === 'close') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            try {
                await chat.setMessagesAdminsOnly(true);
                await msg.reply('🔒 *GRUPPO CHIUSO*\n\nSolo gli admin possono scrivere.');
            } catch {
                await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
            }
        }

        else if (command === 'apri' || command === 'open') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            try {
                await chat.setMessagesAdminsOnly(false);
                await msg.reply('🔓 *GRUPPO APERTO*\n\nTutti possono scrivere.');
            } catch {
                await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
            }
        }

        else if (command === 'lock') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            try {
                await chat.setInfoAdminsOnly(true);
                await msg.reply('🔒 *IMPOSTAZIONI BLOCCATE*\n\nSolo admin possono modificare info gruppo.');
            } catch {
                await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
            }
        }

        else if (command === 'unlock') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            try {
                await chat.setInfoAdminsOnly(false);
                await msg.reply('🔓 *IMPOSTAZIONI SBLOCCATE*\n\nTutti possono modificare info gruppo.');
            } catch {
                await msg.reply('❌ Errore! Assicurati che il bot sia admin.');
            }
        }

        else if (command === 'r' || command === 'delete') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            try {
                const quoted = await msg.getQuotedMessage();
                if (!quoted) return msg.reply('⚠️ Rispondi al messaggio da eliminare!');
                await quoted.delete(true);
                await msg.reply('✅ 🗑️ Messaggio eliminato!');
            } catch (err) {
                await msg.reply('❌ Errore nell\'eliminazione del messaggio.');
            }
        }

        else if (command === 'p' || command === 'promuovi' || command === 'promote') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentionedUsers = await msg.getMentions();
            if (mentionedUsers.length === 0) return msg.reply('❌ Menziona almeno un utente!');
            try {
                for (const user of mentionedUsers) {
                    await chat.promoteParticipants([user.id._serialized]);
                }
                await msg.reply(`✅ 👑 *${mentionedUsers.length}* utente/i promosso/i ad admin!`);
            } catch (err) {
                await msg.reply('❌ Errore nella promozione. Assicurati che il bot sia admin.');
            }
        }

        else if (command === 'd' || command === 'degrada' || command === 'demote') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            const mentionedUsers = await msg.getMentions();
            if (mentionedUsers.length === 0) return msg.reply('❌ Menziona almeno un utente!');
            try {
                for (const user of mentionedUsers) {
                    await chat.demoteParticipants([user.id._serialized]);
                }
                await msg.reply(`✅ 👤 *${mentionedUsers.length}* utente/i degradato/i.`);
            } catch (err) {
                await msg.reply('❌ Errore nel degrado. Assicurati che il bot sia admin.');
            }
        }

        else if (command === 'admins') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            const admins = chat.participants.filter(p => p.isAdmin || p.isSuperAdmin);
            let text = `👑 *LISTA ADMIN* (${admins.length})\n\n`;
            for (let i = 0; i < admins.length; i++) {
                const admin = admins[i];
                text += `${i + 1}. ${admin.id.user}\n`;
            }
            await msg.reply(text);
        }

        else if (command === 'mutati') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            initGroup(chat.id._serialized);
            const muted = groupData[chat.id._serialized].mutedUsers;
            if (muted.length === 0) return msg.reply('📋 Nessun utente mutato!');
            let text = `🔇 *UTENTI MUTATI* (${muted.length})\n\n`;
            muted.forEach((id, i) => {
                text += `${i + 1}. ${id.split('@')[0]}\n`;
            });
            await msg.reply(text);
        }

        else if (command === 'bannati') {
            if (!isGroup) return msg.reply('⚠️ Solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo admin!');
            initGroup(chat.id._serialized);
            const banned = groupData[chat.id._serialized].bannedUsers;
            if (banned.length === 0) return msg.reply('📋 Nessun utente bannato!');
            let text = `🚫 *UTENTI BANNATI* (${banned.length})\n\n`;
            banned.forEach((id, i) => {
                text += `${i + 1}. ${id.split('@')[0]}\n`;
            });
            await msg.reply(text);
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

        else if (command === 'info-bot' || command === 'infobot') {
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

        // ===== GIOCHI =====
        
        if (command === 'rps') {
            const scelta = args[0]?.toLowerCase();
            const opzioni = ['sasso', 'carta', 'forbici'];
            if (!opzioni.includes(scelta)) return msg.reply('⚠️ Usa: .rps sasso/carta/forbici');
            const botScelta = opzioni[Math.floor(Math.random() * 3)];
            let risultato = '';
            if (scelta === botScelta) risultato = '🤝 Pareggio!';
            else if (
                (scelta === 'sasso' && botScelta === 'forbici') ||
                (scelta === 'carta' && botScelta === 'sasso') ||
                (scelta === 'forbici' && botScelta === 'carta')
            ) risultato = '🎉 Hai vinto!';
            else risultato = '😢 Hai perso!';
            await msg.reply(`🎮 *MORRA CINESE*\n\n👤 Tu: ${scelta}\n🤖 Bot: ${botScelta}\n\n${risultato}`);
        }

        else if (command === 'slot') {
            const simboli = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
            const r1 = simboli[Math.floor(Math.random() * simboli.length)];
            const r2 = simboli[Math.floor(Math.random() * simboli.length)];
            const r3 = simboli[Math.floor(Math.random() * simboli.length)];
            let result = `🎰 *SLOT MACHINE*\n\n[ ${r1} | ${r2} | ${r3} ]\n\n`;
            if (r1 === r2 && r2 === r3) result += '💰 JACKPOT! Tre uguali!';
            else if (r1 === r2 || r2 === r3 || r1 === r3) result += '✨ Due uguali! Piccola vincita!';
            else result += '😢 Nessuna vincita, riprova!';
            await msg.reply(result);
        }

        else if (command === 'indovina') {
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            if (!args[0]) {
                gameStates[chatId].indovina = {
                    numero: Math.floor(Math.random() * 100) + 1,
                    tentativi: 0
                };
                saveData();
                return msg.reply('🎲 *INDOVINA IL NUMERO*\n\nHo pensato a un numero tra 1 e 100!\nUsa .indovina [numero] per provare!');
            }
            if (!gameStates[chatId].indovina) return msg.reply('⚠️ Nessuna partita attiva! Usa .indovina per iniziare.');
            const num = parseInt(args[0]);
            if (isNaN(num)) return msg.reply('⚠️ Inserisci un numero valido!');
            const game = gameStates[chatId].indovina;
            game.tentativi++;
            if (num === game.numero) {
                await msg.reply(`🎉 *CORRETTO!*\n\nIl numero era ${game.numero}!\nTentativi: ${game.tentativi}`);
                delete gameStates[chatId].indovina;
                saveData();
            } else if (num < game.numero) {
                await msg.reply(`📈 Troppo basso! Tentativo ${game.tentativi}`);
            } else {
                await msg.reply(`📉 Troppo alto! Tentativo ${game.tentativi}`);
            }
            saveData();
        }

        else if (command === '8ball') {
            if (!args.length) return msg.reply('⚠️ Fai una domanda! Es: .8ball andrà tutto bene?');
            const risposte = [
                '✅ Sì, assolutamente', '❌ No', '🤔 Forse', '🔮 Molto probabile',
                '⚠️ Non ci contare', '✨ Certamente', '🌟 Le stelle dicono di sì',
                '💫 Rifai la domanda più tardi', '🎱 Meglio di no', '🎯 Senza dubbio',
                '🌀 Non posso prevederlo ora', '💭 Concentrati e richiedi'
            ];
            await msg.reply(`🎱 *PALLA MAGICA*\n\n${risposte[Math.floor(Math.random() * risposte.length)]}`);
        }

        else if (command === 'scelta') {
            const opzioni = msg.body.slice(8).split('|').map(o => o.trim());
            if (opzioni.length < 2) return msg.reply('⚠️ Usa: .scelta opzione1|opzione2|opzione3');
            const scelta = opzioni[Math.floor(Math.random() * opzioni.length)];
            await msg.reply(`🎲 *SCELTA CASUALE*\n\nHo scelto: *${scelta}*`);
        }

        else if (command === 'dado') {
            const risultato = Math.floor(Math.random() * 6) + 1;
            const dadi = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            await msg.reply(`🎲 *DADO*\n\n${dadi[risultato-1]} Hai fatto: *${risultato}*`);
        }

        else if (command === 'moneta') {
            const risultato = Math.random() < 0.5 ? 'Testa' : 'Croce';
            const emoji = risultato === 'Testa' ? '👑' : '🪙';
            await msg.reply(`${emoji} *MONETA*\n\nRisultato: *${risultato}*`);
        }

        else if (command === 'blackjack') {
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            const deck = [];
            const valori = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
            const semi = ['♠️','♥️','♣️','♦️'];
            valori.forEach(v => semi.forEach(s => deck.push(v+s)));
            const pesca = () => deck.splice(Math.floor(Math.random() * deck.length), 1)[0];
            const calcola = (carte) => {
                let tot = 0, assi = 0;
                carte.forEach(c => {
                    const v = c.slice(0, -2);
                    if (v === 'A') { tot += 11; assi++; }
                    else if (['J','Q','K'].includes(v)) tot += 10;
                    else tot += parseInt(v);
                });
                while (tot > 21 && assi > 0) { tot -= 10; assi--; }
                return tot;
            };
            const player = [pesca(), pesca()];
            const dealer = [pesca()];
            gameStates[chatId].blackjack = { player, dealer, deck, calcola };
            saveData();
            await msg.reply(
                `🃏 *BLACKJACK*\n\n` +
                `🎴 Le tue carte: ${player.join(' ')} = *${calcola(player)}*\n` +
                `🎴 Carta dealer: ${dealer[0]}\n\n` +
                `Scrivi *hit* per un'altra carta o *stand* per fermarti`
            );
        }

        else if (text === 'hit' || text === 'stand') {
            const chatId = msg.from;
            if (!gameStates[chatId]?.blackjack) return msg.reply('⚠️ Nessuna partita attiva! Usa .blackjack per iniziare.');
            const game = gameStates[chatId].blackjack;
            if (text === 'hit') {
                const deck = [];
                const valori = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
                const semi = ['♠️','♥️','♣️','♦️'];
                valori.forEach(v => semi.forEach(s => deck.push(v+s)));
                const pesca = () => deck.splice(Math.floor(Math.random() * deck.length), 1)[0];
                game.player.push(pesca());
                const tot = game.calcola(game.player);
                if (tot > 21) {
                    await msg.reply(`🃏 Le tue carte: ${game.player.join(' ')} = *${tot}*\n\n💥 *SBALLATO!* Hai perso!`);
                    delete gameStates[chatId].blackjack;
                } else {
                    await msg.reply(`🃏 Le tue carte: ${game.player.join(' ')} = *${tot}*\n\nScrivi *hit* o *stand*`);
                }
            } else {
                while (game.calcola(game.dealer) < 17) {
                    const deck = [];
                    const valori = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
                    const semi = ['♠️','♥️','♣️','♦️'];
                    valori.forEach(v => semi.forEach(s => deck.push(v+s)));
                    const pesca = () => deck.splice(Math.floor(Math.random() * deck.length), 1)[0];
                    game.dealer.push(pesca());
                }
                const pTot = game.calcola(game.player);
                const dTot = game.calcola(game.dealer);
                let result = `🃏 *RISULTATO*\n\n👤 Tu: ${game.player.join(' ')} = *${pTot}*\n🤖 Dealer: ${game.dealer.join(' ')} = *${dTot}*\n\n`;
                if (dTot > 21 || pTot > dTot) result += '🎉 HAI VINTO!';
                else if (pTot === dTot) result += '🤝 PAREGGIO!';
                else result += '😢 HAI PERSO!';
                await msg.reply(result);
                delete gameStates[chatId].blackjack;
            }
            saveData();
        }

        else if (command === 'roulette') {
            if (!args[0]) return msg.reply('⚠️ Usa: .roulette rosso/nero/verde oppure .roulette [numero 0-36]');
            const numero = Math.floor(Math.random() * 37);
            let colore = 'verde';
            if (numero !== 0) {
                const rossi = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
                colore = rossi.includes(numero) ? 'rosso' : 'nero';
            }
            const scommessa = args[0].toLowerCase();
            let vincita = false;
            if (['rosso', 'nero', 'verde'].includes(scommessa)) {
                vincita = scommessa === colore;
            } else if (!isNaN(scommessa)) {
                vincita = parseInt(scommessa) === numero;
            }
            await msg.reply(
                `🎡 *ROULETTE*\n\n` +
                `Numero: *${numero}*\n` +
                `Colore: *${colore}*\n\n` +
                `${vincita ? '🎉 HAI VINTO!' : '😢 HAI PERSO!'}`
            );
        }

        else if (command === 'quiz') {
            const quiz = [
                { q: 'Qual è la capitale dell\'Italia?', a: ['Roma', 'Milano', 'Napoli'], c: 0 },
                { q: 'Quanti continenti ci sono?', a: ['5', '6', '7'], c: 2 },
                { q: 'Chi ha dipinto la Gioconda?', a: ['Michelangelo', 'Leonardo da Vinci', 'Raffaello'], c: 1 },
                { q: 'Quale pianeta è più vicino al Sole?', a: ['Venere', 'Marte', 'Mercurio'], c: 2 },
                { q: 'In che anno è finita la seconda guerra mondiale?', a: ['1943', '1945', '1947'], c: 1 }
            ];
            const q = quiz[Math.floor(Math.random() * quiz.length)];
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            gameStates[chatId].quiz = q;
            saveData();
            await msg.reply(
                `❓ *QUIZ*\n\n${q.q}\n\n` +
                q.a.map((opt, i) => `${i+1}. ${opt}`).join('\n') +
                `\n\nRispondi con il numero (1, 2 o 3)`
            );
        }

        else if (command === 'trivia') {
            const trivia = [
                'Il miele non scade mai! 🍯',
                'Le banane sono bacche, mentre le fragole no! 🍌',
                'Un polpo ha tre cuori! 🐙',
                'Le impronte digitali dei koala sono quasi identiche a quelle umane! 🐨',
                'Un fulmine è 5 volte più caldo della superficie del sole! ⚡'
            ];
            await msg.reply(`💡 *TRIVIA*\n\n${trivia[Math.floor(Math.random() * trivia.length)]}`);
        }

        else if (command === 'math') {
            const n1 = Math.floor(Math.random() * 20) + 1;
            const n2 = Math.floor(Math.random() * 20) + 1;
            const ops = ['+', '-', '*'];
            const op = ops[Math.floor(Math.random() * ops.length)];
            let result;
            if (op === '+') result = n1 + n2;
            else if (op === '-') result = n1 - n2;
            else result = n1 * n2;
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            gameStates[chatId].math = { domanda: `${n1} ${op} ${n2}`, risposta: result };
            saveData();
            await msg.reply(`🧮 *MATEMATICA VELOCE*\n\nQuanto fa?\n\n*${n1} ${op} ${n2} = ?*\n\nRispondi con il numero!`);
        }

        else if (command === 'memory') {
            const simboli = ['🍎', '🍌', '🍒', '🍇', '🍊', '🍋'];
            const sequenza = Array(5).fill(0).map(() => simboli[Math.floor(Math.random() * simboli.length)]);
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            gameStates[chatId].memory = { sequenza: sequenza.join(''), attesa: true };
            saveData();
            await msg.reply(`🧠 *GIOCO MEMORIA*\n\nMemorizza questa sequenza:\n\n${sequenza.join(' ')}\n\nRiscrivila tra 5 secondi!`);
            setTimeout(() => {
                if (gameStates[chatId]?.memory?.attesa) {
                    gameStates[chatId].memory.attesa = false;
                    saveData();
                }
            }, 5000);
        }

        else if (command === 'tictactoe') {
            if (!isGroup) return msg.reply('⚠️ Questo gioco funziona solo nei gruppi!');
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente per sfidarlo!');
            const chatId = chat.id._serialized;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            gameStates[chatId].tictactoe = {
                board: Array(9).fill('⬜'),
                player1: msg.author || msg.from,
                player2: mentioned[0].id._serialized,
                turn: msg.author || msg.from
            };
            saveData();
            await msg.reply(
                `⭕❌ *TRIS*\n\n` +
                `Giocatore 1: @${(msg.author || msg.from).split('@')[0]} (⭕)\n` +
                `Giocatore 2: @${mentioned[0].id._serialized.split('@')[0]} (❌)\n\n` +
                `${gameStates[chatId].tictactoe.board.slice(0,3).join('')}\n` +
                `${gameStates[chatId].tictactoe.board.slice(3,6).join('')}\n` +
                `${gameStates[chatId].tictactoe.board.slice(6,9).join('')}\n\n` +
                `Usa .t [1-9] per giocare!`,
                undefined,
                { mentions: [msg.author || msg.from, mentioned[0].id._serialized] }
            );
        }

        else if (command === 'impiccato') {
            const parole = ['PROGRAMMAZIONE', 'JAVASCRIPT', 'WHATSAPP', 'COMPUTER', 'TELEFONO', 'INTERNET'];
            const parola = parole[Math.floor(Math.random() * parole.length)];
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            gameStates[chatId].impiccato = {
                parola,
                scoperte: Array(parola.length).fill('_'),
                errori: 0,
                lettereUsate: []
            };
            saveData();
            await msg.reply(
                `🎯 *IMPICCATO*\n\n` +
                `Parola: ${gameStates[chatId].impiccato.scoperte.join(' ')}\n` +
                `Errori: ${gameStates[chatId].impiccato.errori}/6\n\n` +
                `Indovina una lettera! Usa .l [lettera]`
            );
        }

        else if (command === 'l' && args[0]) {
            const chatId = msg.from;
            if (!gameStates[chatId]?.impiccato) return msg.reply('⚠️ Nessuna partita attiva! Usa .impiccato');
            const game = gameStates[chatId].impiccato;
            const lettera = args[0].toUpperCase();
            if (game.lettereUsate.includes(lettera)) return msg.reply('⚠️ Lettera già usata!');
            game.lettereUsate.push(lettera);
            if (game.parola.includes(lettera)) {
                for (let i = 0; i < game.parola.length; i++) {
                    if (game.parola[i] === lettera) game.scoperte[i] = lettera;
                }
                if (!game.scoperte.includes('_')) {
                    await msg.reply(`🎉 *HAI VINTO!*\n\nLa parola era: *${game.parola}*`);
                    delete gameStates[chatId].impiccato;
                } else {
                    await msg.reply(
                        `✅ Lettera corretta!\n\n` +
                        `Parola: ${game.scoperte.join(' ')}\n` +
                        `Errori: ${game.errori}/6`
                    );
                }
            } else {
                game.errori++;
                if (game.errori >= 6) {
                    await msg.reply(`💀 *HAI PERSO!*\n\nLa parola era: *${game.parola}*`);
                    delete gameStates[chatId].impiccato;
                } else {
                    await msg.reply(
                        `❌ Lettera sbagliata!\n\n` +
                        `Parola: ${game.scoperte.join(' ')}\n` +
                        `Errori: ${game.errori}/6`
                    );
                }
            }
            saveData();
        }

        else if (command === 'indovinachi') {
            const personaggi = ['Cristiano Ronaldo', 'Einstein', 'Leonardo da Vinci', 'Steve Jobs', 'Michael Jackson'];
            const personaggio = personaggi[Math.floor(Math.random() * personaggi.length)];
            const chatId = msg.from;
            if (!gameStates[chatId]) gameStates[chatId] = {};
            gameStates[chatId].indovinachi = { personaggio, tentativi: 0 };
            saveData();
            await msg.reply(
                `🎭 *INDOVINA CHI*\n\n` +
                `Ho pensato a un personaggio famoso!\n` +
                `Hai 5 tentativi per indovinare.\n\n` +
                `Usa .chi [nome] per rispondere`
            );
        }

        else if (command === 'chi' && args.length) {
            const chatId = msg.from;
            if (!gameStates[chatId]?.indovinachi) return msg.reply('⚠️ Nessuna partita attiva! Usa .indovinachi');
            const game = gameStates[chatId].indovinachi;
            game.tentativi++;
            const risposta = msg.body.slice(5).trim().toLowerCase();
            if (risposta === game.personaggio.toLowerCase()) {
                await msg.reply(`🎉 *ESATTO!*\n\nIl personaggio era: *${game.personaggio}*\nTentativi: ${game.tentativi}`);
                delete gameStates[chatId].indovinachi;
            } else if (game.tentativi >= 5) {
                await msg.reply(`😢 *HAI PERSO!*\n\nIl personaggio era: *${game.personaggio}*`);
                delete gameStates[chatId].indovinachi;
            } else {
                await msg.reply(`❌ Sbagliato! Tentativi rimasti: ${5 - game.tentativi}`);
            }
            saveData();
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

        else if (command === 'amore') {
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona qualcuno per calcolare l\'amore!');
            const percentuale = Math.floor(Math.random() * 101);
            let messaggio = '';
            if (percentuale < 30) messaggio = '💔 Non è proprio amore...';
            else if (percentuale < 60) messaggio = '💛 C\'è del potenziale!';
            else if (percentuale < 80) messaggio = '💕 Bella coppia!';
            else messaggio = '💖 Amore perfetto!';
            await msg.reply(
                `💘 *CALCOLATORE AMORE*\n\n` +
                `@${(msg.author || msg.from).split('@')[0]} ❤️ @${mentioned[0].id._serialized.split('@')[0]}\n\n` +
                `Compatibilità: *${percentuale}%*\n${messaggio}`,
                undefined,
                { mentions: [msg.author || msg.from, mentioned[0].id._serialized] }
            );
        }

        else if (command === 'ship') {
            const mentioned = await msg.getMentions();
            if (mentioned.length < 2) return msg.reply('⚠️ Menziona due utenti da shippare!');
            const percentuale = Math.floor(Math.random() * 101);
            const nome1 = mentioned[0].pushname || mentioned[0].id._serialized.split('@')[0];
            const nome2 = mentioned[1].pushname || mentioned[1].id._serialized.split('@')[0];
            const shipName = nome1.slice(0, Math.ceil(nome1.length/2)) + nome2.slice(Math.floor(nome2.length/2));
            let messaggio = '';
            if (percentuale < 30) messaggio = '💔 Meglio restare amici...';
            else if (percentuale < 60) messaggio = '💛 Potrebbero funzionare!';
            else if (percentuale < 80) messaggio = '💕 Che bella coppia!';
            else messaggio = '💖 Match perfetto!';
            await msg.reply(
                `💝 *SHIP*\n\n` +
                `@${mentioned[0].id._serialized.split('@')[0]} 💕 @${mentioned[1].id._serialized.split('@')[0]}\n\n` +
                `Nome coppia: *${shipName}*\n` +
                `Compatibilità: *${percentuale}%*\n${messaggio}`,
                undefined,
                { mentions: [mentioned[0].id._serialized, mentioned[1].id._serialized] }
            );
        }

        else if (command === 'creacoppia') {
            const mentioned = await msg.getMentions();
            if (mentioned.length < 2) return msg.reply('⚠️ Menziona due utenti da mettere insieme!');
            const frasi = [
                'sono ufficialmente una coppia! 💑',
                'si sono sposati! 💒',
                'sono innamorati! 😍',
                'sono fidanzati! 💕',
                'sono destinati a stare insieme! ✨'
            ];
            await msg.reply(
                `💘 *CUPIDO HA COLPITO*\n\n` +
                `@${mentioned[0].id._serialized.split('@')[0]} e @${mentioned[1].id._serialized.split('@')[0]} ${frasi[Math.floor(Math.random() * frasi.length)]}`,
                undefined,
                { mentions: [mentioned[0].id._serialized, mentioned[1].id._serialized] }
            );
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
            if (isNaN(num) || num < 1 || num > 100) return msg.reply('⚠️ Specifica un numero tra 1 e 100!');
            await msg.reply(`🗑️ Eliminazione di ${num} messaggi in corso...\n\n_Nota: WhatsApp Web ha limitazioni sulla cancellazione massiva_`);
        }

        else if (command === 'pin') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
            try {
                await chat.pinMessage(msg.id.id);
                await msg.reply('📌 Messaggio fissato con successo!');
            } catch (err) {
                await msg.reply('❌ Errore nel fissare il messaggio. Assicurati che il bot sia admin!');
            }
        }

        else if (command === 'unpin') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');
            try {
                await chat.unpinMessage(msg.id.id);
                await msg.reply('📌 Messaggio rimosso dai fissati!');
            } catch (err) {
                await msg.reply('❌ Errore nel rimuovere il messaggio fissato.');
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
            // lasciare silenzioso o suggerire .menu
            // per non sovraccaricare il gruppo rispondi solo se in privato
            if (!isGroup) await msg.reply('❓ Comando non riconosciuto. Usa .menu per la lista dei comandi.');
        }

    } catch (err) {
        console.error('Errore handler message:', err);
        try { await msg.reply('❌ Si è verificato un errore interno nel bot.'); } catch {}
    }
});

// salva dati al termine del processo
process.on('exit', () => saveData());
process.on('SIGINT', () => { saveData(); process.exit(); });
process.on('SIGTERM', () => { saveData(); process.exit(); });

// avvia il client
client.initialize();


