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
                    temperature: 0.6,
                    maxTokens: 800,
                },
                messages: [
                    {
                        role: 'system',
                        text: 'Ты — эрудированный экскурсовод и краевед. Твоя задача — давать точные, емкие и содержательные ответы о достопримечательностях. Ты умеешь по названию определять тип объекта (памятник, бюст, мемориальная доска, парк, собор и т.д.) и рассказывать о нем самое главное.'
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

// Эндпоинт для информации о месте (С УМНЫМ ПРОМПТОМ)
app.post('/api/place-info', async (req, res) => {
    console.log('\n📥 /api/place-info');
    console.log('Название:', req.body.name);
    
    const { name, description, latitude, longitude } = req.body;
    
    try {
        // 🔥 НОВЫЙ, УНИВЕРСАЛЬНЫЙ И "УМНЫЙ" ПРОМПТ
        const prompt = `Ты — экскурсовод. Расскажи о достопримечательности: "${name}".

Координаты: ${latitude}, ${longitude}
${description ? `Описание из базы: ${description}` : ''}

ОПРЕДЕЛИ ТИП МЕСТА (одно-два слова): Памятник, Бюст, Мемориальная доска, Парк, Сквер, Музей, Собор, Церковь, Театр, Библиотека, Мост, Фонтан, Дворец, Усадьба, Крепость, Мемориал.

Напиши 3-4 предложения О КОНКРЕТНОМ месте "${name}" по координатам ${latitude}, ${longitude}:

Если памятник/бюст — КОМУ посвящён, чем известен человек.
Если музей — ЧЕМУ посвящён, что внутри.
Если сквер/парк — в честь кого назван (если известно) или просто "место для отдыха".
Если собор/церковь — когда построен, архитектурный стиль.
Если мост/фонтан — история создания, архитектор.

Только факты. 3-4 предложения. Без "возможно", "к сожалению".

Формат ответа СТРОГО:
🏛️ [ТИП]
[3-4 предложения о месте]

Пример 1:
🏛️ Памятник
Бронзовая фигура поэта Сергея Есенина установлена в 1995 году в Таврическом саду. Памятник изображает поэта в полный рост с томиком стихов в руках. Это одно из самых лиричных мест парка, популярное у поклонников поэзии.

Пример 2:
🏛️ Сквер
Небольшой благоустроенный сквер с лавочками и клумбами. Назван в честь художника Ивана Шишкина. Хорошее место для отдыха в центре города.

Твой ответ:`;

const aiResponse = await callYandexGPT(prompt);

res.json({
    success: true,
    description: aiResponse,
    photoUrl: null,
});

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

// Эндпоинт для чата (ТАКЖЕ ОБНОВЛЕН)
app.post('/api/chat', async (req, res) => {
    console.log('\n📥 /api/chat');
    console.log('Место:', req.body.placeName);
    
    const { placeName, placeDescription, messages } = req.body;
    
    try {
        const lastMessage = messages[messages.length - 1];
        const question = lastMessage.text;
        
        const prompt = `Ты — виртуальный гид. Ты находишься у места "${placeName}". 
Известно о нем следующее: ${placeDescription || 'информация отсутствует'}

**Вопрос от пользователя:** ${question}

**Инструкции для ответа:**
- Твоя задача — ответить на вопрос максимально конкретно и по делу, опираясь на свои знания.
- Если в названии места есть инициалы, используй их так, как они даны, не выдумывай полное имя.
- Будь полезным и дружелюбным гидом. Не используй фразы "к сожалению, я не знаю" или "возможно".
- Если информации недостаточно, скажи: "Точных данных об этом нет, но, судя по всему..."

**Твой ответ:**`;

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
