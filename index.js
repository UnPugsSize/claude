const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ---------------------- CONFIGURAZIONE RAILWAY ----------------------
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || './data';
const SESSION_DIR = path.join(DATA_DIR, '.wwebjs_auth');

// Crea directory se non esistono
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// ---------------------- DATABASE ----------------------
let groupData = {};
let games = {};
let economy = {};
const startTime = Date.now();

function loadData() {
    try {
        const groupDataPath = path.join(DATA_DIR, 'groupData.json');
        const gamesPath = path.join(DATA_DIR, 'games.json');
        const economyPath = path.join(DATA_DIR, 'economy.json');

        if (fs.existsSync(groupDataPath)) groupData = JSON.parse(fs.readFileSync(groupDataPath, 'utf8'));
        if (fs.existsSync(gamesPath)) games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
        if (fs.existsSync(economyPath)) economy = JSON.parse(fs.readFileSync(economyPath, 'utf8'));
        
        console.log('✅ Dati caricati con successo');
    } catch (err) {
        console.log('⚠️ Errore caricamento dati:', err.message);
    }
}

function saveData() {
    try {
        fs.writeFileSync(path.join(DATA_DIR, 'groupData.json'), JSON.stringify(groupData, null, 2));
        fs.writeFileSync(path.join(DATA_DIR, 'games.json'), JSON.stringify(games, null, 2));
        fs.writeFileSync(path.join(DATA_DIR, 'economy.json'), JSON.stringify(economy, null, 2));
    } catch (err) {
        console.log('❌ Errore salvataggio dati:', err.message);
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
            welcomeMessage: 'Benvenuto {user} nel gruppo {group}!',
            goodbyeMessage: 'Ciao {user}, ci mancherai!'
        };
        saveData();
    }
}

function initUser(userId) {
    if (!economy[userId]) {
        economy[userId] = {
            money: 100,
            bank: 0,
            inventory: [],
            lastDaily: 0,
            lastWork: 0
        };
    }
}

// ---------------------- CLIENT ----------------------
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        executablePath: process.env.CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    }
});

client.on('qr', (qr) => {
    console.log('📱 Scansiona questo QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('✅ Autenticazione completata!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Autenticazione fallita:', msg);
});

client.on('ready', () => {
    console.log('🤖 Bot WhatsApp pronto!');
    console.log(`📂 Dati salvati in: ${DATA_DIR}`);
    loadData();
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Client disconnesso:', reason);
    saveData();
});

// ---------------------- UTILITY ----------------------
const nowSeconds = () => Math.floor(Date.now() / 1000);
const getUserIdFromMsg = (msg) => msg.author || msg.from;

// Ottieni numero normalizzato
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

// Controllo admin
async function isAdmin(msg, chat) {
    if (!chat.isGroup) return true;
    const userId = msg.author || msg.from;
    try {
        const freshChat = await client.getChatById(chat.id._serialized);
        const participant = freshChat.participants.find(p => p.id._serialized.split('@')[0] === userId.split('@')[0]);
        return participant && (participant.isAdmin || participant.isSuperAdmin);
    } catch {
        return false;
    }
}

// ---------------------- MESSAGGI ----------------------
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const isGroup = chat.isGroup;
        if (isGroup) initGroup(chat.id._serialized);
        const groupInfo = isGroup ? groupData[chat.id._serialized] : null;

        const userNumber = await getNormalizedNumber(msg);

        // ---------------------- MODERAZIONE ----------------------
        if (isGroup && groupInfo) {
            // Utente mutato
            if (groupInfo.mutedUsers.includes(userNumber)) {
                try { await msg.delete(true); } catch {}
                return;
            }

            // Utente bannato
            if (groupInfo.bannedUsers.includes(userNumber)) {
                try { await chat.removeParticipants([msg.author]); } catch {}
                return;
            }

            // Antilink
            if (groupInfo.antilink && /https?:\/\/|www\./i.test(msg.body || '')) {
                if (!(await isAdmin(msg, chat))) {
                    try { await msg.delete(true); } catch {}
                    await msg.reply('⚠️ I link non sono permessi!');
                    return;
                }
            }

            

            // Slowmode
            if (groupInfo.slowmode > 0) {
                const lastMsg = groupInfo.lastMessage[userNumber] || 0;
                if (Date.now() - lastMsg < groupInfo.slowmode * 1000) {
                    try { await msg.delete(true); } catch {}
                    return;
                }
                groupInfo.lastMessage[userNumber] = Date.now();
            }

            // Parole bloccate
            if ((msg.body || '').length > 0 && groupInfo.blockedWords.some(w => msg.body.toLowerCase().includes(w.toLowerCase()))) {
                try { await msg.delete(true); } catch {}
                await msg.reply('⚠️ Parola vietata!');
                return;
            }
        }

        // ---------------------- COMANDI ----------------------
        if (!msg.body || !msg.body.startsWith('.')) return;

        const args = msg.body.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // ---------- .menu ----------
        if (command === 'menu' || command === 'help') {
            const menu = `
🤖 *MENU BOT WHATSAPP*

👥 *MODERAZIONE*
- .tag - Tagga tutti i membri
- .ban @utente - Banna un utente
- .kick @utente - Rimuovi utente
- .muta @utente - Muta un utente
- .smuta @utente - Smuta un utente
- .warn @utente - Avvisa utente (3 warn = ban)
- .unwarn @utente - Toglie un avviso ad un utente
- .antilink on/off - Blocca link
- .modoadmin on/off - (fix)
- .chiudi - Chiude il gruppo
- .apri - Apre il gruppo
- .r - Rimuove un messaggio
- .p - Promuovi qualcuno Admin
- .d - Rimuove una persona da Admin


🎮 *GIOCHI*
• .rps [sasso/carta/forbici] - Morra cinese
• .slot - Slot machine
• .indovina [numero] - Indovina il numero
• .8ball [domanda] - Palla magica
• .scelta op1|op2|op3 - Scegli random


⚙️ *UTILITÀ*
• .ping - Controlla latenza
• .uptime - Tempo attività bot
• .info-bot - Info sul bot
• .sticker / .s - Converti immagine in sticker
            `;
            await msg.reply(menu);
        }

        // COMANDO: .tag
        else if (command === 'tag' || command === 'tagall') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const messageText = args.join(' ').trim() || '📢 Attenzione!';
            const mentions = [];

            // Raccogli tutti i contatti per le menzioni
            for (let participant of chat.participants) {
                try {
                    const contact = await client.getContactById(participant.id._serialized);
                    mentions.push(contact);
                } catch (e) {
                    // Se non riesce a ottenere il contatto, salta
                    console.log('Impossibile ottenere contatto:', participant.id._serialized);
                }
            }

            // Invia SOLO il messaggio personalizzato, ma con le menzioni "invisibili"
            // WhatsApp notificherà tutti anche senza gli @ visibili
            try {
                await chat.sendMessage(messageText, { mentions });
            } catch (err) {
                console.error('Errore comando .tag:', err);
                await msg.reply('❌ Errore durante il tag di tutti i membri.');
            }
        }

        // COMANDO: .ban
        else if (command === 'ban') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da bannare!');

            const toBanId = mentioned[0].id._serialized;
            const toBanNumber = toBanId.split('@')[0];

            initGroup(chat.id._serialized);
            
            // Controlla se già bannato (confronta numeri)
            const alreadyBanned = groupData[chat.id._serialized].bannedUsers.some(id => {
                return id.split('@')[0] === toBanNumber;
            });

            if (!alreadyBanned) {
                groupData[chat.id._serialized].bannedUsers.push(toBanId);
                saveData();
            }

            try {
                // Cerca il partecipante con il numero corretto
                const freshChat = await client.getChatById(chat.id._serialized);
                const participant = freshChat.participants.find(p => {
                    const pNumber = p.id._serialized.split('@')[0];
                    return pNumber === toBanNumber;
                });

                if (!participant) {
                    return msg.reply('❌ Utente non trovato nel gruppo!');
                }

                await chat.removeParticipants([participant.id._serialized]);
                await msg.reply(`✅ ${mentioned[0].pushname || mentioned[0].number} è stato bannato!\n🚫 Non potrà più rientrare.`);
                console.log('✅ Utente bannato:', toBanNumber);
            } catch (err) {
                console.error('Errore ban:', err);
                await msg.reply('❌ Errore nel bannare l\'utente. Assicurati che il bot sia admin del gruppo!');
            }
        }

        // COMANDO: .kick
        else if (command === 'kick' || command === 'remove') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da rimuovere!');

            const toKickId = mentioned[0].id._serialized;
            const toKickNumber = toKickId.split('@')[0];

            try {
                // Cerca il partecipante con il numero corretto
                const freshChat = await client.getChatById(chat.id._serialized);
                const participant = freshChat.participants.find(p => {
                    const pNumber = p.id._serialized.split('@')[0];
                    return pNumber === toKickNumber;
                });

                if (!participant) {
                    return msg.reply('❌ Utente non trovato nel gruppo!');
                }

                await chat.removeParticipants([participant.id._serialized]);
                await msg.reply(`✅ ${mentioned[0].pushname || mentioned[0].number} è stato rimosso dal gruppo!`);
                console.log('✅ Utente kickato:', toKickNumber);
            } catch (err) {
                console.error('Errore kick:', err);
                await msg.reply('❌ Errore nel rimuovere l\'utente. Assicurati che il bot sia admin del gruppo!');
            }
        }

        // COMANDO: .muta
        else if (command === 'muta' || command === 'mute') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da mutare!');

            // Salva solo il numero, non l'ID completo
            const toMuteId = mentioned[0].id._serialized;
            const toMuteNumber = toMuteId.split('@')[0];
            
            initGroup(chat.id._serialized);
            
            // Controlla se già mutato (confronta numeri)
            const alreadyMuted = groupData[chat.id._serialized].mutedUsers.some(id => {
                return id.split('@')[0] === toMuteNumber;
            });
            
            if (!alreadyMuted) {
                groupData[chat.id._serialized].mutedUsers.push(toMuteId);
                saveData();
                await msg.reply(`🔇 ${mentioned[0].pushname || mentioned[0].number} è stato mutato!`);
                console.log('✅ Utente mutato:', toMuteNumber);
            } else {
                await msg.reply('⚠️ Utente già mutato!');
            }
        }

        // COMANDO: .smuta
        else if (command === 'smuta' || command === 'unmute') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da smutare!');

            const toUnmuteId = mentioned[0].id._serialized;
            const toUnmuteNumber = toUnmuteId.split('@')[0];
            
            initGroup(chat.id._serialized);
            
            // Trova l'indice confrontando i numeri
            const idx = groupData[chat.id._serialized].mutedUsers.findIndex(id => {
                return id.split('@')[0] === toUnmuteNumber;
            });
            
            if (idx !== -1) {
                groupData[chat.id._serialized].mutedUsers.splice(idx, 1);
                saveData();
                await msg.reply(`🔊 ${mentioned[0].pushname || mentioned[0].number} è stato smutato!`);
                console.log('✅ Utente smutato:', toUnmuteNumber);
            } else {
                await msg.reply('⚠️ Utente non mutato!');
            }
        }

        // COMANDO: .warn
        else if (command === 'warn') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente!');

            const userId = mentioned[0].id._serialized;
            initGroup(chat.id._serialized);
            const g = groupData[chat.id._serialized];
            g.warnings[userId] = (g.warnings[userId] || 0) + 1;
            saveData();

            const warnCount = g.warnings[userId];
            await msg.reply(`⚠️ ${mentioned[0].pushname || mentioned[0].number} ha ricevuto un warn! (${warnCount}/${g.autoKickWarns})`);

            if (warnCount >= g.autoKickWarns) {
                try {
                    await chat.removeParticipants([userId]);
                    await msg.reply(`🚫 Utente rimosso per troppi warn!`);
                    delete g.warnings[userId];
                    saveData();
                } catch {}
            }
        }

        // COMANDO: .unwarn
else if (command === 'unwarn') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    const mentioned = await msg.getMentions();
    if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente!');

    const userId = mentioned[0].id._serialized;
    initGroup(chat.id._serialized);
    const g = groupData[chat.id._serialized];

    if (!g.warnings[userId] || g.warnings[userId] === 0) {
        return msg.reply(`⚠️ ${mentioned[0].pushname || mentioned[0].number} non ha warn!`);
    }

    g.warnings[userId]--; // rimuove un warn
    saveData();
    await msg.reply(`✅ Un warn rimosso a ${mentioned[0].pushname || mentioned[0].number} (${g.warnings[userId]}/${g.autoKickWarns})`);
}


        // COMANDO: .antilink
        else if (command === 'antilink') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const status = args[0] ? args[0].toLowerCase() : null;
            if (!['on', 'off'].includes(status)) {
                initGroup(chat.id._serialized);
                const currentStatus = groupData[chat.id._serialized].antilink ? 'ON' : 'OFF';
                return msg.reply(`⚙️ Antilink attualmente: ${currentStatus}\n\nUsa: .antilink on/off`);
            }

            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].antilink = (status === 'on');
            saveData();
            await msg.reply(`✅ Antilink ${status === 'on' ? 'attivato ✅' : 'disattivato ❌'}!`);
        }

        // Comando per attivare/disattivare la modalità admin
if (msg.body === '.modoadmin') {
    if (!(await isAdmin(msg, chat))) {
        await msg.reply('⛔ Solo gli admin possono usare questo comando.');
        return;
    }

    groupInfo.adminMode = !groupInfo.adminMode;
    await saveGroupData(groupId, groupInfo);
    
    if (groupInfo.adminMode) {
        await msg.reply('🔒 *Modalità Admin attivata*\nSolo gli admin possono usare i comandi del bot.');
    } else {
        await msg.reply('🔓 *Modalità Admin disattivata*\nTutti possono usare i comandi del bot.');
    }
    return;
}

// Controllo modalità admin per tutti gli altri comandi
if (groupInfo.adminMode && msg.body && msg.body.startsWith('.')) {
    if (!(await isAdmin(msg, chat))) {
        await msg.reply('⛔ Solo gli admin possono usare i comandi in questo gruppo.');
        return;
    }
}




        // COMANDO: .rps
        else if (command === 'rps' || command === 'morra') {
            const choice = args[0] ? args[0].toLowerCase() : null;
            if (!choice || !['sasso', 'carta', 'forbici'].includes(choice)) {
                return msg.reply('⚠️ Usa: .rps [sasso|carta|forbici]');
            }
            const options = ['sasso', 'carta', 'forbici'];
            const botChoice = options[Math.floor(Math.random() * options.length)];

            const win = (a, b) =>
                (a === 'sasso' && b === 'forbici') ||
                (a === 'forbici' && b === 'carta') ||
                (a === 'carta' && b === 'sasso');

            let resultText = `Tu: ${choice}\nBot: ${botChoice}\n\n`;
            if (choice === botChoice) resultText += "🤝 Pareggio!";
            else if (win(choice, botChoice)) resultText += "🎉 Hai vinto!";
            else resultText += "😢 Hai perso!";
            await msg.reply(resultText);
        }

        // COMANDO: .slot
        else if (command === 'slot') {
            const symbols = ['🍒','🍋','🔔','⭐','7️⃣'];
            const a = symbols[Math.floor(Math.random() * symbols.length)];
            const b = symbols[Math.floor(Math.random() * symbols.length)];
            const c = symbols[Math.floor(Math.random() * symbols.length)];
            let replyText = `🎰 | ${a} ${b} ${c} | 🎰\n`;
            if (a === b && b === c) {
                replyText += '🎉 JACKPOT! Hai vinto 500 coins!';
                initUser(getUserIdFromMsg(msg));
                economy[getUserIdFromMsg(msg)].money += 500;
                saveData();
            } else if (a === b || b === c || a === c) {
                replyText += '✨ Piccola vincita: hai guadagnato 50 coins!';
                initUser(getUserIdFromMsg(msg));
                economy[getUserIdFromMsg(msg)].money += 50;
                saveData();
            } else {
                replyText += '😢 Niente vincite, riprova!';
            }
            await msg.reply(replyText);
        }

        // COMANDO: .indovina
        else if (command === 'indovina' || command === 'guess') {
            const targetKey = chat.id._serialized;
            if (!games[targetKey]) games[targetKey] = { secret: Math.floor(Math.random() * 100) + 1, attempts: {} };

            const guess = parseInt(args[0]);
            if (isNaN(guess)) {
                return msg.reply('⚠️ Usa: .indovina [numero tra 1 e 100]');
            }
            const secret = games[targetKey].secret;
            const uid = getUserIdFromMsg(msg);
            games[targetKey].attempts[uid] = (games[targetKey].attempts[uid] || 0) + 1;
            if (guess === secret) {
                const attempts = games[targetKey].attempts[uid];
                await msg.reply(`🎉 Complimenti! Hai indovinato il numero ${secret} in ${attempts} tentativi!`);
                games[targetKey] = { secret: Math.floor(Math.random() * 100) + 1, attempts: {} };
                saveData();
            } else if (guess < secret) {
                await msg.reply('⬆️ Troppo basso!');
            } else {
                await msg.reply('⬇️ Troppo alto!');
            }
            saveData();
        }

        // COMANDO: .8ball
        else if (command === '8ball' || command === '8palla') {
            const responses = [
                'Sì', 'No', 'Forse', 'Assolutamente', 'Non ci contare', 'Chiedi più tardi',
                'Le prospettive sono buone', 'Le prospettive non sono buone'
            ];
            if (args.length === 0) return msg.reply('⚠️ Fai una domanda dopo .8ball');
            const r = responses[Math.floor(Math.random() * responses.length)];
            await msg.reply(`🔮 ${r}`);
        }

        // COMANDO: .scelta
        else if (command === 'scelta' || command === 'choose') {
            const raw = args.join(' ');
            if (!raw.includes('|')) return msg.reply('⚠️ Usa: .scelta op1|op2|op3');
            const opts = raw.split('|').map(s => s.trim()).filter(Boolean);
            const pick = opts[Math.floor(Math.random() * opts.length)];
            await msg.reply(`🟢 Ho scelto: ${pick}`);
        }

        // COMANDO: .daily
        else if (command === 'daily') {
            const uid = getUserIdFromMsg(msg);
            initUser(uid);
            const now = nowSeconds();
            const last = economy[uid].lastDaily || 0;
            const cooldown = 24 * 60 * 60;
            if (now - last < cooldown) {
                const remaining = cooldown - (now - last);
                const h = Math.floor(remaining / 3600);
                const m = Math.floor((remaining % 3600) / 60);
                return msg.reply(`⏳ Hai già riscattato il daily. Torna tra ${h}h ${m}m.`);
            }
            const amount = 200 + Math.floor(Math.random() * 201);
            economy[uid].money += amount;
            economy[uid].lastDaily = now;
            saveData();
            await msg.reply(`✅ Daily riscattato: +${amount} coins!`);
        }

        // COMANDO: .soldi
        else if (command === 'soldi' || command === 'balance') {
            const uid = getUserIdFromMsg(msg);
            initUser(uid);
            const bal = economy[uid];
            await msg.reply(`💰 Wallet: ${bal.money} coins\n🏦 Banca: ${bal.bank} coins`);
        }

        // COMANDO: .lavora
        else if (command === 'lavora' || command === 'work') {
            const uid = getUserIdFromMsg(msg);
            initUser(uid);
            const now = nowSeconds();
            const cooldown = 60 * 60;
            if (now - economy[uid].lastWork < cooldown) {
                const remaining = cooldown - (now - economy[uid].lastWork);
                return msg.reply(`⏳ Sei esausto. Riprova tra ${Math.ceil(remaining/60)} minuti.`);
            }
            const earned = 50 + Math.floor(Math.random() * 151);
            economy[uid].money += earned;
            economy[uid].lastWork = now;
            saveData();
            await msg.reply(`💼 Hai lavorato e guadagnato ${earned} coins!`);
        }

        // COMANDO: .regalo
        else if (command === 'regalo' || command === 'donate') {
            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente. Es: .regalo @nome 100');
            const amount = parseInt(args[args.length - 1]);
            if (isNaN(amount) || amount <= 0) return msg.reply('⚠️ Specifica un importo valido.');
            const giver = getUserIdFromMsg(msg);
            const receiver = mentioned[0].id._serialized;
            initUser(giver);
            initUser(receiver);
            if (economy[giver].money < amount) return msg.reply('⚠️ Non hai abbastanza soldi.');
            economy[giver].money -= amount;
            economy[receiver].money += amount;
            saveData();
            await msg.reply(`🎁 Hai regalato ${amount} coins a ${mentioned[0].pushname || mentioned[0].number}`);
        }

        // COMANDO: .checkadmin (debug)
        else if (command === 'checkadmin' || command === 'testadmin') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            
            let userId = msg.author || msg.from;
            try {
                // Prova a ottenere il contatto per l'ID reale
                const contact = await msg.getContact();
                const realUserId = contact.id._serialized;
                
                const freshChat = await client.getChatById(chat.id._serialized);
                const userNumber = realUserId.includes('@') ? realUserId.split('@')[0] : realUserId;
                
                const participant = freshChat.participants.find(p => {
                    const participantNumber = p.id._serialized.split('@')[0];
                    return participantNumber === userNumber;
                });
                
                if (!participant) {
                    return msg.reply(`❌ Non trovato!\n\nID @lid: ${userId}\nID reale: ${realUserId}\nNumero: ${userNumber}`);
                }
                
                const debugInfo = `
🔍 *DEBUG ADMIN*
ID @lid: ${userId}
ID reale: ${realUserId}
Numero: ${userNumber}
isAdmin: ${participant.isAdmin}
isSuperAdmin: ${participant.isSuperAdmin}
✅ TROVATO!
                `;
                await msg.reply(debugInfo);
            } catch (e) {
                await msg.reply(`❌ Errore: ${e.message}`);
            }
        }

        // COMANDO: .inventario
        else if (command === 'inventario' || command === 'inventory') {
            const uid = getUserIdFromMsg(msg);
            initUser(uid);
            const inv = economy[uid].inventory;
            if (inv.length === 0) return msg.reply('📦 Il tuo inventario è vuoto.');
            await msg.reply(`📦 Inventario:\n${inv.map((i, idx) => `${idx+1}. ${i}`).join('\n')}`);
        }

        // COMANDO: .negozio
        else if (command === 'negozio' || command === 'shop') {
            const shopItems = [
                { id: 'medikit', name: 'Medikit', price: 300, desc: 'Ricarica energia' },
                { id: 'cassa', name: 'Cassa sorpresa', price: 500, desc: 'Premi casuali' },
                { id: 'vip', name: 'Ruolo VIP', price: 1500, desc: 'Ruolo speciale' }
            ];
            let text = '🛒 *NEGOZIO*\n\n';
            for (let it of shopItems) {
                text += `• ${it.name} (${it.id}) - ${it.price} coins\n  ${it.desc}\n`;
            }
            text += '\nUsa .compra [id] per acquistare';
            await msg.reply(text);
        }

        // COMANDO: .s -> converti immagine in sticker
if (command === 's' || command === 'sticker') {
    try {
        // assicurati che "chat" sia già definito in questo scope: const chat = await msg.getChat();
        // trova il messaggio che contiene il media: il messaggio corrente oppure il messaggio quotato
        let mediaMsg = null;

        if (msg.hasMedia) {
            mediaMsg = msg;
        } else {
            // msg.hasQuotedMsg potrebbe non essere presente in tutte le versioni: proviamo comunque
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted && quoted.hasMedia) mediaMsg = quoted;
            } catch (e) {
                // niente media nel quoted, prosegui
            }
        }

        if (!mediaMsg) {
            return msg.reply("📎 Allegare un'immagine o rispondere a un'immagine con `.s` per creare lo sticker.");
        }

        // Scarica il media
        const media = await mediaMsg.downloadMedia();
        if (!media || !media.data) {
            return msg.reply("❌ Impossibile scaricare l'immagine. Riprova.");
        }

        // Crea un MessageMedia compatibile
        const stickerMedia = new MessageMedia(media.mimetype || 'image/png', media.data, media.filename);

        // Opzioni per invio sticker; stickerAnimated true per gif (se supportato)
        const options = {
            sendMediaAsSticker: true,
            stickerName: 'Sticker',
            stickerAuthor: 'Bot',
            stickerAnimated: media.mimetype && media.mimetype.includes('gif') ? true : false
        };

        // Invia lo sticker nella stessa chat
        await chat.sendMessage(stickerMedia, options);

        // opzionale: conferma all'utente
        // await msg.reply('✅ Sticker creato!');
    } catch (err) {
        console.error('Errore nel comando .s:', err);
        await msg.reply('❌ Si è verificato un errore durante la creazione dello sticker.');
    }
}

        else if (command === 'r' || command === 'remove') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    try {
        const quoted = await msg.getQuotedMessage();
        if (!quoted) return msg.reply('⚠️ Rispondi al messaggio che vuoi rimuovere usando `.r`.');
        await quoted.delete(true);
        await msg.reply('✅ Messaggio rimosso!');
    } catch (err) {
        console.error(err);
        await msg.reply('❌ Non è stato possibile rimuovere il messaggio.');
    }
}

       // COMANDO: .p o .promuovi → Promuove un utente ad admin
else if (command === 'p' || command === 'promuovi') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    try {
        const mentionedUsers = await msg.getMentions();
        if (mentionedUsers.length === 0)
            return msg.reply('❌ Menziona un utente da promuovere.\nEsempio: `.p @utente`');

        for (const user of mentionedUsers) {
            await chat.promoteParticipants([user.id._serialized]);
        }

        await msg.reply(`✅ ${mentionedUsers.length} utente/i promosso/i ad admin! 👑`);
    } catch (err) {
        console.error(err);
        await msg.reply('❌ Errore durante la promozione. Assicurati che il bot sia admin.');
    }
}


// COMANDO: .d o .degrada → Degrada un admin
else if (command === 'd' || command === 'degrada') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    try {
        const mentionedUsers = await msg.getMentions();
        if (mentionedUsers.length === 0)
            return msg.reply('❌ Menziona un utente da degradare.\nEsempio: `.d @utente`');

        for (const user of mentionedUsers) {
            await chat.demoteParticipants([user.id._serialized]);
        }

        await msg.reply(`✅ ${mentionedUsers.length} utente/i degradato/i da admin.`);
    } catch (err) {
        console.error(err);
        await msg.reply('❌ Errore durante il degrado. Assicurati che il bot sia admin.');
    }
}


        

       else if (command === 'chiudi') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].adminMode = true;
    saveData();
    await msg.reply('🔒 Gruppo chiuso: solo gli amministratori possono scrivere.');
}

        else if (command === 'apri') {
    if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
    if (!await isAdmin()) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

    initGroup(chat.id._serialized);
    groupData[chat.id._serialized].adminMode = false;
    saveData();
    await msg.reply('🔓 Gruppo aperto: tutti possono scrivere.');
}



        // COMANDO: .uptime
        else if (command === 'uptime') {
            const uptime = Date.now() - startTime;
            const s = Math.floor(uptime / 1000) % 60;
            const m = Math.floor(uptime / (1000 * 60)) % 60;
            const h = Math.floor(uptime / (1000 * 60 * 60)) % 24;
            const d = Math.floor(uptime / (1000 * 60 * 60 * 24));
            await msg.reply(`⏱️ Uptime: ${d}d ${h}h ${m}m ${s}s`);
        }

        // COMANDO: .info-bot
        else if (command === 'info-bot' || command === 'botinfo') {
            const memoryUsage = process.memoryUsage();
            await msg.reply(`
🤖 *INFO BOT*
PID: ${process.pid}
Node: ${process.version}
Memoria RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)} MB
Start: ${new Date(startTime).toLocaleString('it-IT')}
            `);
        }

        // fallback - comando non riconosciuto
        else {
            // lasciare vuoto o inviare un breve hint
            // await msg.reply('⚠️ Comando non riconosciuto. Usa .menu per la lista dei comandi.');
        }

    } catch (err) {
        console.error('Errore gestione messaggio:', err);
    }
});

        client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const groupInfo = groupData[chat.id._serialized] || {};

    // Comando per info gruppo
    if (msg.body === '.info') {
        const participants = chat.participants.length;
        const admins = chat.participants.filter(p => p.isAdmin).length;
        
        let info = `📊 *Info Gruppo*\n\n`;
        info += `👥 Partecipanti: ${participants}\n`;
        info += `👑 Admin: ${admins}\n`;
        info += `📝 Nome: ${chat.name}\n`;
        info += `🔒 Modo Admin: ${groupInfo.adminMode ? 'Attivo' : 'Disattivo'}\n`;
        info += `⚠️ AntiSpam: ${groupInfo.antiSpam ? 'Attivo' : 'Disattivo'}`;
        
        await msg.reply(info);
        return;
    }

    // ... altri comandi ...
});





// EVENTI: partecipante aggiunto / rimosso - welcome & goodbye
// Nota: whatsapp-web.js emette eventi 'group_join' e 'group_leave' per messaggi di notifica del gruppo
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        if (!g.welcomeEnabled) return;

        // notification.who? in alcune versioni è notification.recipientIds o notification.author
        // Proviamo ad ottenere i nuovi membri dalla proprietà 'recipients' o 'selectedParticipants' in base alla versione.
        let newMembers = [];
        if (notification.type === 'add' && notification.recipientIds) {
            newMembers = notification.recipientIds;
        } else if (notification.recipient) {
            newMembers = [notification.recipient];
        } else if (notification.added) {
            newMembers = notification.added;
        }

        for (let nm of newMembers) {
            try {
                const contact = await client.getContactById(nm);
                const text = g.welcomeMessage.replace('{user}', contact.pushname || contact.number).replace('{group}', chat.name || '');
                await chat.sendMessage(text);
            } catch {}
        }
    } catch (err) {
        // non fondamentale se fallisce
    }
});

client.on('group_leave', async (notification) => {
    try {
        const chat = await notification.getChat();
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        if (!g.goodbyeEnabled) return;

        let leftMembers = [];
        if (notification.recipientIds) leftMembers = notification.recipientIds;
        else if (notification.recipient) leftMembers = [notification.recipient];
        else if (notification.left) leftMembers = notification.left;

        for (let lm of leftMembers) {
            try {
                const contact = await client.getContactById(lm);
                const text = g.goodbyeMessage.replace('{user}', contact.pushname || contact.number).replace('{group}', chat.name || '');
                await chat.sendMessage(text);
            } catch {}
        }
    } catch (err) {
        // ignore
    }
});

// Autosave periodico
setInterval(() => {
    saveData();
}, 30 * 1000); // salva ogni 30s

// Salvataggio su chiusura del processo
function gracefulShutdown() {
    console.log('Shutdown: salvataggio dati...');
    saveData();
    process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    saveData();
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    saveData();
    process.exit(1);
});

// ---------------------- LOGIN ----------------------
client.initialize();
