const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ===== КОНФИГУРАЦИЯ =====
const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;

// Функция запроса к YandexGPT
async function callYandexGPT(promptText) {
    console.log('🚀 Отправка запроса к YandexGPT...');
    console.log('📝 Prompt:', promptText.substring(0, 200) + '...');
    
    try {
        const response = await axios.post(
            'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
            {
                modelUri: `gpt://${YANDEX_FOLDER_ID}/yandexgpt-lite`,
                completionOptions: {
                    stream: false,
                    temperature: 0.6,  // 🔥 Чуть меньше креативности для точности
                    maxTokens: 800,    // 🔥 Больше токенов для полного ответа
                },
                messages: [
                    {
                        role: 'system',
                        text: 'Ты — эксперт-краевед и историк. Отвечай точно, конкретно и по делу. Никакой воды.'
                    },
                    {
                        role: 'user',
                        text: promptText,
                    },
                ],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Api-Key ${YANDEX_API_KEY}`,
                },
                timeout: 30000,
            }
        );
        
        console.log('✅ YandexGPT ответил успешно');
        return response.data.result.alternatives[0].message.text;
        
    } catch (error) {
        console.error('❌ YandexGPT ошибка:');
        if (error.response) {
            console.error('Статус:', error.response.status);
            console.error('Данные:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Сообщение:', error.message);
        }
        throw error;
    }
}

// 🔥 Эндпоинт для информации о месте (УЛУЧШЕННЫЙ ПРОМПТ)
app.post('/api/place-info', async (req, res) => {
    console.log('\n📥 /api/place-info');
    console.log('Название:', req.body.name);
    
    const { name, description, latitude, longitude } = req.body;
    
    try {
        const prompt = `Ты — эксперт-краевед и историк. Расскажи о достопримечательности "${name}".

ВАЖНО: Говори ТОЛЬКО о конкретном месте "${name}". Не давай общую информацию о людях или событиях, если они напрямую не связаны с ЭТИМ местом.

Если это памятник человеку — расскажи:
- Кем был этот человек КОНКРЕТНО
- Почему памятник установлен именно здесь
- Что особенного в этом памятнике

Если это здание — расскажи:
- Что это за здание
- Когда и кем построено
- Что в нём находится сейчас
- Архитектурные особенности

Если это парк или площадь — расскажи:
- Историю этого места
- Почему оно так называется
- Что интересного можно увидеть

Формат ответа СТРОГО:
📜 [Название места — точное историческое название]
✨ [Главная особенность или "фишка" этого конкретного места — один абзац]
🗺️ [Что здесь можно увидеть прямо сейчас — конкретные детали]
💫 [Почему стоит посетить именно это место — уникальность]

Не пиши общие фразы вроде "возможно", "к сожалению, нет информации", "это красивое место", "рекомендую посетить".
Если точных данных нет — предложи осмотреть место лично и обратить внимание на конкретные детали.

${description ? `Описание из базы: ${description}` : ''}
${latitude && longitude ? `Координаты: ${latitude}, ${longitude}` : ''}

Отвечай строго по формату. Без лишних слов.`;

        const aiResponse = await callYandexGPT(prompt);
        
        res.json({
            success: true,
            description: aiResponse,
            photoUrl: null,
        });
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        res.status(500).json({ 
            success: false, 
            description: 'Не удалось получить информацию от ИИ. Попробуйте позже.',
            error: error.message 
        });
    }
});

// 🔥 Эндпоинт для чата (УЛУЧШЕННЫЙ ПРОМПТ)
app.post('/api/chat', async (req, res) => {
    console.log('\n📥 /api/chat');
    console.log('Место:', req.body.placeName);
    
    const { placeName, placeDescription, messages } = req.body;
    
    try {
        const lastMessage = messages[messages.length - 1];
        const question = lastMessage.text;
        
        // 🔥 Формируем историю диалога для контекста
        const dialogHistory = messages
            .slice(0, -1)
            .map(msg => `${msg.sender === 'user' ? 'Пользователь' : 'Гид'}: ${msg.text}`)
            .join('\n');
        
        const prompt = `Ты — виртуальный гид по конкретной достопримечательности "${placeName}".

Информация о месте: ${placeDescription || 'историческая достопримечательность'}

${dialogHistory ? `История диалога:\n${dialogHistory}\n` : ''}

Правила ответа:
1. Отвечай ТОЛЬКО о месте "${placeName}"
2. Если вопрос "Кто он?" или "Что это?" — расскажи КОНКРЕТНО об этом месте/человеке, не давай общую информацию
3. Не используй фразы "возможно", "к сожалению, нет информации", "я не знаю"
4. Если точных данных нет — скажи: "Точных данных об этом нет, но вот что известно: [факты из имеющейся информации]"
5. Будь конкретным, полезным и дружелюбным
6. Отвечай на русском языке

Вопрос пользователя: ${question}

Твой ответ (как гид, который хорошо знает это место):`;

        const aiResponse = await callYandexGPT(prompt);
        
        res.json({
            success: true,
            response: aiResponse,
        });
        
    } catch (error) {
        console.error('❌ Ошибка чата:', error.message);
        res.status(500).json({ 
            success: false, 
            response: 'Извините, произошла ошибка. Попробуйте позже.',
            error: error.message 
        });
    }
});

// Тестовый эндпоинт
app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', message: 'Сервер работает' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
