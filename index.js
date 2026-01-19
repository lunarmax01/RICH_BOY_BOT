require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User');
const Config = require('./models/Config');

const bot = new TelegramBot(process.env.TOKEN, { polling: true });
const ADMINS = process.env.ADMINS.split(',').map(id => Number(id));

/* ================= GLOBAL ERROR HANDLER ================= */
process.on('unhandledRejection', (reason) => {
    console.log('❌ Unhandled Rejection:', reason?.message || reason);
});

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB ulandi"))
    .catch(err => console.log("❌ Mongo error:", err));

/* ================= HELPERS ================= */
const getConfig = async () => {
    let config = await Config.findOne();
    if (!config) {
        config = await Config.create({
            requiredChannels: [],
            refAmount: 50,
            bonusAmount: 50,
            minWithdraw: 10000
        });
    }
    if (!config.requiredChannels) config.requiredChannels = [];
    return config;
};

// Kanalga obuna bo'lishni tekshirish
const checkChannels = async (userId, config) => {
    if (!config.requiredChannels.length) return [];
    const notSubscribed = [];
    for (const ch of config.requiredChannels) {
        try {
            const member = await bot.getChatMember(ch, userId);
            if (['left', 'kicked'].includes(member.status)) notSubscribed.push(ch);
        } catch {
            notSubscribed.push(ch);
        }
    }
    return notSubscribed;
};

// Obuna bo'lishni talab qilish
const sendSubscribeMessage = async (userId, config) => {
    if (ADMINS.includes(userId)) return true;
    const notSubscribed = await checkChannels(userId, config);
    if (!notSubscribed.length) return true;

    const buttons = notSubscribed.map(ch => [{ text: `Obuna bo‘lish 🫆`, url: `https://t.me/${ch.replace('@', '')}` }]);
    buttons.push([{ text: "Obuna bo‘ldim ✅", callback_data: "check_sub" }]);

    try {
        await bot.sendMessage(userId, `⚠️ Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:`, {
            reply_markup: { inline_keyboard: buttons }
        });
    } catch (err) {
        console.log("❌ sendSubscribeMessage error:", err.message);
    }
};

/* ================= MAIN MENU ================= */
const showMainMenu = async (userId) => {
    const config = await getConfig();
    const user = await User.findOne({ userId });
    if (!user) return;

    const keyboard = ADMINS.includes(userId)
        ? [
            [{ text: "💰 Balans", callback_data: "show_balance" }, { text: "🎁 Bonus", callback_data: "get_bonus" }],
            [{ text: "🔗 Referal Link", callback_data: "ref_link" }, { text: "📢 Reklama yuborish", callback_data: "send_ad" }],
            [{ text: "➕ Kanal qo‘shish", callback_data: "add_channel" }, { text: "❌ Kanal o‘chirish", callback_data: "remove_channel" }],
            [{ text: "🎁 Bonus miqdorini sozlash", callback_data: "set_bonus" }, { text: "💸 Minimal yechish miqdorini sozlash", callback_data: "set_min_withdraw" }],
            [{ text: "💎 Referal pulini sozlash", callback_data: "set_ref" }]
        ]
        : [
            [{ text: "💰 Balans", callback_data: "show_balance" }, { text: "🎁 Bonus", callback_data: "get_bonus" }],
            [{ text: "🔗 Referal Link", callback_data: "ref_link" }]
        ];

    try {
        await bot.sendMessage(userId, "👋 Xush kelibsiz! Tugmalardan foydalaning:", {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (err) {
        console.log("❌ showMainMenu error:", err.message);
    }
};

/* ================= START ================= */
bot.onText(/\/start(.*)/, async (msg, match) => {
    const userId = msg.from.id;
    const refId = match[1] ? Number(match[1].trim()) : null;

    let user = await User.findOne({ userId });
    const config = await getConfig();

    // Agar yangi user bo‘lsa
    if (!user) {
        user = await User.create({
            userId,
            balance: 0,
            referredBy: refId || null
        });

        // REFERAL ORQALI KIRGAN BO‘LSA
        if (refId && refId !== userId) {
            const refUser = await User.findOne({ userId: refId });

            if (refUser) {
                // 🔹 YANGI USERGA BONUS
                user.balance += 3000;
                await user.save();

                // 🔹 REFER QILGANGA BONUS
                refUser.balance += config.refAmount;
                refUser.refCount = (refUser.refCount || 0) + 1;
                await refUser.save();

                // Refer qilganga xabar
                bot.sendMessage(refId,
                    `🎉 Tabriklaymiz!
👤 Yangi foydalanuvchi sizning referal linkingiz orqali qo‘shildi.
💰 Sizga ${config.refAmount} so‘m bonus berildi!`
                );

                // Yangi userga xabar
                bot.sendMessage(userId,
                    `🎁 Xush kelibsiz!
🔗 Siz referal orqali qo‘shildingiz
💰 Hisobingizga 3000 so‘m bonus qo‘shildi!`
                );
            }
        }
    }

    showMainMenu(userId);
});


/* ================= CALLBACK ================= */
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    const config = await getConfig();
    const user = await User.findOne({ userId });
    if (!user) return;

    if ((await checkChannels(userId, config)).length && !ADMINS.includes(userId)) {
        return sendSubscribeMessage(userId, config);
    }

    try {
        // Obuna tekshiruv
        if (data === "check_sub") {
            const notSubscribed = await checkChannels(userId, config);
            if (!notSubscribed.length || ADMINS.includes(userId)) {
                await bot.answerCallbackQuery(query.id, { text: "✅ Obuna bo‘ldingiz!" });
                await bot.deleteMessage(userId, query.message.message_id).catch(() => { });
                bot.emit('text', { text: '/start', from: query.from, chat: { id: userId } });
            } else await bot.answerCallbackQuery(query.id, { text: "❌ Siz hali barcha kanallarga obuna bo‘lmadingiz!" });
            return;
        }

        /* ===================== USER ===================== */
        if (data === "show_balance") {
            const msgText = `
🔑 Sizning ID raqamingiz: <code>${userId}</code>
💰 Balans: <b>${user.balance}</b> so'm
💳 Yechib olgan pullaringiz: <b>${user.withdrawn || 0}</b> so'm
📝 Takliflar: <b>${user.refCount || 0}</b> ta
`;
            const buttons = [[{ text: "💸 Pulni yechish 🏧", callback_data: "withdraw_balance" }]];
            await bot.sendMessage(userId, msgText, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
            return showMainMenu(userId);
        }

        if (data === "get_bonus") {
            const now = new Date();
            if (user.lastBonus && new Date(user.lastBonus).toDateString() === now.toDateString())
                return await bot.sendMessage(userId, "⚠️ Bugun bonus olgansiz!").then(() => showMainMenu(userId));

            await User.updateOne({ userId }, { $inc: { balance: config.bonusAmount }, $set: { lastBonus: now } });
            await bot.sendMessage(userId, `🎁 ${config.bonusAmount} so‘m bonus berildi!`);
            return showMainMenu(userId);
        }
        // =================== REFERAL VA ULASHISH FUNKSIYASI ===================
        if (data === "ref_link") {
            try {
                const link = `https://t.me/${process.env.BOT_USERNAME}?start=${userId}`;
                const bonus = config.refAmount;

                const shareText =
                    `🎉 Salom! Senga maxsus taklif!  
Ushbu ajoyib botga qo‘shil va darhol bonus ol! 💰  
🔗 Boshlab yubor: ${link}  
💸 Har bir do‘st qo‘shilishi bilan ${bonus} so‘m bonus senga ham beriladi!  
🚀 Tezroq qo‘shil, imkoniyatni boy berma!`;

                await bot.sendMessage(userId, shareText, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "📤 Do‘stlarim bilan ulashish", url: `https://t.me/share/url?url=${link}&text=${encodeURIComponent(shareText)}` }
                            ]
                        ]
                    }
                });

                return showMainMenu(userId);
            } catch (err) {
                console.error("❌ Referal funksiyasi xatosi:", err);
            }
        }

        // =================== /start Bilan REFERAL BONUS ===================
        bot.onText(/\/start(?: (\d+))?/, async (msg, match) => {
            const newUserId = msg.from.id;
            const refId = match[1] ? parseInt(match[1]) : null;

            try {
                // Yangi foydalanuvchi yaratish yoki topish
                let newUser = await User.findOne({ telegramId: newUserId });
                if (!newUser) {
                    newUser = await User.create({
                        telegramId: newUserId,
                        balance: 0,
                        referrals: [],
                        refFrom: refId || null
                    });
                }

                // Agar refId mavjud bo‘lsa va foydalanuvchi o‘zini referal qilmagan bo‘lsa
                if (refId && refId !== newUserId) {
                    const refUser = await User.findOne({ telegramId: refId });
                    const config = await Config.findOne();

                    if (refUser && config) {
                        if (!refUser.referrals.includes(newUserId)) {
                            // Bonus qo‘shish
                            refUser.balance += config.refAmount;
                            refUser.referrals.push(newUserId);
                            await refUser.save();

                            // Foydalanuvchiga habar yuborish
                            await bot.sendMessage(refId,
                                `🎉 Siz yangi do‘st qo‘shdingiz!\n` +
                                `💰 Sizning balansingizga ${config.refAmount} so'm qo‘shildi.\n` +
                                `👥 Do‘stlaringiz soni: ${refUser.referrals.length}`
                            );
                        }
                    }
                }

            } catch (err) {
                console.error("❌ Referal xatosi:", err);
            }

            return showMainMenu(newUserId);
        });


        if (data === "withdraw_balance") {
            const askAmount = async () => {
                await bot.sendMessage(userId, `💰 Balansingiz: ${user.balance} so'm\n✍️ Qancha summa yechib olmoqchisiz? (Minimal: ${config.minWithdraw} so'm)`);
                bot.once('message', async (msgSum) => {
                    const amount = Number(msgSum.text);
                    if (!amount || amount < config.minWithdraw || amount > user.balance) {
                        await bot.sendMessage(userId, `❌ Noto‘g‘ri summa! Minimal: ${config.minWithdraw}, maksimal: ${user.balance}`);
                        return showMainMenu(userId);
                    }
                    sendWithdrawToAdmin(userId, amount, user.cardNumber, user.fullName);
                    await bot.sendMessage(userId, "✅ So‘rov yuborildi, admin tasdiqlashini kuting");
                    return showMainMenu(userId);
                });
            };

            if (!user.cardNumber || !user.fullName) {
                await bot.sendMessage(userId, "💳 Iltimos karta raqamingizni kiriting:");
                bot.once('message', async (msgCard) => {
                    const cardNumber = msgCard.text;
                    await bot.sendMessage(userId, "📝 To‘liq ism va familiyangizni kiriting:");
                    bot.once('message', async (msgName) => {
                        const fullName = msgName.text;
                        await User.updateOne({ userId }, { $set: { cardNumber, fullName } });
                        return askAmount();
                    });
                });
            } else return askAmount();
        }

        /* ===================== ADMIN ===================== */
        if (ADMINS.includes(userId)) {
            const askNumberAndSave = async (question, field) => {
                await bot.sendMessage(userId, question);
                bot.once('message', async (msg2) => {
                    const val = Number(msg2.text);
                    if (!isNaN(val)) {
                        const cfg = await getConfig();
                        cfg[field] = val;
                        await cfg.save();
                        await bot.sendMessage(userId, `✅ ${field} o‘zgartirildi: ${val}`);
                    } else await bot.sendMessage(userId, "❌ Raqam kiriting!");
                    return showMainMenu(userId);
                });
            };

            if (data === "set_bonus") return askNumberAndSave("🎁 Bonus summasini kiriting:", "bonusAmount");
            if (data === "set_min_withdraw") return askNumberAndSave("💸 Minimal yechish miqdorini kiriting:", "minWithdraw");
            if (data === "set_ref") return askNumberAndSave("💎 Referal summasini kiriting:", "refAmount");

            if (data === "add_channel") {
                await bot.sendMessage(userId, "➕ Kanal username kiriting (misol: @kanalname):");
                bot.once('message', async (msg2) => {
                    const ch = msg2.text.trim();
                    const cfg = await getConfig();
                    if (!cfg.requiredChannels.includes(ch)) {
                        cfg.requiredChannels.push(ch);
                        await cfg.save();
                        await bot.sendMessage(userId, `✅ Kanal qo‘shildi: ${ch}`);
                    } else await bot.sendMessage(userId, "❌ Kanal allaqachon mavjud!");
                    return showMainMenu(userId);
                });
            }

            if (data === "remove_channel") {
                await bot.sendMessage(userId, "❌ O‘chiriladigan kanal username kiriting (misol: @kanalname):");
                bot.once('message', async (msg2) => {
                    const ch = msg2.text.trim();
                    const cfg = await getConfig();
                    const index = cfg.requiredChannels.indexOf(ch);
                    if (index !== -1) {
                        cfg.requiredChannels.splice(index, 1);
                        await cfg.save();
                        await bot.sendMessage(userId, `✅ Kanal o‘chirildi: ${ch}`);
                    } else await bot.sendMessage(userId, "❌ Kanal topilmadi!");
                    return showMainMenu(userId);
                });
            }

            if (data === "send_ad") {
                await bot.sendMessage(userId, "📢 Reklama matnini kiriting:");
                bot.once('message', async (msg2) => {
                    const text = msg2.text;
                    const users = await User.find({});
                    for (const u of users) {
                        await bot.sendMessage(u.userId, `📢 Admindan reklama:\n\n${text}`).catch(() => { });
                    }
                    await bot.sendMessage(userId, `✅ Reklama ${users.length} foydalanuvchiga yuborildi!`);
                    return showMainMenu(userId);
                });
            }
        }

    } catch (err) {
        console.log("❌ callback_query error:", err.message);
    }
});

/* ===================== HELPER: SEND WITHDRAW TO ADMIN ===================== */
function sendWithdrawToAdmin(userId, amount, cardNumber, fullName) {
    ADMINS.forEach(async adminId => {
        await bot.sendMessage(adminId,
            `💰 Yechib olish so‘rovi!

👤 User ID: ${userId}
💰 Summa: ${amount} so'm
💳 Karta raqami: ${cardNumber || "Yo'q"}
📝 Egasi: ${fullName || "Yo'q"}`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "💸 Pul to‘landi", callback_data: `paid_${userId}_${amount}` }
                ]]
            }
        }).catch(() => { });
    });
}