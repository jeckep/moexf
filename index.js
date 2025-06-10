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

  // Получаем индексы
  const sampleUrl = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${ticker}.json?from=2025-01-01&till=2025-01-10`;
  const sampleResp = await fetch(sampleUrl);
  const sampleData = await sampleResp.json();
  const columns = sampleData.history.columns;
  const tradeDateIdx = columns.indexOf('TRADEDATE');
  const settlePriceIdx = columns.indexOf('SETTLEPRICE');
  const swapRateIdx = columns.indexOf('SWAPRATE');

  // Все нужные даты — от today - (monthCount + 12) месяцев
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(now);
  start.setMonth(start.getMonth() - (monthCount + 12));
  const fromStr = start.toISOString().slice(0, 10);
  const tillStr = now.toISOString().slice(0, 10);

  // Получаем все строки
  const allRows = await fetchAllRowsMoexForts(fromStr, tillStr, 4);

  // --- Для месячного графика ---
  const months = [];
  for (let i = 0; i < monthCount + 12; ++i) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(m);
  }

  const monthsData = [];
  for (let i = 0; i < monthCount + 12; ++i) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const from = monthStart.toISOString().slice(0, 10);
    const till = new Date(nextMonthStart - 1).toISOString().slice(0, 10);
    const rows = allRows.filter(r => r[tradeDateIdx] >= from && r[tradeDateIdx] <= till);
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

  // --- Для скользящего графика по дням ---
  const dailyData = allRows
      .filter(r => r[settlePriceIdx] && r[swapRateIdx])
      .map(r => ({
        date: r[tradeDateIdx],
        percent: (r[swapRateIdx] / r[settlePriceIdx]) * 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

  const rollingDaily = [];
  const dateMap = new Map(dailyData.map(d => [d.date, d.percent]));

  const parseDate = s => new Date(s);
  const formatDate = d => d.toISOString().slice(0, 10);
  const subtractYear = d => {
    const copy = new Date(d);
    copy.setFullYear(copy.getFullYear() - 1);
    return copy;
  };

  for (let i = dailyData.length - 1; i >= 0; --i) {
    const endDate = parseDate(dailyData[i].date);
    const startDate = subtractYear(endDate);
    const windowStart = formatDate(startDate);
    const windowEnd = formatDate(endDate);
    const sum = dailyData
        .filter(d => d.date >= windowStart && d.date <= windowEnd)
        .reduce((acc, d) => acc + d.percent, 0);
    rollingDaily.unshift({
      date: dailyData[i].date,
      yearSum: Number(sum.toFixed(3))
    });

    // Ограничим по числу месяцев
    const cutoffDate = new Date(now);
    cutoffDate.setMonth(cutoffDate.getMonth() - monthCount);
    if (endDate < cutoffDate) break;
  }

  return {
    monthly: monthlyLast,
    rolling: rollingDaily
  };
}
