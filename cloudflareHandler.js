const { R2 } = require('node-cloudflare-r2');
require('dotenv').config(); // Для использования переменных окружения

// Инициализация клиента R2
const r2 = new R2({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
  secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
});

// Создаем объект bucket для работы с конкретным бакетом
const bucket = r2.bucket(process.env.CLOUDFLARE_BUCKET_NAME);

/**
 * Словарь MIME-типов для различных форматов изображений
 */
const imageMimeTypes = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  'svg': 'image/svg+xml',
  // Добавьте другие типы по необходимости
};

/**
 * Функция для определения MIME-типа на основе расширения или файла
 * @param {string} extension - Расширение файла
 * @param {string} mimeType - MIME-тип из файла (если доступен)
 * @returns {string} - Соответствующий MIME-тип
 */
function getContentType(extension, mimeType) {
  if (mimeType && mimeType.startsWith('image/')) {
    return mimeType; // Используем MIME-тип из файла, если он указан и является изображением
  }
  return imageMimeTypes[extension.toLowerCase()] || 'application/octet-stream'; // По умолчанию, если тип неизвестен
}

/**
 * Функция для загрузки изображений в Cloudflare R2 и получения ссылок
 * @param {Array<Object>} imageArray - Массив объектов с полем photo (массив объектов файлов от multer)
 * @returns {Promise<Array<Object>>} - Массив с замененными ссылками в поле photo
 */
async function uploadImagesToCloudflare(imageArray) {
  try {
    const processedImages = await Promise.all(imageArray.map(async (item) => {
      // Пропускаем, если нет поля photo или оно пустое
      if (!item.photo || !Array.isArray(item.photo) || item.photo.length === 0) {
        return item;
      }

      // Обрабатываем каждый элемент массива photo (объекты файлов от multer)
      const uploadedUrls = await Promise.all(item.photo.map(async (file) => {
        let fileBuffer = file.buffer; // Буфер файла из multer
        let contentType = getContentType(file.originalname.split('.').pop() || 'bin', file.mimetype); // Определяем тип на основе расширения и MIME

        if (!fileBuffer) {
          console.warn(`Пропущен недействительный файл: ${file.originalname}`);
          return null;
        }

        // Генерация уникального имени файла с учетом оригинального расширения
        const extension = contentType.split('/')[1] || 'bin';
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;

        // Загрузка в R2
        await bucket.upload(fileBuffer, fileName, { contentType });

        // Формирование публичного URL
        const publicUrl = `https://pub-2e445ccba02f4257a880ead839401784.r2.dev/${fileName}`;

        return publicUrl;
      }).filter(url => url !== null)); // Фильтруем null-значения

      // Возвращаем новый объект с замененным массивом URL-адресов
      return {
        ...item,
        photo: uploadedUrls,
      };
    }));

    return processedImages;
  } catch (error) {
    console.error('Ошибка при загрузке изображений в Cloudflare:', error);
    throw new Error('Не удалось обработать изображения');
  }
}

module.exports = { uploadImagesToCloudflare };