async function fetchAllRowsCNYRUBF(from, till, chunkMonths = 4) {
  // Разбиваем диапазон на куски по chunkMonths месяцев
  let rows = [];
  let currentFrom = new Date(from);
  let tillDate = new Date(till);
  while (currentFrom < tillDate) {
    let currentTill = new Date(currentFrom);
    currentTill.setMonth(currentTill.getMonth() + chunkMonths);
    if (currentTill > tillDate) currentTill = tillDate;
    const fStr = currentFrom.toISOString().slice(0, 10);
    const tStr = currentTill.toISOString().slice(0, 10);

    const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/CNYRUBF.json?from=${fStr}&till=${tStr}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Ошибка загрузки: ' + url);
    const data = await resp.json();
    if (data.history && data.history.data) {
      rows.push(...data.history.data);
    }
    // Следующий кусок
    currentFrom = new Date(currentTill);
    currentFrom.setDate(currentFrom.getDate() + 1); // чтобы не было наложений
  }
  return rows;
}

async function fetchFundingLastNMonths(n) {
  // 1. Получаем колонки (разово, любой короткий запрос)
  const sampleUrl = 'https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/CNYRUBF.json?from=2025-01-01&till=2025-01-10';
  const sampleResp = await fetch(sampleUrl);
  const sampleData = await sampleResp.json();
  const columns = sampleData.history.columns;
  const tradeDateIdx = columns.indexOf('TRADEDATE');
  const settlePriceIdx = columns.indexOf('SETTLEPRICE');
  const swapRateIdx = columns.indexOf('SWAPRATE');

  // 2. Формируем даты для выборки (сейчас — до сегодняшнего дня)
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const tillStr = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  const fromStr = fromDate.toISOString().slice(0, 10);

  // 3. Получаем все строки за нужный диапазон короткими запросами (по 4 месяца)
  const allRows = await fetchAllRowsCNYRUBF(fromStr, tillStr, 4);

  // 4. Строим периоды для расчёта (кумулятивно — последний месяц, два, ... n)
  const periods = [];
  for (let i = 1; i <= n; ++i) {
    const periodFrom = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    periods.push({
      from: periodFrom.toISOString().slice(0, 10),
      till: tillStr
    });
  }

  // 5. Считаем фандинг для каждого периода и печатаем результат
  const results = [];
  for (const {from, till} of periods) {
    const rows = allRows.filter(row =>
        row[tradeDateIdx] >= from && row[tradeDateIdx] <= till
    );
    if (!rows.length) {
      console.log(`С ${from} по ${till} фандинг составил: 0% (нет данных)`);
      results.push(0);
      continue;
    }
    let sumSwap = 0;
    let firstSettle = rows[0][settlePriceIdx];
    for (const row of rows) {
      sumSwap += row[swapRateIdx];
    }
    const percent = (sumSwap / firstSettle) * 100;
    const direction = percent > 0 ? "Лонги платят шортам" : (percent < 0 ? "Шорты платят лонгам" : "Никто никому не платит");
    console.log(`С ${from} по ${till} фандинг: ${percent.toFixed(3)}%. ${direction}`);

    results.push(Number(percent.toFixed(3)));
  }
  return results;
}

// Запуск:
fetchFundingLastNMonths(7).then(res => {
  console.log('\nМассив фандинга по месяцам:', res);
});
