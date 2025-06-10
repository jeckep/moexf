export async function fetchMonthlyFundingWithCalendarRolling(monthCount = 12, ticker = 'CNYRUBF') {
  async function fetchAllRowsMoexForts(from, till, chunkMonths = 4) {
    let rows = [];
    let currentFrom = new Date(from);
    let tillDate = new Date(till);
    while (currentFrom < tillDate) {
      let currentTill = new Date(currentFrom);
      currentTill.setMonth(currentTill.getMonth() + chunkMonths);
      if (currentTill > tillDate) currentTill = tillDate;
      const fStr = currentFrom.toISOString().slice(0, 10);
      const tStr = currentTill.toISOString().slice(0, 10);
      const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${ticker}.json?from=${fStr}&till=${tStr}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Ошибка загрузки: ' + url);
      const data = await resp.json();
      if (data.history && data.history.data) {
        rows.push(...data.history.data);
      }
      currentFrom = new Date(currentTill);
      currentFrom.setDate(currentFrom.getDate() + 1);
    }
    return rows;
  }

  // Получаем индексы столбцов
  const sampleUrl = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${ticker}.json?from=2025-01-01&till=2025-01-10`;
  const sampleResp = await fetch(sampleUrl);
  const sampleData = await sampleResp.json();
  const columns = sampleData.history.columns;
  const tradeDateIdx = columns.indexOf('TRADEDATE');
  const settlePriceIdx = columns.indexOf('SETTLEPRICE');
  const swapRateIdx = columns.indexOf('SWAPRATE');

  // Даты, которые нужно покрыть
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const totalMonths = monthCount + 12;
  const months = [];
  for (let i = 0; i < totalMonths; ++i) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(month);
  }
  const earliest = months[months.length - 1];
  const fromStr = earliest.toISOString().slice(0, 10);
  const tillStr = now.toISOString().slice(0, 10);

  // Загружаем все строки
  const allRows = await fetchAllRowsMoexForts(fromStr, tillStr, 4);

  // --- Для месячного графика (баров) ---
  const monthsData = [];
  for (let i = 0; i < months.length - 1; ++i) {
    const monthStart = months[i];
    const nextMonthStart = months[i - 1] || new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const from = monthStart.toISOString().slice(0, 10);
    const till = new Date(nextMonthStart - 1).toISOString().slice(0, 10);

    const rows = allRows.filter(row =>
        row[tradeDateIdx] >= from && row[tradeDateIdx] <= till
    );
    if (!rows.length) {
      monthsData.unshift({
        month: monthStart.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }),
        percent: 0
      });
      continue;
    }
    let sumSwap = 0;
    let firstSettle = rows[0][settlePriceIdx];
    for (const row of rows) {
      sumSwap += row[swapRateIdx];
    }
    const percent = (sumSwap / firstSettle) * 100;
    monthsData.unshift({
      month: monthStart.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }),
      percent: Number(percent.toFixed(3))
    });
  }

  const monthlyLast = monthsData.slice(-monthCount);

  // --- Для дневного rolling-графика ---
  const dailyData = [];
  for (const row of allRows) {
    const tradeDate = row[tradeDateIdx];
    const settlePrice = row[settlePriceIdx];
    const swapRate = row[swapRateIdx];
    if (!settlePrice || !swapRate) continue;
    const percent = (swapRate / settlePrice) * 100;
    dailyData.push({ date: tradeDate, percent });
  }

  // Сортировка на всякий случай
  dailyData.sort((a, b) => a.date.localeCompare(b.date));

  // Скользящая сумма за 12 месяцев
  const rollingDaily = [];
  const oneYearAgo = date => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  };

  for (let i = 0; i < dailyData.length; ++i) {
    const currentDate = dailyData[i].date;
    const startDate = oneYearAgo(currentDate);
    const sum = dailyData
        .filter(d => d.date >= startDate && d.date <= currentDate)
        .reduce((acc, d) => acc + d.percent, 0);
    rollingDaily.push({
      date: currentDate,
      yearSum: Number(sum.toFixed(3))
    });
  }

  return { monthly: monthlyLast, rolling: rollingDaily };
}
