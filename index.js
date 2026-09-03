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
    db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
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

    // Safe Pairing Code Generator for Railway/Cloud
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const phoneNumber = "9674609057"; 
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n\n=== YOUR PAIRING CODE IS: ${code} ===\n\n`);
            } catch (err) {
                console.log("[ SYSTEM ] Pairing code generation failed, retrying...", err);
            }
        }, 8000);
    }

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action, author } = update;
        if (!db.groups[id]) return;
        
        const groupDb = db.groups[id];
        const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';

        if (groupDb.pdx && action === 'promote') {
            const msg = `*［ ⚡ ＳＹＳＴＥＭ ＵＰＤＡＴＥ ］*\n\n⟁ *Status:* New Admin Promoted\n⟁ *Target:* @${participants[0].split('@')[0]}`;
            await sock.sendMessage(ownerNumbers[0], { text: msg, mentions: participants });
            if (botJid) await sock.sendMessage(botJid, { text: msg, mentions: participants });
        }

        if (groupDb.antidemote && action === 'demote') {
            if (author && author !== botJid && !ownerNumbers.includes(author)) {
                await sock.groupParticipantsUpdate(id, [author], 'demote');
                await sock.groupParticipantsUpdate(id, participants, 'promote');
                
                const alertMsg = `*［ ☢️ ＡＮＴＩ-ＤＥＭＯＴＥ ］*\n\n☠️ *Target:* @${author.split('@')[0]}\n⚠️ *Crime:* Unauthorized Admin Demotion.\n⚡ *Penalty:* Privileges Revoked.`;
                await sock.sendMessage(id, { text: alertMsg, mentions: [author, ...participants] });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;

        const sender = msg.key.participant || msg.key.remoteJid;
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        const messageType = Object.keys(msg.message)[0];
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
        
        const isOwner = ownerNumbers.includes(sender);
        const isSudo = isOwner || db.sudo.includes(sender);
        const botNumber = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
        
        const isAdmin = isGroup ? await checkAdmin(sock, from, sender) : false;
        const isBotAdmin = isGroup ? await checkAdmin(sock, from, botNumber) : false;

        if (isGroup && !db.groups[from]) {
            db.groups[from] = { antilink: false, spam: false, bug: false, pdx: false, status: false, antidemote: false, locked: [], badwords: [], warnings: {} };
            saveDB();
        }
        const groupDb = isGroup ? db.groups[from] : null;

        if (isGroup && !isAdmin && !isOwner && isBotAdmin) {
            
            if (groupDb.antilink && /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9]+\.[a-zA-Z]{2,})/i.test(body)) {
                groupDb.warnings[sender] = (groupDb.warnings[sender] || 0) + 1;
                saveDB();
                await sock.sendMessage(from, { delete: msg.key });
                if (groupDb.warnings[sender] >= 3) {
                    await sock.sendMessage(from, { text: `*［ ☠️ ＳＥＣＵＲＩＴＹ ＢＲＥＡＣＨ ］*\n\nTarget: @${sender.split('@')[0]}\nAction: User Terminated 🚫`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], "remove");
                    groupDb.warnings[sender] = 0; 
                } else {
                    await sock.sendMessage(from, { text: `*［ ⚠️ ＳＹＳＴＥＭ ＡＬＥＲＴ ］*\n\nTarget: @${sender.split('@')[0]}\nWarning: Links prohibited. [ ${groupDb.warnings[sender]} / 3 ]`, mentions: [sender] });
                }
            }

            if (groupDb.spam) {
                if (!spamCache[sender]) spamCache[sender] = [];
                spamCache[sender].push(Date.now());
                spamCache[sender] = spamCache[sender].filter(t => Date.now() - t < 4000);
                if (spamCache[sender].length >= 6) {
                    await sock.sendMessage(from, { text: `*［ ☢️ ＳＰＡＭ ＤＥＴＥＣＴＥＤ ］*\n\nTarget: @${sender.split('@')[0]}\nAction: Extermination ⚡`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], "remove");
                    spamCache[sender] = []; 
                }
            }

            if (groupDb.locked && groupDb.locked.length > 0) {
                if ((groupDb.locked.includes('photo') && messageType === 'imageMessage') ||
                    (groupDb.locked.includes('video') && messageType === 'videoMessage') ||
                    (groupDb.locked.includes('files') && messageType === 'documentMessage')) {
                    await sock.sendMessage(from, { delete: msg.key });
                }
            }

            if (groupDb.bug && (body.length > 15000 || /(?:[\u200e\u200f\u202a-\u202e\u2066-\u2069]{100,})/.test(body))) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.groupParticipantsUpdate(from, [sender], "remove");
            }

            if (groupDb.badwords && groupDb.badwords.some(word => body.toLowerCase().includes(word))) {
                await sock.sendMessage(from, { delete: msg.key });
            }

            if (groupDb.status && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0 && body.toLowerCase().includes('story')) {
                await sock.sendMessage(from, { delete: msg.key });
            }
        }

        if (!body.startsWith(prefix)) return;
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const isAllowedUser = isOwner || isSudo || sender === botNumber;
        if (!isAllowedUser) return;

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

╭━━━〔 ⚙️ ꜱᴇᴄᴜʀɪᴛʏ ʟᴏᴄᴋꜱ 〕━━━┈
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
╰━━━━━━━━━━━━━━━┈

╭━━━〔 👨‍💻 ᴏᴡɴᴇʀ 〕━━━┈
├ ⟁ ${prefix}sudo @user
├ ⟁ ${prefix}rm @user
├ ⟁ ${prefix}gstory
├ ⟁ ${prefix}broadcast
╰━━━━━━━━━━━━━━━┈`;

            await sock.sendMessage(from, { 
                video: { url: "https://files.catbox.moe/hcm38s.mp4" }, 
                gifPlayback: true, 
                caption: menuText 
            });
        }

        if (isGroup) {
            if (['antilink', 'spam', 'bug', 'pdx', 'status', 'antidemote'].includes(command)) {
                const state = args[0] === 'on';
                groupDb[command] = state;
                saveDB();
                await sock.sendMessage(from, { text: `*［ ⚙️ ＳＹＳＴＥＭ ＣＯＮＦＩＧ ］*\n\nProtocol: *${command.toUpperCase()}*\nStatus: *${state ? 'ONLINE 🟢' : 'OFFLINE 🔴'}*` });
            }
            if (command === 'close') {
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: "*［ 🔒 ＳＥＣＵＲＩＴＹ ］*\nGroup Locked by Admin." });
            }
            if (command === 'open') {
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: "*［ 🔓 ＳＥＣＵＲＩＴＹ ］*\nGroup Unlocked." });
            }
            if (command === 'lock') {
                if (!args[0]) return sock.sendMessage(from, { text: `*Locked Protocols:* ${groupDb.locked.join(', ') || 'None'}` });
                if (['photo', 'video', 'files'].includes(args[0]) && !groupDb.locked.includes(args[0])) {
                    groupDb.locked.push(args[0]);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ 🔒 ＬＯＣＫＥＤ ］* ⟁ ${args[0]}` });
                }
            }
            if (command === 'unlock') {
                if (groupDb.locked) {
                    groupDb.locked = groupDb.locked.filter(item => item !== args[0]);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ 🔓 ＵＮＬＯＣＫＥＤ ］* ⟁ ${args[0]}` });
                }
            }
            if (command === 'warn') {
                const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (msg.message.extendedTextMessage?.contextInfo?.participant);
                if (target) await sock.sendMessage(from, { text: `*［ ⚠️ ＷＡＲＮＩＮＧ ＩＳＳＵＥＤ ］*\n\nTarget: @${target.split('@')[0]}`, mentions: [target] });
            }
            if (command === 'word') {
                const word = args.join(' ').toLowerCase();
                if (!word) return;
                if (groupDb.badwords.includes(word)) {
                    groupDb.badwords = groupDb.badwords.filter(w => w !== word);
                    await sock.sendMessage(from, { text: `*［ ✅ ＵＰＤＡＴＥＤ ］*\nRemoved '${word}' from Blacklist.` });
                } else {
                    groupDb.badwords.push(word);
                    await sock.sendMessage(from, { text: `*［ 🚫 ＢＬＡＣＫＬＩＳＴＥＤ ］*\nAdded '${word}' to system filter.` });
                }
                saveDB();
            }
        }

        if (isOwner) {
            if (command === 'sudo') {
                const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (msg.message.extendedTextMessage?.contextInfo?.participant);
                if (target && !db.sudo.includes(target)) {
                    db.sudo.push(target);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ 🛡️ ＡＣＣＥＳＳ ＧＲＡＮＴＥＤ ］*\n@${target.split('@')[0]} added to Sudo.`, mentions: [target] });
                }
            }
            if (command === 'rm') {
                const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (msg.message.extendedTextMessage?.contextInfo?.participant);
                if (target) {
                    db.sudo = db.sudo.filter(id => id !== target);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ ❌ ＡＣＣＥＳＳ ＲＥＶＯＫＥＤ ］*\n@${target.split('@')[0]} removed from Sudo.`, mentions: [target] });
                }
            }
            if (command === 'broadcast') {
                const bMsg = args.join(' ');
                const groups = Object.keys(await sock.groupFetchAllParticipating());
                for (let jid of groups) await sock.sendMessage(jid, { text: `*［ 📢 ＳＹＳＴＥＭ ＢＲＯＡＤＣＡＳＴ ］*\n\n${bMsg}` });
                await sock.sendMessage(from, { text: `*［ ✅ ＴＲＡＮＳＭＩＳＳＩＯN ＣＯＭＰＬＥＴＥ ］*` });
            }
            if (command === 'gstory') {
                const isQuoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                const messageToUpload = isQuoted ? isQuoted : msg.message;
                await sock.sendMessage('status@broadcast', { forward: { key: { remoteJid: from, id: msg.key.id }, message: messageToUpload }});
                await sock.sendMessage(from, { text: `*［ ✅ ＳＴＡＴＵＳ ＵＰＤＡＴＥＤ ］*` });
            }
        }
    });
}

async function checkAdmin(sock, groupId, userId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participant = groupMetadata.participants.find(p => p.id === userId);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        return false;
    }
}

startObito();
                const alertMsg = `*［ ☢️ ＡＮＴＩ-ＤＥＭＯＴＥ ］*\n\n☠️ *Target:* @${author.split('@')[0]}\n⚠️ *Crime:* Unauthorized Admin Demotion.\n⚡ *Penalty:* Privileges Revoked.`;
                await sock.sendMessage(id, { text: alertMsg, mentions: [author, ...participants] });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;

        const sender = msg.key.participant || msg.key.remoteJid;
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        const messageType = Object.keys(msg.message)[0];
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
        
        const isOwner = ownerNumbers.includes(sender);
        const isSudo = isOwner || db.sudo.includes(sender);
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        const isAdmin = isGroup ? await checkAdmin(sock, from, sender) : false;
        const isBotAdmin = isGroup ? await checkAdmin(sock, from, botNumber) : false;

        if (isGroup && !db.groups[from]) {
            db.groups[from] = { antilink: false, spam: false, bug: false, pdx: false, status: false, antidemote: false, locked: [], badwords: [], warnings: {} };
            saveDB();
        }
        const groupDb = isGroup ? db.groups[from] : null;

        if (isGroup && !isAdmin && !isOwner && isBotAdmin) {
            
            if (groupDb.antilink && /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9]+\.[a-zA-Z]{2,})/i.test(body)) {
                groupDb.warnings[sender] = (groupDb.warnings[sender] || 0) + 1;
                saveDB();
                await sock.sendMessage(from, { delete: msg.key });
                if (groupDb.warnings[sender] >= 3) {
                    await sock.sendMessage(from, { text: `*［ ☠️ ＳＥＣＵＲＩＴＹ ＢＲＥＡＣＨ ］*\n\nTarget: @${sender.split('@')[0]}\nAction: User Terminated 🚫`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], "remove");
                    groupDb.warnings[sender] = 0; 
                } else {
                    await sock.sendMessage(from, { text: `*［ ⚠️ ＳＹＳＴＥＭ ＡＬＥＲＴ ］*\n\nTarget: @${sender.split('@')[0]}\nWarning: Links prohibited. [ ${groupDb.warnings[sender]} / 3 ]`, mentions: [sender] });
                }
            }

            if (groupDb.spam) {
                if (!spamCache[sender]) spamCache[sender] = [];
                spamCache[sender].push(Date.now());
                spamCache[sender] = spamCache[sender].filter(t => Date.now() - t < 4000);
                if (spamCache[sender].length >= 6) {
                    await sock.sendMessage(from, { text: `*［ ☢️ ＳＰＡＭ ＤＥＴＥＣＴＥＤ ］*\n\nTarget: @${sender.split('@')[0]}\nAction: Extermination ⚡`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], "remove");
                    spamCache[sender] = []; 
                }
            }

            if (groupDb.locked && groupDb.locked.length > 0) {
                if ((groupDb.locked.includes('photo') && messageType === 'imageMessage') ||
                    (groupDb.locked.includes('video') && messageType === 'videoMessage') ||
                    (groupDb.locked.includes('files') && messageType === 'documentMessage')) {
                    await sock.sendMessage(from, { delete: msg.key });
                }
            }

            if (groupDb.bug && (body.length > 15000 || /(?:[\u200e\u200f\u202a-\u202e\u2066-\u2069]{100,})/.test(body))) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.groupParticipantsUpdate(from, [sender], "remove");
            }

            if (groupDb.badwords && groupDb.badwords.some(word => body.toLowerCase().includes(word))) {
                await sock.sendMessage(from, { delete: msg.key });
            }

            if (groupDb.status && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0 && body.toLowerCase().includes('story')) {
                await sock.sendMessage(from, { delete: msg.key });
            }
        }

        if (!body.startsWith(prefix)) return;
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const isAllowedUser = isOwner || isSudo || sender === botNumber;
        if (!isAllowedUser) return;

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

╭━━━〔 ⚙️ ꜱᴇᴄᴜʀɪᴛʏ ʟᴏᴄᴋꜱ 〕━━━┈
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
╰━━━━━━━━━━━━━━━┈

╭━━━〔 👨‍💻 ᴏᴡɴᴇʀ 〕━━━┈
├ ⟁ ${prefix}sudo @user
├ ⟁ ${prefix}rm @user
├ ⟁ ${prefix}gstory
├ ⟁ ${prefix}broadcast
╰━━━━━━━━━━━━━━━┈`;

            await sock.sendMessage(from, { 
                video: { url: "https://files.catbox.moe/hcm38s.mp4" }, 
                gifPlayback: true, 
                caption: menuText 
            });
        }

        if (isGroup) {
            if (['antilink', 'spam', 'bug', 'pdx', 'status', 'antidemote'].includes(command)) {
                const state = args[0] === 'on';
                groupDb[command] = state;
                saveDB();
                await sock.sendMessage(from, { text: `*［ ⚙️ ＳＹＳＴＥＭ ＣＯＮＦＩＧ ］*\n\nProtocol: *${command.toUpperCase()}*\nStatus: *${state ? 'ONLINE 🟢' : 'OFFLINE 🔴'}*` });
            }
            if (command === 'close') {
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: "*［ 🔒 ＳＥＣＵＲＩＴＹ ］*\nGroup Locked by Admin." });
            }
            if (command === 'open') {
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: "*［ 🔓 ＳＥＣＵＲＩＴＹ ］*\nGroup Unlocked." });
            }
            if (command === 'lock') {
                if (!args[0]) return sock.sendMessage(from, { text: `*Locked Protocols:* ${groupDb.locked.join(', ') || 'None'}` });
                if (['photo', 'video', 'files'].includes(args[0]) && !groupDb.locked.includes(args[0])) {
                    groupDb.locked.push(args[0]);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ 🔒 ＬＯＣＫＥＤ ］* ⟁ ${args[0]}` });
                }
            }
            if (command === 'unlock') {
                if (groupDb.locked) {
                    groupDb.locked = groupDb.locked.filter(item => item !== args[0]);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ 🔓 ＵＮＬＯＣＫＥＤ ］* ⟁ ${args[0]}` });
                }
            }
            if (command === 'warn') {
                const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (msg.message.extendedTextMessage?.contextInfo?.participant);
                if (target) await sock.sendMessage(from, { text: `*［ ⚠️ ＷＡＲＮＩＮＧ ＩＳＳＵＥＤ ］*\n\nTarget: @${target.split('@')[0]}`, mentions: [target] });
            }
            if (command === 'word') {
                const word = args.join(' ').toLowerCase();
                if (!word) return;
                if (groupDb.badwords.includes(word)) {
                    groupDb.badwords = groupDb.badwords.filter(w => w !== word);
                    await sock.sendMessage(from, { text: `*［ ✅ ＵＰＤＡＴＥＤ ］*\nRemoved '${word}' from Blacklist.` });
                } else {
                    groupDb.badwords.push(word);
                    await sock.sendMessage(from, { text: `*［ 🚫 ＢＬＡＣＫＬＩＳＴＥＤ ］*\nAdded '${word}' to system filter.` });
                }
                saveDB();
            }
        }

        if (isOwner) {
            if (command === 'sudo') {
                const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (msg.message.extendedTextMessage?.contextInfo?.participant);
                if (target && !db.sudo.includes(target)) {
                    db.sudo.push(target);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ 🛡️ ＡＣＣＥＳＳ ＧＲＡＮＴＥＤ ］*\n@${target.split('@')[0]} added to Sudo.`, mentions: [target] });
                }
            }
            if (command === 'rm') {
                const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (msg.message.extendedTextMessage?.contextInfo?.participant);
                if (target) {
                    db.sudo = db.sudo.filter(id => id !== target);
                    saveDB();
                    await sock.sendMessage(from, { text: `*［ ❌ ＡＣＣＥＳＳ ＲＥＶＯＫＥＤ ］*\n@${target.split('@')[0]} removed from Sudo.`, mentions: [target] });
                }
            }
            if (command === 'broadcast') {
                const bMsg = args.join(' ');
                const groups = Object.keys(await sock.groupFetchAllParticipating());
                for (let jid of groups) await sock.sendMessage(jid, { text: `*［ 📢 ＳＹＳＴＥＭ ＢＲＯＡＤＣＡＳＴ ］*\n\n${bMsg}` });
                await sock.sendMessage(from, { text: `*［ ✅ ＴＲＡＮＳＭＩＳＳＩＯＮ ＣＯＭＰＬＥＴＥ ］*` });
            }
            if (command === 'gstory') {
                const isQuoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                const messageToUpload = isQuoted ? isQuoted : msg.message;
                await sock.sendMessage('status@broadcast', { forward: { key: { remoteJid: from, id: msg.key.id }, message: messageToUpload }});
                await sock.sendMessage(from, { text: `*［ ✅ ＳＴＡＴＵＳ ＵＰＤＡＴＥＤ ］*` });
            }
        }
    });
}

async function checkAdmin(sock, groupId, userId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participant = groupMetadata.participants.find(p => p.id === userId);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        return false;
    }
}

startObito();
                                              
