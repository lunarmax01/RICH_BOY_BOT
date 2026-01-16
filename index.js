require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User');
const Config = require('./models/Config');

const bot = new TelegramBot(process.env.TOKEN, { polling: true });
const ADMINS = process.env.ADMINS.split(',').map(id => Number(id));

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB ulandi"))
    .catch(err => console.log("❌ Mongo error:", err));

/* ================= HELPERS ================= */
const getConfig = async () => {
    let config = await Config.findOne();
    if (!config) config = await Config.create({ requiredChannels: [], refAmount: 50 });
    if (!config.requiredChannels) config.requiredChannels = [];
    return config;
};

const checkChannels = async (userId, config) => {
    if (!config.requiredChannels || config.requiredChannels.length === 0) return [];
    const notSubscribed = [];
    for (const channel of config.requiredChannels) {
        try {
            const member = await bot.getChatMember(channel, userId);
            if (['left', 'kicked'].includes(member.status)) notSubscribed.push(channel);
        } catch {
            notSubscribed.push(channel);
        }
    }
    return notSubscribed;
};

// Faqat foydalanuvchilar uchun obuna xabari
const sendSubscribeMessage = async (userId, config) => {
    if (ADMINS.includes(userId)) return true; // adminlar uchun tekshirish yo'q

    const notSubscribed = await checkChannels(userId, config);
    if (notSubscribed.length === 0) return true;

    const buttons = notSubscribed.map(ch => [{ text: `Obuna bo‘lish 🫆`, url: `https://t.me/${ch.replace('@','')}` }]);
    buttons.push([{ text: "Obuna bo‘ldim ✅", callback_data: "check_sub" }]);

    return bot.sendMessage(userId, `⚠️ Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:`, {
        reply_markup: { inline_keyboard: buttons }
    });
};

/* ================= START ================= */
bot.onText(/\/start(?: (\d+))?/, async (msg, match) => {
    const userId = msg.from.id;
    const refId = match[1] ? Number(match[1]) : null;
    const config = await getConfig();

    if ((await checkChannels(userId, config)).length > 0 && !ADMINS.includes(userId)) 
        return sendSubscribeMessage(userId, config);

    let user = await User.findOne({ userId });
    if (!user) {
        user = await User.create({ userId, refBy: refId, balance: 0, lastBonus: null });
        if (refId && refId !== userId) {
            await User.updateOne({ userId: refId }, { $inc: { balance: config.refAmount || 50 } });
            const username = msg.from.username ? '@' + msg.from.username : msg.from.first_name;
            bot.sendMessage(refId, `🎉 Sizning yangi obunachingiz qo‘shildi: ${username}\n💰 Sizga ${config.refAmount || 50} so‘m berildi!`);
        }
    }

    // ===== ADD OPEN BUTTON (Web App / Website) =====
    await bot.setChatMenuButton({
        chat_id: userId,
        menu_button: {
            type: "web_app",
            text: "Open 🌐",
            web_app: { url: "https://yourwebsite.com" } // sizning sayt URL
        }
    });

    const keyboard = ADMINS.includes(userId)
        ? [
            [{ text: "Balans" }, { text: "Bonus" }],
            [{ text: "Referal Link" }, { text: "Yechib olish" }, { text: "Reklama yuborish" }],
            [{ text: "Kanal qo‘shish" }, { text: "Kanal o‘chirish" }],
            [{ text: "Referal pulini sozlash" }]
        ]
        : [
            [{ text: "Balans" }, { text: "Bonus" }],
            [{ text: "Referal Link" }, { text: "Yechib olish" }]
        ];

    bot.sendMessage(userId, "👋 Xush kelibsiz! Menu tugmasidan foydalaning.", { reply_markup: { keyboard, resize_keyboard: true } });
});

/* ================= CALLBACK ================= */
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    const config = await getConfig();

    if (data === "check_sub") {
        if ((await checkChannels(userId, config)).length === 0 || ADMINS.includes(userId)) {
            bot.answerCallbackQuery(query.id, { text: "✅ Obuna bo‘ldingiz!" });
            bot.deleteMessage(userId, query.message.message_id);
            bot.emit('text', { text: '/start', from: query.from, chat: { id: userId } });
        } else {
            bot.answerCallbackQuery(query.id, { text: "❌ Siz hali barcha kanallarga obuna bo‘lmadingiz!" });
        }
    }

    if (data.startsWith("paid_")) {
        const [, uid, amount] = data.split("_").map(Number);
        const user = await User.findOne({ userId: uid });
        if (!user) return;
        if (user.balance < amount) return bot.answerCallbackQuery(query.id, { text: "❌ Balans yetarli emas!" });

        await User.updateOne({ userId: uid }, { $inc: { balance: -amount } });
        bot.answerCallbackQuery(query.id, { text: `✅ ${amount} so'm balansdan yechildi` });
        bot.sendMessage(query.from.id, `✅ Pul foydalanuvchi balansidan yechildi!`);
        bot.sendMessage(uid, `✅ Sizning yechib olish so‘rovingiz tasdiqlandi. ${amount} so'm yechildi.`);
    }
});

/* ================= MESSAGE HANDLER ================= */
bot.on('message', async (msg) => {
    const userId = msg.from.id;
    const text = msg.text;
    const config = await getConfig();
    const user = await User.findOne({ userId });
    if (!user) return;
    const now = new Date();
    const isAdmin = ADMINS.includes(userId);

    if ((await checkChannels(userId, config)).length > 0 && !isAdmin) return sendSubscribeMessage(userId, config);

    // ===== BONUS =====
    if (text === "Bonus") {
        if (user.lastBonus && new Date(user.lastBonus).toDateString() === now.toDateString()) 
            return bot.sendMessage(userId, "⚠️ Bugun bonus olgansiz!");
        await User.updateOne({ userId }, { $inc: { balance: 50 }, $set: { lastBonus: now } });
        return bot.sendMessage(userId, "🎁 50 so‘m bonus berildi!");
    }

    // ===== BALANS =====
    if (text === "Balans") {
        return bot.sendMessage(userId, `💰 Balansingiz: ${user.balance} so'm`);
    }

    // ===== REFERAL =====
    if (text === "Referal Link") {
        const link = `https://t.me/RICHBOY_RoBoT?start=${userId}`;
        return bot.sendMessage(userId, `🔗 Sizning referal link: ${link}\n💰 Har bir qo‘shilgan do‘st uchun: ${config.refAmount || 50} so'm`);
    }

    // ===== YECHIB OLISH =====
    if (text === "Yechib olish") {
        if (user.balance < 10000) return bot.sendMessage(userId, "⚠️ Minimal yechib olish 10.000 so‘m!");

        const askAmount = async () => {
            bot.sendMessage(userId, `💰 Balansingiz: ${user.balance} so'm\n✍️ Qancha summa yechib olmoqchisiz?`).then(() => {
                bot.once('message', async (msgSum) => {
                    const amount = Number(msgSum.text);
                    if (!amount || amount < 10000 || amount > user.balance) 
                        return bot.sendMessage(userId, "❌ Noto‘g‘ri summa!");
                    sendWithdrawToAdmin(userId, amount, user.cardNumber, user.fullName);
                    bot.sendMessage(userId, "✅ So‘rov yuborildi, admin tasdiqlashini kuting");
                });
            });
        };

        if (!user.cardNumber || !user.fullName) {
            bot.sendMessage(userId, "💳 Iltimos karta raqamingizni kiriting:").then(() => {
                bot.once('message', async (msgCard) => {
                    const cardNumber = msgCard.text;
                    bot.sendMessage(userId, "📝 To‘liq ism va familiyangizni kiriting:").then(() => {
                        bot.once('message', async (msgName) => {
                            const fullName = msgName.text;
                            await User.updateOne({ userId }, { $set: { cardNumber, fullName } });
                            await askAmount();
                        });
                    });
                });
            });
        } else await askAmount();
        return;
    }

    // ===== ADMIN =====
    if (isAdmin) {
        if (text === "Reklama yuborish") {
            bot.sendMessage(userId, "Xabar matnini yuboring:").then(() => {
                bot.once('message', async (msg2) => {
                    const users = await User.find();
                    users.forEach(u => bot.sendMessage(u.userId, msg2.text).catch(() => {}));
                    bot.sendMessage(userId, "✅ Reklama yuborildi");
                });
            });
        }

        // ===== KANAL QO‘SHISH =====
        if (text === "Kanal qo‘shish") {
            bot.sendMessage(userId, "Kanal username kiriting (@ bilan):").then(() => {
                bot.once('message', async (msg2) => {
                    const ch = msg2.text.trim();
                    if (!ch.startsWith('@')) return bot.sendMessage(userId, "❌ @ bilan boshlanishi kerak!");
                    const cfg = await getConfig();
                    if (cfg.requiredChannels.includes(ch)) 
                        return bot.sendMessage(userId, "❌ Kanal allaqachon mavjud!");
                    cfg.requiredChannels.push(ch);
                    await cfg.save();
                    bot.sendMessage(userId, `✅ Kanal qo‘shildi: ${ch}`);
                });
            });
        }

        // ===== KANAL O‘CHIRISH =====
        if (text === "Kanal o‘chirish") {
            bot.sendMessage(userId, "O‘chirmoqchi bo‘lgan kanal (@ bilan):").then(() => {
                bot.once('message', async (msg2) => {
                    const ch = msg2.text.trim();
                    const cfg = await getConfig();
                    if (cfg.requiredChannels.includes(ch)) {
                        cfg.requiredChannels = cfg.requiredChannels.filter(c => c !== ch);
                        await cfg.save();
                        bot.sendMessage(userId, `✅ Kanal o‘chirildi: ${ch}`);
                    } else bot.sendMessage(userId, "❌ Kanal topilmadi!");
                });
            });
        }

        // ===== REFERAL PULINI SOZLASH =====
        if (text === "Referal pulini sozlash") {
            bot.sendMessage(userId, "Referal pulini kiriting:").then(() => {
                bot.once('message', async (msg2) => {
                    const amount = Number(msg2.text);
                    if (!isNaN(amount)) {
                        const cfg = await getConfig();
                        cfg.refAmount = amount;
                        await cfg.save();
                        bot.sendMessage(userId, `✅ Referal summasi o‘zgartirildi: ${amount} so'm`);
                    } else bot.sendMessage(userId, "❌ Raqam kiriting!");
                });
            });
        }
    }
});

/* ===================== HELPER: SEND WITHDRAW TO ADMIN ===================== */
function sendWithdrawToAdmin(userId, amount, cardNumber, fullName) {
    const username = `@${userId}`;
    ADMINS.forEach(adminId => {
        bot.sendMessage(adminId,
`💰 Yechib olish so‘rovi!

👤 User: ${username}
🆔 ID: ${userId}
💰 Summa: ${amount} so'm
💳 Karta raqami: ${cardNumber || "Yo'q"}
📝 Egasi: ${fullName || "Yo'q"}`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "💸 Pul to‘landi", callback_data: `paid_${userId}_${amount}` }
                ]]
            }
        });
    });
}
