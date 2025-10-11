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

const getNormalizedNumber = async (msg) => {
    try {
        const contact = await msg.getContact();
        return contact.id._serialized.split('@')[0];
    } catch {
        return (msg.author || msg.from).split('@')[0];
    }
};

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
            if (groupInfo.mutedUsers.includes(userNumber)) {
                try { await msg.delete(true); } catch {}
                return;
            }

            if (groupInfo.bannedUsers.includes(userNumber)) {
                try { await chat.removeParticipants([msg.author]); } catch {}
                return;
            }

            if (groupInfo.antilink && /https?:\/\/|www\./i.test(msg.body || '')) {
                if (!(await isAdmin(msg, chat))) {
                    try { await msg.delete(true); } catch {}
                    await msg.reply('⚠️ I link non sono permessi!');
                    return;
                }
            }

            if (groupInfo.slowmode > 0) {
                const lastMsg = groupInfo.lastMessage[userNumber] || 0;
                if (Date.now() - lastMsg < groupInfo.slowmode * 1000) {
                    try { await msg.delete(true); } catch {}
                    return;
                }
                groupInfo.lastMessage[userNumber] = Date.now();
            }

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
- .unwarn @utente - Toglie un avviso
- .antilink on/off - Blocca link
- .chiudi - Chiude il gruppo
- .apri - Apre il gruppo
- .r - Rimuove un messaggio
- .p - Promuovi Admin
- .d - Rimuove Admin

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
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const messageText = args.join(' ').trim() || '📢 Attenzione!';
            const mentions = [];

            for (let participant of chat.participants) {
                try {
                    const contact = await client.getContactById(participant.id._serialized);
                    mentions.push(contact);
                } catch (e) {
                    console.log('Impossibile ottenere contatto:', participant.id._serialized);
                }
            }

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
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da bannare!');

            const toBanId = mentioned[0].id._serialized;
            const toBanNumber = toBanId.split('@')[0];

            initGroup(chat.id._serialized);
            
            const alreadyBanned = groupData[chat.id._serialized].bannedUsers.some(id => {
                return id.split('@')[0] === toBanNumber;
            });

            if (!alreadyBanned) {
                groupData[chat.id._serialized].bannedUsers.push(toBanId);
                saveData();
            }

            try {
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
            } catch (err) {
                console.error('Errore ban:', err);
                await msg.reply('❌ Errore nel bannare l\'utente. Assicurati che il bot sia admin del gruppo!');
            }
        }

        // COMANDO: .kick
        else if (command === 'kick' || command === 'remove') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da rimuovere!');

            const toKickId = mentioned[0].id._serialized;
            const toKickNumber = toKickId.split('@')[0];

            try {
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
            } catch (err) {
                console.error('Errore kick:', err);
                await msg.reply('❌ Errore nel rimuovere l\'utente. Assicurati che il bot sia admin del gruppo!');
            }
        }

        // COMANDO: .muta
        else if (command === 'muta' || command === 'mute') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da mutare!');

            const toMuteId = mentioned[0].id._serialized;
            const toMuteNumber = toMuteId.split('@')[0];
            
            initGroup(chat.id._serialized);
            
            const alreadyMuted = groupData[chat.id._serialized].mutedUsers.some(id => {
                return id.split('@')[0] === toMuteNumber;
            });
            
            if (!alreadyMuted) {
                groupData[chat.id._serialized].mutedUsers.push(toMuteId);
                saveData();
                await msg.reply(`🔇 ${mentioned[0].pushname || mentioned[0].number} è stato mutato!`);
            } else {
                await msg.reply('⚠️ Utente già mutato!');
            }
        }

        // COMANDO: .smuta
        else if (command === 'smuta' || command === 'unmute') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente da smutare!');

            const toUnmuteId = mentioned[0].id._serialized;
            const toUnmuteNumber = toUnmuteId.split('@')[0];
            
            initGroup(chat.id._serialized);
            
            const idx = groupData[chat.id._serialized].mutedUsers.findIndex(id => {
                return id.split('@')[0] === toUnmuteNumber;
            });
            
            if (idx !== -1) {
                groupData[chat.id._serialized].mutedUsers.splice(idx, 1);
                saveData();
                await msg.reply(`🔊 ${mentioned[0].pushname || mentioned[0].number} è stato smutato!`);
            } else {
                await msg.reply('⚠️ Utente non mutato!');
            }
        }

        // COMANDO: .warn
        else if (command === 'warn') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

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
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            const mentioned = await msg.getMentions();
            if (mentioned.length === 0) return msg.reply('⚠️ Menziona un utente!');

            const userId = mentioned[0].id._serialized;
            initGroup(chat.id._serialized);
            const g = groupData[chat.id._serialized];

            if (!g.warnings[userId] || g.warnings[userId] === 0) {
                return msg.reply(`⚠️ ${mentioned[0].pushname || mentioned[0].number} non ha warn!`);
            }

            g.warnings[userId]--;
            saveData();
            await msg.reply(`✅ Un warn rimosso a ${mentioned[0].pushname || mentioned[0].number} (${g.warnings[userId]}/${g.autoKickWarns})`);
        }

        // COMANDO: .antilink
        else if (command === 'antilink') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

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

        // COMANDO: .chiudi
        else if (command === 'chiudi') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].adminMode = true;
            saveData();
            await msg.reply('🔒 Gruppo chiuso: solo gli amministratori possono scrivere.');
        }

        // COMANDO: .apri
        else if (command === 'apri') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

            initGroup(chat.id._serialized);
            groupData[chat.id._serialized].adminMode = false;
            saveData();
            await msg.reply('🔓 Gruppo aperto: tutti possono scrivere.');
        }

        // COMANDO: .r (rimuovi messaggio)
        else if (command === 'r') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

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

        // COMANDO: .p (promuovi)
        else if (command === 'p' || command === 'promuovi') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

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

        // COMANDO: .d (degrada)
        else if (command === 'd' || command === 'degrada') {
            if (!isGroup) return msg.reply('⚠️ Comando disponibile solo nei gruppi!');
            if (!await isAdmin(msg, chat)) return msg.reply('⚠️ Solo gli admin possono usare questo comando!');

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

        // COMANDO: .s (sticker)
        else if (command === 's' || command === 'sticker') {
            try {
                let mediaMsg = null;

                if (msg.hasMedia) {
                    mediaMsg = msg;
                } else {
                    try {
                        const quoted = await msg.getQuotedMessage();
                        if (quoted && quoted.hasMedia) mediaMsg = quoted;
                    } catch (e) {}
                }

                if (!mediaMsg) {
                    return msg.reply("📎 Allegare un'immagine o rispondere a un'immagine con `.s` per creare lo sticker.");
                }

                const media = await mediaMsg.downloadMedia();
                if (!media || !media.data) {
                    return msg.reply("❌ Impossibile scaricare l'immagine. Riprova.");
                }

                const stickerMedia = new MessageMedia(media.mimetype || 'image/png', media.data, media.filename);

                const options = {
                    sendMediaAsSticker: true,
                    stickerName: 'Sticker',
                    tickerAuthor: 'Bot'
                };

                await chat.sendMessage(stickerMedia, options);
            } catch (err) {
                console.error('Errore nel comando .s:', err);
                await msg.reply('❌ Si è verificato un errore durante la creazione dello sticker.');
            }
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

    } catch (err) {
        console.error('Errore gestione messaggio:', err);
    }
});

// EVENTI: welcome & goodbye
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        initGroup(chat.id._serialized);
        const g = groupData[chat.id._serialized];
        if (!g.welcomeEnabled) return;

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
                const text = g.welcomeMessage
                    .replace('{user}', contact.pushname || contact.number)
                    .replace('{group}', chat.name || '');
                await chat.sendMessage(text);
            } catch {}
        }
    } catch (err) {}
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
                const text = g.goodbyeMessage
                    .replace('{user}', contact.pushname || contact.number)
                    .replace('{group}', chat.name || '');
                await chat.sendMessage(text);
            } catch {}
        }
    } catch (err) {}
});

// Autosave periodico
setInterval(() => {
    saveData();
}, 30 * 1000);

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