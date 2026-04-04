const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ===== КОНФИГУРАЦИЯ =====
const YANDEX_API_KEY = process.env.YANDEX_API_KEY;  // БЕЗ ХАРДКОДА
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID; // ВСТАВЬТЕ ВАШ ПОЛНЫЙ КЛЮЧ

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
                    temperature: 0.7,
                    maxTokens: 500,
                },
                messages: [
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

// Эндпоинт для информации о месте
app.post('/api/place-info', async (req, res) => {
    console.log('\n📥 /api/place-info');
    console.log('Название:', req.body.name);
    
    const { name, description } = req.body;
    
    try {
        const prompt = `Расскажи о достопримечательности "${name}" в строго следующем формате (каждый пункт с новой строки):

📅 Год постройки/открытия: [укажи год, если известно, иначе "неизвестно"]
⭐ Почему стоит посетить: [2-3 предложения]
🤔 Интересный факт: [1 предложение]

${description ? `Дополнительная информация: ${description}` : ''}

Отвечай только в этом формате, без лишнего текста.`;

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

// Эндпоинт для чата
app.post('/api/chat', async (req, res) => {
    console.log('\n📥 /api/chat');
    console.log('Место:', req.body.placeName);
    
    const { placeName, placeDescription, messages } = req.body;
    
    try {
        const lastMessage = messages[messages.length - 1];
        const question = lastMessage.text;
        
        const prompt = `Ты — туристический гид. 
Место: ${placeName}
Информация: ${placeDescription || 'историческая достопримечательность'}

Вопрос пользователя: ${question}

Ответь подробно и интересно.`;

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