async function fetchMoexFundingStats() {
  // 1. Получаем данные
  const url = 'https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/CNYRUBF.json?from=2025-01-01&till=2025-06-10';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Ошибка загрузки данных MOEX');
  const data = await response.json();

  // 2. Достаем нужные массивы
  const columns = data.history.columns;
  const rows = data.history.data;

  // 3. Индексы нужных колонок
  const tradeDateIdx = columns.indexOf('TRADEDATE');
  const swapRateIdx = columns.indexOf('SWAPRATE');
  const settlePriceIdx = columns.indexOf('SETTLEPRICE');

  // 4. Дата последней строки
  const dates = rows.map(row => row[tradeDateIdx]);
  const lastDate = new Date(dates[dates.length - 1]);

  // 5. Группируем по месяцам
  function isInLastNMonths(dateStr, months) {
    const d = new Date(dateStr);
    const cmp = new Date(lastDate);
    cmp.setMonth(cmp.getMonth() - months);
    return d > cmp;
  }

  // 6. Функция для подсчета по N месяцам
  function sumFunding(months) {
    let sum = 0, cnt = 0, firstSettlePrice = null;
    for (let i = 0; i < rows.length; ++i) {
      const row = rows[i];
      const dateStr = row[tradeDateIdx];
      if (isInLastNMonths(dateStr, months)) {
        sum += row[swapRateIdx];
        if (firstSettlePrice === null) firstSettlePrice = row[settlePriceIdx];
        cnt++;
      }
    }
    // Берем цену первого дня из диапазона как базу для процентов (альтернативы ниже)
    return {
      sum,
      basePrice: firstSettlePrice
    };
  }

  // 7. Считаем статистики для 1-7 месяцев
  const result = [];
  for (let m = 1; m <= 7; ++m) {
    const {sum, basePrice} = sumFunding(m);
    // Можно брать за базу среднюю цену или цену первого дня (обычно используют цену входа)
    // Фандинг по сути дневной процент, т.е. процент за день. Сумма по диапазону — это накопленный процент.
    const percent = (sum / basePrice) * 100;
    result.push(Number(percent.toFixed(3))); // округляем для красоты
  }
  return result;
}

fetchMoexFundingStats().then(console.log);
// Пример вывода: [0.24, 0.51, ...] (фандинг в % за 1-7 месяцев)
