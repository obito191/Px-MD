const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const ownerNumbers = ['9198003781@s.whatsapp.net', '919800378187@s.whatsapp.net'];
const prefix = '>';
const devName = '❛ ⃪𝆭𝐃α꧊᱂к-𑄈⸙';
const botName = 'ＯＢＩＴＯ - Ｖ１';

// --- Database Setup ---
const dbPath = path.resolve(__dirname, 'database.json');
let db = { sudo: [], groups: {} };
if (fs.existsSync(dbPath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
        db = { sudo: [], groups: {} };
    }
}
const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

const spamCache = {};

async function startObito() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, 
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[ SYSTEM ] Connection closed. Reconnecting...');
            if (shouldReconnect) setTimeout(startObito, 5000); 
        } else if (connection === 'open') {
            console.log(`[ SYSTEM ] ${botName} is now ONLINE in PRIVATE MODE!`);
        }
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const phoneNumber = "919674609057"; 
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n\n=== YOUR PAIRING CODE IS: ${code} ===\n\n`);
            } catch (err) {
                console.log("[ SYSTEM ] Pairing code generation failed...", err);
            }
        }, 8000);
    }

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action, author } = update;
        if (!db.groups[id]) return;
        
        const groupDb = db.groups[id];
        const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
        const cleanAuthor = author ? author.split(':')[0] + '@s.whatsapp.net' : '';

        if (groupDb.pdx && action === 'promote') {
            const msg = `*［ ⚡ ＳＹＳＴＥＭ ＵＰＤＡＴＥ ］*\n\n⟁ *Status:* New Admin Promoted\n⟁ *Target:* @${participants[0].split('@')[0]}`;
            try { await sock.sendMessage(ownerNumbers[0], { text: msg, mentions: participants }); } catch(e){}
            if (botJid) { try { await sock.sendMessage(botJid, { text: msg, mentions: participants }); } catch(e){} }
        }

        if (groupDb.antidemote && action === 'demote') {
            if (cleanAuthor && cleanAuthor !== botJid && !ownerNumbers.includes(cleanAuthor)) {
                try {
                    await sock.groupParticipantsUpdate(id, [author], 'demote');
                    await sock.groupParticipantsUpdate(id, participants, 'promote');
                    const alertMsg = `*［ ☢️ ＡＮＴＩ-ＤＥＭＯＴＥ ］*\n\n☠️ *Target:* @${cleanAuthor.split('@')[0]}\n⚠️ *Crime:* Unauthorized Admin Demotion.\n⚡ *Penalty:* Privileges Revoked.`;
                    await sock.sendMessage(id, { text: alertMsg, mentions: [cleanAuthor, ...participants] });
                } catch(e){}
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;

        let actualMessage = msg.message;
        if (actualMessage?.ephemeralMessage) {
            actualMessage = actualMessage.ephemeralMessage.message;
        } else if (actualMessage?.viewOnceMessage?.message) {
            actualMessage = actualMessage.viewOnceMessage.message;
        } else if (actualMessage?.documentWithCaptionMessage?.message) {
            actualMessage = actualMessage.documentWithCaptionMessage.message;
        }
        
        if (!actualMessage) return;

        const messageType = Object.keys(actualMessage)[0];
        const body = actualMessage.conversation || actualMessage.extendedTextMessage?.text || actualMessage.imageMessage?.caption || actualMessage.videoMessage?.caption || "";

        const from = msg.key.remoteJid;
        const botNumber = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
        
        // JID Fix: Cleaning the sender number properly
        const rawSender = msg.key.fromMe ? botNumber : (msg.key.participant || msg.key.remoteJid);
        const sender = rawSender ? rawSender.split(':')[0] + '@s.whatsapp.net' : '';
        
        const isGroup = from.endsWith('@g.us');
        const isOwner = ownerNumbers.includes(sender);
        const isSudo = isOwner || db.sudo.includes(sender);
        const isAllowedUser = isOwner || isSudo || sender === botNumber;
        
        // Admin verification logic updated
        const isAdmin = isGroup ? await checkAdmin(sock, from, sender) : false;
        const isBotAdmin = isGroup ? await checkAdmin(sock, from, botNumber) : false;

        if (isGroup && !db.groups[from]) {
            db.groups[from] = { antilink: false, spam: false, bug: false, pdx: false, status: false, antidemote: false, locked: [], badwords: [], warnings: {} };
            saveDB();
        }
        const groupDb = isGroup ? db.groups[from] : null;

        // --- SECURITY ACTION BLOCK ---
        if (isGroup && !isAdmin && !isOwner && isBotAdmin) {
            
            // Antilink
            if (groupDb.antilink && /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9]+\.[a-zA-Z]{2,})/i.test(body)) {
                groupDb.warnings[sender] = (groupDb.warnings[sender] || 0) + 1;
                saveDB();
                try { await sock.sendMessage(from, { delete: msg.key }); } catch(e){}
                
                if (groupDb.warnings[sender] >= 3) {
                    try {
                        await sock.sendMessage(from, { text: `*［ ☠️ ＳＥＣＵＲＩＴＹ ＢＲＥＡＣＨ ］*\n\nTarget: @${sender.split('@')[0]}\nAction: User Terminated 🚫`, mentions: [sender] });
                        await sock.groupParticipantsUpdate(from, [sender], "remove");
                    } catch(e){}
                    groupDb.warnings[sender] = 0; 
                } else {
                    try { await sock.sendMessage(from, { text: `*［ ⚠️ ＳＹＳＴＥＭ ＡＬＥＲＴ ］*\n\nTarget: @${sender.split('@')[0]}\nWarning: Links prohibited. [ ${groupDb.warnings[sender]} / 3 ]`, mentions: [sender] }); } catch(e){}
                }
            }

            // Anti-Spam
            if (groupDb.spam) {
                if (!spamCache[sender]) spamCache[sender] = [];
                spamCache[sender].push(Date.now());
                spamCache[sender] = spamCache[sender].filter(t => Date.now() - t < 4000); 
                if (spamCache[sender].length >= 5) { 
                    try {
                        await sock.sendMessage(from, { text: `*［ ☢️ ＳＰＡＭ ＤＥＴＥＣＴＥＤ ］*\n\nTarget: @${sender.split('@')[0]}\nAction: Extermination ⚡`, mentions: [sender] });
                        await sock.groupParticipantsUpdate(from, [sender], "remove");
                    } catch(e){}
                    spamCache[sender] = []; 
                }
            }

            // Anti-Bug
            if (groupDb.bug && (body.length > 15000 || /(?:[\u200e\u200f\u202a-\u202e\u2066-\u2069]{100,})/.test(body))) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.groupParticipantsUpdate(from, [sender], "remove");
                } catch(e){}
            }
        }

        // --- COMMAND PROCESSING ---
        if (!body.startsWith(prefix)) return;
        if (!isAllowedUser) return; 

        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'ping') {
            await sock.sendMessage(from, { text: '*［ 🟢 ＳＹＳＴＥＭ ＯＮＬＩＮＥ ］*\n\nEverything is working properly!' });
        }

        if (command === 'menu') {
            const time = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
            const date = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

            const menuText = `╭━━━〔 👑 ${botName} 〕━━━┈
├ ✨ ɴᴀᴍᴇ : ${botName}
├ 👤 ᴏᴡɴᴇʀ : ${devName}
├ 🛡️ ᴍᴏᴅᴇ : ᴘʀɪᴠᴀᴛᴇ (ᴏᴡɴᴇʀ ᴏɴʟʏ)
├ ⏳ ᴛɪᴍᴇ : ${time}
├ 📅 ᴅᴀᴛᴇ : ${date}
╰━━━━━━━━━━━━━━━┈

╭━━━〔 ⚙️ ꜱᴇᴄᴜʀＩᴛʏ ʟᴏᴄᴋꜱ 〕━━━┈
├ ⟁ ${prefix}antilink [on/off]
├ ⟁ ${prefix}antidemote [on/off]
├ ⟁ ${prefix}spam [on/off]
├ ⟁ ${prefix}bug [on/off]
├ ⟁ ${prefix}pdx [on/off]
├ ⟁ ${prefix}status [on/off]
╰━━━━━━━━━━━━━━━┈

╭━━━〔 🛠️ ɢʀᴏᴜᴘ ᴄᴏɴᴛʀᴏʟ 〕━━━┈
├ ⟁ ${prefix}lock [item]
├ ⟁ ${prefix}unlock [item]
├ ⟁ ${prefix}close
├ ⟁ ${prefix}open
├ ⟁ ${prefix}warn @user
├ ⟁ ${prefix}word [add/remove]
╰━━━━━━━━━━━━━━━┈`;

            try {
                await sock.sendMessage(from, { 
                    video: { url: "https://files.catbox.moe/hcm38s.mp4" }, 
                    gifPlayback: true, 
                    caption: menuText 
                });
            } catch (err) {
                await sock.sendMessage(from, { text: menuText }); 
            }
        }

        if (isGroup) {
            if (['antilink', 'spam', 'bug', 'pdx', 'status', 'antidemote'].includes(command)) {
                const state = args[0] === 'on';
                groupDb[command] = state;
                saveDB();
                try {
                    await sock.sendMessage(from, { text: `*［ ⚙️ ＳＹＳＴＥＭ ＣＯＮＦＩＧ ］*\n\nProtocol: *${command.toUpperCase()}*\nStatus: *${state ? 'ONLINE 🟢' : 'OFFLINE 🔴'}*` });
                } catch (e) {}
            }
            if (command === 'close') {
                try {
                    await sock.groupSettingUpdate(from, 'announcement');
                    await sock.sendMessage(from, { text: "*［ 🔒 ＳＥＣＵＲＩＴＹ ］*\nGroup Locked by Admin." });
                } catch (e) {}
            }
            if (command === 'open') {
                try {
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sock.sendMessage(from, { text: "*［ 🔓 ＳＥＣＵＲＩＴＹ ］*\nGroup Unlocked." });
                } catch (e) {}
            }
        }
    });
}

// --- JID Fix Applied Here ---
async function checkAdmin(sock, groupId, userId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const cleanUserId = userId.split(':')[0] + '@s.whatsapp.net';
        const participant = groupMetadata.participants.find(p => (p.id.split(':')[0] + '@s.whatsapp.net') === cleanUserId);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        return false;
    }
}

startObito();
