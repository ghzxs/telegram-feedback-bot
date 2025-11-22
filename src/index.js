// Cloudflare Workers - Telegram 客服机器人
// 使用 Workers KV 存储用户数据

// 垃圾信息关键词列表
const SPAM_KEYWORDS = ["贷款","加微信","私信","包装","刷单","合作","赚钱","投资","t.me/joinchat","http","https","@","频道","群","wx"];

// Telegram API 辅助函数
async function telegramAPI(token, method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('Telegram API Error:', data);
    }
    
    return data;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
}

// 发送消息
async function sendMessage(token, chatId, text, options = {}) {
  return await telegramAPI(token, 'sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    ...options,
  });
}

// 转发消息
async function forwardMessage(token, chatId, fromChatId, messageId) {
  return await telegramAPI(token, 'forwardMessage', {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
  });
}

// 编辑消息
async function editMessage(token, chatId, messageId, text, options = {}) {
  return await telegramAPI(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    ...options,
  });
}

// 回答 callback query
async function answerCallbackQuery(token, callbackQueryId, text = '', showAlert = false) {
  return await telegramAPI(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text,
    show_alert: showAlert,
  });
}

// 复制消息（当转发失败时使用）
async function copyMessage(token, chatId, fromChatId, messageId) {
  return await telegramAPI(token, 'copyMessage', {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
  });
}

// 检查用户是否被封禁
async function isUserBanned(env, userId) {
  const banKey = `ban:${userId}`;
  const banData = await env.BOT_KV.get(banKey);
  
  if (!banData) return false;
  
  const banInfo = JSON.parse(banData);
  const now = Date.now();
  
  if (now < banInfo.until) {
    return true;
  } else {
    // 封禁已过期，删除记录
    await env.BOT_KV.delete(banKey);
    return false;
  }
}

// 封禁用户
async function banUser(env, userId, days = 7) {
  const banKey = `ban:${userId}`;
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  
  await env.BOT_KV.put(banKey, JSON.stringify({ until }), {
    expirationTtl: days * 24 * 60 * 60,
  });
}

// 检查用户是否已验证
async function isUserVerified(env, userId) {
  const userKey = `user:${userId}`;
  const userData = await env.BOT_KV.get(userKey);
  
  if (!userData) return false;
  
  const user = JSON.parse(userData);
  return user.verified === true;
}

// 生成 CAPTCHA（参照 Python 版本）
function generateCaptcha() {
  const a = Math.floor(Math.random() * 31) + 10; // 10-40
  const b = Math.floor(Math.random() * 31) + 10; // 10-40
  const answer = a + b;
  const question = `${a} + ${b} = ?`;

  // 随机生成2个干扰项，确保不与正确答案重复
  const optionsSet = new Set([answer]);
  while (optionsSet.size < 3) {
    // 干扰项范围：answer-10 ~ answer+10，排除answer本身
    const distractor = answer + Math.floor(Math.random() * 21) - 10;
    if (distractor !== answer) {
      optionsSet.add(distractor);
    }
  }
  const options = Array.from(optionsSet);

  // 打乱顺序
  options.sort(() => Math.random() - 0.5);

  return {
    question,
    answer: answer.toString(),
    options: options.map(x => x.toString())
  };
}

// 发送 CAPTCHA
async function sendCaptcha(env, token, userId) {
  const captcha = generateCaptcha();
  
  // 生成唯一的 callback_data（使用用户ID作为标识）
  const captchaId = Date.now().toString(36);
  
  // 保存 CAPTCHA 答案
  const captchaKey = `captcha:${userId}`;
  await env.BOT_KV.put(captchaKey, JSON.stringify({
    answer: captcha.answer,
    attempts: 0,
    captchaId: captchaId,
  }), {
    expirationTtl: 300, // 5分钟过期
  });
  
  // 创建 inline keyboard（3个选项按钮，一行显示）
  const keyboard = {
    inline_keyboard: [
      captcha.options.map(option => ({
        text: option,
        callback_data: `c_${option}_${userId}`
      }))
    ]
  };
  
  await sendMessage(token, userId, 
    `🔐 <b>首次使用需要过个小验证（防广告机器人）</b>\n\n${captcha.question}`,
    { reply_markup: keyboard }
  );
}

// 验证 CAPTCHA（通过 callback）
async function verifyCaptchaCallback(env, token, userId, userAnswer) {
  const captchaKey = `captcha:${userId}`;
  const captchaData = await env.BOT_KV.get(captchaKey);
  
  if (!captchaData) {
    return { success: false, message: '❌ CAPTCHA 已过期，请重新开始。', retry: true };
  }
  
  const captcha = JSON.parse(captchaData);
  
  if (userAnswer === captcha.answer) {
    // 验证成功
    const userKey = `user:${userId}`;
    await env.BOT_KV.put(userKey, JSON.stringify({
      verified: true,
      verifiedAt: Date.now(),
    }));
    
    await env.BOT_KV.delete(captchaKey);
    return { success: true, message: '✅ 验证成功！你已通过验证，直接发消息吧～' };
  } else {
    // 验证失败
    captcha.attempts += 1;
    
    if (captcha.attempts >= 3) {
      // 封禁用户
      await banUser(env, userId, 7);
      await env.BOT_KV.delete(captchaKey);
      return { success: false, message: '❌ 验证失败次数过多，您已被限制 7 天。', banned: true };
    } else {
      // 更新尝试次数，生成新题目
      const newCaptcha = generateCaptcha();
      
      // 更新答案
      captcha.answer = newCaptcha.answer;
      await env.BOT_KV.put(captchaKey, JSON.stringify(captcha), {
        expirationTtl: 300,
      });
      
      // 生成新的按钮
      const keyboard = {
        inline_keyboard: [
          newCaptcha.options.map(option => ({
            text: option,
            callback_data: `c_${option}_${userId}`
          }))
        ]
      };
      
      return { 
        success: false, 
        message: `❌ 答案错误，请重试。\n\n${newCaptcha.question}\n\n剩余尝试次数：${3 - captcha.attempts}`,
        keyboard: keyboard,
        retry: true
      };
    }
  }
}

// 检查是否为垃圾信息
function isSpam(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return SPAM_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// 保存最后联系的用户
async function saveLastContact(env, userId, username) {
  await env.BOT_KV.put('last_contact', JSON.stringify({
    userId: userId.toString(),
    username: username || '',
    timestamp: Date.now(),
  }));
}

// 获取最后联系的用户
async function getLastContact(env) {
  const data = await env.BOT_KV.get('last_contact');
  return data ? JSON.parse(data) : null;
}

// 处理普通用户消息
async function handleUserMessage(env, token, adminId, message) {
  const userId = message.from.id;
  const username = message.from.username || message.from.first_name || '';
  const text = message.text || message.caption || '';
  
  console.log(`Received message from user ${userId}: ${text}`);
  
  // 检查是否被封禁
  if (await isUserBanned(env, userId)) {
    await sendMessage(token, userId, '❌ 您已被限制使用，请稍后再试。');
    return;
  }
  
  // 检查是否已验证
  if (!await isUserVerified(env, userId)) {
    console.log(`User ${userId} not verified, prompting to use /start`);
    await sendMessage(token, userId, '⚠️ 请先发送 /start 完成验证。');
    return;
  }
  
  // 检查垃圾信息
  if (isSpam(text)) {
    await sendMessage(token, userId, '⚠️ 检测到疑似广告内容，消息未发送。');
    // 通知管理员
    return;
  }
  
  // 先尝试转发消息
  const forwardResult = await forwardMessage(token, adminId, userId, message.message_id);
  
  // 如果转发失败，尝试复制消息
  if (!forwardResult.ok) {
    console.log('Forward failed, trying copy');
    await copyMessage(token, adminId, userId, message.message_id);
    // 添加用户信息
    await sendMessage(token, adminId, 
      `👤 来自用户：${userId}\n用户名：@${username}`
    );
  }
  
  // 保存最后联系的用户
  await saveLastContact(env, userId, username);
  
  // // 向用户确认
  // await sendMessage(token, userId, '✅ 您的消息已发送给客服，请耐心等待回复。');
}

// 处理管理员消息
async function handleAdminMessage(env, token, message) {
  const text = message.text || message.caption || '';
  
  console.log(`Received message from admin: ${text}`);
  
  // 获取最后联系的用户
  const lastContact = await getLastContact(env);
  
  if (!lastContact) {
    await sendMessage(token, message.chat.id, '❌ 没有最近联系的用户。');
    return;
  }
  
  const targetUserId = lastContact.userId;
  
  // 先尝试转发消息
  const forwardResult = await forwardMessage(token, targetUserId, message.chat.id, message.message_id);
  
  // 如果转发失败，尝试复制消息
  if (!forwardResult.ok) {
    console.log('Forward to user failed, trying copy');
    await copyMessage(token, targetUserId, message.chat.id, message.message_id);
  }
  
  await sendMessage(token, message.chat.id, 
    `✅ 消息已发送给用户 ${targetUserId} (@${lastContact.username})`
  );
}

// 处理 /start 命令
async function handleStartCommand(env, token, userId) {
  console.log(`/start command from user ${userId}`);
  
  if (await isUserBanned(env, userId)) {
    await sendMessage(token, userId, '❌ 您已被限制使用，请稍后再试。');
    return;
  }
  
  if (!await isUserVerified(env, userId)) {
    await sendCaptcha(env, token, userId);
  } else {
    await sendMessage(token, userId, 
      '👋 <b>欢迎回来！</b>\n\n您可以直接发送消息给客服。'
    );
  }
}

// 处理 callback query（按钮点击）
async function handleCallbackQuery(env, token, adminId, callbackQuery) {
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  
  console.log(`Callback from user ${userId}: ${data}`);
  
  // 处理 CAPTCHA 回调（格式：c_答案_用户ID）
  if (data.startsWith('c_')) {
    const parts = data.split('_');
    if (parts.length !== 3) {
      await answerCallbackQuery(token, callbackQuery.id, '❌ 无效的选择', true);
      return;
    }
    
    const answer = parts[1];
    const callbackUserId = parts[2];
    
    // 验证是否是当前用户的按钮
    if (callbackUserId !== userId.toString()) {
      await answerCallbackQuery(token, callbackQuery.id, '❌ 这不是你的验证', true);
      return;
    }
    
    const result = await verifyCaptchaCallback(env, token, userId, answer);
    
    if (result.success) {
      // 验证成功，编辑消息移除按钮
      await editMessage(token, userId, messageId, result.message, { reply_markup: { inline_keyboard: [] } });
      await answerCallbackQuery(token, callbackQuery.id, '✅ 验证成功！');
    } else if (result.banned) {
      // 被封禁
      await editMessage(token, userId, messageId, result.message, { reply_markup: { inline_keyboard: [] } });
      await answerCallbackQuery(token, callbackQuery.id, '❌ 已被封禁', true);
    } else if (result.retry) {
      if (result.keyboard) {
        // 显示新题目
        await editMessage(token, userId, messageId, result.message, { reply_markup: result.keyboard });
        await answerCallbackQuery(token, callbackQuery.id, '❌ 答案错误，请重试');
      } else {
        // CAPTCHA 过期，需要重新 /start
        await editMessage(token, userId, messageId, result.message, { reply_markup: { inline_keyboard: [] } });
        await answerCallbackQuery(token, callbackQuery.id, '❌ 已过期', true);
        await sendMessage(token, userId, '请发送 /start 重新验证。');
      }
    }
  } else {
    await answerCallbackQuery(token, callbackQuery.id, '未知操作');
  }
}

// 处理 /status 命令（管理员查看状态）
async function handleStatusCommand(env, token, userId) {
  const lastContact = await getLastContact(env);
  
  let statusText = '📊 <b>机器人状态</b>\n\n';
  
  if (lastContact) {
    statusText += `最近联系用户：\n`;
    statusText += `- ID: ${lastContact.userId}\n`;
    statusText += `- 用户名: @${lastContact.username}\n`;
    statusText += `- 时间: ${new Date(lastContact.timestamp).toLocaleString('zh-CN')}`;
  } else {
    statusText += '暂无最近联系用户';
  }
  
  await sendMessage(token, userId, statusText);
}

// 新增：普通用户使用的 /status 命令，返回简单运行状态
async function handleStatusUserCommand(env, token, userId) {
  await sendMessage(token, userId, '🟢 <b>All Systems Operational</b>');
}

// 主处理函数
async function handleUpdate(env, token, adminId, update) {
  console.log('Received update:', JSON.stringify(update));
  
  // 处理 callback query（按钮点击）
  if (update.callback_query) {
    await handleCallbackQuery(env, token, adminId, update.callback_query);
    return;
  }
  
  if (!update.message) {
    console.log('No message in update');
    return;
  }
  
  const message = update.message;
  const userId = message.from.id;
  const isAdmin = userId.toString() === adminId.toString();
  
  console.log(`Message from ${userId}, isAdmin: ${isAdmin}`);
  
  // 处理命令
  if (message.text) {
    if (message.text.startsWith('/start')) {
      await handleStartCommand(env, token, userId);
      return;
    }
    
    // 将 /status 改为对所有用户可用：管理员显示详细状态，普通用户仅返回“运行正常”
    if (message.text.startsWith('/status')) {
      if (isAdmin) {
        await handleStatusCommand(env, token, userId);
      } else {
        await handleStatusUserCommand(env, token, userId);
      }
      return;
    }
  }

  // 管理员消息
  if (isAdmin) {
    await handleAdminMessage(env, token, message);
  } else {
    // 普通用户消息
    await handleUserMessage(env, token, adminId, message);
  }
}

// Cloudflare Workers 入口
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 从环境变量读取配置
    const BOT_TOKEN = env.BOT_TOKEN;
    const ADMIN_ID = env.ADMIN_ID;
    
    if (!BOT_TOKEN || !ADMIN_ID) {
      console.error('Missing required environment variables');
      return new Response('Configuration Error: Missing BOT_TOKEN or ADMIN_ID', { 
        status: 500 
      });
    }
    
    console.log(`Admin ID configured: ${ADMIN_ID}`);
    
    // 处理 webhook
    if (request.method === 'POST' && url.pathname === '/webhook') {
      try {
        const update = await request.json();
        await handleUpdate(env, BOT_TOKEN, ADMIN_ID, update);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error processing update:', error);
        return new Response('Error: ' + error.message, { status: 500 });
      }
    }
    
    // 设置 webhook
    if (url.pathname === '/setWebhook') {
      const webhookUrl = `${url.origin}/webhook`;
      console.log(`Setting webhook to: ${webhookUrl}`);
      
      const result = await telegramAPI(BOT_TOKEN, 'setWebhook', {
        url: webhookUrl,
        drop_pending_updates: true, // 清除待处理的更新
      });
      
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 获取 webhook 信息
    if (url.pathname === '/getWebhookInfo') {
      const result = await telegramAPI(BOT_TOKEN, 'getWebhookInfo', {});
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 删除 webhook（用于测试）
    if (url.pathname === '/deleteWebhook') {
      const result = await telegramAPI(BOT_TOKEN, 'deleteWebhook', {});
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 获取机器人信息
    if (url.pathname === '/getMe') {
      const result = await telegramAPI(BOT_TOKEN, 'getMe', {});
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Telegram Bot is running\n\nAvailable endpoints:\n- POST /webhook\n- GET /setWebhook\n- GET /getWebhookInfo\n- GET /deleteWebhook\n- GET /getMe', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};