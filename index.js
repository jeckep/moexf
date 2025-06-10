export async function fetchMonthlyFunding(monthCount = 12, ticker = 'CNYRUBF') {
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

  // Получаем индексы (разово)
  const sampleUrl = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${ticker}.json?from=2025-01-01&till=2025-01-10`;
  const sampleResp = await fetch(sampleUrl);
  const sampleData = await sampleResp.json();
  const columns = sampleData.history.columns;
  const tradeDateIdx = columns.indexOf('TRADEDATE');
  const settlePriceIdx = columns.indexOf('SETTLEPRICE');
  const swapRateIdx = columns.indexOf('SWAPRATE');

  // Месяцы от текущего назад
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const months = [];
  for (let i = 0; i < monthCount; ++i) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(month);
  }
  const earliest = months[months.length - 1];
  const fromStr = earliest.toISOString().slice(0, 10);
  const tillStr = now.toISOString().slice(0, 10);

  // Получаем все строки (по месяцам)
  const allRows = await fetchAllRowsMoexForts(fromStr, tillStr, 4);

  // Для каждого месяца считаем фандинг отдельно
  const monthly = [];
  for (let i = 0; i < months.length; ++i) {
    const monthStart = months[i];
    const nextMonthStart = i > 0 ? months[i-1] : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const from = monthStart.toISOString().slice(0, 10);
    const till = new Date(nextMonthStart - 1).toISOString().slice(0, 10);

    const rows = allRows.filter(row =>
        row[tradeDateIdx] >= from && row[tradeDateIdx] <= till
    );
    if (!rows.length) {
      monthly.unshift({
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
    monthly.unshift({
      month: monthStart.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }),
      percent: Number(percent.toFixed(3))
    });
  }
  return monthly;
}
