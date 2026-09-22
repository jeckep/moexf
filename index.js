// Вечные фьючерсы, котируемые в долларах: SETTLEPRICE в USD, а SWAPRATE — в рублях,
// поэтому долю от позиции считаем только после приведения цены к рублям по курсу дня.
const USD_QUOTED = new Set([
  'SP500F', 'QQQF',
  'AMDF', 'AMZNF', 'APPF', 'BSXF', 'CMGF', 'COHRF', 'COINF', 'CRWDF', 'CVNAF', 'DASHF',
  'HOODF', 'LITEF', 'LULUF', 'NBISF', 'NFLXF', 'PANWF', 'SMCIF', 'SNDKF', 'TSLAF', 'UBERF',
  'BTCUSDF', 'ETHUSDF', 'SOLUSDF', 'TRXUSDF', 'XRPUSDF'
]);

export async function fetchMonthlyFundingWithCalendarRolling(monthCount = 12, ticker = 'CNYRUBF') {
  async function fetchAllRowsMoexFortsBackwards(ticker, maxMonthsBack = 60, chunkMonths = 4) {
    const now = new Date();
    let rows = [];
    let currentTill = new Date(now);
    let oldestDate = null;

    for (let i = 0; i < maxMonthsBack; i += chunkMonths) {
      const currentFrom = new Date(currentTill);
      currentFrom.setMonth(currentFrom.getMonth() - chunkMonths);
      const fromStr = currentFrom.toISOString().slice(0, 10);
      const tillStr = currentTill.toISOString().slice(0, 10);

      const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${ticker}.json?from=${fromStr}&till=${tillStr}`;
      const resp = await fetch(url);
      if (!resp.ok) break;

      const data = await resp.json();
      const chunk = data.history?.data ?? [];

      if (!chunk.length) break;

      rows.unshift(...chunk); // prepend — данные должны идти от старых к новым
      oldestDate = chunk[0][data.history.columns.indexOf('TRADEDATE')];
      currentTill = new Date(currentFrom);
      currentTill.setDate(currentTill.getDate() - 1);
    }

    return { rows, oldestDate };
  }

  // Settle-цена USDRUBF совпадает с фиксингом MOEX USDFIXME до сотых,
  // но достаётся тем же запросом, что и остальные данные.
  async function fetchUsdRubByDate(fromStr, tillStr) {
    const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/USDRUBF.json?from=${fromStr}&till=${tillStr}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('не удалось загрузить курс USD/RUB');

    const data = await resp.json();
    const cols = data.history.columns;
    const dateIdx = cols.indexOf('TRADEDATE');
    const priceIdx = cols.indexOf('SETTLEPRICE');

    const rates = new Map();
    for (const row of data.history.data) {
      if (row[priceIdx]) rates.set(row[dateIdx], row[priceIdx]);
    }
    return rates;
  }

  // Индексы столбцов
  const sampleUrl = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${ticker}.json?from=2025-01-01&till=2025-01-10`;
  const sampleResp = await fetch(sampleUrl);
  const sampleData = await sampleResp.json();
  const columns = sampleData.history.columns;
  const tradeDateIdx = columns.indexOf('TRADEDATE');
  const settlePriceIdx = columns.indexOf('SETTLEPRICE');
  const swapRateIdx = columns.indexOf('SWAPRATE');

  // Дата сейчас и загрузка всех строк
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const { rows: allRows, oldestDate } = await fetchAllRowsMoexFortsBackwards(ticker);
  const oldest = new Date(oldestDate);
  oldest.setHours(0, 0, 0, 0);

  if (USD_QUOTED.has(ticker) && allRows.length) {
    const rates = await fetchUsdRubByDate(oldestDate, now.toISOString().slice(0, 10));
    const known = [...rates.keys()].sort();
    if (!known.length) throw new Error('нет данных по курсу USD/RUB');

    // allRows идут от старых к новым: у долларовых контрактов есть сессия выходного дня,
    // курса за такой день нет — тянем последний известный.
    let rate = rates.get(known[0]);
    for (const row of allRows) {
      rate = rates.get(row[tradeDateIdx]) ?? rate;
      if (row[settlePriceIdx]) row[settlePriceIdx] *= rate;
    }
  }

  // --- Месячный фандинг ---
  const startDateMonthly = new Date(now);
  startDateMonthly.setMonth(now.getMonth() - monthCount);
  const actualStartDate = oldest > startDateMonthly ? oldest : startDateMonthly;
  // Тикер мог начать торговаться в середине месяца — иначе этот месяц выпадает из выборки.
  const actualStartMonth = new Date(actualStartDate.getFullYear(), actualStartDate.getMonth(), 1);

  const monthsData = [];
  let current = new Date(now.getFullYear(), now.getMonth(), 1);

  while (current >= actualStartMonth) {
    const monthStart = new Date(current);
    const nextMonthStart = new Date(current);
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

    const from = monthStart.toISOString().slice(0, 10);
    const till = new Date(nextMonthStart - 1).toISOString().slice(0, 10);

    const monthRows = allRows.filter(r => r[tradeDateIdx] >= from && r[tradeDateIdx] <= till);
    if (!monthRows.length) {
      monthsData.unshift({
        month: monthStart.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }),
        percent: 0
      });
    } else {
      let sumSwap = 0;
      let firstSettle = monthRows[0][settlePriceIdx];
      for (const row of monthRows) {
        sumSwap += row[swapRateIdx];
      }
      const percent = (sumSwap / firstSettle) * 100;
      monthsData.unshift({
        month: monthStart.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }),
        percent: Number(percent.toFixed(3))
      });
    }

    current.setMonth(current.getMonth() - 1);
  }

  // --- Скользящий фандинг ---
  const dailyData = allRows
      .filter(r => r[settlePriceIdx] && r[swapRateIdx])
      .map(r => ({
        date: r[tradeDateIdx],
        percent: (r[swapRateIdx] / r[settlePriceIdx]) * 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

  const rollingDaily = [];
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

    if (startDate < oldest) break;

    const windowStart = formatDate(startDate);
    const windowEnd = formatDate(endDate);

    const sum = dailyData
        .filter(d => d.date >= windowStart && d.date <= windowEnd)
        .reduce((acc, d) => acc + d.percent, 0);

    rollingDaily.unshift({
      date: dailyData[i].date,
      yearSum: Number(sum.toFixed(3))
    });
  }

  // --- Накопленный фандинг от текущего месяца назад ---
  const cumulative = [];
  let acc = 0;
  for (let i = monthsData.length - 1; i >= 0; i--) {
    acc += monthsData[i].percent;
    cumulative.unshift(Number(acc.toFixed(3)));
  }

  // --- Дневной фандинг за последние 30 дней ---
  const last30 = dailyData.slice(-30);
  const dailyFunding = last30.map(d => ({
    date: d.date,
    percent: Number(d.percent.toFixed(3))
  }));

  return {
    monthly: monthsData.slice(-monthCount),
    rolling: rollingDaily,
    cumulative,
    daily: dailyFunding
  };
}
