const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ===== КОНФИГУРАЦИЯ =====
const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || null;

// ===== ФУНКЦИЯ ПОИСКА ФОТО =====
async function searchPhoto(name, lat, lng) {
  try {
    // 1. Wikimedia Commons (бесплатно)
    const commonsUrl = await searchWikimedia(name);
    if (commonsUrl) return commonsUrl;
    
    // 2. Google Maps (если есть ключ)
    if (GOOGLE_API_KEY) {
      const googleUrl = await searchGoogleMaps(name, lat, lng);
      if (googleUrl) return googleUrl;
    }
    
    // 3. Unsplash (если есть ключ)
    if (UNSPLASH_ACCESS_KEY) {
      const unsplashUrl = await searchUnsplash(name);
      if (unsplashUrl) return unsplashUrl;
    }
    
    return null;
  } catch (e) {
    console.error('❌ Ошибка поиска фото:', e.message);
    return null;
  }
}

async function searchWikimedia(query) {
  try {
    const cleanQuery = query.replace(/[А-Я]\.[ ]?[А-Я]\.[ ]?/g, '').replace(/им\./g, '').trim() || query;
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&srnamespace=6&srlimit=5&format=json&origin=*`;
    const response = await axios.get(searchUrl, { timeout: 5000 });
    const searchResults = response.data?.query?.search;
    if (!searchResults || searchResults.length === 0) return null;
    
    const imageTitles = searchResults.filter(r => /\.(jpg|jpeg|png)$/i.test(r.title)).map(r => r.title);
    if (imageTitles.length === 0) return null;
    
    const imageUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(imageTitles[0])}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
    const imageResponse = await axios.get(imageUrl, { timeout: 5000 });
    const pages = imageResponse.data?.query?.pages;
    const firstPage = Object.values(pages)[0];
    return firstPage?.imageinfo?.[0]?.thumburl || firstPage?.imageinfo?.[0]?.url || null;
  } catch (e) {
    return null;
  }
}

async function searchGoogleMaps(name, lat, lng) {
  try {
    const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=100&keyword=${encodeURIComponent(name)}&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(searchUrl, { timeout: 5000 });
    const places = response.data?.results;
    if (!places || places.length === 0) return null;
    const place = places[0];
    if (place.photos && place.photos.length > 0) {
      return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function searchUnsplash(query) {
  try {
    const cleanQuery = query.split(' ').slice(0, 3).join(' ');
    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query: cleanQuery, per_page: 1, orientation: 'landscape' },
      headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      timeout: 5000,
    });
    return response.data?.results?.[0]?.urls?.regular || null;
  } catch (e) {
    return null;
  }
}

// ===== ФУНКЦИЯ ЗАПРОСА К YandexGPT =====
async function callYandexGPT(promptText) {
  console.log('🚀 Отправка запроса к YandexGPT...');
  console.log('📝 Prompt:', promptText.substring(0, 200) + '...');
  
  try {
    const response = await axios.post(
      'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      {
        modelUri: `gpt://${YANDEX_FOLDER_ID}/yandexgpt-lite`,
        completionOptions: { stream: false, temperature: 0.6, maxTokens: 800 },
        messages: [
          { role: 'system', text: 'Ты — эрудированный экскурсовод и краевед. Твоя задача — давать точные, емкие и содержательные ответы о достопримечательностях. Ты умеешь по названию определять тип объекта (памятник, бюст, мемориальная доска, парк, собор и т.д.) и рассказывать о нем самое главное.' },
          { role: 'user', text: promptText },
        ],
      },
      {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Api-Key ${YANDEX_API_KEY}` },
        timeout: 30000,
      }
    );
    
    console.log('✅ YandexGPT ответил успешно');
    return response.data.result.alternatives[0].message.text;
  } catch (error) {
    console.error('❌ YandexGPT ошибка:', error.message);
    throw error;
  }
}

// ===== ЭНДПОИНТ: ИНФОРМАЦИЯ О МЕСТЕ =====
app.post('/api/place-info', async (req, res) => {
  console.log('\n📥 /api/place-info');
  console.log('Название:', req.body.name);
  
  const { name, description, latitude, longitude } = req.body;
  
  try {
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
Бронзовая фигура поэта Сергея Есенина установлена в 1995 году в Таврическом саду. Памятник изображает поэта в полный рост с томиком стихов в руках. Это одно из самых лиричных мест парка.

Пример 2:
🏛️ Сквер
Небольшой благоустроенный сквер с лавочками и клумбами. Назван в честь художника Ивана Шишкина. Хорошее место для отдыха в центре города.

Твой ответ:`;

    // 🔥 ЗАПУСКАЕМ ПАРАЛЛЕЛЬНО: ИИ + ПОИСК ФОТО
    const [aiResponse, photoUrl] = await Promise.all([
      callYandexGPT(prompt),
      searchPhoto(name, latitude, longitude)
    ]);
    
    console.log('📸 Фото:', photoUrl ? 'найдено' : 'не найдено');
    
    res.json({
      success: true,
      description: aiResponse,
      photoUrl: photoUrl,
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

// ===== ЭНДПОИНТ: ЧАТ =====
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
- Ответь на вопрос максимально конкретно и по делу.
- Будь полезным и дружелюбным гидом. Не используй фразы "к сожалению, я не знаю" или "возможно".
- Если информации недостаточно, скажи: "Точных данных об этом нет, но, судя по всему..."

**Твой ответ:**`;

    const aiResponse = await callYandexGPT(prompt);
    
    res.json({ success: true, response: aiResponse });
    
  } catch (error) {
    console.error('❌ Ошибка чата:', error.message);
    res.status(500).json({ success: false, response: 'Извините, произошла ошибка. Попробуйте позже.' });
  }
});

// ===== ТЕСТ =====
app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'Сервер работает' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
