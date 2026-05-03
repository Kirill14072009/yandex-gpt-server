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
    const translitName = transliterate(name);
    
    // 🔥 1. GOOGLE MAPS (самый точный — по координатам)
    if (GOOGLE_API_KEY && lat && lng) {
      console.log('🔍 Google Maps...');
      const photoUrl = await searchGoogleMaps(name, lat, lng);
      if (photoUrl) { console.log('✅ Google Maps найдено'); return photoUrl; }
    }
    
    // 🔥 2. UNSPLASH (качественные фото)
    if (UNSPLASH_ACCESS_KEY) {
      console.log('🔍 Unsplash (оригинал)...');
      let photoUrl = await searchUnsplash(name);
      if (photoUrl) { console.log('✅ Unsplash найдено'); return photoUrl; }
      
      if (translitName !== name) {
        console.log('🔍 Unsplash (транслит)...');
        photoUrl = await searchUnsplash(translitName);
        if (photoUrl) { console.log('✅ Unsplash (транслит) найдено'); return photoUrl; }
      }
    }
    
    // 🔥 3. WIKIMEDIA (бесплатно, но менее точно)
    console.log('🔍 Wikimedia (оригинал)...');
    let photoUrl = await searchWikimedia(name);
    if (photoUrl) { console.log('✅ Wikimedia найдено'); return photoUrl; }
    
    if (translitName !== name) {
      console.log('🔍 Wikimedia (транслит)...');
      photoUrl = await searchWikimedia(translitName);
      if (photoUrl) { console.log('✅ Wikimedia (транслит) найдено'); return photoUrl; }
    }
    
    console.log('❌ Фото не найдено');
    return null;
  } catch (e) {
    console.error('❌ Ошибка поиска фото:', e.message);
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
          { role: 'system', text: 'Ты — эрудированный экскурсовод и краевед. Давай точные и содержательные ответы о достопримечательностях.' },
          { role: 'user', text: promptText },
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
    const prompt = `Ты — экскурсовод. Расскажи о достопримечательности: "${name}".

Координаты: ${latitude}, ${longitude}
${description ? `Описание из базы: ${description}` : ''}

ОПРЕДЕЛИ ТИП МЕСТА (одно-два слова): Памятник, Бюст, Мемориальная доска, Парк, Сквер, Музей, Собор, Церковь, Театр, Библиотека, Мост, Фонтан, Дворец, Усадьба, Крепость, Мемориал.

Напиши 3-4 предложения О КОНКРЕТНОМ месте "${name}" по координатам ${latitude}, ${longitude}.

Формат:
🏛️ [ТИП]
[3-4 предложения]

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
