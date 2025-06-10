const axios = require('axios');

// Функция для форматирования даты в YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Функция для расчета фандинга
async function calculateFundingStats() {
    try {
        // 1. Определяем даты для запроса (последние 7 месяцев)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 7);

        // 2. Формируем URL запроса
        const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/CNYRUBF.json?from=${formatDate(startDate)}&till=${formatDate(endDate)}`;

        // 3. Запрашиваем данные с MOEX API
        const response = await axios.get(url);
        const data = response.data;

        // 4. Извлекаем исторические данные
        const historyData = data.history.data;
        if (!historyData || historyData.length === 0) {
            console.log("Нет данных для анализа");
            return;
        }

        // 5. Группируем данные по месяцам и рассчитываем сумму фандинга
        const monthlyFunding = {};

        historyData.forEach(record => {
            const tradeDate = record[1];  // Дата в формате YYYY-MM-DD
            const swapRate = record[12];  // Значение SWAPRATE

            if (!tradeDate || swapRate === undefined) return;

            // Извлекаем месяц в формате YYYY-MM
            const month = tradeDate.substring(0, 7);

            // Суммируем абсолютные значения фандинга
            if (!monthlyFunding[month]) {
                monthlyFunding[month] = 0;
            }
            monthlyFunding[month] += Math.abs(swapRate);
        });

        // 6. Сортируем месяцы по убыванию (от свежих к старым)
        const sortedMonths = Object.keys(monthlyFunding)
            .sort()
            .reverse()
            .slice(0, 7);  // Берем максимум 7 последних месяцев

        // 7. Рассчитываем накопительные суммы
        const cumulativeFunding = {};
        let runningTotal = 0;

        sortedMonths.forEach((month, index) => {
            runningTotal += monthlyFunding[month];
            cumulativeFunding[index + 1] = runningTotal;
        });

        // 8. Выводим результаты
        console.log("Статистика фандинга по фьючерсу CNYRUBF:");
        for (let months = 1; months <= Math.min(7, sortedMonths.length); months++) {
            console.log(`За последние ${months} месяц(ев): ${cumulativeFunding[months].toFixed(5)}%`);
        }

    } catch (error) {
        console.error('Ошибка при получении или обработке данных:', error.message);
    }
}

// Запускаем расчет
calculateFundingStats();
