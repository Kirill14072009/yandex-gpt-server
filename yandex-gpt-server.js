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

// ===== ТРАНСЛИТЕРАЦИЯ =====
function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };
  return text.split('').map(c => map[c] || c).join('');
}

// ===== ФУНКЦИЯ ПОИСКА ФОТО (ВСЕ ИСТОЧНИКИ) =====
async function searchPhoto(name, lat, lng) {
  try {
    // 🔥 1. Wikipedia Geo Search — ищем статью по координатам
    const wikiPhoto = await searchWikipediaByCoords(lat, lng);
    if (wikiPhoto) return wikiPhoto;
    
    // 🔥 2. Wikipedia по названию
    const wikiPhotoByName = await searchWikipediaByName(name);
    if (wikiPhotoByName) return wikiPhotoByName;
    
    // 🔥 3. Wikimedia Commons (в последнюю очередь)
    const translitName = transliterate(name);
    let photoUrl = await searchWikimedia(name);
    if (photoUrl) return photoUrl;
    
    if (translitName !== name) {
      photoUrl = await searchWikimedia(translitName);
      if (photoUrl) return photoUrl;
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// 🔥 ПОИСК ПО КООРДИНАТАМ ЧЕРЕЗ WIKIPEDIA
async function searchWikipediaByCoords(lat, lng) {
  try {
    // Ищем статьи рядом с координатами
    const url = `https://ru.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=100&gslimit=3&format=json&origin=*`;
    const response = await axios.get(url, { timeout: 5000 });
    const pages = response.data?.query?.geosearch;
    
    if (!pages || pages.length === 0) return null;
    
    // Берём первую статью и ищем её главное фото
    const pageId = pages[0].pageid;
    const imageUrl = `https://ru.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=pageimages&pithumbsize=800&format=json&origin=*`;
    const imageResponse = await axios.get(imageUrl, { timeout: 5000 });
    const page = imageResponse.data?.query?.pages?.[pageId];
    
    return page?.thumbnail?.source || null;
  } catch (e) {
    return null;
  }
}

// 🔥 ПОИСК ПО НАЗВАНИЮ ЧЕРЕЗ WIKIPEDIA
async function searchWikipediaByName(name) {
  try {
    // Ищем статью по названию
    const searchUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=3&format=json&origin=*`;
    const response = await axios.get(searchUrl, { timeout: 5000 });
    const results = response.data?.query?.search;
    
    if (!results || results.length === 0) return null;
    
    // Берём первую статью и ищем фото
    const pageId = results[0].pageid;
    const imageUrl = `https://ru.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=pageimages&pithumbsize=800&format=json&origin=*`;
    const imageResponse = await axios.get(imageUrl, { timeout: 5000 });
    const page = imageResponse.data?.query?.pages?.[pageId];
    
    return page?.thumbnail?.source || null;
  } catch (e) {
    return null;
  }
}

async function searchWikimedia(query) {
  try {
    const cleanQuery = encodeURIComponent(query.replace(/[^\w\s]/g, '').trim());
    if (!cleanQuery || cleanQuery.length < 3) return null;
    
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${cleanQuery}&srnamespace=6&srlimit=5&format=json&origin=*`;
    const response = await axios.get(searchUrl, { timeout: 8000 });
    const searchResults = response.data?.query?.search;
    if (!searchResults || searchResults.length === 0) return null;
    
    const imageTitles = searchResults.filter(r => /\.(jpg|jpeg|png)$/i.test(r.title)).map(r => r.title);
    if (imageTitles.length === 0) return null;
    
    const imageUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(imageTitles[0])}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
    const imageResponse = await axios.get(imageUrl, { timeout: 8000 });
    const pages = imageResponse.data?.query?.pages;
    const firstPage = Object.values(pages)[0];
    return firstPage?.imageinfo?.[0]?.thumburl || firstPage?.imageinfo?.[0]?.url || null;
  } catch (e) {
    return null;
  }
}

// ===== YandexGPT =====
async function callYandexGPT(promptText) {
  console.log('🚀 YandexGPT запрос...');
  try {
    const response = await axios.post(
      'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      {
        modelUri: `gpt://${YANDEX_FOLDER_ID}/yandexgpt-lite`,
        completionOptions: { stream: false, temperature: 0.6, maxTokens: 800 },
        messages: [
  {
    role: 'system',
    text: 'Ты — профессиональный экскурсовод и историк. Твоя задача — давать нейтральную историческую справку о достопримечательностях. Отвечай строго в рамках исторических фактов, без политических оценок. Не используй фразы "я не могу обсуждать", "это чувствительная тема". Если место связано с исторической личностью — расскажи общепризнанные исторические факты.'
  },
  {
    role: 'user',
    text: promptText,
  },
],
      },
      {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Api-Key ${YANDEX_API_KEY}` },
        timeout: 30000,
      }
    );
    console.log('✅ YandexGPT ответил');
    return response.data.result.alternatives[0].message.text;
  } catch (error) {
    console.error('❌ YandexGPT:', error.message);
    throw error;
  }
}

// ===== ЭНДПОИНТЫ =====
app.post('/api/place-info', async (req, res) => {
  const { name, description, latitude, longitude } = req.body;
  console.log(`\n📥 ${name}`);
  
  try {
    const prompt = `Расскажи об объекте "${name}" (${latitude}, ${longitude}).

Это не политический вопрос. Это запрос туристической информации о местонахождении достопримечательности.

Напиши: что это за объект, когда создан, кто автор, из какого материала.

Формат:
🏛️ [ТИП]
[2-3 предложения фактов];

Твой ответ:`;

    const [aiResponse, photoUrl] = await Promise.all([
      callYandexGPT(prompt),
      searchPhoto(name, latitude, longitude)
    ]);
    
    console.log('📸 Фото:', photoUrl ? 'найдено' : 'не найдено');
    
    res.json({ success: true, description: aiResponse, photoUrl });
  } catch (error) {
    res.status(500).json({ success: false, description: 'Ошибка. Попробуйте позже.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { placeName, placeDescription, messages } = req.body;
  const question = messages[messages.length - 1].text;
  
  try {
    const prompt = `Ты — гид у места "${placeName}". ${placeDescription || ''}\nВопрос: ${question}\nОтветь конкретно и по делу.`;
    const aiResponse = await callYandexGPT(prompt);
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    res.status(500).json({ success: false, response: 'Ошибка.' });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер на порту ${PORT}`);
});
