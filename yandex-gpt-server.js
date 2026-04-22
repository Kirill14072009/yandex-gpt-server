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
        const prompt = `Я показываю тебе достопримечательность с названием "${name}". 

Твоя задача — определить по названию, что это за объект, и дать краткую, но емкую историческую справку.

**Пожалуйста, проанализируй название и действуй по следующему алгоритму:**
1.  **Определи тип объекта:** Это памятник, бюст, мемориальная доска, парк, сквер, музей, собор или что-то другое? Напиши это **одним-двумя словами** в самом начале.
2.  **Не расшифровывай инициалы, если не уверен:** Если в названии есть инициалы ("В.И. Ленин", "А.С. Пушкин"), **не пытайся угадать или найти полное имя**. Используй то написание, которое дано в названии.
3.  **Расскажи суть:** Кем был этот человек (если это памятник) или чем примечательно это место? В чем его главная особенность или "фишка"?
4.  **Что можно увидеть?** Опиши, что именно представляет собой объект, на что стоит обратить внимание.
5.  **Почему стоит посетить?** В двух словах, почему это место интересно.

**Формат ответа СТРОГО:**
📜 **Название:** [Краткое и точное название места, как на табличке]
🏛️ **Тип:** [Одно-два слова: Памятник, Бюст, Мемориальная доска, Парк, Музей и т.д.]
✨ **Особенность:** [1-2 предложения о главной особенности. Кому посвящен или чем знаменит]
🗺️ **Что увидите:** [1 предложение о том, что конкретно можно рассмотреть]
💫 **Зачем идти:** [1 предложение о ценности этого места]

**Пример 1:**
Запрос: "Памятник В.И. Ленину"
📜 **Название:** Памятник В.И. Ленину
🏛️ **Тип:** Памятник
✨ **Особенность:** Типичный памятник вождю мирового пролетариата, часто являющийся композиционным центром главной площади города.
🗺️ **Что увидите:** Бронзовая фигура в характерной позе на гранитном постаменте.
💫 **Зачем идти:** Чтобы прикоснуться к истории СССР и увидеть классику монументальной пропаганды.

**Пример 2:**
Запрос: "Павловский парк"
📜 **Название:** Павловский парк
🏛️ **Тип:** Пейзажный парк
✨ **Особенность:** Один из крупнейших и живописнейших пейзажных парков Европы, часть дворцово-паркового ансамбля.
🗺️ **Что увидите:** Романтические руины, извилистые дорожки, реку Славянку и бескрайние зеленые просторы.
💫 **Зачем идти:** Идеальное место для долгих прогулок, наслаждения природой и уникальной атмосферой.

${description ? `**Доп. информация из базы:** ${description}` : ''}
${latitude && longitude ? `**Координаты:** ${latitude}, ${longitude}` : ''}

**Твой ответ:**`;

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
