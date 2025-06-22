import random
import csv

# Пороговые значения по числу оставшихся бросков (последний элемент – порог для 2-го броска и т.д.)
# Стратегия 1 — останавливаемся, если значение > порога (строго больше!)
strategy1_thresholds = [85.48, 84.14, 82.53, 80.54, 78.01, 74.67, 70.03, 63.00, 50.50]
# Стратегия 2 — останавливаемся, если значение >= порога (больше или равно)
strategy2_thresholds = [93, 92, 91, 89, 87, 84, 79, 71, 50]

# Количество игр (строк результата)
N = 1000

def play_strategy(thresholds, inclusive):
    """inclusive: True если >=, False если >"""
    results = []
    for _ in range(N):
        for throw in range(10):
            roll = random.randint(1, 100)
            # если последний бросок — берем что есть
            if throw == 9:
                results.append(roll)
                break
            threshold = thresholds[throw]
            if inclusive:
                if roll >= threshold:
                    results.append(roll)
                    break
            else:
                if roll > threshold:
                    results.append(roll)
                    break
    return results

# Моделирование
results1 = play_strategy(strategy1_thresholds, inclusive=False)
results2 = play_strategy(strategy2_thresholds, inclusive=True)

# Запись в файл
with open("cube_results.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Стратегия 1", "Стратегия 2"])
    for a, b in zip(results1, results2):
        writer.writerow([a, b])
